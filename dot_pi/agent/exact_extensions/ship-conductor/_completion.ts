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
import type { ModelIdentity } from "./_models.ts";

const PROFILE_FILE = "ship-conductor-profile.json";
const REVIEW_DEADLINE_MS = 20 * 60 * 1000;
const REVIEW_MAX_STATUS_CHECKS = 30;
const REVIEW_POLL_INTERVALS_SECONDS = [10, 30, 60] as const;

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
  | { status: "verified"; prUrl: string; reviewedHead: string; deadlineAt: string }
  | { status: "blocked"; stage: CompletionStage | "transition"; reason: string; prUrl?: string; headSha?: string }
  | { status: "cancelled" | "process-failure"; stage: CompletionStage; reason: string; prUrl?: string; headSha?: string };

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
  thinkingLevel: string;
  now?: () => Date;
  signal?: AbortSignal;
  dispatch: CompletionStageDispatch;
};

type ProfileFile = { schemaVersion: 1; profile: "work" | "personal" };

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

function validateOutcome(stage: CompletionStage, response: { status: string; outcome?: LifecycleOutcomeEnvelope }): string | undefined {
  if (response.status !== "settled") return undefined;
  const outcome = response.outcome;
  if (!outcome) return `${stage} settled without an outcome`;
  if (outcome.stage !== stage) return `${stage} settled with mismatched stage ${outcome.stage}`;
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
    stageModel: input.models.execute,
    thinkingLevel: input.thinkingLevel,
    completion,
  }, input.worktree);
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
    };
  }
  if (input.signal?.aborted) {
    return { status: "cancelled", stage: "pr-publish", reason: "Cancelled before completion started" };
  }

  const publishConfig = buildConfig(input, "pr-publish", {
    policy: "work",
    candidate: input.candidate,
  });
  const publish = await input.dispatch({
    stage: "pr-publish",
    prompt: "/pr-publish",
    config: publishConfig,
    signal: input.signal,
  });
  const publishError = validateOutcome("pr-publish", publish);
  if (publishError) return { status: "process-failure", stage: "pr-publish", reason: publishError };
  if (publish.status === "cancelled") return { status: "cancelled", stage: "pr-publish", reason: publish.reason };
  if (publish.status === "failure") return { status: "process-failure", stage: "pr-publish", reason: publish.reason };
  if (publish.status === "blocked") return { status: "blocked", stage: "pr-publish", reason: publish.reason };
  if (publish.status !== "settled") {
    return { status: "process-failure", stage: "pr-publish", reason: "pr-publish returned an unknown status" };
  }

  const publishOutcome = publish.outcome;
  if (publishOutcome.outcome === "blocked") {
    return { status: "blocked", stage: "pr-publish", reason: "pr-publish reported a lifecycle blocker" };
  }
  if (!sameCandidate(publishOutcome.candidate, input.candidate)) {
    return { status: "blocked", stage: "pr-publish", reason: "pr-publish changed the candidate state" };
  }
  if (!publishOutcome.prUrl) {
    return { status: "blocked", stage: "pr-publish", reason: "pr-publish did not return a PR URL" };
  }

  const expectedHeadSha = input.candidate.head;
  if (!publishOutcome.publishedHeadSha) {
    return { status: "process-failure", stage: "pr-publish", reason: "pr-publish did not report the pushed PR head SHA" };
  }
  if (publishOutcome.publishedHeadSha !== expectedHeadSha) {
    return {
      status: "blocked",
      stage: "pr-publish",
      reason: `pr-publish head ${publishOutcome.publishedHeadSha} does not match the verified candidate head ${expectedHeadSha}`,
      prUrl: publishOutcome.prUrl,
      headSha: expectedHeadSha,
    };
  }

  const now = input.now ?? (() => new Date());
  const nowMs = () => now().getTime();
  const deadlineAtMs = nowMs() + REVIEW_DEADLINE_MS;
  const deadlineAt = new Date(deadlineAtMs).toISOString();

  const reviewConfig = buildConfig(input, "arp-review", {
    policy: "work",
    candidate: input.candidate,
    reviewRequest: {
      prUrl: publishOutcome.prUrl,
      expectedHeadSha,
      deadlineAt,
      maxStatusChecks: REVIEW_MAX_STATUS_CHECKS,
      pollIntervalsSeconds: [...REVIEW_POLL_INTERVALS_SECONDS],
      silent: true,
    },
  });
  const scopedSignal = addDeadline(input.signal, deadlineAtMs, nowMs);
  try {
    const review = await input.dispatch({
      stage: "arp-review",
      prompt: "/arp-review",
      config: reviewConfig,
      signal: scopedSignal.signal,
    });
    const reviewError = validateOutcome("arp-review", review);
    if (reviewError) {
      return { status: "process-failure", stage: "arp-review", reason: reviewError, prUrl: publishOutcome.prUrl, headSha: expectedHeadSha };
    }

    if (scopedSignal.deadlineExpired()) {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: `silent ARP review did not complete before deadline ${deadlineAt}`,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }

    if (review.status === "cancelled") {
      if (input.signal?.aborted) {
        return { status: "cancelled", stage: "arp-review", reason: review.reason, prUrl: publishOutcome.prUrl, headSha: expectedHeadSha };
      }
      return {
        status: "blocked",
        stage: "arp-review",
        reason: `silent ARP review stopped before completion (deadline ${deadlineAt})`,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (review.status === "failure") {
      return {
        status: "process-failure",
        stage: "arp-review",
        reason: review.reason,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (review.status === "blocked") {
      return { status: "blocked", stage: "arp-review", reason: review.reason, prUrl: publishOutcome.prUrl, headSha: expectedHeadSha };
    }
    if (review.status !== "settled") {
      return {
        status: "process-failure",
        stage: "arp-review",
        reason: "arp-review returned an unknown status",
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }

    const reviewOutcome = review.outcome;
    if (!sameCandidate(reviewOutcome.candidate, input.candidate)) {
      return { status: "blocked", stage: "arp-review", reason: "arp-review changed the candidate state", prUrl: publishOutcome.prUrl, headSha: expectedHeadSha };
    }
    const evidence = reviewOutcome.reviewEvidence;
    if (!evidence) {
      return {
        status: "process-failure",
        stage: "arp-review",
        reason: "arp-review outcome did not include structured review evidence",
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (evidence.targetHeadSha !== expectedHeadSha) {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: `arp-review targeted ${evidence.targetHeadSha}, expected ${expectedHeadSha}`,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (evidence.reusedReview && evidence.silent !== true) {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: "arp-review reused prior review evidence without established silent mode",
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (reviewOutcome.outcome === "blocked") {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: `silent ARP review blocked (result ${evidence.result}, findings ${evidence.actionableFindings}, capture ${evidence.captureState}, checks ${evidence.statusChecks})`,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (evidence.reviewedHeadSha !== expectedHeadSha) {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: `arp-review completed on ${evidence.reviewedHeadSha}, expected ${expectedHeadSha}`,
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    if (evidence.captureState !== "complete" || evidence.result !== "clean" || evidence.actionableFindings !== 0 || evidence.silent !== true) {
      return {
        status: "blocked",
        stage: "arp-review",
        reason: "arp-review success evidence is incomplete or non-clean for the expected head",
        prUrl: publishOutcome.prUrl,
        headSha: expectedHeadSha,
      };
    }
    return {
      status: "verified",
      prUrl: publishOutcome.prUrl,
      reviewedHead: evidence.reviewedHeadSha,
      deadlineAt,
    };
  } finally {
    scopedSignal.dispose();
  }
}
