import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRepoContextKey,
  formatCurrentModel,
  formatPR,
  loadRexLines,
  pathInside,
  shouldAddSkillLoaderGuidance,
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

test("pathInside accepts descendants and rejects sibling prefix lookalikes", () => {
  const parent = path.join(path.sep, "tmp", "repo");
  assert.equal(pathInside(path.join(parent, "sub", "file.ts"), parent), true);
  assert.equal(pathInside(parent, parent), true);
  assert.equal(pathInside(path.join(path.sep, "tmp", "repo-other", "file.ts"), parent), false);
});

test("shouldAddSkillLoaderGuidance only triggers for code work", () => {
  assert.equal(shouldAddSkillLoaderGuidance("fix the TypeScript extension tests"), true);
  assert.equal(shouldAddSkillLoaderGuidance("what is the weather?"), false);
  assert.equal(shouldAddSkillLoaderGuidance("summarize this incident"), false);
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

test("loadRexLines disables Rex's built-in naming and adds repository session and task tab guidance", async () => {
  const calls = [];
  const run = async (...args) => {
    calls.push(args);
    return "You're running in a Rex terminal.\n\nREX_SESSION=session:x";
  };
  const lines = await loadRexLines({ REX_SESSION: "session:x" }, run);
  assert.deepEqual(calls, [["rex", ["__internal", "session-start", "--agent", "pi", "--feature-session-naming=false"], undefined, 3000]]);
  assert.deepEqual(lines.slice(0, 5), [
    "## Rex",
    "",
    "You're running in a Rex terminal.",
    "",
    "REX_SESSION=session:x",
  ]);
  const guidance = lines.slice(5).join("\n");
  assert.doesNotMatch(guidance, /the shared Rex session/);
  assert.match(guidance, /Before task work.*first request that identifies the task/);
  assert.doesNotMatch(guidance, /rex-name-session/);
  assert.match(guidance, /π-.*two to four lowercase task words/);
  assert.match(guidance, /rex-name-task π-compare-rex-extensions/);
  assert.match(guidance, /not the focused tab/);
  assert.match(guidance, /split tabs.*only this pane/);
  assert.match(guidance, /verifies changes/);
  assert.doesNotMatch(guidance, /rex (session rename|window rename|block inspect)/);
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
    writeFileSync(path.join(bin, "rex"), `#!${process.execPath}\nconsole.log('Rex fixture');\n`, { mode: 0o755 });
    writeFileSync(path.join(bin, "fish"), `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.CALLS, JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), pid: process.pid }) + '\\n');
if (process.env.FAIL === 'true') process.exit(1);
const interval = setInterval(() => { if (fs.existsSync(process.env.RELEASE)) { clearInterval(interval); process.exit(0); } }, 10);
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
      await first(event, ctx);
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
      console.log(JSON.stringify({ result, alive }));
    `;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: startup, encoding: "utf8", timeout: 8000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REX_SESSION: session, REX_BLOCK: block, CALLS: calls, RELEASE: release, TARGET: target, MODE: mode, FAIL: String(fail), RELOAD: String(reload) },
    });
    assert.equal(result.status, 0, result.stderr);
    let recorded = [];
    try { recorded = readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const { result: output, alive } = JSON.parse(result.stdout);
    return { recorded, startup: realpathSync(startup), output, alive };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("registered hook names once in the startup directory without waiting, including after reload", () => {
  const { recorded, startup, output, alive } = runHookScenario({ reload: true });
  assert.equal(alive, true, "the hook returned before Fish exited");
  assert.equal(recorded.length, 1);
  assert.deepEqual({ cwd: recorded[0].cwd, args: recorded[0].args }, { cwd: startup, args: ["-c", "rex-name-session"] });
  assert.match(output.message.content, /rex-name-task/);
  assert.doesNotMatch(output.message.content, /rex-name-session/);
});

test("registered hook excludes RPC and missing Rex identifiers", () => {
  for (const options of [{ mode: "rpc" }, { session: "" }, { block: "" }]) {
    assert.deepEqual(runHookScenario(options).recorded, []);
  }
});

test("registered hook ignores failed naming and does not retry", () => {
  const { recorded, output } = runHookScenario({ fail: true, reload: true });
  assert.equal(recorded.length, 1);
  assert.match(output.message.content, /rex-name-task/);
});

test("candidate extension injects Rex guidance in an isolated Pi RPC agent loop", { timeout: 30_000 }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "user-context-rpc-"));
  let child;
  try {
    const agentDir = path.join(dir, "agent");
    const bin = path.join(dir, "bin");
    mkdirSync(agentDir);
    mkdirSync(bin);
    symlinkSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules"), path.join(dir, "node_modules"));
    const calls = path.join(dir, "calls");
    const captured = path.join(dir, "context.json");
    writeFileSync(path.join(bin, "rex"), `#!${process.execPath}\nconsole.log('Rex RPC fixture');\n`, { mode: 0o755 });
    writeFileSync(path.join(bin, "fish"), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CALLS, 'called');\n`, { mode: 0o755 });
    const driver = path.join(dir, "driver.ts");
    writeFileSync(driver, `
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/compat';
import { writeFileSync } from 'node:fs';
export default function (pi) {
  pi.registerProvider('context-test', {
    name: 'Context fixture', baseUrl: 'http://127.0.0.1', apiKey: 'fixture-only', api: 'context-test-api',
    models: [{ id: 'driver', name: 'Context fixture', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024 }],
    streamSimple(model, context) {
      writeFileSync(process.env.CAPTURED, JSON.stringify(context));
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
      const message = { role: 'assistant', content: [{ type: 'text', text: 'fixture complete' }], api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(), usage, stopReason: 'stop' };
      const stream = createAssistantMessageEventStream();
      stream.push({ type: 'done', reason: 'stop', message });
      stream.end(message);
      return stream;
    },
  });
}`);
    const candidate = fileURLToPath(new URL("./user-context.ts", import.meta.url));
    child = spawn("pi", ["--mode", "rpc", "--no-session", "--no-extensions", "--no-prompt-templates", "--no-context-files", "--provider", "context-test", "--model", "driver", "--thinking", "minimal", "-e", candidate, "-e", driver], {
      cwd: dir,
      env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: "1", PATH: `${bin}:${process.env.PATH}`, REX_SESSION: "session:fixture", REX_BLOCK: "block:fixture", CALLS: calls, CAPTURED: captured },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    await new Promise((resolve, reject) => {
      const finish = (error) => { clearTimeout(timer); if (error) reject(error); else resolve(); };
      const timer = setTimeout(() => finish(new Error(`Pi RPC timed out: ${stderr}`)), 20_000);
      child.on("error", finish);
      child.on("close", (code) => finish(new Error(`Pi RPC exited early (${code}): ${stderr}`)));
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.split("\n").some((line) => { try { return JSON.parse(line).type === "agent_settled"; } catch { return false; } })) {
          finish();
        }
      });
      child.stdin.write(`${JSON.stringify({ type: "prompt", message: "hello" })}\n`);
    });
    const context = readFileSync(captured, "utf8");
    assert.match(context, /Rex RPC fixture/);
    assert.match(context, /rex-name-task/);
    assert.doesNotMatch(context, /rex-name-session/);
    assert.equal(existsSync(calls), false, "RPC mode must not run the Fish naming function");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => { child.once("close", resolve); child.kill(); });
    }
    rmSync(dir, { recursive: true, force: true });
  }
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
