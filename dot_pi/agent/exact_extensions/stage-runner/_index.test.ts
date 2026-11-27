import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildDesignBrief, createDesignWorktree, deriveDesignBranch, inspectDesignBranch, validateFeatureBranchName } from "./_design.ts";
import stageRunner, { trackPublishedPr } from "./index.ts";

test("registers /arp-review and rejects invalid arguments before model selection", async (t) => {
  const savedChild = process.env.PI_STAGE_RUNNER_CHILD;
  delete process.env.PI_STAGE_RUNNER_CHILD;
  t.after(() => {
    if (savedChild === undefined) delete process.env.PI_STAGE_RUNNER_CHILD;
    else process.env.PI_STAGE_RUNNER_CHILD = savedChild;
  });
  type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
  const commands = new Map<string, Command>();
  const events: unknown[] = [];
  const prUrl = "https://github.com/ddoghq/demo/pull/1";
  stageRunner({
    registerEntryRenderer() {},
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    appendEntry() {},
    events: { emit: (event: string, data: unknown) => events.push([event, data]) },
    on() {},
  } as unknown as ExtensionAPI);
  const command = commands.get("arp-review");
  assert.ok(command);
  const messages: string[] = [];
  for (const bad of ["--max-heads 0", "https://github.com/ddoghq/demo/issues/1"]) {
    await command.handler(bad, {
      hasUI: true,
      ui: {
        notify: (message: string) => messages.push(message),
        select: () => assert.fail("Invalid arguments must not select a model"),
      },
    } as unknown as Parameters<Command["handler"]>[1]);
  }
  assert.match(messages.join("\n"), /--max-heads.*1.*10/);
  assert.equal(messages.length, 2);

  const rejected = {
    hasUI: false,
    ui: { notify: () => {}, select: () => assert.fail("Rejected runs must not select a model") },
  } as unknown as Parameters<Command["handler"]>[1];
  await command.handler(prUrl, rejected);
  assert.deepEqual(events, []);

  const prompts: string[] = [];
  let selected!: () => void;
  const selectCalled = new Promise<void>(resolve => { selected = resolve; });
  let finishSelection!: (value: undefined) => void;
  const selection = new Promise<undefined>(resolve => { finishSelection = resolve; });
  await command.handler(prUrl, {
    hasUI: true,
    scopedModels: [{ model: { provider: "p", id: "m" } }],
    ui: {
      notify: () => {},
      setWidget: () => {},
      select: async (prompt: string) => { prompts.push(prompt); selected(); return selection; },
    },
  } as unknown as Parameters<Command["handler"]>[1]);
  await selectCalled;
  await command.handler(prUrl, { ...rejected, hasUI: true });
  finishSelection(undefined);
  assert.deepEqual(events, [["pr-status:track", { url: prUrl }]]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(prompts, ["Select ARP fix model"]);
});

test("only a valid publication message emits a tracking event", () => {
  const events: unknown[] = [];
  const pi = { events: { emit: (event: string, data: unknown) => events.push([event, data]) } } as unknown as ExtensionAPI;
  const url = "https://github.com/ddoghq/demo/pull/1";
  trackPublishedPr(pi, { type: "skills", labels: [] });
  trackPublishedPr(pi, { type: "message", message: `Found ${url}` });
  trackPublishedPr(pi, { type: "message", message: "Published https://github.com/ddoghq/demo/issues/1 at abc" });
  trackPublishedPr(pi, { type: "message", message: `Published ${url} at abc` });
  assert.deepEqual(events, [["pr-status:track", { url }]]);
});

test("only a settled managed child with its own valid handoff shuts down", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "managed-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "handoff.json");
  const keys = ["PI_STAGE_RUNNER_CHILD", "PI_DESIGN_STAGE", "PI_DESIGN_HANDOFF"];
  const saved = keys.map(k => process.env[k]);
  t.after(() => keys.forEach((k,i) => { if (saved[i] === undefined) delete process.env[k]; else process.env[k] = saved[i]; }));
  for (const managed of [false,true]) {
    for (const k of keys) delete process.env[k];
    if (managed) Object.assign(process.env,{ PI_STAGE_RUNNER_CHILD:"1", PI_DESIGN_STAGE:"design-plan", PI_DESIGN_HANDOFF:file });
    let count = 0, settled = () => {}, registeredTools: string[] = [];
    stageRunner({
      registerEntryRenderer() {},
      registerCommand() {},
      registerTool(def: { name: string }) { registeredTools.push(def.name); },
      on(name: string, cb: Function) {
        if (name === "agent_settled") settled = () => cb({}, { shutdown: () => count++ });
      },
    } as unknown as ExtensionAPI);
    assert.equal(registeredTools.includes("submit_stage_handoff"), managed);
    fs.rmSync(file,{force:true}); settled(); assert.equal(count,0);
    for (const content of ["{", JSON.stringify({ schemaVersion:1, stage:"design-draft", summary:"done", designPath:"plans/a/design.md", draftCommit:"a".repeat(40) })]) {
      fs.writeFileSync(file,content,{mode:0o600}); settled(); assert.equal(count,0);
    }
    fs.writeFileSync(file, JSON.stringify({ schemaVersion:1, stage:"design-plan", summary:"done", planPath:"plans/a/plan.md", planCommit:"a".repeat(40) }));
    settled(); assert.equal(count, managed ? 1 : 0);
  }
});

test("buildDesignBrief handles empty input, explicit briefs, conversation seed, and truncation", () => {
  assert.equal(buildDesignBrief("   ", []), "");
  assert.equal(buildDesignBrief("  my brief  ", []), "my brief");

  const entries = [
    { type: "compaction", summary: "Earlier summary." },
    { type: "message", message: { role: "user", content: "First question" } },
    {
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "secret reasoning" },
          { type: "text", text: "First answer" },
          { type: "toolCall", name: "bash" },
        ],
      },
    },
    { type: "message", message: { role: "toolResult", content: [{ type: "text", text: "noisy tool output" }] } },
    { type: "message", message: { role: "user", content: [{ type: "text", text: "Follow-up" }] } },
  ];

  const fromChat = buildDesignBrief("", entries);
  assert.match(fromChat, /^Conversation context:\n\n/);
  assert.match(fromChat, /Summary of earlier conversation:\nEarlier summary\./);
  assert.match(fromChat, /User:\nFirst question/);
  assert.match(fromChat, /Assistant:\nFirst answer/);
  assert.match(fromChat, /User:\nFollow-up/);
  assert.doesNotMatch(fromChat, /secret reasoning|noisy tool output/);

  const combined = buildDesignBrief("Focus on hooks", entries);
  assert.match(combined, /^Focus:\nFocus on hooks\n\nConversation context:\n\n/);
  assert.match(combined, /Follow-up/);

  const longEntries = Array.from({ length: 20 }, (_, i) => ({
    type: "message",
    message: { role: i % 2 === 0 ? "user" : "assistant", content: `turn-${i} ` + "x".repeat(60) },
  }));
  const truncated = buildDesignBrief("", longEntries, 300);
  assert.ok(Buffer.byteLength(JSON.stringify(truncated)) <= 300);
  assert.match(truncated, /\[Earlier conversation omitted for length\]/);
  assert.match(truncated, /turn-19/);

  const giant = buildDesignBrief("", [{ type: "message", message: { role: "user", content: "a".repeat(500) + "END" } }], 200);
  assert.ok(Buffer.byteLength(JSON.stringify(giant)) <= 200);
  assert.match(giant, /END$/);
});

test("inspectDesignBranch, validateFeatureBranchName, and createDesignWorktree create a clean worktree from main", async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "design-wt-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const repo = path.join(tmp, "repo");
  const wtPath = path.join(tmp, "wt-feature");
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
  git("add", "README.md");
  git("commit", "-m", "init");

  const info = inspectDesignBranch(repo);
  assert.equal(info.branch, "main");
  assert.equal(info.onDefault, true);

  assert.throws(() => validateFeatureBranchName(repo, "", "main"), /Invalid feature branch name/);
  assert.throws(() => validateFeatureBranchName(repo, "main", "main"), /Choose a feature branch/);
  assert.throws(() => validateFeatureBranchName(repo, "bad branch", "main"), /Invalid feature branch name/);
  assert.equal(validateFeatureBranchName(repo, " maruina/demo ", "main"), "maruina/demo");

  const fakeWt = path.join(tmp, "fake-wt.mjs");
  fs.writeFileSync(
    fakeWt,
    `import { execFileSync } from "node:child_process";
const args = process.argv.slice(2);
const branch = args[args.indexOf("--create") + 1];
const base = args[args.indexOf("--base") + 1];
const target = ${JSON.stringify(wtPath)};
execFileSync("git", ["worktree", "add", "-b", branch, target, base], { stdio: "ignore" });
process.stdout.write(JSON.stringify({ path: target, branch }));
`,
  );

  const created = await createDesignWorktree(repo, "maruina/demo", process.env, [process.execPath, fakeWt]);
  assert.equal(created, fs.realpathSync(wtPath));
  assert.equal(git("symbolic-ref", "--short", "HEAD"), "main");
  assert.equal(execFileSync("git", ["symbolic-ref", "--short", "HEAD"], { cwd: created, encoding: "utf8" }).trim(), "maruina/demo");

  assert.equal(deriveDesignBranch(repo, "Fix COMP-4210 footer PR tracking", "", undefined, "main"), "maruina/comp-4210");
  assert.equal(
    deriveDesignBranch(repo, "", "Conversation context:\n\nUser:\nTrack session PRs in the Pi footer", undefined, "main"),
    "maruina/track-session-prs-pi-footer",
  );
  assert.equal(
    deriveDesignBranch(repo, "", "Conversation context:\n\nUser:\nIgnored", "see-only-prs", "main"),
    "maruina/see-only-prs",
  );
  assert.equal(deriveDesignBranch(repo, "demo", "", undefined, "main"), "maruina/demo-2");
});

test("/stage-runner-design requires either a brief or existing conversation context", async (t) => {
  const savedChild = process.env.PI_STAGE_RUNNER_CHILD;
  delete process.env.PI_STAGE_RUNNER_CHILD;
  t.after(() => {
    if (savedChild === undefined) delete process.env.PI_STAGE_RUNNER_CHILD;
    else process.env.PI_STAGE_RUNNER_CHILD = savedChild;
  });
  type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
  const commands = new Map<string, Command>();
  stageRunner({
    registerEntryRenderer() {},
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    appendEntry() {},
    on() {},
  } as unknown as ExtensionAPI);
  const command = commands.get("stage-runner-design");
  assert.ok(command);
  const messages: string[] = [];
  await command.handler("", {
    hasUI: true,
    sessionManager: { getBranch: () => [] },
    ui: {
      notify: (message: string) => messages.push(message),
      select: () => assert.fail("Empty brief and empty conversation must not select a model"),
    },
  } as unknown as Parameters<Command["handler"]>[1]);
  assert.deepEqual(messages, ["Provide a brief or start /stage-runner-design from an existing conversation"]);
});

test("registers /stage-runner-doctor and rejects child or non-UI sessions", async (t) => {
  const savedChild = process.env.PI_STAGE_RUNNER_CHILD;
  t.after(() => {
    if (savedChild === undefined) delete process.env.PI_STAGE_RUNNER_CHILD;
    else process.env.PI_STAGE_RUNNER_CHILD = savedChild;
  });
  type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
  const commands = new Map<string, Command>();
  stageRunner({
    registerEntryRenderer() {},
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    appendEntry() {},
    on() {},
  } as unknown as ExtensionAPI);
  const doctor = commands.get("stage-runner-doctor");
  assert.ok(doctor);
  const messages: Array<[string, string | undefined]> = [];
  delete process.env.PI_STAGE_RUNNER_CHILD;
  await doctor.handler("", {
    hasUI: false,
    ui: { notify: (message: string, level?: string) => messages.push([message, level]) },
  } as unknown as Parameters<Command["handler"]>[1]);
  process.env.PI_STAGE_RUNNER_CHILD = "1";
  await doctor.handler("", {
    hasUI: true,
    ui: { notify: (message: string, level?: string) => messages.push([message, level]) },
  } as unknown as Parameters<Command["handler"]>[1]);
  assert.deepEqual(messages, [
    ["Use /stage-runner-doctor in an interactive parent session", "error"],
    ["Use /stage-runner-doctor in an interactive parent session", "error"],
  ]);
});
