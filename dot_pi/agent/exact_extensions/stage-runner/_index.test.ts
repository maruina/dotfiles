import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import stageRunner from "./index.ts";

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
