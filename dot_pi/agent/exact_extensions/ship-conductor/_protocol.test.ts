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
const NEXT_COMMIT = "b".repeat(40);
const PLAN_BLOB = "c".repeat(40);
const DESIGN_BLOB = "d".repeat(40);

function validExecutionConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function validCompletionBase(stage: string): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    scope: "completion",
    runId: "run-test-123",
    stage,
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
    stageModel: stage === "verify" ? { provider: "lifecycle-test", id: "verifier" } : { provider: "lifecycle-test", id: "executor" },
    thinkingLevel: "minimal",
    completion: {
      policy: "work",
      candidate: { branch: "feature", head: COMMIT, stateDigest: "e".repeat(64) },
    },
  };
}

function withCompletion(stage: "pr-publish" | "arp-review" | "arp-fix" | "verify", completionOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = validCompletionBase(stage);
  const completion = {
    ...(base.completion as Record<string, unknown>),
    ...completionOverrides,
  };
  return { ...base, completion };
}

describe("parseStageConfig", () => {
  it("accepts a versioned execution stage contract pinned to the expected worktree", () => {
    const config = validExecutionConfig();
    assert.deepEqual(parseStageConfig(config, WORKTREE), config);
  });

  it("accepts completion configs for publish, review, fix, and feature verify", () => {
    const publish = withCompletion("pr-publish");
    const review = withCompletion("arp-review", {
      reviewRequest: {
        prUrl: "https://github.com/DataDog/repo/pull/123",
        expectedHeadSha: COMMIT,
        deadlineAt: "2026-01-01T00:20:00.000Z",
        maxStatusChecks: 30,
        pollIntervalsSeconds: [10, 30, 60],
        silent: true,
      },
      pendingSettlements: [{ findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" }],
    });
    const fix = withCompletion("arp-fix", {
      fixRequest: {
        prUrl: "https://github.com/DataDog/repo/pull/123",
        reviewedHeadSha: COMMIT,
        findings: [{ findingId: "finding-1", filePath: "src/main.ts", startLine: 2, endLine: 4, reviewedSha: COMMIT, summary: "summary" }],
      },
    });
    const verify = withCompletion("verify", {
      verificationWriters: ["lifecycle-test/executor", "lifecycle-test/simplifier"],
    });

    assert.deepEqual(parseStageConfig(publish, WORKTREE), publish);
    assert.deepEqual(parseStageConfig(review, WORKTREE), review);
    assert.deepEqual(parseStageConfig(fix, WORKTREE), fix);
    assert.deepEqual(parseStageConfig(verify, WORKTREE), verify);
  });

  it("accepts verification writer references whose model IDs contain slashes", () => {
    const slashed = {
      ...validCompletionBase("verify"),
      models: {
        execute: { provider: "openai", id: "openai/gpt-5.3-codex" },
        simplify: { provider: "anthropic", id: "claude-4.5-sonnet" },
        verify: { provider: "google", id: "gemini-2.5-pro" },
      },
      stageModel: { provider: "google", id: "gemini-2.5-pro" },
      completion: {
        policy: "work",
        candidate: { branch: "feature", head: COMMIT, stateDigest: "e".repeat(64) },
        verificationWriters: ["openai/openai/gpt-5.3-codex", "anthropic/claude-4.5-sonnet"],
      },
    };

    assert.deepEqual(parseStageConfig(slashed, WORKTREE), slashed);
  });

  it("rejects completion configs with wrong stage metadata", () => {
    assert.throws(() => parseStageConfig(withCompletion("pr-publish", {
      reviewRequest: {
        prUrl: "https://github.com/DataDog/repo/pull/123",
        expectedHeadSha: COMMIT,
        deadlineAt: "2026-01-01T00:20:00.000Z",
        maxStatusChecks: 30,
        pollIntervalsSeconds: [10, 30, 60],
        silent: true,
      },
    }), WORKTREE), /pr-publish stage accepts only policy and candidate metadata/i);

    assert.throws(() => parseStageConfig(withCompletion("arp-review"), WORKTREE), /requires review request metadata/i);

    assert.throws(() => parseStageConfig(withCompletion("arp-fix", {
      fixRequest: {
        prUrl: "https://github.com/DataDog/repo/pull/123",
        reviewedHeadSha: COMMIT,
        findings: [],
      },
    }), WORKTREE), /invalid lifecycle stage configuration|requires actionable findings/i);

    assert.throws(() => parseStageConfig(withCompletion("verify", {
      verificationWriters: ["executor"],
    }), WORKTREE), /canonical provider\/id identities/i);

    assert.throws(() => parseStageConfig(withCompletion("verify", {
      verificationWriters: ["lifecycle-test/"],
    }), WORKTREE), /canonical provider\/id identities/i);

    assert.throws(() => parseStageConfig(withCompletion("verify", {
      verificationWriters: [" lifecycle-test /verifier "],
    }), WORKTREE), /canonical provider\/id identities/i);

    assert.throws(() => parseStageConfig(withCompletion("verify", {
      verificationWriters: ["lifecycle-test/verifier"],
    }), WORKTREE), /includes the verifier identity/i);

    assert.throws(() => parseStageConfig(withCompletion("verify", {
      verificationWriters: ["other-provider/verifier"],
    }), WORKTREE), /includes the verifier identity/i);
  });

  it("rejects unsupported version, stage, or worktree", () => {
    assert.throws(() => parseStageConfig(validExecutionConfig({ protocolVersion: PROTOCOL_VERSION + 1 }), WORKTREE));
    assert.throws(() => parseStageConfig(validExecutionConfig({ stage: "repair" }), WORKTREE));
    assert.throws(() => parseStageConfig(validExecutionConfig({ worktree: "/other" }), WORKTREE));
  });

  it("rejects scope and stage mismatches", () => {
    assert.throws(() => parseStageConfig(validExecutionConfig({ scope: "completion" }), WORKTREE), /invalid lifecycle stage configuration|invalid for completion scope/i);
    const reviewAsExecution = {
      ...withCompletion("arp-review", {
        reviewRequest: {
          prUrl: "https://github.com/DataDog/repo/pull/123",
          expectedHeadSha: COMMIT,
          deadlineAt: "2026-01-01T00:20:00.000Z",
          maxStatusChecks: 30,
          pollIntervalsSeconds: [10, 30, 60],
          silent: true,
        },
      }),
      scope: "execution",
    };
    assert.throws(() => parseStageConfig(reviewAsExecution, WORKTREE), /invalid lifecycle stage configuration/i);
  });

  it("rejects incomplete or out-of-worktree baseline references", () => {
    const missingBaseline = validExecutionConfig();
    delete missingBaseline.baseline;
    assert.throws(() => parseStageConfig(missingBaseline, WORKTREE));

    const outsidePlan = validExecutionConfig({ planPath: "/other/plan.md" });
    assert.throws(() => parseStageConfig(outsidePlan, WORKTREE));

    const sameVerifier = validExecutionConfig({
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
    stage: "arp-fix" as const,
    sessionId: "child-session",
    model: { provider: "lifecycle-test", id: "driver" },
  };
  const envelope = {
    schemaVersion: PROTOCOL_VERSION,
    ...expected,
    outcome: "success",
    change: "not-applicable",
    candidate: { branch: "feature", head: NEXT_COMMIT, stateDigest: "f".repeat(64) },
    reportRef: "lifecycle-coordinator/runs/run-test-123/reports/arp-fix.md",
    commitRefs: [NEXT_COMMIT],
    pendingSettlements: [{ findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" }],
  };

  it("accepts typed completion metadata for arp-fix", () => {
    assert.deepEqual(parseLifecycleOutcomeEnvelope(envelope, expected), envelope);
  });

  it("accepts a typed execution outcome envelope", () => {
    const executionExpected = {
      runId: "run-test-123",
      stage: "execute" as const,
      sessionId: "child-session",
      model: { provider: "lifecycle-test", id: "driver" },
    };
    const executionEnvelope = {
      schemaVersion: PROTOCOL_VERSION,
      ...executionExpected,
      outcome: "success",
      change: "changed",
      candidate: { branch: "feature", head: COMMIT, stateDigest: "a".repeat(64) },
      reportRef: "lifecycle-coordinator/runs/run-test-123/reports/execute.md",
      commitRefs: [COMMIT],
    };
    assert.deepEqual(parseLifecycleOutcomeEnvelope(executionEnvelope, executionExpected), executionEnvelope);
  });

  it("rejects mismatched identity or unsafe report references", () => {
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, stage: "arp-review" }, expected));
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, sessionId: "other" }, expected));
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, model: { provider: "other", id: "driver" } }, expected));
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, reportRef: "../../outside.md" }, expected));
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, candidate: { ...envelope.candidate, head: "bad" } }, expected));
    assert.throws(() => parseLifecycleOutcomeEnvelope({ ...envelope, candidate: { ...envelope.candidate, stateDigest: "bad" } }, expected));
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
  it("accepts stage-appropriate outcomes and completion metadata", () => {
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
          report: "Draft PR is ready.",
          prUrl: "https://github.com/DataDog/repo/pull/123",
          publishedHeadSha: COMMIT,
          commitRefs: [COMMIT],
        },
        "pr-publish",
      ).outcome,
      "success",
    );

    assert.equal(
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "Findings require fixes.",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: COMMIT,
            captureState: "complete",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: true,
          },
          actionableFindingDetails: [{ findingId: "finding-1", filePath: "src/main.ts", startLine: 10, endLine: 12, reviewedSha: COMMIT, summary: "summary" }],
          settledFindingIds: ["false-positive-1"],
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
          report: "Applied fix commit.",
          commitRefs: [NEXT_COMMIT],
          pendingSettlements: [{ findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" }],
        },
        "arp-fix",
      ).outcome,
      "success",
    );
  });

  it("rejects unsupported versions and stage/outcome metadata mismatches", () => {
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
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "missing commit refs",
          prUrl: "https://github.com/DataDog/repo/pull/123",
          publishedHeadSha: COMMIT,
        },
        "pr-publish",
      ),
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "findings without details",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: COMMIT,
            captureState: "complete",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: true,
          },
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
          report: "findings capture incomplete",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: COMMIT,
            captureState: "review-in-progress",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: true,
          },
          actionableFindingDetails: [{ findingId: "finding-1", filePath: "src/main.ts", startLine: 10, endLine: 12, reviewedSha: COMMIT, summary: "summary" }],
        },
        "arp-review",
      ),
      /captureState complete/i,
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "findings not silent",
          reviewEvidence: {
            targetHeadSha: COMMIT,
            reviewedHeadSha: COMMIT,
            captureState: "complete",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: false,
          },
          actionableFindingDetails: [{ findingId: "finding-1", filePath: "src/main.ts", startLine: 10, endLine: 12, reviewedSha: COMMIT, summary: "summary" }],
        },
        "arp-review",
      ),
      /silent review evidence/i,
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "fix without pending settlements",
          commitRefs: [NEXT_COMMIT],
        },
        "arp-fix",
      ),
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "fix duplicate commits",
          commitRefs: [NEXT_COMMIT, NEXT_COMMIT],
          pendingSettlements: [{ findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" }],
        },
        "arp-fix",
      ),
      /commitRefs must be unique/i,
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "fix duplicate settlement ids",
          commitRefs: [NEXT_COMMIT],
          pendingSettlements: [
            { findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" },
            { findingId: "finding-1", fixCommitSha: NEXT_COMMIT, fixChangeSummary: "summary", reason: "reason" },
          ],
        },
        "arp-fix",
      ),
      /pending settlement IDs must be unique/i,
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "success",
          change: "not-applicable",
          report: "fix settlement commit missing",
          commitRefs: [NEXT_COMMIT],
          pendingSettlements: [{ findingId: "finding-1", fixCommitSha: COMMIT, fixChangeSummary: "summary", reason: "reason" }],
        },
        "arp-fix",
      ),
      /settlement commit must be included in commitRefs/i,
    );

    assert.throws(() =>
      parseLifecycleOutcome(
        {
          schemaVersion: PROTOCOL_VERSION,
          outcome: "blocked",
          change: "not-applicable",
          report: "bad metadata for verify",
          settledFindingIds: ["finding-1"],
        },
        "verify",
      ),
    );
  });

  it("rejects reports that exceed the byte cap even when character count is lower", () => {
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
