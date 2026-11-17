import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { runCompletionPhase, type CompletionPolicy, type CompletionStageDispatch } from "./_completion.ts";
import { PROTOCOL_VERSION } from "./_protocol.ts";
import type { CandidateSnapshot } from "./_worktree.ts";

const BASELINE = "a".repeat(40);
const HEAD = "b".repeat(40);

const CANDIDATE: CandidateSnapshot = { branch: "feature", head: HEAD, stateDigest: "c".repeat(64) };

function policy(kind: CompletionPolicy["kind"]): CompletionPolicy {
  if (kind === "invalid") return { kind, reason: "missing profile" };
  return { kind };
}

function completionModels() {
  return {
    execute: { provider: "fixture", id: "writer" },
    simplify: { provider: "fixture", id: "simplifier" },
    verify: { provider: "fixture", id: "verifier" },
  };
}

type ReviewVerdict = "success" | "blocked" | "failure" | "success-missing-evidence";

function makeDispatch(overrides: {
  publishOutcome?: "success" | "blocked";
  publishedHeadSha?: string;
  reviewVerdict?: ReviewVerdict;
} = {}): {
  calls: Array<{ stage: string; signalAbortedAtStart: boolean; config: Record<string, unknown> }>;
  dispatch: CompletionStageDispatch;
} {
  const calls: Array<{ stage: string; signalAbortedAtStart: boolean; config: Record<string, unknown> }> = [];
  const dispatch: CompletionStageDispatch = async ({ stage, config, signal }) => {
    calls.push({ stage, signalAbortedAtStart: signal?.aborted === true, config: config as unknown as Record<string, unknown> });
    if (stage === "pr-publish") {
      return {
        status: "settled",
        outcome: {
          schemaVersion: PROTOCOL_VERSION,
          runId: "run-test",
          stage,
          sessionId: "session-pr",
          model: { provider: "fixture", id: "writer" },
          outcome: overrides.publishOutcome ?? "success",
          change: "not-applicable",
          candidate: CANDIDATE,
          reportRef: "lifecycle-coordinator/runs/run-test/reports/pr-publish.md",
          prUrl: "https://github.com/DataDog/repo/pull/123",
          publishedHeadSha: overrides.publishedHeadSha ?? HEAD,
          commitRefs: [HEAD],
        },
      };
    }

    const verdict = overrides.reviewVerdict ?? "success";
    if (verdict === "failure") {
      return {
        status: "failure",
        reason: "review request failed",
      };
    }
    if (verdict === "success-missing-evidence") {
      return {
        status: "settled",
        outcome: {
          schemaVersion: PROTOCOL_VERSION,
          runId: "run-test",
          stage,
          sessionId: "session-arp",
          model: { provider: "fixture", id: "writer" },
          outcome: "success",
          change: "not-applicable",
          candidate: CANDIDATE,
          reportRef: "lifecycle-coordinator/runs/run-test/reports/arp-review.md",
        },
      };
    }
    return {
      status: "settled",
      outcome: {
        schemaVersion: PROTOCOL_VERSION,
        runId: "run-test",
        stage,
        sessionId: "session-arp",
        model: { provider: "fixture", id: "writer" },
        outcome: verdict,
        change: "not-applicable",
        candidate: CANDIDATE,
        reportRef: "lifecycle-coordinator/runs/run-test/reports/arp-review.md",
        reviewEvidence: {
          targetHeadSha: HEAD,
          reviewedHeadSha: HEAD,
          captureState: verdict === "success" ? "complete" : "review-in-progress",
          result: verdict === "success" ? "clean" : "findings",
          actionableFindings: verdict === "success" ? 0 : 2,
          statusChecks: 5,
          reusedReview: true,
          silent: true,
        },
      },
    };
  };
  return { calls, dispatch };
}

async function runWithDispatch(dispatch: CompletionStageDispatch, now?: () => Date) {
  return runCompletionPhase({
    policy: policy("work"),
    runId: "run-test",
    worktree: "/repo",
    branch: "feature",
    planPath: "/repo/plans/feature/plan.md",
    baselineCommit: BASELINE,
    baselinePlanPath: "/repo/plans/feature/plan.md",
    baselinePlanBlob: "d".repeat(40),
    baselineDesignPath: "/repo/plans/feature/design.md",
    baselineDesignBlob: "e".repeat(40),
    candidate: CANDIDATE,
    models: completionModels(),
    thinkingLevel: "minimal",
    now,
    dispatch,
  });
}

describe("runCompletionPhase", () => {
  it("runs publication then silent exact-head review for work policy", async () => {
    const { calls, dispatch } = makeDispatch();
    const result = await runWithDispatch(dispatch, () => new Date("2026-01-01T00:00:00.000Z"));

    assert.deepEqual(calls.map((call) => call.stage), ["pr-publish", "arp-review"]);
    const reviewConfig = (calls[1]!.config.completion as Record<string, unknown>).reviewRequest as Record<string, unknown>;
    assert.equal(reviewConfig.expectedHeadSha, HEAD);
    assert.equal(reviewConfig.silent, true);
    assert.equal(reviewConfig.maxStatusChecks, 30);
    assert.deepEqual(reviewConfig.pollIntervalsSeconds, [10, 30, 60]);
    assert.equal(typeof reviewConfig.deadlineAt, "string");
    assert.equal(result.status, "verified");
  });

  it("uses the verified candidate head as expected review target and blocks published-head mismatch", async () => {
    const { dispatch } = makeDispatch({ publishedHeadSha: "f".repeat(40) });
    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "pr-publish");
    assert.match(result.reason, /does not match the verified candidate head/);
  });

  it("does not retry a failed arp-review dispatch outside one review session", async () => {
    const { calls, dispatch } = makeDispatch({ reviewVerdict: "failure" });
    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "process-failure");
    assert.equal(result.stage, "arp-review");
    assert.deepEqual(calls.map((call) => call.stage), ["pr-publish", "arp-review"]);
  });

  it("rejects arp-review success without typed review evidence", async () => {
    const { dispatch } = makeDispatch({ reviewVerdict: "success-missing-evidence" });
    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "process-failure");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /structured review evidence/i);
  });

  it("blocks when arp-review returns actionable findings", async () => {
    const { dispatch } = makeDispatch({ reviewVerdict: "blocked" });
    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
  });

  it("blocks late review success after the configured deadline", async () => {
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const { dispatch } = makeDispatch();
    const result = await runWithDispatch(
      async (request) => {
        if (request.stage === "arp-review") nowMs += 21 * 60 * 1000;
        return dispatch(request);
      },
      () => new Date(nowMs),
    );

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /did not complete before deadline/i);
  });

  it("skips completion for personal policy", async () => {
    const { calls, dispatch } = makeDispatch();
    const result = await runCompletionPhase({
      policy: policy("personal"),
      runId: "run-test",
      worktree: "/repo",
      branch: "feature",
      planPath: "/repo/plans/feature/plan.md",
      baselineCommit: BASELINE,
      baselinePlanPath: "/repo/plans/feature/plan.md",
      baselinePlanBlob: "d".repeat(40),
      baselineDesignPath: "/repo/plans/feature/design.md",
      baselineDesignBlob: "e".repeat(40),
      candidate: CANDIDATE,
      models: completionModels(),
      thinkingLevel: "minimal",
      dispatch,
    });

    assert.equal(result.status, "skipped");
    assert.equal(calls.length, 0);
  });

  it("blocks completion on invalid policy only at completion entry", async () => {
    const { calls, dispatch } = makeDispatch();
    const result = await runCompletionPhase({
      policy: policy("invalid"),
      runId: "run-test",
      worktree: "/repo",
      branch: "feature",
      planPath: "/repo/plans/feature/plan.md",
      baselineCommit: BASELINE,
      baselinePlanPath: "/repo/plans/feature/plan.md",
      baselinePlanBlob: "d".repeat(40),
      baselineDesignPath: "/repo/plans/feature/design.md",
      baselineDesignBlob: "e".repeat(40),
      candidate: CANDIDATE,
      models: completionModels(),
      thinkingLevel: "minimal",
      dispatch,
    });

    assert.equal(result.status, "blocked");
    assert.match(result.reason, /profile policy/i);
    assert.equal(calls.length, 0);
  });
});
