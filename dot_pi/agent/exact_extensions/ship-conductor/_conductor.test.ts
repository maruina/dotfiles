import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  runConductor,
  type ConductorDeps,
  type ConductorOutcome,
  type StageRunner,
  type UiSink,
} from "./_conductor.ts";
import { IMPLEMENTER_POOL, VERIFIER_POOL, type ModelRegistryLike } from "./_pools.ts";
import type { StageResult } from "./_spawn.ts";
import type { ResolvePlanResult } from "./_worktree.ts";

const PLAN_PATH = "/wt/plans/feat/plan.md";
const ROOT = "/wt";

const EXECUTE_TEMPLATE = "---\ndescription: x\n---\n# Execute\n\n> $ARGUMENTS\n\nbody with $GLOB untouched";
const VERIFY_TEMPLATE = "---\ndescription: x\n---\n# Verify\n\n> $ARGUMENTS\n\nbody";

function okResolve(): ResolvePlanResult {
  return { ok: true, planPath: PLAN_PATH, root: ROOT, branch: "maruina/feat" };
}

function refuseResolve(reason: string): ResolvePlanResult {
  return { ok: false, reason };
}

function registryAll(): ModelRegistryLike {
  const all = [...IMPLEMENTER_POOL, ...VERIFIER_POOL];
  return {
    find(provider, modelId) {
      const model = all.find((m) => m.provider === provider && m.id === modelId);
      return model ? model : undefined;
    },
    getProviderAuthStatus() {
      return { configured: true };
    },
  };
}

function registryOnly(ids: string[]): ModelRegistryLike {
  const all = [...IMPLEMENTER_POOL, ...VERIFIER_POOL].filter((m) => ids.includes(m.id));
  return {
    find(provider, modelId) {
      const model = all.find((m) => m.provider === provider && m.id === modelId);
      return model ? model : undefined;
    },
    getProviderAuthStatus() {
      return { configured: true };
    },
  };
}

function uiSink(): { ui: UiSink; state: { notified: Array<{ message: string; type?: string }>; editorText: string | undefined } } {
  const state = { notified: [] as Array<{ message: string; type?: string }>, editorText: undefined as string | undefined };
  return {
    state,
    ui: {
      notify(message, type) {
        state.notified.push({ message, type });
      },
      setEditorText(text) {
        state.editorText = text;
      },
    },
  };
}

function queueRunner(
  results: StageResult[],
): { runner: StageRunner; calls: Array<{ model: string; prompt: string; cwd: string }> } {
  const calls: Array<{ model: string; prompt: string; cwd: string }> = [];
  let index = 0;
  return {
    calls,
    runner: async (options) => {
      calls.push({ model: options.model, prompt: options.prompt, cwd: options.cwd });
      const result = results[Math.min(index, results.length - 1)];
      index++;
      return result;
    },
  };
}

const EXECUTE_SUCCESS: StageResult = {
  exitCode: 0,
  finalMessage:
    "Done.\n\nImplementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`\n\n1. Run /model and select a different model.",
  stopReason: "end",
  errorMessage: undefined,
  stderr: "",
  aborted: false,
};

const VERIFY_REPORT = (verdict: string): StageResult => ({
  exitCode: 0,
  finalMessage: [
    "## Target and scope",
    "worktree, branch",
    "## Risk and review",
    "classification",
    "## Fresh evidence",
    "commands",
    "## Skills loaded and used",
    "table",
    "## Findings",
    "none",
    "## State comparison",
    "match",
    "## Next action",
    "none",
    verdict,
  ].join("\n"),
  stopReason: "end",
  errorMessage: undefined,
  stderr: "",
  aborted: false,
});

function baseDeps(overrides: Partial<ConductorDeps>): ConductorDeps {
  return {
    resolvePlan: () => okResolve(),
    readPrompt: (name) => (name === "execute" ? EXECUTE_TEMPLATE : VERIFY_TEMPLATE),
    registry: registryAll(),
    runStage: async () => EXECUTE_SUCCESS,
    ui: uiSink().ui,
    ...overrides,
  };
}

function assertHardStop(outcome: ConductorOutcome, stage: string, pattern: RegExp): void {
  assert.equal(outcome.status, "hard-stop");
  if (outcome.status !== "hard-stop") return;
  assert.equal(outcome.stage, stage);
  assert.match(outcome.reason, pattern);
}

describe("runConductor", () => {
  it("refuses a plan on the default branch before spawning", async () => {
    const ui = uiSink();
    const stages = queueRunner([EXECUTE_SUCCESS]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      resolvePlan: () => refuseResolve("Refusing to ship on default branch main (/repo)"),
      runStage: stages.runner,
      ui: ui.ui,
    }), undefined);
    assertHardStop(outcome, "preflight", /default branch main/);
    assert.equal(stages.calls.length, 0);
    assert.ok(ui.state.notified.some((n) => n.type === "error"));
  });

  it("refuses an uncommitted plan before spawning", async () => {
    const stages = queueRunner([EXECUTE_SUCCESS]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      resolvePlan: () => refuseResolve("Plan has uncommitted changes: /wt/plans/feat/plan.md"),
      runStage: stages.runner,
    }), undefined);
    assertHardStop(outcome, "preflight", /uncommitted changes/);
    assert.equal(stages.calls.length, 0);
  });

  it("refuses when a prompt template is unreadable", async () => {
    const stages = queueRunner([EXECUTE_SUCCESS]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      readPrompt: (name) => (name === "execute" ? undefined : VERIFY_TEMPLATE),
      runStage: stages.runner,
    }), undefined);
    assertHardStop(outcome, "preflight", /execute prompt/);
    assert.equal(stages.calls.length, 0);
  });

  it("refuses when no distinct verifier is available", async () => {
    const stages = queueRunner([EXECUTE_SUCCESS]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      registry: registryOnly(["baseten/zai-org/GLM-5.3"]),
      runStage: stages.runner,
    }), undefined);
    assertHardStop(outcome, "preflight", /No distinct verifier/);
    assert.equal(stages.calls.length, 0);
  });

  it("runs execute then verify under distinct models and surfaces VERIFIED", async () => {
    const ui = uiSink();
    const stages = queueRunner([EXECUTE_SUCCESS, VERIFY_REPORT("VERIFIED")]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      runStage: stages.runner,
      ui: ui.ui,
    }), undefined);
    assert.equal(outcome.status, "verified");
    if (outcome.status !== "verified") return;
    assert.equal(outcome.verifierModel, "baseten/zai-org/GLM-5.3-Flash");
    assert.equal(stages.calls.length, 2);
    assert.equal(stages.calls[0].model, "baseten/zai-org/GLM-5.3");
    assert.equal(stages.calls[1].model, "baseten/zai-org/GLM-5.3-Flash");
    assert.equal(stages.calls[0].cwd, ROOT);
    assert.equal(stages.calls[1].cwd, ROOT);
    assert.ok(stages.calls[0].prompt.includes(PLAN_PATH));
    assert.ok(!stages.calls[0].prompt.includes("$ARGUMENTS"));
    assert.ok(stages.calls[0].prompt.includes("$GLOB"));
    assert.ok(stages.calls[1].prompt.includes(`${PLAN_PATH} --implemented-by baseten/zai-org/GLM-5.3`));
    assert.ok(ui.state.notified.some((n) => n.message.includes("VERIFIED")));
  });

  it("surfaces BLOCKED with the verify final message and no repair", async () => {
    const ui = uiSink();
    const blocked = VERIFY_REPORT("BLOCKED");
    const stages = queueRunner([EXECUTE_SUCCESS, blocked]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({
      runStage: stages.runner,
      ui: ui.ui,
    }), undefined);
    assert.equal(outcome.status, "blocked");
    if (outcome.status !== "blocked") return;
    assert.equal(outcome.verifierModel, "baseten/zai-org/GLM-5.3-Flash");
    assert.equal(outcome.message, blocked.finalMessage);
    assert.equal(ui.state.editorText, blocked.finalMessage);
    assert.equal(stages.calls.length, 2);
  });

  it("hard-stops on an absent execute marker and never spawns verify", async () => {
    const stages = queueRunner([{ ...EXECUTE_SUCCESS, finalMessage: "no handoff marker here" }]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({ runStage: stages.runner }), undefined);
    assertHardStop(outcome, "execute", /handoff marker/);
    assert.equal(stages.calls.length, 1);
  });

  it("hard-stops on an execute marker id mismatch and never spawns verify", async () => {
    const stages = queueRunner([
      { ...EXECUTE_SUCCESS, finalMessage: "Implementation model: `Other (x) (other/model)`" },
    ]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({ runStage: stages.runner }), undefined);
    assertHardStop(outcome, "execute", /handoff names other\/model/);
    assert.equal(stages.calls.length, 1);
  });

  it("hard-stops on a failing execute stage and never spawns verify", async () => {
    const ui = uiSink();
    const stages = queueRunner([
      { exitCode: 1, finalMessage: "partial", stopReason: "error", errorMessage: "kaboom", stderr: "trace\n", aborted: false },
    ]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({ runStage: stages.runner, ui: ui.ui }), undefined);
    assertHardStop(outcome, "execute", /execute failed/);
    assert.equal(stages.calls.length, 1);
    assert.equal(ui.state.editorText, "partial");
  });

  it("hard-stops when the verify verdict is absent", async () => {
    const ui = uiSink();
    const stages = queueRunner([EXECUTE_SUCCESS, { ...VERIFY_REPORT("VERIFIED"), finalMessage: "no verdict" }]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({ runStage: stages.runner, ui: ui.ui }), undefined);
    assertHardStop(outcome, "verify", /terminal verdict/);
    assert.equal(ui.state.editorText, "no verdict");
    assert.equal(stages.calls.length, 2);
  });

  it("reports cancellation when the active stage is aborted", async () => {
    const ui = uiSink();
    const stages = queueRunner([
      { exitCode: 143, finalMessage: "", stopReason: "aborted", errorMessage: undefined, stderr: "", aborted: true },
    ]);
    const outcome = await runConductor("plans/feat/plan.md", "/cwd", baseDeps({ runStage: stages.runner, ui: ui.ui }), undefined);
    assert.equal(outcome.status, "cancelled");
    assert.equal(stages.calls.length, 1);
    assert.ok(ui.state.notified.some((n) => n.message.includes("cancelled")));
  });
});
