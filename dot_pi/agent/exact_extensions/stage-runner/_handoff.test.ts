import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import stageRunnerHandoff, { validateHandoffPayload } from "./_handoff.ts";

function loadTool(env: Record<string, string | undefined>) {
  const saved = {
    PI_STAGE_RUNNER_HANDOFF: process.env.PI_STAGE_RUNNER_HANDOFF,
    PI_STAGE_RUNNER_STAGE: process.env.PI_STAGE_RUNNER_STAGE,
    PI_DESIGN_HANDOFF: process.env.PI_DESIGN_HANDOFF,
    PI_DESIGN_STAGE: process.env.PI_DESIGN_STAGE,
  };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let registered: any;
  try {
    stageRunnerHandoff({
      registerTool(def: unknown) {
        registered = def;
      },
    } as unknown as ExtensionAPI);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return registered;
}

test("submit_stage_handoff registers only when stage-runner handoff env is set", () => {
  assert.equal(loadTool({ PI_STAGE_RUNNER_HANDOFF: undefined, PI_STAGE_RUNNER_STAGE: undefined }), undefined);
  assert.equal(loadTool({ PI_STAGE_RUNNER_HANDOFF: "/tmp/x.json", PI_STAGE_RUNNER_STAGE: "unknown" }), undefined);
});

test("submit_stage_handoff validates schema and writes a 0600 JSON file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sr-handoff-"));
  try {
    const out = path.join(dir, "handoff.json");
    const tool = loadTool({ PI_STAGE_RUNNER_HANDOFF: out, PI_STAGE_RUNNER_STAGE: "verify" });
    assert.ok(tool);
    await assert.rejects(
      () => tool.execute("1", { summary: "Done", status: "success" }),
      /Invalid verdict/,
    );
    await tool.execute("2", { summary: "Verified cleanly", status: "VERIFIED", findings: [] });
    assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), {
      schemaVersion: 1,
      stage: "verify",
      summary: "Verified cleanly",
      status: "VERIFIED",
      findings: [],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("submit_stage_handoff registers for design-draft and design-plan env vars", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sr-design-handoff-"));
  try {
    const out = path.join(dir, "handoff.json");
    const tool = loadTool({
      PI_STAGE_RUNNER_HANDOFF: undefined,
      PI_STAGE_RUNNER_STAGE: undefined,
      PI_DESIGN_HANDOFF: out,
      PI_DESIGN_STAGE: "design-draft",
    });
    assert.ok(tool);
    await tool.execute("1", { summary: "Draft ready", designPath: "plans/a/design.md", draftCommit: "a".repeat(40) });
    assert.equal(statSync(out).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).stage, "design-draft");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("validateHandoffPayload validates arp-fix findings entries", () => {
  const base = { schemaVersion: 1, stage: "arp-fix", summary: "Fixed finding" };
  assert.throws(() => validateHandoffPayload(base, "arp-fix"), /Invalid arp-fix findings/);
  assert.throws(() => validateHandoffPayload({ ...base, findings: [{ id: 1, disposition: "fixed" }] }, "arp-fix"), /Invalid arp-fix findings/);
  assert.throws(() => validateHandoffPayload({ ...base, findings: [{ id: 1, disposition: "needs-operator" }] }, "arp-fix"), /Invalid arp-fix findings/);
  assert.doesNotThrow(() =>
    validateHandoffPayload(
      {
        ...base,
        findings: [
          { id: 1, disposition: "fixed", fixSha: "a".repeat(40), changeSummary: "Fixed bug" },
          { id: 2, disposition: "needs-operator", reason: "Requires scope decision" },
        ],
      },
      "arp-fix",
    ),
  );
});
