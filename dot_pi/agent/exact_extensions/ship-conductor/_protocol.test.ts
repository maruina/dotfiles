import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_STAGE_REPORT_BYTES,
  PROTOCOL_VERSION,
  parseDecisionInput,
  parseDecisionResult,
  parseLifecycleOutcome,
  parseLifecycleOutcomeEnvelope,
  parseStageConfig,
} from "./_protocol.ts";

const WORKTREE = "/tmp/lifecycle-worktree";
const COMMIT = "a".repeat(40);
const PLAN_BLOB = "b".repeat(40);
const DESIGN_BLOB = "c".repeat(40);

function validStageConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scope: "execution",
    runId: "run-test-123",
    stage: "execute",
    worktree: WORKTREE,
    branch: "feature",
    planPath: `${WORKTREE}/plans/fixture/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/fixture/plan.md`, blob: PLAN_BLOB },
      design: { path: `${WORKTREE}/plans/fixture/design.md`, blob: DESIGN_BLOB },
    },
    unitBase: COMMIT,
    unit: { heading: "Fixture task", taskNumbers: [1] },
    models: {
      execute: { provider: "lifecycle-test", id: "executor" },
      simplify: { provider: "lifecycle-test", id: "simplifier" },
      verify: { provider: "lifecycle-test", id: "verifier" },
    },
    stageModel: { provider: "lifecycle-test", id: "executor" },
    thinkingLevel: "minimal",
    ...overrides,
  };
}

function validCompletionConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scope: "completion",
    runId: "run-test-123",
    stage: "arp-review",
    worktree: WORKTREE,
    branch: "feature",
    planPath: `${WORKTREE}/plans/fixture/plan.md`,
    baseline: {
      commit: COMMIT,
      plan: { path: `${WORKTREE}/plans/fixture/plan.md`, blob: PLAN_BLOB },
      design: { path: `${WORKTREE}/plans/fixture/design.md`, blob: DESIGN_BLOB },
    },
    models: {
      execute: { provider: "lifecycle-test", id: "executor" },
      simplify: { provider: "lifecycle-test", id: "simplifier" },
      verify: { provider: "lifecycle-test", id: "verifier" },
    },
    stageModel: { provider: "lifecycle-test", id: "executor" },
    thinkingLevel: "minimal",
    completion: {
      policy: "work",
      candidate: { branch: "feature", head: COMMIT, stateDigest: "d".repeat(64) },
      reviewRequest: {
        prUrl: "https://github.com/DataDog/repo/pull/123",
        expectedHeadSha: COMMIT,
        deadlineAt: "2026-01-01T00:20:00.000Z",
        maxStatusChecks: 30,
        pollIntervalsSeconds: [10, 30, 60],
        silent: true,
      },
    },
    ...overrides,
  };
}

describe("parseStageConfig", () => {
  it("accepts a versioned stage contract pinned to the expected worktree", () => {
    const config = validStageConfig();
    assert.deepEqual(parseStageConfig(config, WORKTREE), config);
  });

  it("rejects an unsupported version, stage, or worktree", () => {
    assert.throws(() => parseStageConfig(validStageConfig({ protocolVersion: PROTOCOL_VERSION + 1 }), WORKTREE));
    assert.throws(() => parseStageConfig(validStageConfig({ stage: "repair" }), WORKTREE));
    assert.throws(() => parseStageConfig(validStageConfig({ worktree: "/other" }), WORKTREE));
  });

  it("accepts feature-scoped completion stages with bounded review metadata", () => {
    const config = validCompletionConfig();
    assert.deepEqual(parseStageConfig(config, WORKTREE), config);
  });

  it("rejects completion stages missing required review bounds", () => {
    assert.throws(() => parseStageConfig(validCompletionConfig({ completion: { policy: "work", candidate: { branch: "feature", head: COMMIT, stateDigest: "d".repeat(64) } } }), WORKTREE));
    assert.throws(() => parseStageConfig(validCompletionConfig({ unitBase: COMMIT, unit: { heading: "bad", taskNumbers: [1] } }), WORKTREE));
  });

  it("rejects scope and stage mismatches", () => {
    assert.throws(() => parseStageConfig(validStageConfig({ scope: "completion" }), WORKTREE), /invalid lifecycle stage configuration|invalid for completion scope/i);
    assert.throws(() => parseStageConfig(validCompletionConfig({ scope: "execution" }), WORKTREE), /invalid lifecycle stage configuration/i);
    assert.throws(() => parseStageConfig(validCompletionConfig({ stage: "pr-publish" }), WORKTREE), /must not include review request metadata/);
  });

  it("rejects incomplete or out-of-worktree baseline references", () => {
    const missingBaseline = validStageConfig();
    delete missingBaseline.baseline;
    assert.throws(() => parseStageConfig(missingBaseline, WORKTREE));

    const missingUnitBase = validStageConfig();
    delete missingUnitBase.unitBase;
    assert.throws(() => parseStageConfig(missingUnitBase, WORKTREE));
    assert.throws(() => parseStageConfig(validStageConfig({ unitBase: "HEAD" }), WORKTREE));

    const outsidePlan = validStageConfig({ planPath: "/other/plan.md" });
    assert.throws(() => parseStageConfig(outsidePlan, WORKTREE));
    const sameVerifier = validStageConfig({
      stage: "verify",
      models: {
        execute: { provider: "lifecycle-test", id: "executor" },
        simplify: { provider: "lifecycle-test", id: "simplifier" },
        verify: { provider: "other", id: "executor" },
      },
    });
    assert.throws(() => parseStageConfig(sameVerifier, WORKTREE), /matches the execute model/);
  });
});

describe("parseDecisionResult", () => {
  const expected = {
    runId: "run-test-123",
    stage: "execute" as const,
    sessionId: "child-session",
    model: { provider: "lifecycle-test", id: "driver" },
    requestId: "tool-call-1",
  };
  const details = {
    protocolVersion: PROTOCOL_VERSION,
    ...expected,
    decision: "approved",
    question: "May I proceed?",
    evidence: "The fixture reached its approval gate.",
    proposal: "Continue the deterministic test.",
    context: "The test does not modify candidate files.",
  };

  it("accepts a correlated decision result with complete context", () => {
    assert.deepEqual(parseDecisionResult(details, expected), details);
  });

  it("rejects wrong stage, session, model, request ID, or invalid decision", () => {
    for (const invalid of [
      { ...details, stage: "verify" },
      { ...details, sessionId: "other" },
      { ...details, model: { provider: "other", id: "model" } },
      { ...details, requestId: "other-tool" },
      { ...details, decision: "allow" },
    ]) {
      assert.throws(() => parseDecisionResult(invalid, expected));
    }
  });
});

describe("parseLifecycleOutcomeEnvelope", () => {
  const expected = {
    runId: "run-test-123",
    stage: "execute" as const,
    sessionId: "child-session",
    model: { provider: "lifecycle-test", id: "driver" },
  };
  const envelope = {
    schemaVersion: PROTOCOL_VERSION,
    ...expected,
    outcome: "success",
    change: "changed",
    candidate: { branch: "feature", head: COMMIT, stateDigest: "d".repeat(64) },
    reportRef: "lifecycle-coordinator/runs/run-test-123/reports/execute.md",
    commitRefs: [COMMIT],
  };

  it("accepts a typed stage result with runtime identity and candidate state", () => {
    assert.deepEqual(parseLifecycleOutcomeEnvelope(envelope, expected), envelope);
  });

  it("rejects missing, mismatched, stale, or unsafe outcome data", () => {
    for (const invalid of [
      { ...envelope, stage: "verify" },
      { ...envelope, sessionId: "other" },
      { ...envelope, model: { provider: "other", id: "model" } },
      { ...envelope, candidate: { ...envelope.candidate, head: "bad" } },
      { ...envelope, candidate: { ...envelope.candidate, stateDigest: "bad" } },
      { ...envelope, reportRef: "../../outside.md" },
      { ...envelope, outcome: "VERIFIED" },
    ]) {
      assert.throws(() => parseLifecycleOutcomeEnvelope(invalid, expected));
    }
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
        { schemaVersion: PROTOCOL_VERSION, outcome: "success", change: "unchanged", report: "No candidate change." },
        "execute",
      ).outcome,
      "success",
    );
    assert.equal(
      parseLifecycleOutcome(
        { schemaVersion: PROTOCOL_VERSION, outcome: "VERIFIED", change: "not-applicable", report: "Fresh verification passed." },
        "verify",
      ).outcome,
      "VERIFIED",
    );
    assert.equal(
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "Silent ARP review is complete.",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: COMMIT,
            captureState: "complete",
            result: "clean",
            actionableFindings: 0,
            statusChecks: 3,
            reusedReview: true,
            silent: true,
          },
        },
        "arp-review",
      ).outcome,
      "success",
    );
    assert.equal(
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "Silent ARP review found stale data.",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: "f".repeat(40),
            captureState: "review-in-progress",
            result: "stale",
            actionableFindings: 2,
            statusChecks: 7,
            reusedReview: true,
            silent: false,
          },
        },
        "arp-review",
      ).outcome,
      "blocked",
    );
    assert.equal(
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "Draft PR is ready.",
          prUrl: "https://github.com/DataDog/repo/pull/123",
          publishedHeadSha: COMMIT,
        },
        "pr-publish",
      ).outcome,
      "success",
    );
  });

  it("rejects unsupported versions and stage/outcome mismatches", () => {
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: PROTOCOL_VERSION + 1, outcome: "success", change: "changed", report: "invalid version" },
        "execute",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: PROTOCOL_VERSION, outcome: "VERIFIED", change: "not-applicable", report: "wrong stage" },
        "execute",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        { schemaVersion: PROTOCOL_VERSION, outcome: "success", change: "unchanged", report: "wrong stage" },
        "verify",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "missing review evidence",
        },
        "arp-review",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "missing blocked evidence",
        },
        "arp-review",
      ),
    );
    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "missing published head",
          prUrl: "https://github.com/DataDog/repo/pull/123",
        },
        "pr-publish",
      ),
    );
  });

  it("rejects reports that exceed the byte cap even when their character count is lower", () => {
    const report = "🧪".repeat(Math.floor(MAX_STAGE_REPORT_BYTES / 4) + 1);
    assert.ok(report.length < MAX_STAGE_REPORT_BYTES);
    assert.ok(Buffer.byteLength(report, "utf8") > MAX_STAGE_REPORT_BYTES);
    assert.throws(
      () => parseLifecycleOutcome({ schemaVersion: PROTOCOL_VERSION, outcome: "success", change: "unchanged", report }, "simplify"),
      /Lifecycle report exceeds/,
    );
  });

  it("does not accept model-supplied identity fields", () => {
    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
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
