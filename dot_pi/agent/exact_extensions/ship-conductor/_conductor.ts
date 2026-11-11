import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildStagePrompt,
  parseSinglePlanArgument,
  type LifecycleStage,
} from "./_prompts.ts";
import { selectModels, type LifecycleModel, type ModelIdentity, type ModelRegistryLike, type ModelSelectionUI } from "./_models.ts";
import { PROTOCOL_VERSION, parseStageConfig, type LifecycleOutcomeEnvelope, type Stage, type StageConfig } from "./_protocol.ts";
import {
  type RpcLifecycleStageResult,
  type RpcObservedState,
  type RpcStageCallbacks,
  type RpcStageDecision,
  type RpcStageUI,
} from "./_spawn.ts";
import { LifecycleRunLease, LifecycleStateStore } from "./_state.ts";
import { remainingUnitHeadings, selectExecutionUnit, validatePlanProgress, type UnitDescriptor } from "./_unit.ts";
import type { CandidateSnapshot, ResolvePlanResult } from "./_worktree.ts";

export type LifecycleStageRequest = {
  runId: string;
  stage: Stage;
  cwd: string;
  config: StageConfig;
  configPath: string;
  prompt: string;
  promptPath: string;
  templates: Array<{ commandName: Stage; promptPath: string }>;
  bridgePath: string;
  model: ModelIdentity;
  thinkingLevel: string;
  candidateBefore: CandidateSnapshot;
};

export type LifecycleStageRunner = (
  request: LifecycleStageRequest,
  signal: AbortSignal | undefined,
  callbacks: RpcStageCallbacks,
) => Promise<RpcLifecycleStageResult>;

export type ConductorUI = RpcStageUI & {
  setEditorText(text: string): void;
};

export type ConductorDeps = {
  resolvePlan(input: string, cwd: string): ResolvePlanResult;
  registry: ModelRegistryLike;
  currentModel: ModelIdentity | undefined;
  scopedModels?: readonly ModelIdentity[];
  modelUI: ModelSelectionUI;
  ui: ConductorUI;
  stateStore: LifecycleStateStore;
  coordinatorSessionId: string;
  thinkingLevel: string;
  stagePaths: Record<Stage, string>;
  bridgePath: string;
  captureCandidate(root: string): CandidateSnapshot;
  runStage: LifecycleStageRunner;
  createRunId?: () => string;
  now?: () => string;
};

type StageRecord = {
  status: string;
  model: ModelIdentity;
  thinkingLevel: string;
  progress: string[];
  decisions: RpcStageDecision[];
  sessionId?: string;
  candidateBefore?: CandidateSnapshot;
  candidateAfter?: CandidateSnapshot;
  outcome?: LifecycleOutcomeEnvelope;
  reportRef?: string;
  error?: string;
  stderr?: string;
};

type RoundRecord = {
  number: number;
  unit: UnitDescriptor;
  unitBase: string;
  status: string;
  stages: Record<Stage, StageRecord>;
  candidateCommits: { execute?: string; simplify?: string };
  verificationAttempts: 0 | 1;
  blockedVerdicts: 0 | 1;
};

type RunRecord = Record<string, unknown> & {
  schemaVersion: 1;
  runId: string;
  coordinatorSessionId: string;
  worktree: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  planPath: string;
  branch: string;
  defaultBranch: string;
  baseline: Extract<ResolvePlanResult, { ok: true }>["baseline"];
  models: Record<Stage, ModelIdentity>;
  thinkingLevel: string;
  initialCandidate: CandidateSnapshot;
  currentCandidate: CandidateSnapshot;
  rounds: RoundRecord[];
  remainingUnits: string[];
  decisions: RpcStageDecision[];
  reports: string[];
  prUrl?: string;
  prPresence: "present" | "absent";
  verificationAttempts: number;
  blockedVerdicts: 0 | 1;
  error?: string;
  nextAction: string;
};

export type ConductorOutcome =
  | {
      status: "verified";
      runId: string;
      recordPath: string;
      verificationAttempts: number;
      blockedVerdicts: 0;
      summary: string;
    }
  | {
      status: "blocked";
      runId: string;
      recordPath: string;
      stage: TerminalStage;
      reason: string;
      verificationAttempts: number;
      blockedVerdicts: 0 | 1;
      summary: string;
    }
  | {
      status: "process-failure";
      runId: string;
      recordPath: string;
      stage: TerminalStage;
      reason: string;
      verificationAttempts: number;
      blockedVerdicts: 0;
      ownershipRetained: boolean;
      summary: string;
    }
  | {
      status: "cancelled";
      runId?: string;
      recordPath?: string;
      stage?: Stage | "transition";
      reason: string;
      verificationAttempts: number;
      blockedVerdicts: 0;
      ownershipRetained: boolean;
      summary: string;
    }
  | {
      status: "preflight-failure";
      reason: string;
      verificationAttempts: 0;
      blockedVerdicts: 0;
      summary: string;
    };

type TerminalStage = Stage | "preflight" | "transition";

const STAGES: Stage[] = ["execute", "simplify", "verify"];
// deliberate: one run executes at most 20 rounds so the run record stays below MAX_RUN_RECORD_BYTES; rerun /implement to continue.
export const MAX_ROUNDS_PER_RUN = 20;
const MAX_PROGRESS_ENTRIES = 100;
const MAX_PROGRESS_BYTES = 512;
const MAX_ERROR_BYTES = 2_000;

function modelIdentity(model: LifecycleModel): ModelIdentity {
  return { provider: model.provider, id: model.id };
}

function modelKey(model: ModelIdentity): string {
  return `${model.provider}/${model.id}`;
}

function truncate(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  const prefix = Buffer.from(value, "utf8").subarray(0, Math.max(0, maxBytes - 3)).toString("utf8");
  return `${prefix.endsWith("\uFFFD") ? prefix.slice(0, -1) : prefix}…`;
}

function reasonOf(error: unknown): string {
  return truncate(error instanceof Error ? error.message : String(error), MAX_ERROR_BYTES);
}

function preflightFailure(reason: string, ui: ConductorUI): ConductorOutcome {
  const summary = `Lifecycle preflight failed: ${reason}\nNo stage was started.`;
  ui.notify(summary, "error");
  ui.setEditorText(summary);
  return { status: "preflight-failure", reason, verificationAttempts: 0, blockedVerdicts: 0, summary };
}

function cancelledBeforeRun(reason: string, ui: ConductorUI): ConductorOutcome {
  const summary = `Lifecycle run cancelled: ${reason}\nNo stage was started.`;
  ui.notify(summary, "warning");
  ui.setEditorText(summary);
  return { status: "cancelled", reason, verificationAttempts: 0, blockedVerdicts: 0, ownershipRetained: false, summary };
}

function sameBaseline(left: Extract<ResolvePlanResult, { ok: true }>, right: Extract<ResolvePlanResult, { ok: true }>): boolean {
  return left.planPath === right.planPath && left.root === right.root && left.branch === right.branch &&
    left.defaultBranch === right.defaultBranch && left.baseline.commit === right.baseline.commit &&
    left.baseline.plan.path === right.baseline.plan.path && left.baseline.plan.blob === right.baseline.plan.blob &&
    left.baseline.design.path === right.baseline.design.path && left.baseline.design.blob === right.baseline.design.blob;
}

function sameUnit(left: UnitDescriptor, right: UnitDescriptor): boolean {
  return left.heading === right.heading && JSON.stringify(left.taskNumbers) === JSON.stringify(right.taskNumbers);
}

function sameCandidate(left: CandidateSnapshot, right: CandidateSnapshot): boolean {
  return left.branch === right.branch && left.head === right.head && left.stateDigest === right.stateDigest;
}

function expectedCandidateMatches(outcome: LifecycleOutcomeEnvelope, candidate: CandidateSnapshot): boolean {
  return sameCandidate(outcome.candidate, candidate);
}

function emptyStage(model: ModelIdentity, thinkingLevel: string): StageRecord {
  return { status: "pending", model, thinkingLevel, progress: [], decisions: [] };
}

function createRunRecord(
  runId: string,
  coordinatorSessionId: string,
  resolved: Extract<ResolvePlanResult, { ok: true }>,
  models: Record<Stage, ModelIdentity>,
  thinkingLevel: string,
  candidate: CandidateSnapshot,
  now: string,
): RunRecord {
  return {
    schemaVersion: 1,
    runId,
    coordinatorSessionId,
    worktree: resolved.root,
    status: "preflight",
    startedAt: now,
    updatedAt: now,
    planPath: resolved.planPath,
    branch: resolved.branch,
    defaultBranch: resolved.defaultBranch,
    baseline: resolved.baseline,
    models,
    thinkingLevel,
    initialCandidate: candidate,
    currentCandidate: candidate,
    rounds: [],
    remainingUnits: [],
    decisions: [],
    reports: [],
    prPresence: "absent",
    verificationAttempts: 0,
    blockedVerdicts: 0,
    nextAction: "No stage has started.",
  };
}

function startRound(record: RunRecord, unit: UnitDescriptor, unitBase: string): RoundRecord {
  const round: RoundRecord = {
    number: record.rounds.length + 1,
    unit,
    unitBase,
    status: "running",
    stages: {
      execute: emptyStage(record.models.execute, record.thinkingLevel),
      simplify: emptyStage(record.models.simplify, record.thinkingLevel),
      verify: emptyStage(record.models.verify, record.thinkingLevel),
    },
    candidateCommits: {},
    verificationAttempts: 0,
    blockedVerdicts: 0,
  };
  record.rounds.push(round);
  return round;
}

function compactRound(round: RoundRecord): void {
  // Completed rounds keep outcomes and references; reports hold the detail, so drop bounded diagnostics to cap record growth.
  for (const stage of STAGES) {
    round.stages[stage].progress = [];
    round.stages[stage].decisions = [];
    delete round.stages[stage].stderr;
  }
}

function markBlockedVerdict(record: RunRecord, round: RoundRecord): void {
  round.blockedVerdicts = 1;
  record.blockedVerdicts = 1;
}

function updateDecision(record: RunRecord, round: RoundRecord, stage: Stage, decision: RpcStageDecision): void {
  const index = record.decisions.findIndex((entry) => entry.uiRequestId === decision.uiRequestId && entry.stage === stage);
  if (index < 0) record.decisions.push(decision);
  else record.decisions[index] = decision;
  const stageDecisions = round.stages[stage].decisions;
  const stageIndex = stageDecisions.findIndex((entry) => entry.uiRequestId === decision.uiRequestId);
  if (stageIndex < 0) stageDecisions.push(decision);
  else stageDecisions[stageIndex] = decision;
}

function stageSummary(round: RoundRecord, stage: Stage): string {
  const value = round.stages[stage];
  const session = value.sessionId ? `, session ${value.sessionId}` : "";
  const candidate = value.candidateAfter ? `, candidate ${value.candidateAfter.head.slice(0, 12)}` : "";
  return `  ${stage}: ${value.status} (${modelKey(value.model)}, thinking ${value.thinkingLevel}${session}${candidate})`;
}

function renderSummary(record: RunRecord, reason?: string): string {
  const lines = [
    `Lifecycle run ${record.runId}: ${record.status}`,
    `Worktree: ${record.worktree} (${record.branch})`,
    `Plan: ${record.planPath}`,
    ...record.rounds.flatMap((round) => [
      `Round ${round.number} — ${round.unit.heading}: ${round.status} (tasks ${round.unit.taskNumbers.join(", ")}; unit base ${round.unitBase.slice(0, 12)}; verification attempts ${round.verificationAttempts}/1; blocked verdicts ${round.blockedVerdicts}/1)`,
      ...STAGES.map((stage) => stageSummary(round, stage)),
      `  execute commit: ${round.candidateCommits.execute ?? "none"}; simplify commit: ${round.candidateCommits.simplify ?? "none"}`,
    ]),
    `Remaining slices: ${record.remainingUnits.length > 0 ? record.remainingUnits.join("; ") : "none"}`,
    `PR: ${record.prUrl ?? "absent"}`,
    `Verification attempts: ${record.verificationAttempts}; blocked verdicts: ${record.blockedVerdicts}/1`,
    `Reports: ${record.reports.length > 0 ? record.reports.join(", ") : "none"}`,
    `Decisions: ${record.decisions.length > 0 ? record.decisions.map((entry) => `${entry.stage} ${entry.decision}: ${entry.question ?? entry.title}`).join("; ") : "none"}`,
  ];
  if (reason) lines.push(`Reason: ${reason}`);
  lines.push(`Next action: ${record.nextAction}`);
  lines.push("No PR was opened, merged, or deployed by the coordinator.");
  return lines.join("\n");
}

function validateObservedState(
  stage: Stage,
  state: RpcObservedState | undefined,
  model: ModelIdentity,
  thinkingLevel: string,
  seenSessions: Set<string>,
): string | undefined {
  if (!state) return `Stage ${stage} did not report its observed RPC session state`;
  if (state.model.provider !== model.provider || state.model.id !== model.id) {
    return `Stage ${stage} model drift: expected ${modelKey(model)}, observed ${modelKey(state.model)}`;
  }
  if (state.thinkingLevel !== thinkingLevel) return `Stage ${stage} thinking level drift: expected ${thinkingLevel}, observed ${state.thinkingLevel}`;
  if (seenSessions.has(state.sessionId)) return `Stage ${stage} reused a prior RPC session ID: ${state.sessionId}`;
  seenSessions.add(state.sessionId);
  return undefined;
}

function buildConfig(
  runId: string,
  stage: Stage,
  resolved: Extract<ResolvePlanResult, { ok: true }>,
  unit: UnitDescriptor,
  unitBase: string,
  models: Record<Stage, ModelIdentity>,
  thinkingLevel: string,
): StageConfig {
  return parseStageConfig({
    protocolVersion: PROTOCOL_VERSION,
    runId,
    stage,
    worktree: resolved.root,
    branch: resolved.branch,
    planPath: resolved.planPath,
    baseline: resolved.baseline,
    unitBase,
    unit,
    models,
    thinkingLevel,
  }, resolved.root);
}

function stageOutcomeName(stage: Stage, outcome: LifecycleOutcomeEnvelope): boolean {
  if (stage === "execute" || stage === "simplify") return outcome.outcome === "success" || outcome.outcome === "blocked";
  return outcome.outcome === "VERIFIED" || outcome.outcome === "BLOCKED";
}

export async function runImplement(
  rawPlanInput: string,
  cwd: string,
  deps: ConductorDeps,
  signal: AbortSignal | undefined,
): Promise<ConductorOutcome> {
  const parsed = parseSinglePlanArgument(rawPlanInput);
  if (!parsed.ok) return preflightFailure(parsed.reason, deps.ui);
  if (!deps.coordinatorSessionId) return preflightFailure("Coordinator session ID is unavailable", deps.ui);
  if (!deps.thinkingLevel) return preflightFailure("Coordinator thinking level is unavailable", deps.ui);
  if (signal?.aborted) return cancelledBeforeRun("Cancelled before preflight", deps.ui);

  const initial = deps.resolvePlan(parsed.planPath, cwd);
  if (!initial.ok) return preflightFailure(initial.reason, deps.ui);
  const selectedUnit = selectExecutionUnit(initial.planText);
  if (!selectedUnit.ok) return preflightFailure(selectedUnit.reason, deps.ui);

  let initialCandidate: CandidateSnapshot;
  try {
    initialCandidate = deps.captureCandidate(initial.root);
  } catch (error) {
    return preflightFailure(`Cannot capture clean starting candidate: ${reasonOf(error)}`, deps.ui);
  }
  if (initialCandidate.branch !== initial.branch || initialCandidate.head !== initial.baseline.commit) {
    return preflightFailure("Starting candidate changed while the plan baseline was being resolved", deps.ui);
  }

  const selection = await selectModels(deps.registry, deps.currentModel, deps.modelUI, deps.scopedModels);
  if (!selection.ok) {
    if (/cancelled/i.test(selection.reason) || signal?.aborted) return cancelledBeforeRun(selection.reason, deps.ui);
    return preflightFailure(selection.reason, deps.ui);
  }
  if (signal?.aborted) return cancelledBeforeRun("Cancelled during model selection", deps.ui);

  const afterSelection = deps.resolvePlan(initial.planPath, cwd);
  if (!afterSelection.ok) return preflightFailure(`Plan changed during model selection: ${afterSelection.reason}`, deps.ui);
  if (!sameBaseline(initial, afterSelection)) return preflightFailure("Pinned plan or design baseline changed during model selection", deps.ui);
  const unitAfterSelection = selectExecutionUnit(afterSelection.planText);
  if (!unitAfterSelection.ok || !sameUnit(selectedUnit.unit, unitAfterSelection.unit)) {
    return preflightFailure(unitAfterSelection.ok ? "Selected execution unit changed during model selection" : unitAfterSelection.reason, deps.ui);
  }

  const runId = (deps.createRunId ?? randomUUID)();
  const models: Record<Stage, ModelIdentity> = {
    execute: modelIdentity(selection.models.execute),
    simplify: modelIdentity(selection.models.simplify),
    verify: modelIdentity(selection.models.verify),
  };
  let lease: LifecycleRunLease;
  try {
    lease = deps.stateStore.acquireWorktree(initial.root, runId, deps.coordinatorSessionId);
  } catch (error) {
    return preflightFailure(`Cannot acquire exclusive worktree ownership: ${reasonOf(error)}`, deps.ui);
  }

  const now = deps.now ?? (() => new Date().toISOString());
  const record = createRunRecord(runId, deps.coordinatorSessionId, initial, models, deps.thinkingLevel, initialCandidate, now());
  let releaseOwnership = true;
  let ownershipRetained = false;
  let terminal: ConductorOutcome | undefined;
  const seenSessions = new Set<string>();
  let planTextBeforeStage = initial.planText;
  let candidateBeforeStage = initialCandidate;
  let unit = selectedUnit.unit;
  let round: RoundRecord | undefined;
  const completedTasks = new Set<number>();

  const persist = () => {
    record.updatedAt = now();
    lease.writeRecord(record);
  };

  const finish = (status: "blocked" | "process-failure" | "cancelled" | "verified", stage: TerminalStage, reason?: string, nextAction?: string): void => {
    record.status = status;
    try {
      record.remainingUnits = remainingUnitHeadings(readFileSync(initial.planPath, "utf8"));
    } catch (error) {
      record.remainingUnits = [`unknown (${reasonOf(error)})`];
    }
    if (round && stage !== "transition" && stage !== "preflight") round.status = status;
    record.nextAction = nextAction ?? (status === "verified"
      ? `Review the reports and decide any follow-up; the coordinator did not open or merge a PR. For optional cross-slice cleanup, run /simplify ${initial.planPath} --base ${initial.baseline.commit}, then a fresh /verify.`
      : status === "cancelled"
        ? "Inspect the retained candidate and run record before starting another lifecycle run."
        : status === "process-failure"
          ? "Inspect the retained candidate and run record; confirm any child termination before retrying manually."
          : "Review the blocker and resolve it through the approved planning or execution workflow; no later stage or round was started.");
    if (reason) record.error = reason;
    if (round && status !== "verified" && stage !== "preflight" && stage !== "transition") {
      for (const later of STAGES.slice(STAGES.indexOf(stage) + 1)) {
        if (round.stages[later].status === "pending") round.stages[later].status = "not-started";
      }
    }
    persist();
    const summary = renderSummary(record, reason);
    if (status === "verified") {
      terminal = {
        status: "verified",
        runId,
        recordPath: lease.recordPath,
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: 0,
        summary,
      };
    } else if (status === "blocked") {
      terminal = {
        status,
        runId,
        recordPath: lease.recordPath,
        stage,
        reason: reason ?? "Lifecycle stage was blocked",
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: record.blockedVerdicts,
        summary,
      };
    } else if (status === "process-failure") {
      terminal = {
        status,
        runId,
        recordPath: lease.recordPath,
        stage,
        reason: reason ?? "Lifecycle transport or protocol failure",
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: 0,
        ownershipRetained,
        summary,
      };
    } else {
      terminal = {
        status,
        runId,
        recordPath: lease.recordPath,
        stage: stage === "preflight" ? undefined : stage,
        reason: reason ?? "Lifecycle run was cancelled",
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: 0,
        ownershipRetained,
        summary,
      };
    }
    deps.ui.notify(summary, status === "verified" ? "info" : status === "cancelled" ? "warning" : "error");
    deps.ui.setEditorText(summary);
  };

  try {
    const lockedBaseline = deps.resolvePlan(initial.planPath, cwd);
    if (!lockedBaseline.ok || !sameBaseline(initial, lockedBaseline)) {
      finish("blocked", "preflight", `Pinned worktree changed before dispatch${lockedBaseline.ok ? "" : `: ${lockedBaseline.reason}`}`);
    } else {
      const lockedCandidate = deps.captureCandidate(initial.root);
      const lockedUnit = selectExecutionUnit(lockedBaseline.planText);
      if (!sameCandidate(initialCandidate, lockedCandidate) || !lockedUnit.ok || !sameUnit(selectedUnit.unit, lockedUnit.unit)) {
        finish("blocked", "preflight", "Candidate or selected unit changed after exclusive ownership was acquired");
      } else {
        record.status = "preflight";
        record.currentCandidate = lockedCandidate;
        persist();
        rounds: while (!terminal) {
          round = startRound(record, unit, candidateBeforeStage.head);
          const activeRound = round;
          persist();
          for (const stage of STAGES) {
            if (signal?.aborted) {
              activeRound.stages[stage].status = "not-started";
              finish("cancelled", stage, "Cancelled before the next stage was dispatched");
              break;
            }
            const stageCandidate = deps.captureCandidate(initial.root);
            if (!sameCandidate(candidateBeforeStage, stageCandidate)) {
              finish("blocked", stage, `Candidate changed outside the coordinator before ${stage}`);
              break;
            }

            const stageConfig = buildConfig(runId, stage, initial, unit, activeRound.unitBase, models, deps.thinkingLevel);
            const configPath = lease.writeStageConfig(activeRound.number, stage, stageConfig);
            const model = models[stage];
            const request: LifecycleStageRequest = {
              runId,
              stage,
              cwd: initial.root,
              config: stageConfig,
              configPath,
              prompt: buildStagePrompt(stage as LifecycleStage, initial.planPath, {
                implementedBy: modelKey(models.execute),
                simplifiedBy: modelKey(models.simplify),
              }),
              promptPath: deps.stagePaths[stage],
              templates: STAGES.filter((candidate) => candidate !== stage).map((candidate) => ({
                commandName: candidate,
                promptPath: deps.stagePaths[candidate],
              })),
              bridgePath: deps.bridgePath,
              model,
              thinkingLevel: deps.thinkingLevel,
              candidateBefore: stageCandidate,
            };
            const stageRecord = activeRound.stages[stage];
            stageRecord.status = "starting";
            stageRecord.candidateBefore = stageCandidate;
            record.status = "running";
            record.currentCandidate = stageCandidate;
            persist();
            deps.ui.setStatus("lifecycle-coordinator", `${stage}: starting ${modelKey(model)} (${deps.thinkingLevel})`);

            let stageResult: RpcLifecycleStageResult;
            try {
              stageResult = await deps.runStage(request, signal, {
                onObserved: async (state) => {
                  const invalid = validateObservedState(stage, state, model, deps.thinkingLevel, seenSessions);
                  if (invalid) throw new Error(invalid);
                  stageRecord.sessionId = state.sessionId;
                  stageRecord.status = "running";
                  persist();
                },
                onProgress: (message) => {
                  if (stageRecord.progress.length < MAX_PROGRESS_ENTRIES) stageRecord.progress.push(truncate(message, MAX_PROGRESS_BYTES));
                  deps.ui.setStatus("lifecycle-coordinator", truncate(message, MAX_PROGRESS_BYTES));
                  persist();
                },
                onWaitingForUser: (waiting) => {
                  stageRecord.status = waiting ? "waiting-for-user" : "running";
                  record.status = waiting ? "waiting-for-user" : "running";
                  deps.ui.setStatus("lifecycle-coordinator", waiting ? `${stage}: waiting for user decision` : `${stage}: running`);
                  persist();
                },
                onDecision: (decision) => {
                  updateDecision(record, activeRound, stage, decision);
                  persist();
                },
              });
            } catch (error) {
              ownershipRetained = true;
              releaseOwnership = false;
              stageRecord.status = "process-failure";
              stageRecord.error = `Stage runner threw without a termination result: ${reasonOf(error)}`;
              finish("process-failure", stage, stageRecord.error);
              break;
            }

            for (const decision of stageResult.decisions) updateDecision(record, activeRound, stage, decision);
            stageRecord.progress = stageResult.progress.slice(0, MAX_PROGRESS_ENTRIES).map((message) => truncate(message, MAX_PROGRESS_BYTES));
            stageRecord.stderr = truncate(stageResult.stderr, 16 * 1024);
            stageRecord.error = stageResult.status === "settled" ? undefined : stageResult.reason;
            if (stageResult.observed) {
              const invalid = stageRecord.sessionId
                ? stageRecord.sessionId === stageResult.observed.sessionId && stageResult.observed.model.provider === model.provider &&
                  stageResult.observed.model.id === model.id && stageResult.observed.thinkingLevel === deps.thinkingLevel
                  ? undefined
                  : `Stage ${stage} returned observed state that contradicts its pre-dispatch record`
                : validateObservedState(stage, stageResult.observed, model, deps.thinkingLevel, seenSessions);
              if (invalid) {
                stageRecord.status = "process-failure";
                finish("process-failure", stage, invalid);
                if (!stageResult.terminationConfirmed) {
                  ownershipRetained = true;
                  releaseOwnership = false;
                }
                break;
              }
              stageRecord.sessionId = stageResult.observed.sessionId;
            }
            if (stage === "verify" && stageResult.promptStarted && activeRound.verificationAttempts === 0) {
              activeRound.verificationAttempts = 1;
              record.verificationAttempts++;
            }
            stageRecord.status = stageResult.status === "settled" ? "settled" : stageResult.status === "blocked" ? "blocked" : stageResult.status === "cancelled" ? "cancelled" : "process-failure";
            if (stageResult.status === "settled") {
              stageRecord.outcome = stageResult.outcome;
              stageRecord.reportRef = stageResult.outcome.reportRef;
              if (!record.reports.includes(stageResult.outcome.reportRef)) record.reports.push(stageResult.outcome.reportRef);
              if (stageResult.outcome.prUrl) {
                record.prUrl = stageResult.outcome.prUrl;
                record.prPresence = "present";
              }
            }
            if (!stageResult.terminationConfirmed) {
              ownershipRetained = true;
              releaseOwnership = false;
            }
            persist();

            if (stageResult.status !== "settled") {
              if (stageResult.status === "cancelled") finish("cancelled", stage, stageResult.reason);
              else if (stageResult.status === "blocked") finish("blocked", stage, stageResult.reason);
              else finish("process-failure", stage, stageResult.reason);
              break;
            }
            if (!stageResult.observed) {
              stageRecord.status = "process-failure";
              finish("process-failure", stage, `Stage ${stage} settled without observed RPC state`);
              break;
            }
            if (!stageResult.promptStarted) {
              finish("process-failure", stage, `${stage} settled without a started native prompt`);
              break;
            }
            if (!stageOutcomeName(stage, stageResult.outcome)) {
              finish("process-failure", stage, `${stage} submitted an outcome that does not match its stage`);
              break;
            }
            if ((stage === "execute" || stage === "simplify") && stageResult.outcome.outcome === "blocked") {
              stageRecord.status = "blocked";
              finish("blocked", stage, `${stage} reported a lifecycle blocker`);
              break;
            }
            let afterCandidate: CandidateSnapshot;
            try {
              afterCandidate = deps.captureCandidate(initial.root);
            } catch (error) {
              const reason = stage === "verify"
                ? `Verification changed or dirtied candidate state: ${reasonOf(error)}`
                : `${stage} did not leave a clean committed candidate: ${reasonOf(error)}`;
              const status = stage === "verify" || /not clean/i.test(reason) ? "blocked" : "process-failure";
              if (stage === "verify" && activeRound.verificationAttempts === 1) markBlockedVerdict(record, activeRound);
              stageRecord.status = status === "blocked" ? "blocked" : "process-failure";
              finish(status, stage, reason);
              break;
            }
            stageRecord.candidateAfter = afterCandidate;
            if (afterCandidate.branch !== initial.branch || !expectedCandidateMatches(stageResult.outcome, afterCandidate)) {
              if (stage === "verify" && activeRound.verificationAttempts === 1) markBlockedVerdict(record, activeRound);
              stageRecord.status = "blocked";
              finish("blocked", stage, `${stage} candidate snapshot changed after the bridge submitted its outcome`);
              break;
            }
            if (stage === "verify") {
              if (!sameCandidate(stageCandidate, afterCandidate)) {
                markBlockedVerdict(record, activeRound);
                stageRecord.status = "blocked";
                finish("blocked", stage, "Verification changed the candidate after its read-only review");
                break;
              }
              record.currentCandidate = afterCandidate;
              if (stageResult.outcome.outcome === "BLOCKED") {
                markBlockedVerdict(record, activeRound);
                stageRecord.status = "blocked";
                finish("blocked", stage, "Independent verification returned BLOCKED");
              } else {
                activeRound.status = "verified";
              }
              break;
            }

            const progressAfter = validatePlanProgress(planTextBeforeStage, readFileSync(initial.planPath, "utf8"), unit, stage);
            if (!progressAfter.ok) {
              stageRecord.status = "blocked";
              finish("blocked", stage, progressAfter.reason);
              break;
            }
            if (stage === "execute") {
              if (stageResult.outcome.change !== "changed" || afterCandidate.head === stageCandidate.head) {
                stageRecord.status = "blocked";
                finish("blocked", stage, "Execute must commit the selected unit before simplify can start");
                break;
              }
              activeRound.candidateCommits.execute = afterCandidate.head;
            } else {
              if (stageResult.outcome.change === "unchanged" && !sameCandidate(stageCandidate, afterCandidate)) {
                stageRecord.status = "blocked";
                finish("blocked", stage, "Simplify reported unchanged but changed candidate state");
                break;
              }
              if (stageResult.outcome.change === "changed" && afterCandidate.head === stageCandidate.head) {
                stageRecord.status = "blocked";
                finish("blocked", stage, "Simplify reported changed without creating a new candidate commit");
                break;
              }
              if (stageResult.outcome.change === "changed") activeRound.candidateCommits.simplify = afterCandidate.head;
            }
            record.currentCandidate = afterCandidate;
            planTextBeforeStage = readFileSync(initial.planPath, "utf8");
            candidateBeforeStage = afterCandidate;
            record.status = "running";
            persist();
          }
          if (terminal) break;

          compactRound(activeRound);
          for (const number of unit.taskNumbers) completedTasks.add(number);
          const next = selectExecutionUnit(readFileSync(initial.planPath, "utf8"));
          if (!next.ok) {
            if (next.complete) finish("verified", "transition");
            else finish("blocked", "transition", `Cannot select the next execution unit: ${next.reason}`);
            break rounds;
          }
          if (next.unit.heading === unit.heading || next.unit.taskNumbers.some((number) => completedTasks.has(number))) {
            finish("blocked", "transition", `The next execution unit did not advance past ${unit.heading}`);
            break rounds;
          }
          if (record.rounds.length >= MAX_ROUNDS_PER_RUN) {
            finish(
              "blocked",
              "transition",
              `Round limit of ${MAX_ROUNDS_PER_RUN} reached with slices remaining`,
              `Run /implement ${initial.planPath} again to continue with the remaining slices.`,
            );
            break rounds;
          }
          if (signal?.aborted) {
            finish("cancelled", "transition", "Cancelled before the next round was dispatched");
            break rounds;
          }
          unit = next.unit;
          persist();
        }
      }
    }
  } catch (error) {
    record.error = reasonOf(error);
    if (!terminal) {
      record.status = "process-failure";
      record.nextAction = "Inspect the retained candidate and run record; confirm any child termination before retrying manually.";
      try {
        persist();
      } catch {
        // Preserve the original failure; the lock still protects unresolved evidence.
      }
      terminal = {
        status: "process-failure",
        runId,
        recordPath: lease.recordPath,
        stage: "preflight",
        reason: record.error,
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: 0,
        ownershipRetained,
        summary: renderSummary(record, record.error),
      };
      deps.ui.notify(terminal.summary, "error");
      deps.ui.setEditorText(terminal.summary);
    }
  } finally {
    deps.ui.setStatus("lifecycle-coordinator", undefined);
    deps.ui.setStatus("lifecycle-stage", undefined);
    deps.ui.setStatus("lifecycle-child", undefined);
  }

  if (!terminal) {
    terminal = {
      status: "process-failure",
      runId,
      recordPath: lease.recordPath,
      stage: "preflight",
      reason: "Lifecycle state machine ended without a terminal outcome",
      verificationAttempts: record.verificationAttempts,
      blockedVerdicts: 0,
      ownershipRetained,
      summary: renderSummary(record, "Lifecycle state machine ended without a terminal outcome"),
    };
    record.status = "process-failure";
    record.error = terminal.reason;
    try {
      persist();
    } catch {
      // The already-rendered terminal failure is authoritative for this invocation.
    }
  }

  if (releaseOwnership) {
    try {
      lease.release();
    } catch (error) {
      ownershipRetained = true;
      const reason = `Worktree ownership release failed: ${reasonOf(error)}`;
      record.status = "process-failure";
      record.error = reason;
      record.nextAction = "Inspect the retained lock and run record manually; do not start another writer on this worktree.";
      try {
        persist();
      } catch {
        // The lock is retained and remains the safety boundary.
      }
      terminal = {
        status: "process-failure",
        runId,
        recordPath: lease.recordPath,
        stage: "preflight",
        reason,
        verificationAttempts: record.verificationAttempts,
        blockedVerdicts: 0,
        ownershipRetained,
        summary: renderSummary(record, reason),
      };
      deps.ui.notify(terminal.summary, "error");
      deps.ui.setEditorText(terminal.summary);
    }
  }
  return terminal;
}
