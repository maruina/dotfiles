import { execFileSync } from "node:child_process";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runCompletionPhase, type CompletionPolicy, type CompletionStageDispatch } from "./_completion.ts";
import { PROTOCOL_VERSION, type CompletionStage, type LifecycleOutcomeEnvelope, type StageConfig } from "./_protocol.ts";
import type { CandidateSnapshot } from "./_worktree.ts";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function createFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "ship-completion-test-"));
  mkdirSync(join(root, "plans", "feature"), { recursive: true });
  writeFileSync(join(root, "plans", "feature", "plan.md"), "# Plan\n");
  writeFileSync(join(root, "plans", "feature", "design.md"), "# Design\n");
  writeFileSync(join(root, "src.txt"), "baseline\n");

  git(root, "init", "--quiet", "--initial-branch=feature");
  git(root, "config", "user.name", "Lifecycle Fixture");
  git(root, "config", "user.email", "lifecycle-fixture@example.invalid");
  git(root, "config", "commit.gpgsign", "false");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "baseline");
  const baseline = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src.txt"), "head1\n");
  git(root, "add", "src.txt");
  git(root, "commit", "--quiet", "-m", "head1");
  const head1 = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src.txt"), "head2\n");
  git(root, "add", "src.txt");
  git(root, "commit", "--quiet", "-m", "head2");
  const head2 = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src.txt"), "head3\n");
  git(root, "add", "src.txt");
  git(root, "commit", "--quiet", "-m", "head3");
  const head3 = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src.txt"), "head4\n");
  git(root, "add", "src.txt");
  git(root, "commit", "--quiet", "-m", "head4");
  const head4 = git(root, "rev-parse", "HEAD");

  const planBlob = git(root, "rev-parse", `${baseline}:plans/feature/plan.md`);
  const designBlob = git(root, "rev-parse", `${baseline}:plans/feature/design.md`);
  return { root, baseline, planBlob, designBlob, head1, head2, head3, head4 };
}

const REPO = createFixtureRepo();
after(() => rmSync(REPO.root, { recursive: true, force: true }));

const BASELINE = REPO.baseline;
const HEAD1 = REPO.head1;
const HEAD2 = REPO.head2;
const HEAD3 = REPO.head3;
const HEAD4 = REPO.head4;

const CANDIDATE1: CandidateSnapshot = { branch: "feature", head: HEAD1, stateDigest: "1".repeat(64) };
const CANDIDATE2: CandidateSnapshot = { branch: "feature", head: HEAD2, stateDigest: "2".repeat(64) };
const CANDIDATE3: CandidateSnapshot = { branch: "feature", head: HEAD3, stateDigest: "3".repeat(64) };
const CANDIDATE4: CandidateSnapshot = { branch: "feature", head: HEAD4, stateDigest: "4".repeat(64) };
const PR_URL = "https://github.com/DataDog/repo/pull/123";

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

function outcome(stage: CompletionStage, candidate: CandidateSnapshot, extras: Partial<LifecycleOutcomeEnvelope> = {}): LifecycleOutcomeEnvelope {
  const base: LifecycleOutcomeEnvelope = {
    schemaVersion: PROTOCOL_VERSION,
    runId: "run-test",
    stage,
    sessionId: `session-${stage}`,
    model: stage === "verify" ? { provider: "fixture", id: "verifier" } : { provider: "fixture", id: "writer" },
    outcome: stage === "verify" ? "VERIFIED" : "success",
    change: "not-applicable",
    candidate,
    reportRef: `lifecycle-coordinator/runs/run-test/reports/${stage}.md`,
  };
  return { ...base, ...extras };
}

function reviewBlocked(
  candidate: CandidateSnapshot,
  details: Array<{ findingId: string; reviewedSha?: string }> = [{ findingId: "finding-1" }],
  settledFindingIds: string[] = [],
): LifecycleOutcomeEnvelope {
  return outcome("arp-review", candidate, {
    outcome: "blocked",
    reviewEvidence: {
      targetHeadSha: candidate.head,
      reviewedHeadSha: candidate.head,
      captureState: "complete",
      result: "findings",
      actionableFindings: details.length,
      statusChecks: 3,
      reusedReview: true,
      silent: true,
    },
    actionableFindingDetails: details.map((detail, index) => ({
      findingId: detail.findingId,
      filePath: "src/main.ts",
      startLine: 10 + index,
      endLine: 12 + index,
      reviewedSha: detail.reviewedSha ?? candidate.head,
      summary: `${detail.findingId} summary`,
    })),
    settledFindingIds,
  });
}

function reviewClean(candidate: CandidateSnapshot, settledFindingIds: string[] = []): LifecycleOutcomeEnvelope {
  return outcome("arp-review", candidate, {
    outcome: "success",
    reviewEvidence: {
      targetHeadSha: candidate.head,
      reviewedHeadSha: candidate.head,
      captureState: "complete",
      result: "clean",
      actionableFindings: 0,
      statusChecks: 5,
      reusedReview: true,
      silent: true,
    },
    settledFindingIds,
  });
}

function published(candidate: CandidateSnapshot): LifecycleOutcomeEnvelope {
  return outcome("pr-publish", candidate, {
    prUrl: PR_URL,
    publishedHeadSha: candidate.head,
    commitRefs: [candidate.head],
  });
}

function fixed(before: CandidateSnapshot, after: CandidateSnapshot, findingId = "finding-1"): LifecycleOutcomeEnvelope {
  return outcome("arp-fix", after, {
    commitRefs: [after.head],
    pendingSettlements: [
      {
        findingId,
        fixCommitSha: after.head,
        fixChangeSummary: "Apply deterministic fix",
        reason: "verified in completion verify",
      },
    ],
  });
}

async function runWithDispatch(
  dispatch: CompletionStageDispatch,
  options: { now?: () => Date; writerModelIds?: string[]; signal?: AbortSignal } = {},
) {
  return runCompletionPhase({
    policy: policy("work"),
    runId: "run-test",
    worktree: REPO.root,
    branch: "feature",
    planPath: join(REPO.root, "plans", "feature", "plan.md"),
    baselineCommit: BASELINE,
    baselinePlanPath: join(REPO.root, "plans", "feature", "plan.md"),
    baselinePlanBlob: REPO.planBlob,
    baselineDesignPath: join(REPO.root, "plans", "feature", "design.md"),
    baselineDesignBlob: REPO.designBlob,
    candidate: CANDIDATE1,
    models: completionModels(),
    writerModelIds: options.writerModelIds ?? ["fixture/writer", "fixture/simplifier"],
    thinkingLevels: { execute: "minimal", verify: "high" },
    now: options.now,
    signal: options.signal,
    dispatch,
  });
}

describe("runCompletionPhase", () => {
  it("runs publish → review → fix → verify → publish → review and settles addressed findings", async () => {
    const calls: Array<{ stage: CompletionStage; config: StageConfig }> = [];
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      calls.push({ stage, config });
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      if (stage === "arp-review") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        if (calls.filter((call) => call.stage === "arp-review").length === 1) {
          return { status: "settled", outcome: reviewBlocked(candidate, [{ findingId: "invalid-1", reviewedSha: HEAD1 }, { findingId: "bug-1", reviewedSha: "f".repeat(40) }], ["invalid-1"]) };
        }
        return { status: "settled", outcome: reviewClean(candidate, ["bug-1"]) };
      }
      if (stage === "arp-fix") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        assert.equal(config.scope, "completion");
        assert.equal(config.thinkingLevel, "minimal");
        assert.equal(config.completion.fixRequest?.findings[1]?.reviewedSha, "f".repeat(40));
        return { status: "settled", outcome: fixed(candidate, CANDIDATE2, "bug-1") };
      }
      assert.equal(stage, "verify");
      assert.equal(config.scope, "completion");
      assert.equal(config.thinkingLevel, "high");
      assert.deepEqual(config.completion.verificationWriters, ["fixture/writer", "fixture/simplifier"]);
      return { status: "settled", outcome: outcome("verify", CANDIDATE2, { outcome: "VERIFIED" }) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "verified");
    assert.equal(result.reviewedHead, HEAD2);
    assert.deepEqual(result.settledFindingIds.sort(), ["bug-1", "invalid-1"]);
    assert.deepEqual(calls.map((call) => call.stage), ["pr-publish", "arp-review", "arp-fix", "verify", "pr-publish", "arp-review"]);

    const secondReview = calls.filter((call) => call.stage === "arp-review")[1]!;
    assert.equal(secondReview.config.scope, "completion");
    assert.deepEqual(secondReview.config.completion.pendingSettlements?.map((entry) => entry.findingId), ["bug-1"]);
  });

  it("runs publication then silent exact-head review for work policy", async () => {
    const calls: Array<{ stage: CompletionStage; config: StageConfig }> = [];
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push({ stage, config });
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      assert.equal(stage, "arp-review");
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      return { status: "settled", outcome: reviewClean(candidate) };
    }, { now: () => new Date("2026-01-01T00:00:00.000Z") });

    assert.equal(result.status, "verified");
    assert.deepEqual(calls.map((call) => call.stage), ["pr-publish", "arp-review"]);
    assert.equal(calls[1]!.config.scope, "completion");
    const reviewRequest = calls[1]!.config.completion.reviewRequest!;
    assert.equal(reviewRequest.expectedHeadSha, HEAD1);
    assert.equal(reviewRequest.silent, true);
    assert.equal(reviewRequest.maxStatusChecks, 30);
    assert.deepEqual(reviewRequest.pollIntervalsSeconds, [10, 30, 60]);
  });

  it("does not retry a failed arp-review dispatch outside one review session", async () => {
    const calls: CompletionStage[] = [];
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push(stage);
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      return { status: "failure", reason: "review request failed" };
    });

    assert.equal(result.status, "process-failure");
    assert.equal(result.stage, "arp-review");
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("rejects arp-review success without typed review evidence", async () => {
    const result = await runWithDispatch(async ({ stage, config }) => {
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      return {
        status: "settled",
        outcome: outcome("arp-review", CANDIDATE1, {
          outcome: "success",
        }),
      };
    });

    assert.equal(result.status, "process-failure");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /structured review evidence/i);
  });

  it("blocks findings review evidence with incomplete capture before arp-fix", async () => {
    const calls: CompletionStage[] = [];
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push(stage);
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      return {
        status: "settled",
        outcome: outcome("arp-review", CANDIDATE1, {
          outcome: "blocked",
          reviewEvidence: {
            targetHeadSha: HEAD1,
            reviewedHeadSha: HEAD1,
            captureState: "review-in-progress",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: true,
          },
          actionableFindingDetails: [
            {
              findingId: "finding-1",
              filePath: "src/main.ts",
              startLine: 10,
              endLine: 12,
              reviewedSha: HEAD1,
              summary: "fixture",
            },
          ],
        }),
      };
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /incomplete or non-silent/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("blocks findings review evidence when silent mode is not confirmed", async () => {
    const calls: CompletionStage[] = [];
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push(stage);
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      return {
        status: "settled",
        outcome: outcome("arp-review", CANDIDATE1, {
          outcome: "blocked",
          reviewEvidence: {
            targetHeadSha: HEAD1,
            reviewedHeadSha: HEAD1,
            captureState: "complete",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 3,
            reusedReview: true,
            silent: false,
          },
          actionableFindingDetails: [
            {
              findingId: "finding-1",
              filePath: "src/main.ts",
              startLine: 10,
              endLine: 12,
              reviewedSha: HEAD1,
              summary: "fixture",
            },
          ],
        }),
      };
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /reused prior review evidence without established silent mode|incomplete or non-silent/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("blocks ambiguous findings without running arp-fix", async () => {
    const calls: CompletionStage[] = [];
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      calls.push(stage);
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      return {
        status: "settled",
        outcome: outcome("arp-review", CANDIDATE1, {
          outcome: "blocked",
          reviewEvidence: {
            targetHeadSha: HEAD1,
            reviewedHeadSha: HEAD1,
            captureState: "complete",
            result: "findings",
            actionableFindings: 1,
            statusChecks: 1,
            reusedReview: true,
            silent: true,
          },
          actionableFindingDetails: [],
        }),
      };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /without complete structured finding details/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("stops on third reviewed head with unresolved findings and does not run an unreviewed fix", async () => {
    let reviewCount = 0;
    let fixCount = 0;
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") {
        return { status: "settled", outcome: published(candidate) };
      }
      if (stage === "arp-review") {
        reviewCount += 1;
        const settledFindingIds = config.scope === "completion"
          ? (config.completion.pendingSettlements ?? []).map((entry) => entry.findingId)
          : [];
        return { status: "settled", outcome: reviewBlocked(candidate, [{ findingId: "finding-1" }], settledFindingIds) };
      }
      if (stage === "arp-fix") {
        fixCount += 1;
        if (fixCount === 1) return { status: "settled", outcome: fixed(CANDIDATE1, CANDIDATE2) };
        return { status: "settled", outcome: fixed(CANDIDATE2, CANDIDATE3) };
      }
      assert.equal(stage, "verify");
      return { status: "settled", outcome: outcome("verify", fixCount === 1 ? CANDIDATE2 : CANDIDATE3, { outcome: "VERIFIED" }) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /reached 3 reviewed heads/i);
    assert.equal(reviewCount, 3);
    assert.equal(fixCount, 2);
  });

  it("blocks when completion verify fails and does not publish or settle fix findings", async () => {
    const calls: CompletionStage[] = [];
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      calls.push(stage);
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") return { status: "settled", outcome: published(candidate) };
      if (stage === "arp-review") return { status: "settled", outcome: reviewBlocked(candidate) };
      if (stage === "arp-fix") return { status: "settled", outcome: fixed(CANDIDATE1, CANDIDATE2) };
      return { status: "settled", outcome: outcome("verify", CANDIDATE2, { outcome: "BLOCKED" }) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "verify");
    assert.match(result.reason, /returned BLOCKED/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review", "arp-fix", "verify"]);
  });

  it("blocks partial addressed settlement after verified fix", async () => {
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") return { status: "settled", outcome: published(candidate) };
      if (stage === "arp-review" && candidate.head === HEAD1) return { status: "settled", outcome: reviewBlocked(candidate) };
      if (stage === "arp-fix") return { status: "settled", outcome: fixed(CANDIDATE1, CANDIDATE2) };
      if (stage === "verify") return { status: "settled", outcome: outcome("verify", CANDIDATE2, { outcome: "VERIFIED" }) };
      return { status: "settled", outcome: reviewClean(candidate, []) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /settled only 0 of 1 addressed findings/i);
  });

  it("completes dismissal-only review without extra fix or re-review", async () => {
    const calls: CompletionStage[] = [];
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      calls.push(stage);
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      assert.equal(stage, "arp-review");
      return { status: "settled", outcome: reviewClean(CANDIDATE1, ["invalid-1"]) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "verified");
    assert.deepEqual(result.settledFindingIds, ["invalid-1"]);
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("uses verified candidate head as expected review target and blocks published-head mismatch", async () => {
    const dispatch: CompletionStageDispatch = async ({ stage }) => {
      if (stage === "pr-publish") {
        return {
          status: "settled",
          outcome: outcome("pr-publish", CANDIDATE1, {
            prUrl: PR_URL,
            publishedHeadSha: "f".repeat(40),
            commitRefs: ["f".repeat(40)],
          }),
        };
      }
      return { status: "settled", outcome: reviewClean(CANDIDATE1) };
    };

    const result = await runWithDispatch(dispatch);

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "pr-publish");
    assert.match(result.reason, /does not match the verified candidate head/);
  });

  it("blocks before completion verify when writer metadata includes verifier identity", async () => {
    const dispatch: CompletionStageDispatch = async () => {
      throw new Error("dispatch must not run");
    };

    const result = await runWithDispatch(dispatch, { writerModelIds: ["fixture/verifier"] });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "verify");
    assert.match(result.reason, /includes the verifier identity/i);
  });

  it("blocks arp-fix settlement metadata for unrelated findings", async () => {
    const calls: CompletionStage[] = [];
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push(stage);
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") return { status: "settled", outcome: published(candidate) };
      if (stage === "arp-review") return { status: "settled", outcome: reviewBlocked(candidate) };
      assert.equal(stage, "arp-fix");
      return {
        status: "settled",
        outcome: outcome("arp-fix", CANDIDATE2, {
          commitRefs: [HEAD2],
          pendingSettlements: [
            {
              findingId: "finding-unrelated",
              fixCommitSha: HEAD2,
              fixChangeSummary: "fixture",
              reason: "fixture",
            },
          ],
        }),
      };
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-fix");
    assert.match(result.reason, /unrelated finding/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review", "arp-fix"]);
  });

  it("preserves settled and remaining finding IDs when review settles after deadline", async () => {
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const result = await runWithDispatch(async ({ stage, config }) => {
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") return { status: "settled", outcome: published(candidate) };
      nowMs += 21 * 60 * 1000;
      return {
        status: "settled",
        outcome: reviewBlocked(candidate, [{ findingId: "invalid-1" }, { findingId: "bug-1" }], ["invalid-1"]),
      };
    }, { now: () => new Date(nowMs) });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /did not complete before deadline/i);
    assert.deepEqual(result.settledFindingIds, ["invalid-1"]);
    assert.deepEqual(result.remainingFindingIds, ["bug-1"]);
  });

  it("stops before arp-fix dispatch when cancellation is observed after review returns", async () => {
    const calls: CompletionStage[] = [];
    const signal = new AbortController();
    const result = await runWithDispatch(async ({ stage, config }) => {
      calls.push(stage);
      const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
      if (stage === "pr-publish") return { status: "settled", outcome: published(candidate) };
      signal.abort();
      return { status: "settled", outcome: reviewBlocked(candidate) };
    }, { signal: signal.signal });

    assert.equal(result.status, "cancelled");
    assert.equal(result.stage, "arp-fix");
    assert.match(result.reason, /before arp-fix started/i);
    assert.deepEqual(calls, ["pr-publish", "arp-review"]);
  });

  it("blocks completion on invalid policy only at completion entry", async () => {
    const dispatch: CompletionStageDispatch = async () => {
      throw new Error("dispatch must not run");
    };

    const result = await runCompletionPhase({
      policy: policy("invalid"),
      runId: "run-test",
      worktree: REPO.root,
      branch: "feature",
      planPath: join(REPO.root, "plans", "feature", "plan.md"),
      baselineCommit: BASELINE,
      baselinePlanPath: join(REPO.root, "plans", "feature", "plan.md"),
      baselinePlanBlob: REPO.planBlob,
      baselineDesignPath: join(REPO.root, "plans", "feature", "design.md"),
      baselineDesignBlob: REPO.designBlob,
      candidate: CANDIDATE1,
      models: completionModels(),
      writerModelIds: ["fixture/writer", "fixture/simplifier"],
      thinkingLevels: { execute: "minimal", verify: "high" },
      dispatch,
    });

    assert.equal(result.status, "blocked");
    assert.match(result.reason, /profile policy/i);
  });

  it("skips completion for personal policy", async () => {
    const dispatch: CompletionStageDispatch = async () => {
      throw new Error("dispatch must not run");
    };

    const result = await runCompletionPhase({
      policy: policy("personal"),
      runId: "run-test",
      worktree: REPO.root,
      branch: "feature",
      planPath: join(REPO.root, "plans", "feature", "plan.md"),
      baselineCommit: BASELINE,
      baselinePlanPath: join(REPO.root, "plans", "feature", "plan.md"),
      baselinePlanBlob: REPO.planBlob,
      baselineDesignPath: join(REPO.root, "plans", "feature", "design.md"),
      baselineDesignBlob: REPO.designBlob,
      candidate: CANDIDATE1,
      models: completionModels(),
      writerModelIds: ["fixture/writer", "fixture/simplifier"],
      thinkingLevels: { execute: "minimal", verify: "high" },
      dispatch,
    });

    assert.equal(result.status, "skipped");
  });

  it("blocks late review success after deadline", async () => {
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const dispatch: CompletionStageDispatch = async ({ stage, config }) => {
      if (stage === "pr-publish") {
        const candidate = config.scope === "completion" ? config.completion.candidate : CANDIDATE1;
        return { status: "settled", outcome: published(candidate) };
      }
      nowMs += 21 * 60 * 1000;
      return { status: "settled", outcome: reviewClean(CANDIDATE1) };
    };

    const result = await runWithDispatch(dispatch, { now: () => new Date(nowMs) });

    assert.equal(result.status, "blocked");
    assert.equal(result.stage, "arp-review");
    assert.match(result.reason, /did not complete before deadline/i);
  });
});
