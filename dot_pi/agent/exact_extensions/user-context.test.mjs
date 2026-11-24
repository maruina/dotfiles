import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";

import {
  buildRepoContextKey,
  derivePromptTaskLabel,
  deriveSlashTaskLabel,
  formatCurrentModel,
  formatPR,
  getWorktreeInfo,
  loadRexLines,
  nameRexSession,
  nameRexSessionAndTask,
  nameRexTask,

  repoHints,
  uniqueMatches,
} from "./user-context.ts";

const neverRun = () => {
  throw new Error("rex must not run when REX_SESSION is unset");
};

test("uniqueMatches returns distinct Jira keys in first-seen order", () => {
  assert.deepEqual(
    uniqueMatches("PLAT-123 and COST-456 then PLAT-123"),
    ["PLAT-123", "COST-456"],
  );
});

import { isPathInside } from "./_shared/fs.ts";

test("isPathInside accepts descendants and rejects sibling prefix lookalikes", () => {
  const parent = path.join(path.sep, "tmp", "repo");
  assert.equal(isPathInside(parent, path.join(parent, "sub", "file.ts")), true);
  assert.equal(isPathInside(parent, parent), true);
  assert.equal(isPathInside(parent, path.join(path.sep, "tmp", "repo-other", "file.ts")), false);
});

test("getWorktreeInfo and repoHints gate work-only conventions by profile", () => {
  assert.match(getWorktreeInfo("/home/u/dd/.worktrees/repo/branch", "work", "/home/u").join("\n"), /DataDog worktree/);
  assert.deepEqual(getWorktreeInfo("/home/u/dd/.worktrees/repo/branch", "personal", "/home/u"), []);
  assert.match(getWorktreeInfo("/home/u/src/.worktrees/repo/branch", "personal", "/home/u").join("\n"), /personal worktree/);

  assert.equal(repoHints("/tmp/dd-source", "dd-source", "work").some((l) => l.includes("bzl")), true);
  assert.equal(repoHints("/tmp/dd-source", "dd-source", "personal").some((l) => l.includes("bzl")), false);
});

test("buildRepoContextKey changes when branch or email changes", () => {
  const base = buildRepoContextKey("/repo", "main", "me@example.com");
  assert.notEqual(buildRepoContextKey("/repo", "feature", "me@example.com"), base);
  assert.notEqual(buildRepoContextKey("/repo", "main", "other@example.com"), base);
  assert.equal(buildRepoContextKey("/repo", null, null), "/repo\0\0");
});

test("formatCurrentModel emits a provider-qualified model ID and omits missing IDs", () => {
  assert.deepEqual(
    formatCurrentModel({ provider: "google", id: "gemini-4-argon", name: "Gemini 4 Argon" }),
    ["## Current Model", "- Gemini 4 Argon (google/gemini-4-argon)"],
  );
  assert.deepEqual(
    formatCurrentModel({ provider: "openai-gpt-6-2", id: "openai/gpt-6.2-astra", name: "GPT-6.2 Astra" }),
    ["## Current Model", "- GPT-6.2 Astra (openai-gpt-6-2/openai/gpt-6.2-astra)"],
  );
  assert.deepEqual(
    formatCurrentModel({ provider: "google", id: "google/gemini-4-argon", name: "Gemini 4 Argon" }),
    ["## Current Model", "- Gemini 4 Argon (google/gemini-4-argon)"],
  );
  assert.deepEqual(
    formatCurrentModel({ id: "gpt-5", name: "GPT-5" }),
    ["## Current Model", "- GPT-5 (gpt-5)"],
  );
  assert.deepEqual(formatCurrentModel(), []);
  assert.deepEqual(formatCurrentModel({ name: "GPT-5" }), []);
});

test("loadRexLines returns nothing without REX_SESSION and never runs rex", async () => {
  assert.equal(await loadRexLines({}, neverRun), null);
  assert.equal(await loadRexLines({ REX_SERVER: "unix:///tmp/rex.sock" }, neverRun), null);
});

test("loadRexLines returns nothing when rex is missing or unusable", async () => {
  const run = async () => null;
  assert.equal(await loadRexLines({ REX_SESSION: "session:x" }, run), null);
});

test("loadRexLines passes --autostart=false and --server when set, and disables built-in naming", async () => {
  const calls = [];
  const run = async (...args) => {
    calls.push(args);
    return "You're running in a Rex terminal.\n\nREX_SESSION=session:x";
  };
  const lines = await loadRexLines({ REX_SESSION: "session:x", REX_SERVER: "unix:///tmp/rex.sock" }, run);
  assert.deepEqual(calls, [["rex", ["--autostart=false", "--timeout", "3s", "--server", "unix:///tmp/rex.sock", "__internal", "session-start", "--agent", "pi", "--feature-session-naming=false"], undefined, 3000]]);
  assert.deepEqual(lines, [
    "## Rex",
    "",
    "You're running in a Rex terminal.",
    "",
    "REX_SESSION=session:x",
  ]);
});

test("nameRexSession renames single-pane sessions directly via rex without fish and preserves keep: names", async () => {
  const calls = [];
  const run = async (cmd, args) => {
    calls.push([cmd, args]);
    if (cmd === "rex" && args.includes("inspect")) {
      return JSON.stringify({ label: "old", windows: [{ window_id: "window:1", layers: [{ blocks: [{ block_id: "block:x" }] }] }] });
    }
    if (cmd === "git" && args[0] === "rev-parse") return "/tmp/repo";
    if (cmd === "git" && args[0] === "remote") return "git@github.com:maruina/dotfiles.git";
    return "";
  };
  await nameRexSession("/tmp/repo", { REX_SESSION: "session:x", REX_BLOCK: "block:x", REX_SERVER: "unix:///tmp/rex.sock" }, run);
  assert.deepEqual(calls.at(-1), ["rex", ["--autostart=false", "--timeout", "3s", "--server", "unix:///tmp/rex.sock", "session", "rename", "session:x", "dotfiles"]]);

  const keepCalls = [];
  await nameRexSession("/tmp/repo", { REX_SESSION: "session:x", REX_BLOCK: "block:x" }, async (cmd, args) => {
    keepCalls.push([cmd, args]);
    return JSON.stringify({ label: "keep:pinned", windows: [{ window_id: "window:1", layers: [{ blocks: [{ block_id: "block:x" }] }] }] });
  });
  assert.equal(keepCalls.length, 1);
});

test("nameRexTask labels the containing window for single-pane tabs and the block for split tabs", async () => {
  const calls = [];
  const env = { REX_SESSION: "session:x", REX_BLOCK: "block:x" };
  await nameRexTask("π-analyze-pi-extensions", env, async (cmd, args) => {
    calls.push([cmd, args]);
    if (args.includes("inspect")) {
      return JSON.stringify({ windows: [{ window_id: "window:1", layers: [{ blocks: [{ block_id: "block:x" }] }] }] });
    }
    return "";
  });
  assert.deepEqual(calls.at(-1), ["rex", ["--autostart=false", "--timeout", "3s", "window", "rename", "-s", "session:x", "window:1", "π-analyze-pi-extensions"]]);

  const splitCalls = [];
  await nameRexTask("π-analyze-pi-extensions", env, async (cmd, args) => {
    splitCalls.push([cmd, args]);
    if (args.includes("inspect")) {
      return JSON.stringify({ windows: [{ window_id: "window:1", layers: [{ blocks: [{ block_id: "block:x" }, { block_id: "block:y" }] }] }] });
    }
    return "";
  });
  assert.deepEqual(splitCalls.at(-1), ["rex", ["--autostart=false", "--timeout", "3s", "block", "rename", "-s", "session:x", "block:x", "π-analyze-pi-extensions"]]);
});

function runHookScenario({ mode = "tui", session = "session:x", block = "block:x", fail = false, reload = false } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "user-context-hook-"));
  try {
    const startup = path.join(dir, "startup");
    const target = path.join(dir, "target");
    const bin = path.join(dir, "bin");
    for (const p of [startup, target, bin]) mkdirSync(p);
    const calls = path.join(dir, "calls");
    const release = path.join(dir, "release");
    writeFileSync(path.join(bin, "rex"), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.includes('session-start')) {
  console.log('Rex fixture');
  process.exit(0);
}
fs.appendFileSync(process.env.CALLS, JSON.stringify({ cwd: process.cwd(), args, pid: process.pid }) + '\\n');
if (process.env.FAIL === 'true') process.exit(1);
if (args.includes('inspect')) {
  const interval = setInterval(() => {
    if (fs.existsSync(process.env.RELEASE)) {
      clearInterval(interval);
      console.log(JSON.stringify({ label: 'old', windows: [{ window_id: 'window:1', layers: [{ blocks: [{ block_id: process.env.REX_BLOCK }] }] }] }));
      process.exit(0);
    }
  }, 10);
}
`, { mode: 0o755 });
    const moduleUrl = new URL("./user-context.ts", import.meta.url).href;
    const script = `
      import { existsSync, readFileSync, writeFileSync } from 'node:fs';
      const register = async (suffix) => {
        const { default: extension } = await import(${JSON.stringify(moduleUrl)} + suffix);
        let hook;
        extension({ on(name, fn) { if (name === 'before_agent_start') hook = fn; }, events: { emit() {} } });
        return hook;
      };
      const event = { messageType: 'user', prompt: 'hello', systemPrompt: 'base' };
      const ctx = { cwd: process.env.TARGET, mode: process.env.MODE, sessionManager: { getSessionId: () => 'test' } };
      const first = await register('?first');
      process.chdir(process.env.TARGET);
      const result = await first(event, ctx);
      const secondResult = await first(event, ctx);
      if (process.env.RELOAD === 'true') await (await register('?reload'))(event, ctx);
      let alive = false;
      if (process.env.MODE === 'tui' && process.env.REX_SESSION && process.env.REX_BLOCK && process.env.FAIL !== 'true') {
        for (let i = 0; i < 100 && !existsSync(process.env.CALLS); i++) await new Promise(r => setTimeout(r, 10));
        if (existsSync(process.env.CALLS)) {
          const { pid } = JSON.parse(readFileSync(process.env.CALLS, 'utf8').split('\\n')[0]);
          try { process.kill(pid, 0); alive = true; } catch {}
        }
      }
      writeFileSync(process.env.RELEASE, 'released');
      console.log(JSON.stringify({ result, secondResult, alive }));
    `;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: startup, encoding: "utf8", timeout: 8000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REX_SESSION: session, REX_BLOCK: block, REX_SERVER: "", CALLS: calls, RELEASE: release, TARGET: target, MODE: mode, FAIL: String(fail), RELOAD: String(reload) },
    });
    assert.equal(result.status, 0, result.stderr);
    let recorded = [];
    try { recorded = readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const { result: output, secondResult, alive } = JSON.parse(result.stdout);
    return { recorded, startup: realpathSync(startup), output, secondResult, alive };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("registered hook names once in the startup directory without waiting, including after reload", () => {
  const { recorded, startup, output, secondResult, alive } = runHookScenario({ reload: true });
  assert.equal(alive, true, "the hook returned before rex exited");
  const inspects = recorded.filter((c) => c.args.includes("inspect"));
  assert.equal(inspects.length, 1);
  assert.deepEqual({ cwd: inspects[0].cwd, args: inspects[0].args }, { cwd: startup, args: ["--autostart=false", "--timeout", "3s", "session", "inspect", "session:x", "--json"] });
  assert.doesNotMatch(output.message.content, /rex-name-task/);
  assert.doesNotMatch(output.message.content, /rex-name-session/);
  assert.equal(output.systemPrompt, undefined);
  assert.equal(secondResult, undefined, "unchanged user-context must not be re-injected on every turn");
});

test("registered hook excludes RPC and missing Rex identifiers", () => {
  for (const options of [{ mode: "rpc" }, { session: "" }, { block: "" }]) {
    assert.deepEqual(runHookScenario(options).recorded, []);
  }
});

test("deriveSlashTaskLabel and derivePromptTaskLabel build deterministic Rex task labels", () => {
  assert.equal(deriveSlashTaskLabel("/execute plans/fix-rex-fork/plan.md"), "π-execute-fix-rex-fork");
  assert.equal(deriveSlashTaskLabel("/verify plans/foo/plan.md"), "π-verify-foo");
  assert.equal(deriveSlashTaskLabel("/pr-validate https://github.com/DataDog/dd-source/pull/42"), "π-pr-validate-dd-source");
  assert.equal(deriveSlashTaskLabel("/disk-cleanup"), "π-disk-cleanup");
  assert.equal(deriveSlashTaskLabel("/learn"), "π-learn-task");
  assert.equal(deriveSlashTaskLabel("fix the tests"), null);
  assert.equal(derivePromptTaskLabel("Analyze my pi extensions for duplication"), "π-analyze-pi-extensions");
  assert.equal(derivePromptTaskLabel("please fix the flaky `rex-fork` tests"), "π-fix-flaky-tests");
  assert.equal(derivePromptTaskLabel("hello"), null);
});

test("registered hook ignores failed naming and does not retry", () => {
  const { recorded, output } = runHookScenario({ fail: true, reload: true });
  assert.equal(recorded.length, 1);
  assert.doesNotMatch(output.message.content, /rex-name-task/);
});

test("registered hook suppresses Rex naming, background fetches, and skill-loader injection in stage-runner children while keeping Current Model", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "user-context-child-"));
  try {
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    const rexMarker = path.join(dir, "rex-called");
    writeFileSync(path.join(bin, "rex"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(rexMarker)}, '1');\nconsole.log('Rex child');\n`, { mode: 0o755 });
    const moduleUrl = new URL("./user-context.ts", import.meta.url).href;
    const script = `
      const { default: extension } = await import(${JSON.stringify(moduleUrl)});
      let hook;
      extension({ on(name, fn) { if (name === 'before_agent_start') hook = fn; }, events: { emit() {} } });
      const result = await hook(
        { messageType: 'user', prompt: 'fix the TypeScript extension tests', systemPrompt: 'base' },
        { cwd: ${JSON.stringify(dir)}, mode: 'json', model: { provider: 'google', id: 'gemini-4-neon', name: 'Gemini 4 Neon' }, sessionManager: { getSessionId: () => 'child' } },
      );
      console.log(JSON.stringify(result));
    `;
    const run = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: dir, encoding: "utf8", timeout: 8000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REX_SESSION: "session:x", REX_BLOCK: "block:x", PI_STAGE_RUNNER_CHILD: "1" },
    });
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(existsSync(rexMarker), false, "stage-runner child must not invoke rex");
    assert.doesNotMatch(output.message.content, /rex-name-task|## Rex/);
    assert.match(output.message.content, /## Current Model\n- Gemini 4 Neon \(google\/gemini-4-neon\)/);
    assert.equal(output.systemPrompt, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nameRexSessionAndTask inspects Rex once when naming both session and task", async () => {
  const calls = [];
  const run = async (cmd, args = []) => {
    calls.push({ cmd, args });
    if (cmd === "rex" && args.includes("inspect")) {
      return JSON.stringify({
        label: "random-name",
        windows: [{ window_id: "window:1", layers: [{ blocks: [{ block_id: "block:1" }] }] }],
      });
    }
    if (cmd === "git" && args[0] === "rev-parse") return "/tmp/dotfiles";
    if (cmd === "git" && args[0] === "remote") return "git@github.com:maruina/dotfiles.git";
    return "";
  };
  await nameRexSessionAndTask(
    { sessionCwd: "/tmp/dotfiles", taskLabel: "π-fix-tests" },
    { REX_SESSION: "session:1", REX_BLOCK: "block:1" },
    run,
  );
  const inspects = calls.filter((c) => c.cmd === "rex" && c.args.includes("inspect"));
  assert.equal(inspects.length, 1);
  assert.ok(calls.some((c) => c.cmd === "rex" && c.args.includes("session") && c.args.includes("rename") && c.args.includes("dotfiles")));
  assert.ok(calls.some((c) => c.cmd === "rex" && c.args.includes("window") && c.args.includes("rename") && c.args.includes("π-fix-tests")));
});

test("formatPR includes state, number, base, title, head, and link", () => {
  assert.equal(
    formatPR({
      number: 42,
      title: "Improve pi extensions",
      state: "OPEN",
      url: "https://example.test/pr/42",
      baseRefName: "main",
      headRefName: "feature/pi",
    }),
    "- [OPEN] #42 → main: Improve pi extensions [head: feature/pi] (https://example.test/pr/42)",
  );
});
