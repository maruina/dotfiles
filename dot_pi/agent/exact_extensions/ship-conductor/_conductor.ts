/**
 * /ship orchestrator: a pre-flight → execute → verify state machine over
 * injected dependencies. Every hard gate is a hard stop; the conductor never
 * edits, commits, retries, or repairs.
 */

import { parseExecuteMarker, parseVerifyVerdict } from "./_markers.ts";
import { selectModels, type ModelRegistryLike } from "./_pools.ts";
import { buildExecuteArguments, buildVerifyArguments, expandPrompt, type PromptName } from "./_prompts.ts";
import { describeFailure, isStageFailure, stderrTail, type StageResult } from "./_spawn.ts";
import type { ResolvePlanResult } from "./_worktree.ts";

export type PromptReader = (name: PromptName) => string | undefined;

export type StageRunner = (
  options: { model: string; prompt: string; cwd: string },
  signal: AbortSignal | undefined,
) => Promise<StageResult>;

export type UiSink = {
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setEditorText(text: string): void;
};

export type ConductorDeps = {
  resolvePlan(input: string, cwd: string): ResolvePlanResult;
  readPrompt: PromptReader;
  registry: ModelRegistryLike;
  runStage: StageRunner;
  ui: UiSink;
};

export type ConductorOutcome =
  | { status: "verified"; verifierModel: string }
  | { status: "blocked"; verifierModel: string; message: string }
  | { status: "cancelled" }
  | { status: "hard-stop"; stage: string; reason: string; message?: string };

function hardStop(ui: UiSink, stage: string, reason: string, message?: string): ConductorOutcome {
  ui.notify(`ship: ${reason}`, "error");
  if (message) ui.setEditorText(message);
  return { status: "hard-stop", stage, reason, message };
}

function cancelled(ui: UiSink): ConductorOutcome {
  ui.notify("ship: cancelled by user", "warning");
  return { status: "cancelled" };
}

function failureDetail(result: StageResult): string {
  const tail = stderrTail(result.stderr).trim();
  return tail ? ` (${describeFailure(result)}; stderr: ${tail})` : ` (${describeFailure(result)})`;
}

export async function runConductor(
  planInput: string,
  cwd: string,
  deps: ConductorDeps,
  signal: AbortSignal | undefined,
): Promise<ConductorOutcome> {
  const { resolvePlan, readPrompt, registry, runStage, ui } = deps;

  const resolved = resolvePlan(planInput, cwd);
  if (!resolved.ok) {
    return hardStop(ui, "preflight", resolved.reason);
  }

  const executeTemplate = readPrompt("execute");
  if (executeTemplate === undefined) {
    return hardStop(ui, "preflight", "Cannot read the execute prompt template");
  }
  const verifyTemplate = readPrompt("verify");
  if (verifyTemplate === undefined) {
    return hardStop(ui, "preflight", "Cannot read the verify prompt template");
  }

  const selection = selectModels(registry);
  if (!selection.ok) {
    return hardStop(ui, "preflight", selection.reason);
  }
  const { implementer, verifier } = selection;

  // Execute stage
  const executePrompt = expandPrompt(executeTemplate, buildExecuteArguments(resolved.planPath));
  ui.notify(`ship: execute under ${implementer.id} in ${resolved.root}`, "info");
  const executeResult = await runStage({ model: implementer.id, prompt: executePrompt, cwd: resolved.root }, signal);
  if (executeResult.aborted) return cancelled(ui);
  if (isStageFailure(executeResult)) {
    return hardStop(ui, "execute", `execute failed${failureDetail(executeResult)}`, executeResult.finalMessage);
  }

  const marker = parseExecuteMarker(executeResult.finalMessage);
  if (!marker) {
    return hardStop(ui, "execute", "execute did not reach its Implementation model handoff marker", executeResult.finalMessage);
  }
  if (marker.id !== implementer.id) {
    return hardStop(
      ui,
      "execute",
      `execute handoff names ${marker.id}, but the stage ran under ${implementer.id}`,
      executeResult.finalMessage,
    );
  }
  ui.notify(`ship: execute completed under ${marker.id}`, "info");

  // Verify stage
  const verifyPrompt = expandPrompt(verifyTemplate, buildVerifyArguments(resolved.planPath, implementer.id));
  ui.notify(`ship: verify under ${verifier.id} in ${resolved.root}`, "info");
  const verifyResult = await runStage({ model: verifier.id, prompt: verifyPrompt, cwd: resolved.root }, signal);
  if (verifyResult.aborted) return cancelled(ui);
  if (isStageFailure(verifyResult)) {
    return hardStop(ui, "verify", `verify failed${failureDetail(verifyResult)}`, verifyResult.finalMessage);
  }

  const verdict = parseVerifyVerdict(verifyResult.finalMessage);
  if (verdict === "VERIFIED") {
    ui.notify(`ship: VERIFIED under ${verifier.id}`, "info");
    return { status: "verified", verifierModel: verifier.id };
  }
  if (verdict === "BLOCKED") {
    ui.notify(`ship: BLOCKED under ${verifier.id}`, "warning");
    ui.setEditorText(verifyResult.finalMessage);
    return { status: "blocked", verifierModel: verifier.id, message: verifyResult.finalMessage };
  }
  return hardStop(ui, "verify", "verify did not reach a terminal verdict", verifyResult.finalMessage);
}
