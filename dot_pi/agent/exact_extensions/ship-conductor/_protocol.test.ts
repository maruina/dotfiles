import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { parseDecisionInput, parseLifecycleOutcome, parseStageConfig } from "./_protocol.ts";

const WORKTREE = "/tmp/lifecycle-worktree";
const COMMIT = "a".repeat(40);
const PLAN_BLOB = "b".repeat(40);
const DESIGN_BLOB = "c".repeat(40);

function validStageConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocolVersion: 1,
    runId: "run-test-123",
    stage: "execute",
    worktree: WORKTREE,
    planPath: `${WORKTREE}/plans/fixture/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/fixture/plan.md`, blob: PLAN_BLOB },
      design: { path: `${WORKTREE}/plans/fixture/design.md`, blob: DESIGN_BLOB },
    },
    unit: { heading: "Fixture task", taskNumbers: [1] },
    model: { provider: "lifecycle-test", id: "driver" },
    thinkingLevel: "minimal",
    ...overrides,
  };
}

describe("parseStageConfig", () => {
  it("accepts a versioned stage contract pinned to the expected worktree", () => {
    const config = validStageConfig();
    assert.deepEqual(parseStageConfig(config, WORKTREE), config);
  });

  it("rejects an unsupported version, stage, or worktree", () => {
    assert.throws(() => parseStageConfig(validStageConfig({ protocolVersion: 2 }), WORKTREE));
    assert.throws(() => parseStageConfig(validStageConfig({ stage: "repair" }), WORKTREE));
    assert.throws(() => parseStageConfig(validStageConfig({ worktree: "/other" }), WORKTREE));
  });

  it("rejects incomplete or out-of-worktree baseline references", () => {
    const missingBaseline = validStageConfig();
    delete missingBaseline.baseline;
    assert.throws(() => parseStageConfig(missingBaseline, WORKTREE));

    const outsidePlan = validStageConfig({ planPath: "/other/plan.md" });
    assert.throws(() => parseStageConfig(outsidePlan, WORKTREE));
  });
});

describe("parseDecisionInput", () => {
  it("requires the question and full decision context", () => {
    assert.deepEqual(
      parseDecisionInput({
        question: "May I proceed?",
        evidence: "The fixture reached its approval gate.",
        proposal: "Continue the deterministic test.",
        context: "The test does not modify candidate files.",
      }),
      {
        question: "May I proceed?",
        evidence: "The fixture reached its approval gate.",
        proposal: "Continue the deterministic test.",
        context: "The test does not modify candidate files.",
      },
    );
    assert.throws(() => parseDecisionInput({ question: "May I proceed?", context: "missing evidence and proposal" }));
  });
});

describe("parseLifecycleOutcome", () => {
  it("accepts stage-appropriate outcomes and change classifications", () => {
    assert.equal(
      parseLifecycleOutcome(
        { schemaVersion: 1, outcome: "success", change: "unchanged", report: "No candidate change." },
        "execute",
      ).outcome,
      "success",
    );
    assert.equal(
      parseLifecycleOutcome(
        { schemaVersion: 1, outcome: "VERIFIED", change: "not-applicable", report: "Fresh verification passed." },
        "verify",
      ).outcome,
      "VERIFIED",
    );
  });

  it("rejects unsupported versions and stage/outcome mismatches", () => {
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: 2, outcome: "success", change: "changed", report: "invalid version" },
        "execute",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: 1, outcome: "VERIFIED", change: "not-applicable", report: "wrong stage" },
        "execute",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: 1, outcome: "success", change: "unchanged", report: "wrong stage" },
        "verify",
      ),
    );
  });

  it("does not accept model-supplied identity fields", () => {
    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: 1,
          outcome: "success",
          change: "changed",
          report: "candidate update",
          runId: "attacker-run",
          stage: "verify",
          sessionId: "attacker-session",
          model: { provider: "attacker", id: "attacker-model" },
        },
        "execute",
      ),
    );
  });
});
