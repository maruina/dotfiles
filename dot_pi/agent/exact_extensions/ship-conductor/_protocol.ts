import { Value } from "@sinclair/typebox/value";
import { Type, type Static } from "@sinclair/typebox";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const PROTOCOL_VERSION = 1;
export const MAX_DECISION_CONTEXT_BYTES = 16 * 1024;
export const MAX_STAGE_REPORT_BYTES = 64 * 1024;

export const StageSchema = Type.Union([Type.Literal("execute"), Type.Literal("simplify"), Type.Literal("verify")]);
export type Stage = Static<typeof StageSchema>;

const GitObjectIdSchema = Type.String({ pattern: "^(?:[0-9a-f]{40}|[0-9a-f]{64})$" });
const ModelIdentitySchema = Type.Object(
  { provider: Type.String({ minLength: 1, maxLength: 256 }), id: Type.String({ minLength: 1, maxLength: 512 }) },
  { additionalProperties: false },
);
const StageConfigSchema = Type.Object(
  {
    protocolVersion: Type.Literal(PROTOCOL_VERSION),
    runId: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$" }),
    stage: StageSchema,
    worktree: Type.String({ minLength: 1, maxLength: 4096 }),
    branch: Type.String({ minLength: 1, maxLength: 256 }),
    planPath: Type.String({ minLength: 1, maxLength: 4096 }),
    baseline: Type.Object(
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
    ),
    unit: Type.Object(
      {
        heading: Type.String({ minLength: 1, maxLength: 2048 }),
        taskNumbers: Type.Array(Type.Integer({ minimum: 1 }), { minItems: 1, maxItems: 1000 }),
      },
      { additionalProperties: false },
    ),
    models: Type.Object(
      { execute: ModelIdentitySchema, simplify: ModelIdentitySchema, verify: ModelIdentitySchema },
      { additionalProperties: false },
    ),
    thinkingLevel: Type.String({ minLength: 1, maxLength: 32 }),
  },
  { additionalProperties: false },
);
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
  },
  { additionalProperties: false },
);
export type LifecycleOutcomeInput = Static<typeof LifecycleOutcomeInputSchema>;

const CandidateSnapshotSchema = Type.Object(
  {
    branch: Type.String({ minLength: 1, maxLength: 256 }),
    head: GitObjectIdSchema,
    stateDigest: Type.String({ pattern: "^[0-9a-f]{64}$" }),
  },
  { additionalProperties: false },
);
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

export function parseLifecycleOutcome(value: unknown, stage: Stage): LifecycleOutcomeInput {
  const input = validate<LifecycleOutcomeInput>(LifecycleOutcomeInputSchema, value, "lifecycle outcome");
  if (Buffer.byteLength(input.report, "utf8") > MAX_STAGE_REPORT_BYTES) {
    throw new Error(`Lifecycle report exceeds ${MAX_STAGE_REPORT_BYTES} bytes`);
  }

  const writerStage = stage === "execute" || stage === "simplify";
  const validOutcome = writerStage ? input.outcome === "success" || input.outcome === "blocked" : input.outcome === "VERIFIED" || input.outcome === "BLOCKED";
  const validChange = writerStage ? input.change === "changed" || input.change === "unchanged" : input.change === "not-applicable";
  if (!validOutcome || !validChange) throw new Error(`Lifecycle outcome does not match stage ${stage}`);

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
  const writerStage = result.stage === "execute" || result.stage === "simplify";
  const validOutcome = writerStage ? result.outcome === "success" || result.outcome === "blocked" : result.outcome === "VERIFIED" || result.outcome === "BLOCKED";
  const validChange = writerStage ? result.change === "changed" || result.change === "unchanged" : result.change === "not-applicable";
  if (!validOutcome || !validChange) throw new Error(`Lifecycle outcome does not match stage ${result.stage}`);
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
