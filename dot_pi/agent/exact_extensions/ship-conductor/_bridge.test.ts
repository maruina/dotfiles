import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { stageContract } from "./_bridge.ts";
import type { StageConfig } from "./_protocol.ts";

const WORKTREE = "/work/repo";
const COMMIT = "a".repeat(40);

function config(designPath: string, designBlob: string): StageConfig {
  return {
    protocolVersion: 1,
    runId: "run-test",
    stage: "execute",
    worktree: WORKTREE,
    branch: "feature",
    planPath: `${WORKTREE}/plans/feature/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/feature/plan.md`, blob: "b".repeat(40) },
      design: { path: designPath, blob: designBlob },
    },
    unitBase: COMMIT,
    unit: { heading: "Slice 1: First", taskNumbers: [1] },
    models: {
      execute: { provider: "fixture", id: "writer" },
      simplify: { provider: "fixture", id: "simplifier" },
      verify: { provider: "fixture", id: "verifier" },
    },
    thinkingLevel: "low",
  };
}

describe("stageContract", () => {
  it("names the pinned plan and design files beside their blob IDs", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/design.md`, "c".repeat(40)));
    assert.match(text, new RegExp(`^Pinned plan blob: ${"b".repeat(40)} \\(plans/feature/plan\\.md\\)$`, "m"));
    assert.match(text, new RegExp(`^Pinned design blob: ${"c".repeat(40)} \\(plans/feature/design\\.md\\)$`, "m"));
  });

  it("gives exact commands to read and check the pinned plan and explains the ledger", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/design.md`, "c".repeat(40)));
    assert.match(text, new RegExp(`git rev-parse ${COMMIT}:plans/feature/plan\\.md`));
    assert.match(text, new RegExp(`git show ${"b".repeat(40)}`));
    assert.match(text, new RegExp(`git show ${"c".repeat(40)}`));
    assert.match(text, /working-tree plan is the progress ledger.*differs? from the pinned plan blob/is);
  });

  it("states that no design document exists when the plan is the design baseline", () => {
    const text = stageContract(config(`${WORKTREE}/plans/feature/plan.md`, "b".repeat(40)));
    assert.match(text, /^Pinned design blob: none — no design\.md exists; the pinned plan is the only requirements document$/m);
    assert.doesNotMatch(text, /Pinned design blob: b{40}/);
  });
});
