import { Value } from "@sinclair/typebox/value";
import { Type, type Static } from "@sinclair/typebox";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const PROTOCOL_VERSION = 2;
export const MAX_DECISION_CONTEXT_BYTES = 16 * 1024;
export const MAX_STAGE_REPORT_BYTES = 64 * 1024;

export const StageSchema = Type.Union([
  Type.Literal("execute"),
  Type.Literal("simplify"),
  Type.Literal("verify"),
  Type.Literal("pr-publish"),
  Type.Literal("arp-review"),
]);
export type Stage = Static<typeof StageSchema>;
export type ExecutionStage = Extract<Stage, "execute" | "simplify" | "verify">;
export type CompletionStage = Extract<Stage, "pr-publish" | "arp-review">;

export function isExecutionStage(stage: Stage): stage is ExecutionStage {
  return stage === "execute" || stage === "simplify" || stage === "verify";
}

export function isCompletionStage(stage: Stage): stage is CompletionStage {
  return stage === "pr-publish" || stage === "arp-review";
}

const GitObjectIdSchema = Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" });
const ModelIdentitySchema = Type.Object(
  { provider: Type.String({ minLength: 1, maxLength: 256 }), id: Type.String({ minLength: 1, maxLength: 512 }) },
  { additionalProperties: false },
);
const UnitSchema = Type.Object(
  {
    heading: Type.String({ minLength: 1, maxLength: 2048 }),
    taskNumbers: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 1000 }),
  },
  { additionalProperties: false },
);
const CandidateSnapshotSchema = Type.Object(
  {
    branch: Type.String({ minLength: 1, maxLength: 256 }),
    head: GitObjectIdSchema,
    stateDigest: Type.String({ pattern: "^[0-9a-f]{64}$" }),
  },
  { additionalProperties: false },
);
const ReviewRequestConfigSchema = Type.Object(
  {
    prUrl: Type.String({ maxLength: 2048 }),
    expectedHeadSha: GitObjectIdSchema,
    deadlineAt: Type.String({ minLength: 1, maxLength: 128 }),
    maxStatusChecks: Type.Integer({ minimum: 1, maximum: 30 }),
    pollIntervalsSeconds: Type.Array(Type.Integer({ minimum: 1, maximum: 600 }), { minItems: 3, maxItems: 3 }),
    silent: Type.Literal(true),
  },
  { additionalProperties: false },
);

const CompletionConfigSchema = Type.Object(
  {
    policy: Type.Literal("work"),
    candidate: CandidateSnapshotSchema,
    reviewRequest: Type.Optional(ReviewRequestConfigSchema),
  },
  { additionalProperties: false },
);

const BaselineSchema = Type.Object(
  {
    commit: GitObjectIdSchema,
    plan: Type.Object(
      { path: Type.String({ minLength: 1, maxLength: 4096 }), blob: GitObjectIdSchema },
      { additionalProperties: false },
    ),
    design: Type.Object(
      { path: Type.String({ minLength: 1, maxLength: 4096 }), blob: GitObjectIdSchema },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const ModelsSchema = Type.Object(
  { execute: ModelIdentitySchema, simplify: ModelIdentitySchema, verify: ModelIdentitySchema },
  { additionalProperties: false },
);

const ExecutionStageSchema = Type.Union([Type.Literal("execute"), Type.Literal("simplify"), Type.Literal("verify")]);
const CompletionStageSchema = Type.Union([Type.Literal("pr-publish"), Type.Literal("arp-review")]);

const StageConfigSchema = Type.Union([
  Type.Object(
    {
      protocolVersion: Type.Literal(PROTOCOL_VERSION),
      scope: Type.Literal("execution"),
      runId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" }),
      stage: ExecutionStageSchema,
      worktree: Type.String({ minLength: 1, maxLength: 4096 }),
      branch: Type.String({ minLength: 1, maxLength: 256 }),
      planPath: Type.String({ minLength: 1, maxLength: 4096 }),
      baseline: BaselineSchema,
      unitBase: GitObjectIdSchema,
      unit: UnitSchema,
      models: ModelsSchema,
      stageModel: ModelIdentitySchema,
      thinkingLevel: Type.String({ minLength: 1, maxLength: 32 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      protocolVersion: Type.Literal(PROTOCOL_VERSION),
      scope: Type.Literal("completion"),
      runId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" }),
      stage: CompletionStageSchema,
      worktree: Type.String({ minLength: 1, maxLength: 4096 }),
      branch: Type.String({ minLength: 1, maxLength: 256 }),
      planPath: Type.String({ minLength: 1, maxLength: 4096 }),
      baseline: BaselineSchema,
      models: ModelsSchema,
      stageModel: ModelIdentitySchema,
      thinkingLevel: Type.String({ minLength: 1, maxLength: 32 }),
      completion: CompletionConfigSchema,
    },
    { additionalProperties: false },
  ),
]);
export type StageConfig = Static<typeof StageConfigSchema>;

export const DecisionInputSchema = Type.Object(
  {
    question: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    evidence: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    proposal: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    context: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
  },
  { additionalProperties: false },
);
export type DecisionInput = Static<typeof DecisionInputSchema>;

const ReviewEvidenceSchema = Type.Object(
  {
    targetHeadSha: GitObjectIdSchema,
    reviewedHeadSha: GitObjectIdSchema,
    captureState: Type.Union([Type.Literal("complete"), Type.Literal("review-in-progress")]),
    result: Type.Union([Type.Literal("clean"), Type.Literal("findings"), Type.Literal("stale"), Type.Literal("error")]),
    actionableFindings: Type.Integer({ minimum: 0, maximum: 10_000 }),
    statusChecks: Type.Integer({ minimum: 0, maximum: 30 }),
    reusedReview: Type.Boolean(),
    silent: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const LifecycleOutcomeInputSchema = Type.Object(
  {
    schemaVersion: Type.Literal(PROTOCOL_VERSION),
    outcome: Type.Union([
      Type.Literal("success"),
      Type.Literal("blocked"),
      Type.Literal("VERIFIED"),
      Type.Literal("BLOCKED"),
    ]),
    change: Type.Union([Type.Literal("changed"), Type.Literal("unchanged"), Type.Literal("not-applicable")]),
    report: Type.String({ minLength: 1, maxLength: MAX_STAGE_REPORT_BYTES }),
    prUrl: Type.Optional(Type.String({ maxLength: 2048 })),
    commitRefs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 128 })),
    publishedHeadSha: Type.Optional(GitObjectIdSchema),
    reviewEvidence: Type.Optional(ReviewEvidenceSchema),
  },
  { additionalProperties: false },
);
export type LifecycleOutcomeInput = Static<typeof LifecycleOutcomeInputSchema>;

const LifecycleOutcomeEnvelopeSchema = Type.Object(
  {
    schemaVersion: Type.Literal(PROTOCOL_VERSION),
    runId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" }),
    stage: StageSchema,
    sessionId: Type.String({ minLength: 1, maxLength: 512 }),
    model: ModelIdentitySchema,
    outcome: Type.Union([Type.Literal("success"), Type.Literal("blocked"), Type.Literal("VERIFIED"), Type.Literal("BLOCKED")]),
    change: Type.Union([Type.Literal("changed"), Type.Literal("unchanged"), Type.Literal("not-applicable")]),
    candidate: CandidateSnapshotSchema,
    reportRef: Type.String({ minLength: 1, maxLength: 4096 }),
    prUrl: Type.Optional(Type.String({ maxLength: 2048 })),
    commitRefs: Type.Optional(Type.Array(GitObjectIdSchema, { maxItems: 128 })),
    publishedHeadSha: Type.Optional(GitObjectIdSchema),
    reviewEvidence: Type.Optional(ReviewEvidenceSchema),
  },
  { additionalProperties: false },
);
export type LifecycleOutcomeEnvelope = Static<typeof LifecycleOutcomeEnvelopeSchema>;

const DecisionResultSchema = Type.Object(
  {
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    runId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" }),
    stage: StageSchema,
    sessionId: Type.String({ minLength: 1, maxLength: 512 }),
    model: ModelIdentitySchema,
    requestId: Type.String({ minLength: 1, maxLength: 512 }),
    decision: Type.Union([Type.Literal("approved"), Type.Literal("rejected"), Type.Literal("cancelled")]),
    question: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    evidence: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    proposal: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
    context: Type.String({ minLength: 1, maxLength: MAX_DECISION_CONTEXT_BYTES }),
  },
  { additionalProperties: false },
);
export type DecisionResult = Static<typeof DecisionResultSchema>;

function validate<T>(schema: Parameters<typeof Value.Check>[0], value: unknown, label: string): T {
  if (!Value.Check(schema, value)) throw new Error(`Invalid ${label}`);
  return value as T;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isWithin(root: string, target: string): boolean {
  const rel = relative(canonicalPath(root), canonicalPath(target));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function sameKnownModel(left: { provider: string; id: string }, right: { provider: string; id: string }): boolean {
  // deliberate: Pi exposes no upstream model-service identity; identical IDs across providers are treated as equivalent.
  return left.id.trim().toLowerCase() === right.id.trim().toLowerCase();
}

function sameModel(left: { provider: string; id: string }, right: { provider: string; id: string }): boolean {
  return left.provider === right.provider && left.id === right.id;
}

export function parseStageConfig(value: unknown, expectedWorktree: string): StageConfig {
  const config = validate<StageConfig>(StageConfigSchema, value, "lifecycle stage configuration");
  if (!isAbsolute(config.worktree) || !isAbsolute(expectedWorktree) || canonicalPath(config.worktree) !== canonicalPath(expectedWorktree)) {
    throw new Error(`Lifecycle stage configuration worktree ${resolve(config.worktree)} does not match child directory ${resolve(expectedWorktree)}`);
  }
  if (!isAbsolute(config.planPath) || !isWithin(config.worktree, config.planPath)) {
    throw new Error("Lifecycle plan path is outside the configured worktree");
  }
  if (resolve(config.baseline.plan.path) !== resolve(config.planPath) || !isWithin(config.worktree, config.baseline.design.path)) {
    throw new Error("Lifecycle baseline paths do not match the configured worktree and plan");
  }
  if (sameKnownModel(config.models.verify, config.models.execute)) {
    throw new Error("Lifecycle verifier matches the execute model identity");
  }
  if (sameKnownModel(config.models.verify, config.models.simplify)) {
    throw new Error("Lifecycle verifier matches the simplify model identity");
  }

  if (config.scope === "execution") {
    if (!isExecutionStage(config.stage)) {
      throw new Error(`Lifecycle stage ${config.stage} is invalid for execution scope`);
    }
    if (!sameModel(config.stageModel, config.models[config.stage])) {
      throw new Error(`Lifecycle stage model does not match models.${config.stage}`);
    }
    return config;
  }

  if (!isCompletionStage(config.stage)) {
    throw new Error(`Lifecycle stage ${config.stage} is invalid for completion scope`);
  }
  if (!sameModel(config.stageModel, config.models.execute)) {
    throw new Error(`Lifecycle completion stage ${config.stage} must run with the selected execute model`);
  }

  const reviewRequest = config.completion.reviewRequest;
  if (config.stage === "pr-publish") {
    if (reviewRequest) throw new Error("Lifecycle pr-publish stage must not include review request metadata");
    return config;
  }

  if (!reviewRequest) {
    throw new Error("Lifecycle arp-review stage requires review request metadata");
  }
  if (!Number.isFinite(Date.parse(reviewRequest.deadlineAt))) {
    throw new Error("Lifecycle arp-review deadline is invalid");
  }
  if (reviewRequest.silent !== true) {
    throw new Error("Lifecycle arp-review stage requires silent review mode");
  }
  return config;
}

export function parseDecisionInput(value: unknown): DecisionInput {
  const input = validate<DecisionInput>(DecisionInputSchema, value, "lifecycle decision request");
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > MAX_DECISION_CONTEXT_BYTES) {
    throw new Error(`Lifecycle decision context exceeds ${MAX_DECISION_CONTEXT_BYTES} bytes`);
  }
  return input;
}

export function parseDecisionResult(
  value: unknown,
  expected: { runId: string; stage: Stage; sessionId: string; model: { provider: string; id: string }; requestId: string },
): DecisionResult {
  const result = validate<DecisionResult>(DecisionResultSchema, value, "lifecycle decision result");
  if (
    result.runId !== expected.runId || result.stage !== expected.stage || result.sessionId !== expected.sessionId ||
    result.requestId !== expected.requestId || result.model.provider !== expected.model.provider || result.model.id !== expected.model.id
  ) {
    throw new Error("Lifecycle decision result identity does not match the active request");
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_DECISION_CONTEXT_BYTES * 2) {
    throw new Error("Lifecycle decision result exceeds its bounded context size");
  }
  return result;
}

function validateStageOutcome(stage: Stage, outcome: LifecycleOutcomeInput["outcome"], change: LifecycleOutcomeInput["change"]): void {
  if (stage === "execute" || stage === "simplify") {
    if (!(outcome === "success" || outcome === "blocked") || !(change === "changed" || change === "unchanged")) {
      throw new Error(`Lifecycle outcome does not match stage ${stage}`);
    }
    return;
  }
  if (stage === "verify") {
    if (!(outcome === "VERIFIED" || outcome === "BLOCKED") || change !== "not-applicable") {
      throw new Error(`Lifecycle outcome does not match stage ${stage}`);
    }
    return;
  }
  if (!(outcome === "success" || outcome === "blocked") || change !== "not-applicable") {
    throw new Error(`Lifecycle outcome does not match stage ${stage}`);
  }
}

function validateCompletionOutcomeMetadata(
  stage: Stage,
  input: Pick<LifecycleOutcomeInput, "outcome" | "prUrl" | "publishedHeadSha" | "reviewEvidence">,
): void {
  if (isExecutionStage(stage)) {
    if (input.publishedHeadSha || input.reviewEvidence) {
      throw new Error(`Lifecycle stage ${stage} does not accept completion outcome metadata`);
    }
    return;
  }

  if (stage === "pr-publish") {
    if (input.reviewEvidence) throw new Error("Lifecycle pr-publish outcome must not include review evidence");
    if (input.outcome === "success") {
      if (!input.prUrl) throw new Error("Lifecycle pr-publish success outcome requires prUrl");
      if (!input.publishedHeadSha) throw new Error("Lifecycle pr-publish success outcome requires publishedHeadSha");
    }
    return;
  }

  if (input.publishedHeadSha) throw new Error("Lifecycle arp-review outcome must not include publishedHeadSha");
  if (!input.reviewEvidence) throw new Error("Lifecycle arp-review outcomes require reviewEvidence");
  if (input.outcome === "success") {
    if (input.reviewEvidence.captureState !== "complete") {
      throw new Error("Lifecycle arp-review success outcome requires captureState complete");
    }
    if (input.reviewEvidence.result !== "clean") {
      throw new Error("Lifecycle arp-review success outcome requires result clean");
    }
    if (input.reviewEvidence.actionableFindings !== 0) {
      throw new Error("Lifecycle arp-review success outcome requires zero actionable findings");
    }
    if (input.reviewEvidence.silent !== true) {
      throw new Error("Lifecycle arp-review success outcome requires silent review evidence");
    }
  }
}

export function parseLifecycleOutcome(value: unknown, stage: Stage): LifecycleOutcomeInput {
  const input = validate<LifecycleOutcomeInput>(LifecycleOutcomeInputSchema, value, "lifecycle outcome");
  if (Buffer.byteLength(input.report, "utf8") > MAX_STAGE_REPORT_BYTES) {
    throw new Error(`Lifecycle report exceeds ${MAX_STAGE_REPORT_BYTES} bytes`);
  }

  validateStageOutcome(stage, input.outcome, input.change);
  validateCompletionOutcomeMetadata(stage, input);
  validatePrUrl(input.prUrl);
  return input;
}

export function parseLifecycleOutcomeEnvelope(
  value: unknown,
  expected: { runId: string; stage: Stage; sessionId: string; model: { provider: string; id: string } },
): LifecycleOutcomeEnvelope {
  const result = validate<LifecycleOutcomeEnvelope>(LifecycleOutcomeEnvelopeSchema, value, "lifecycle outcome envelope");
  if (
    result.runId !== expected.runId || result.stage !== expected.stage || result.sessionId !== expected.sessionId ||
    result.model.provider !== expected.model.provider || result.model.id !== expected.model.id
  ) {
    throw new Error("Lifecycle outcome identity does not match the active stage");
  }
  validateStageOutcome(result.stage, result.outcome, result.change);
  validateCompletionOutcomeMetadata(result.stage, result);
  if (isAbsolute(result.reportRef) || result.reportRef.split(/[\\/]/).includes("..")) {
    throw new Error("Lifecycle report reference must be a safe relative path");
  }
  if (!result.reportRef.startsWith(`lifecycle-coordinator/runs/${result.runId}/reports/`)) {
    throw new Error("Lifecycle report reference does not belong to this run");
  }
  validatePrUrl(result.prUrl);
  return result;
}

function validatePrUrl(value: string | undefined): void {
  if (value === undefined) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Lifecycle PR reference must be an absolute HTTP(S) URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    throw new Error("Lifecycle PR reference must be an absolute HTTP(S) URL without credentials");
  }
}
