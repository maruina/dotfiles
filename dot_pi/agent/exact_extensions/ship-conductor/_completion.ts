import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROTOCOL_VERSION,
  parseStageConfig,
  type CompletionStage,
  type LifecycleOutcomeEnvelope,
  type StageConfig,
} from "./_protocol.ts";
import type { CandidateSnapshot } from "./_worktree.ts";
import type { Publisher } from "./_publish.ts";

export type CompletionStep = CompletionStage | "pr-publish";
import { sameKnownModel, type ModelIdentity } from "./_models.ts";

const PROFILE_FILE = "ship-conductor-profile.json";
const REVIEW_DEADLINE_MS = 20 * 60 * 1000;
const REVIEW_MAX_STATUS_CHECKS = 30;
const REVIEW_POLL_INTERVALS_SECONDS = [10, 30, 60] as const;
const MAX_REVIEWED_HEADS = 3;

export type CompletionPolicy =
  | { kind: "work" }
  | { kind: "personal" }
  | { kind: "invalid"; reason: string };

export type CompletionStageDispatch = (request: {
  stage: CompletionStage;
  prompt: string;
  config: StageConfig;
  signal: AbortSignal | undefined;
}) => Promise<
  | { status: "settled"; outcome: LifecycleOutcomeEnvelope }
  | { status: "blocked" | "cancelled" | "failure"; reason: string }
>;

export type CompletionPhaseResult =
  | { status: "skipped"; reason: string }
  | {
      status: "verified";
      prUrl: string;
      reviewedHead: string;
      deadlineAt: string;
      settledFindingIds: string[];
      reviewedHeads: string[];
      remainingFindingIds: string[];
    }
  | {
      status: "blocked";
      stage: CompletionStep | "transition";
      reason: string;
      prUrl?: string;
      headSha?: string;
      settledFindingIds: string[];
      reviewedHeads: string[];
      remainingFindingIds: string[];
    }
  | {
      status: "cancelled" | "process-failure";
      stage: CompletionStep;
      reason: string;
      prUrl?: string;
      headSha?: string;
      settledFindingIds: string[];
      reviewedHeads: string[];
      remainingFindingIds: string[];
    };

export type CompletionPhaseInput = {
  policy: CompletionPolicy;
  runId: string;
  worktree: string;
  branch: string;
  planPath: string;
  baselineCommit: string;
  baselinePlanPath: string;
  baselinePlanBlob: string;
  baselineDesignPath: string;
  baselineDesignBlob: string;
  candidate: CandidateSnapshot;
  models: { execute: ModelIdentity; simplify: ModelIdentity; verify: ModelIdentity };
  writerModelIds: string[];
  thinkingLevels: { execute: string; verify: string };
  now?: () => Date;
  signal?: AbortSignal;
  publish: Publisher;
  dispatch: CompletionStageDispatch;
};

type ProfileFile = { schemaVersion: 1; profile: "work" | "personal" };
type PendingSettlement = NonNullable<LifecycleOutcomeEnvelope["pendingSettlements"]>[number];
type FindingDetail = NonNullable<LifecycleOutcomeEnvelope["actionableFindingDetails"]>[number];

function gitText(worktree: string, args: string[]): string {
  return execFileSync("git", ["-C", worktree, ...args], { encoding: "utf8" }).trim();
}

function isAncestorCommit(worktree: string, ancestor: string, descendant: string): boolean {
  try {
    gitText(worktree, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException & { status?: number }).status;
    if (code === 1) return false;
    throw error;
  }
}

function parseProfile(value: unknown): CompletionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kind: "invalid", reason: "ship-conductor profile file is not a JSON object" };
  }
  const profile = value as Partial<ProfileFile>;
  if (profile.schemaVersion !== 1) {
    return { kind: "invalid", reason: "ship-conductor profile schemaVersion must be 1" };
  }
  if (profile.profile === "work") return { kind: "work" };
  if (profile.profile === "personal") return { kind: "personal" };
  return { kind: "invalid", reason: "ship-conductor profile must be work or personal" };
}

export function loadCompletionPolicy(agentDirectory: string): CompletionPolicy {
  const path = join(agentDirectory, PROFILE_FILE);
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parseProfile(parsed);
  } catch (error) {
    return {
      kind: "invalid",
      reason: `cannot read ${PROFILE_FILE}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function addDeadline(parent: AbortSignal | undefined, deadlineAtMs: number, nowMs: () => number): {
  signal: AbortSignal | undefined;
  dispose: () => void;
  deadlineExpired: () => boolean;
} {
  if (!Number.isFinite(deadlineAtMs)) {
    return { signal: parent, dispose: () => undefined, deadlineExpired: () => false };
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const expire = () => {
    expired = true;
    controller.abort();
  };
  const onAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  const remainingMs = deadlineAtMs - nowMs();
  if (remainingMs <= 0) expire();
  else timer = setTimeout(expire, remainingMs);
  return {
    signal: controller.signal,
    dispose: () => {
      if (timer) clearTimeout(timer);
      if (parent) parent.removeEventListener("abort", onAbort);
    },
    deadlineExpired: () => expired || nowMs() > deadlineAtMs,
  };
}

function sameCandidate(left: CandidateSnapshot, right: CandidateSnapshot): boolean {
  return left.branch === right.branch && left.head === right.head && left.stateDigest === right.stateDigest;
}

function modelIdentity(model: ModelIdentity): string {
  return `${model.provider}/${model.id}`;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function parseModelReference(reference: string): ModelIdentity | undefined {
  const trimmed = reference.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return undefined;
  const providerRaw = trimmed.slice(0, slash);
  const idRaw = trimmed.slice(slash + 1);
  const provider = providerRaw.trim();
  const id = idRaw.trim();
  if (!provider || !id) return undefined;
  return { provider, id };
}

function referencesModel(reference: string, model: ModelIdentity): boolean {
  const parsed = parseModelReference(reference);
  if (!parsed) return false;
  return sameKnownModel(parsed, model);
}

function validateOutcome(stage: CompletionStage, response: { status: string; outcome?: LifecycleOutcomeEnvelope }): string | undefined {
  if (response.status !== "settled") return undefined;
  const outcome = response.outcome;
  if (!outcome) return `${stage} settled without an outcome`;
  if (outcome.stage !== stage) return `${stage} settled with mismatched stage ${outcome.stage}`;
  if (stage === "verify") {
    if (!(outcome.outcome === "VERIFIED" || outcome.outcome === "BLOCKED") || outcome.change !== "not-applicable") {
      return `${stage} submitted an outcome that does not match completion verify rules`;
    }
    return undefined;
  }
  if (!(outcome.outcome === "success" || outcome.outcome === "blocked") || outcome.change !== "not-applicable") {
    return `${stage} submitted an outcome that does not match completion stage rules`;
  }
  return undefined;
}

function buildConfig(
  input: CompletionPhaseInput,
  stage: CompletionStage,
  completion: Extract<StageConfig, { scope: "completion" }>["completion"],
): StageConfig {
  return parseStageConfig({
    protocolVersion: PROTOCOL_VERSION,
    scope: "completion",
    runId: input.runId,
    stage,
    worktree: input.worktree,
    branch: input.branch,
    planPath: input.planPath,
    baseline: {
      commit: input.baselineCommit,
      plan: { path: input.baselinePlanPath, blob: input.baselinePlanBlob },
      design: { path: input.baselineDesignPath, blob: input.baselineDesignBlob },
    },
    models: input.models,
    stageModel: stage === "verify" ? input.models.verify : input.models.execute,
    thinkingLevel: stage === "verify" ? input.thinkingLevels.verify : input.thinkingLevels.execute,
    completion,
  }, input.worktree);
}

function blocked(
  stage: CompletionStep | "transition",
  reason: string,
  context: { prUrl?: string; headSha?: string; settledFindingIds: string[]; reviewedHeads: string[]; remainingFindingIds: string[] },
): CompletionPhaseResult {
  return {
    status: "blocked",
    stage,
    reason,
    ...(context.prUrl ? { prUrl: context.prUrl } : {}),
    ...(context.headSha ? { headSha: context.headSha } : {}),
    settledFindingIds: context.settledFindingIds,
    reviewedHeads: context.reviewedHeads,
    remainingFindingIds: context.remainingFindingIds,
  };
}

function stopped(
  status: "cancelled" | "process-failure",
  stage: CompletionStep,
  reason: string,
  context: { prUrl?: string; headSha?: string; settledFindingIds: string[]; reviewedHeads: string[]; remainingFindingIds: string[] },
): CompletionPhaseResult {
  return {
    status,
    stage,
    reason,
    ...(context.prUrl ? { prUrl: context.prUrl } : {}),
    ...(context.headSha ? { headSha: context.headSha } : {}),
    settledFindingIds: context.settledFindingIds,
    reviewedHeads: context.reviewedHeads,
    remainingFindingIds: context.remainingFindingIds,
  };
}

export async function runCompletionPhase(input: CompletionPhaseInput): Promise<CompletionPhaseResult> {
  if (input.policy.kind === "personal") {
    return { status: "skipped", reason: "Personal profile skips automatic completion publication and ARP review." };
  }
  if (input.policy.kind === "invalid") {
    return {
      status: "blocked",
      stage: "transition",
      reason: `Completion profile policy is invalid: ${input.policy.reason}`,
      settledFindingIds: [],
      reviewedHeads: [],
      remainingFindingIds: [],
    };
  }
  if (input.signal?.aborted) {
    return {
      status: "cancelled",
      stage: "pr-publish",
      reason: "Cancelled before completion started",
      settledFindingIds: [],
      reviewedHeads: [],
      remainingFindingIds: [],
    };
  }

  const now = input.now ?? (() => new Date());
  const nowMs = () => now().getTime();

  let currentCandidate = input.candidate;
  let prUrl: string | undefined;
  let deadlineAt = "";
  let pendingSettlements: PendingSettlement[] = [];
  const settledFindingIds = new Set<string>();
  const remainingFindingIds = new Set<string>();
  const reviewedHeads: string[] = [];
  const writerModelIds = dedupeStrings([...input.writerModelIds, modelIdentity(input.models.execute)]);
  if (writerModelIds.some((writer) => referencesModel(writer, input.models.verify))) {
    return {
      status: "blocked",
      stage: "verify",
      reason: "Completion verification writer metadata includes the verifier identity",
      settledFindingIds: [],
      reviewedHeads: [],
      remainingFindingIds: [],
    };
  }

  const replaceRemaining = (ids: string[]) => {
    remainingFindingIds.clear();
    for (const findingId of dedupeStrings(ids)) remainingFindingIds.add(findingId);
  };

  const addSettled = (ids: string[] | undefined) => {
    for (const findingId of ids ?? []) {
      settledFindingIds.add(findingId);
      remainingFindingIds.delete(findingId);
    }
  };

  const context = () => ({
    prUrl,
    headSha: currentCandidate.head,
    settledFindingIds: [...settledFindingIds],
    reviewedHeads: [...reviewedHeads],
    remainingFindingIds: [...remainingFindingIds],
  });

  const cancelledBefore = (stage: CompletionStep): CompletionPhaseResult | undefined => {
    if (!input.signal?.aborted) return undefined;
    return stopped("cancelled", stage, `Cancelled before ${stage} started`, context());
  };

  while (true) {
    const cancelBeforePublish = cancelledBefore("pr-publish");
    if (cancelBeforePublish) return cancelBeforePublish;

    const publish = await input.publish({ worktree: input.worktree, candidate: currentCandidate, signal: input.signal });
    if (publish.prUrl) prUrl = publish.prUrl;
    if (publish.status === "cancelled") return stopped("cancelled", "pr-publish", publish.reason, context());
    if (publish.status !== "published") return blocked("pr-publish", publish.reason, context());
    if (publish.headSha !== currentCandidate.head) {
      return blocked("pr-publish", `Published head ${publish.headSha} does not match the verified candidate head ${currentCandidate.head}`, context());
    }
    const cyclePrUrl = publish.prUrl;

    const cancelBeforeReview = cancelledBefore("arp-review");
    if (cancelBeforeReview) return cancelBeforeReview;

    const deadlineAtMs = nowMs() + REVIEW_DEADLINE_MS;
    deadlineAt = new Date(deadlineAtMs).toISOString();
    const reviewConfig = buildConfig(input, "arp-review", {
      policy: "work",
      candidate: currentCandidate,
      reviewRequest: {
        prUrl: cyclePrUrl,
        expectedHeadSha: currentCandidate.head,
        deadlineAt,
        maxStatusChecks: REVIEW_MAX_STATUS_CHECKS,
        pollIntervalsSeconds: [...REVIEW_POLL_INTERVALS_SECONDS],
        silent: true,
      },
      ...(pendingSettlements.length > 0 ? { pendingSettlements } : {}),
    });

    const scopedSignal = addDeadline(input.signal, deadlineAtMs, nowMs);
    let review:
      | { status: "settled"; outcome: LifecycleOutcomeEnvelope }
      | { status: "blocked" | "cancelled" | "failure"; reason: string };
    try {
      review = await input.dispatch({
        stage: "arp-review",
        prompt: "/arp-review",
        config: reviewConfig,
        signal: scopedSignal.signal,
      });
    } finally {
      scopedSignal.dispose();
    }

    const reviewError = validateOutcome("arp-review", review);
    if (reviewError) return stopped("process-failure", "arp-review", reviewError, context());

    if (review.status === "cancelled") {
      if (scopedSignal.deadlineExpired()) {
        return blocked("arp-review", `silent ARP review did not complete before deadline ${deadlineAt}`, context());
      }
      if (input.signal?.aborted) return stopped("cancelled", "arp-review", review.reason, context());
      return blocked("arp-review", `silent ARP review stopped before completion (deadline ${deadlineAt})`, context());
    }
    if (review.status === "failure") {
      if (scopedSignal.deadlineExpired()) {
        return blocked("arp-review", `silent ARP review did not complete before deadline ${deadlineAt}`, context());
      }
      return stopped("process-failure", "arp-review", review.reason, context());
    }
    if (review.status === "blocked") {
      if (scopedSignal.deadlineExpired()) {
        return blocked("arp-review", `silent ARP review did not complete before deadline ${deadlineAt}`, context());
      }
      return blocked("arp-review", review.reason, context());
    }
    if (review.status !== "settled") {
      return stopped("process-failure", "arp-review", "arp-review returned an unknown status", context());
    }

    const reviewOutcome = review.outcome;
    if (!sameCandidate(reviewOutcome.candidate, currentCandidate)) {
      return blocked("arp-review", "arp-review changed the candidate state", context());
    }

    addSettled(reviewOutcome.settledFindingIds);

    const evidence = reviewOutcome.reviewEvidence;
    if (!evidence) {
      return stopped("process-failure", "arp-review", "arp-review outcome did not include structured review evidence", context());
    }
    if (evidence.targetHeadSha !== currentCandidate.head) {
      return blocked("arp-review", `arp-review targeted ${evidence.targetHeadSha}, expected ${currentCandidate.head}`, context());
    }
    if (evidence.reusedReview && evidence.silent !== true) {
      return blocked("arp-review", "arp-review reused prior review evidence without established silent mode", context());
    }
    if (evidence.reviewedHeadSha !== currentCandidate.head) {
      return blocked("arp-review", `arp-review completed on ${evidence.reviewedHeadSha}, expected ${currentCandidate.head}`, context());
    }
    if (!reviewedHeads.includes(evidence.reviewedHeadSha)) {
      reviewedHeads.push(evidence.reviewedHeadSha);
    }

    if (pendingSettlements.length > 0) {
      const resolved = new Set(reviewOutcome.settledFindingIds ?? []);
      const missing = pendingSettlements
        .map((settlement) => settlement.findingId)
        .filter((findingId) => !resolved.has(findingId));
      if (missing.length > 0) {
        replaceRemaining(missing);
        return blocked(
          "arp-review",
          `arp-review settled only ${resolved.size} of ${pendingSettlements.length} addressed findings (${missing.join(", ")})`,
          context(),
        );
      }
      pendingSettlements = [];
      replaceRemaining([]);
    }

    if (reviewOutcome.outcome === "success") {
      if (evidence.captureState !== "complete" || evidence.result !== "clean" || evidence.actionableFindings !== 0 || evidence.silent !== true) {
        return blocked("arp-review", "arp-review success evidence is incomplete or non-clean for the expected head", context());
      }
      if ((reviewOutcome.actionableFindingDetails ?? []).length > 0) {
        return stopped("process-failure", "arp-review", "arp-review success included unexpected actionable findings", context());
      }
      replaceRemaining([]);
      if (scopedSignal.deadlineExpired()) {
        return blocked("arp-review", `silent ARP review did not complete before deadline ${deadlineAt}`, context());
      }
      return {
        status: "verified",
        prUrl: cyclePrUrl,
        reviewedHead: evidence.reviewedHeadSha,
        deadlineAt,
        settledFindingIds: [...settledFindingIds],
        reviewedHeads: [...reviewedHeads],
        remainingFindingIds: [],
      };
    }

    if (evidence.result !== "findings") {
      return blocked(
        "arp-review",
        `silent ARP review blocked (result ${evidence.result}, findings ${evidence.actionableFindings}, capture ${evidence.captureState}, checks ${evidence.statusChecks})`,
        context(),
      );
    }

    if (evidence.captureState !== "complete" || evidence.silent !== true) {
      return blocked(
        "arp-review",
        "arp-review findings evidence is incomplete or non-silent for the expected head",
        context(),
      );
    }

    const findings: FindingDetail[] = reviewOutcome.actionableFindingDetails ?? [];
    if (findings.length === 0 || evidence.actionableFindings !== findings.length) {
      return blocked(
        "arp-review",
        "arp-review reported actionable findings without complete structured finding details",
        context(),
      );
    }

    replaceRemaining(findings.map((finding) => finding.findingId).filter((findingId) => !settledFindingIds.has(findingId)));

    if (scopedSignal.deadlineExpired()) {
      return blocked("arp-review", `silent ARP review did not complete before deadline ${deadlineAt}`, context());
    }

    if (reviewedHeads.length >= MAX_REVIEWED_HEADS) {
      return blocked(
        "arp-review",
        `completion reached ${MAX_REVIEWED_HEADS} reviewed heads with unresolved findings (${findings.map((finding) => finding.findingId).join(", ")})`,
        context(),
      );
    }

    const cancelBeforeFix = cancelledBefore("arp-fix");
    if (cancelBeforeFix) return cancelBeforeFix;

    const fixConfig = buildConfig(input, "arp-fix", {
      policy: "work",
      candidate: currentCandidate,
      fixRequest: {
        prUrl: cyclePrUrl,
        reviewedHeadSha: evidence.reviewedHeadSha,
        findings,
      },
    });

    const fix = await input.dispatch({
      stage: "arp-fix",
      prompt: "/arp-fix",
      config: fixConfig,
      signal: input.signal,
    });
    const fixError = validateOutcome("arp-fix", fix);
    if (fixError) return stopped("process-failure", "arp-fix", fixError, context());
    if (fix.status === "cancelled") return stopped("cancelled", "arp-fix", fix.reason, context());
    if (fix.status === "failure") return stopped("process-failure", "arp-fix", fix.reason, context());
    if (fix.status === "blocked") return blocked("arp-fix", fix.reason, context());
    if (fix.status !== "settled") {
      return stopped("process-failure", "arp-fix", "arp-fix returned an unknown status", context());
    }

    const fixOutcome = fix.outcome;
    if (fixOutcome.outcome === "blocked") {
      return blocked("arp-fix", "arp-fix reported a lifecycle blocker", context());
    }
    if (sameCandidate(fixOutcome.candidate, currentCandidate)) {
      return blocked("arp-fix", "arp-fix reported success without creating a new candidate commit", context());
    }
    if (fixOutcome.candidate.branch !== currentCandidate.branch) {
      return blocked("arp-fix", "arp-fix changed the candidate branch", context());
    }
    if (!isAncestorCommit(input.worktree, currentCandidate.head, fixOutcome.candidate.head)) {
      return blocked("arp-fix", "arp-fix candidate head is not a descendant of the reviewed candidate head", context());
    }
    if (!fixOutcome.pendingSettlements || fixOutcome.pendingSettlements.length === 0) {
      return stopped("process-failure", "arp-fix", "arp-fix success did not include pending settlement metadata", context());
    }
    if (!fixOutcome.commitRefs || fixOutcome.commitRefs.length === 0) {
      return stopped("process-failure", "arp-fix", "arp-fix success did not include commit references", context());
    }

    const requestedFindingIds = new Set(findings.map((finding) => finding.findingId));
    const commitRefs = dedupeStrings(fixOutcome.commitRefs);
    if (commitRefs.length !== fixOutcome.commitRefs.length) {
      return blocked("arp-fix", "arp-fix commit references include duplicates", context());
    }
    for (const commitRef of commitRefs) {
      if (!isAncestorCommit(input.worktree, currentCandidate.head, commitRef)) {
        return blocked("arp-fix", `arp-fix commit reference ${commitRef} is outside the reviewed candidate ancestry`, context());
      }
      if (!isAncestorCommit(input.worktree, commitRef, fixOutcome.candidate.head)) {
        return blocked("arp-fix", `arp-fix commit reference ${commitRef} is not part of the reported candidate ancestry`, context());
      }
    }

    const settlementIds = new Set<string>();
    for (const settlement of fixOutcome.pendingSettlements) {
      if (settlementIds.has(settlement.findingId)) {
        return blocked("arp-fix", `arp-fix reported duplicate pending settlement ID ${settlement.findingId}`, context());
      }
      settlementIds.add(settlement.findingId);
      if (!requestedFindingIds.has(settlement.findingId)) {
        return blocked("arp-fix", `arp-fix reported pending settlement for unrelated finding ${settlement.findingId}`, context());
      }
      if (!commitRefs.includes(settlement.fixCommitSha)) {
        return blocked("arp-fix", `arp-fix settlement ${settlement.findingId} references commit ${settlement.fixCommitSha} outside commitRefs`, context());
      }
      if (!isAncestorCommit(input.worktree, currentCandidate.head, settlement.fixCommitSha)) {
        return blocked(
          "arp-fix",
          `arp-fix settlement ${settlement.findingId} references commit ${settlement.fixCommitSha} outside reviewed candidate ancestry`,
          context(),
        );
      }
      if (!isAncestorCommit(input.worktree, settlement.fixCommitSha, fixOutcome.candidate.head)) {
        return blocked(
          "arp-fix",
          `arp-fix settlement ${settlement.findingId} references commit ${settlement.fixCommitSha} not present in candidate ancestry`,
          context(),
        );
      }
    }

    pendingSettlements = fixOutcome.pendingSettlements;
    replaceRemaining(pendingSettlements.map((settlement) => settlement.findingId));
    currentCandidate = fixOutcome.candidate;

    const cancelBeforeVerify = cancelledBefore("verify");
    if (cancelBeforeVerify) return cancelBeforeVerify;

    const verifyConfig = buildConfig(input, "verify", {
      policy: "work",
      candidate: currentCandidate,
      verificationWriters: writerModelIds,
    });
    const verify = await input.dispatch({
      stage: "verify",
      prompt: "/verify",
      config: verifyConfig,
      signal: input.signal,
    });
    const verifyError = validateOutcome("verify", verify);
    if (verifyError) return stopped("process-failure", "verify", verifyError, context());
    if (verify.status === "cancelled") return stopped("cancelled", "verify", verify.reason, context());
    if (verify.status === "failure") return stopped("process-failure", "verify", verify.reason, context());
    if (verify.status === "blocked") return blocked("verify", verify.reason, context());
    if (verify.status !== "settled") {
      return stopped("process-failure", "verify", "completion verify returned an unknown status", context());
    }

    const verifyOutcome = verify.outcome;
    if (verifyOutcome.outcome === "BLOCKED") {
      return blocked("verify", "Independent feature verification returned BLOCKED after arp-fix", context());
    }
    if (!sameCandidate(verifyOutcome.candidate, currentCandidate)) {
      return blocked("verify", "completion verify changed the candidate after its read-only review", context());
    }
  }
}
