import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
