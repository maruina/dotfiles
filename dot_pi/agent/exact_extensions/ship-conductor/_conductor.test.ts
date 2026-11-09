import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { runImplement, type ConductorDeps, type ConductorOutcome, type LifecycleStageRunner } from "./_conductor.ts";
import type { LifecycleModel, ModelRegistryLike, ModelSelectionUI } from "./_models.ts";
import type { RpcStageUI } from "./_spawn.ts";
import type { LifecycleOutcomeEnvelope } from "./_protocol.ts";
import { LifecycleStateStore } from "./_state.ts";
import { captureCleanCandidate, createGitRunner, resolvePlan } from "./_worktree.ts";

const PLAN = `# Implementation Plan\n\n## Work\n\n### Slice 1: Current slice\n\n#### Task 1: Implement current slice\n**Blocked by:** None\n- [ ] Implement the selected slice.\n\n### Slice 2: Later slice\n\n#### Task 2: Implement later slice\n**Blocked by:** Task 1\n- [ ] Implement the later slice.\n`;
const DESIGN = "# Design\n\nThe current slice is the only authorized unit.\n";
const fixtures: string[] = [];

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function createRepo(): { base: string; root: string; planPath: string } {
  const base = mkdtempSync(join(tmpdir(), "implement-coordinator-"));
  fixtures.push(base);
  const root = join(base, "repo");
  const planPath = join(root, "plans", "feature", "plan.md");
  mkdirSync(join(root, "plans", "feature"), { recursive: true });
  writeFileSync(planPath, PLAN);
  writeFileSync(join(root, "plans", "feature", "design.md"), DESIGN);
  git(root, ["init", "--quiet", "--initial-branch=trunk"]);
  git(root, ["config", "user.name", "Lifecycle test"]);
  git(root, ["config", "user.email", "lifecycle-test@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
  git(root, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "baseline"]);
  git(root, ["switch", "--quiet", "-c", "feature"]);
  return { base, root, planPath };
}

const MODELS: LifecycleModel[] = [
  { provider: "fixture", id: "writer-a", name: "Writer A" },
  { provider: "fixture", id: "writer-b", name: "Writer B" },
  { provider: "fixture", id: "reviewer", name: "Reviewer" },
];

function registry(): ModelRegistryLike {
  return {
    getAvailable: () => MODELS,
    find: (provider, id) => MODELS.find((model) => model.provider === provider && model.id === id),
    hasConfiguredAuth: () => true,
  };
}

function selectionUI(selections: string[] = []): { ui: ModelSelectionUI; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ui: {
      async select(stage, options) {
        calls.push(stage);
        const id = selections.shift() ?? (stage === "execute" ? "writer-a" : stage === "simplify" ? "writer-b" : "reviewer");
        return options.find((option) => option.includes(`fixture/${id})`));
      },
      async confirmIndependent() {
        return true;
      },
    },
  };
}

function conductorUI(): RpcStageUI & { setEditorText(text: string): void; notices: string[]; statuses: Map<string, string | undefined> } {
  const notices: string[] = [];
  const statuses = new Map<string, string | undefined>();
  const ui: RpcStageUI & { setEditorText(text: string): void; notices: string[]; statuses: Map<string, string | undefined> } = {
    async select(_title: string, options: string[]) {
      return options[0];
    },
    async confirm() {
      return true;
    },
    async input() {
      return "fixture";
    },
    async editor() {
      return "fixture";
    },
    notify(message: string) {
      notices.push(message);
    },
    setStatus(key: string, text: string | undefined) {
      statuses.set(key, text);
    },
    setEditorText(_text: string) {},
    notices,
    statuses,
  };
  return ui;
}

type RunnerOptions = {
  simplifyChange?: "changed" | "unchanged";
  executeOutcome?: "success" | "blocked";
  verifyOutcome?: "VERIFIED" | "BLOCKED";
  failAt?: "execute" | "simplify" | "verify";
  mutateVerify?: boolean;
};

function stageRunner(root: string, planPath: string, options: RunnerOptions = {}): {
  runner: LifecycleStageRunner;
  calls: Array<{ stage: string; prompt: string; sessionId: string; unit: number[]; model: string }>;
} {
  const gitRunner = createGitRunner();
  const calls: Array<{ stage: string; prompt: string; sessionId: string; unit: number[]; model: string }> = [];
  const runner: LifecycleStageRunner = async (request, _signal, callbacks) => {
    const sessionId = `session-${request.stage}`;
    calls.push({
      stage: request.stage,
      prompt: request.prompt,
      sessionId,
      unit: request.config.unit.taskNumbers,
      model: `${request.model.provider}/${request.model.id}`,
    });
    await callbacks.onObserved?.({ sessionId, model: request.model, thinkingLevel: request.thinkingLevel, messageCount: 0 });
    callbacks.onProgress?.(`${request.stage}: fixture started`);
    if (options.failAt === request.stage) {
      return {
        status: "failure",
        reason: `${request.stage} fixture failure`,
        promptStarted: true,
        observed: { sessionId, model: request.model, thinkingLevel: request.thinkingLevel, messageCount: 0 },
        decisions: [],
        progress: [],
        stderr: "fixture stderr",
        terminationConfirmed: true,
      };
    }

    let outcome: LifecycleOutcomeEnvelope["outcome"];
    let change: "changed" | "unchanged" | "not-applicable";
    if (request.stage === "execute") {
      if (options.executeOutcome === "blocked") {
        outcome = "blocked";
        change = "unchanged";
      } else {
        writeFileSync(planPath, readFileSync(planPath, "utf8").replace("- [ ] Implement the selected slice.", "- [x] Implement the selected slice."));
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "execute.txt"), "execute result\n");
        git(root, ["add", "."]);
        git(root, ["commit", "--quiet", "-m", "implement selected slice"]);
        outcome = "success";
        change = "changed";
      }
    } else if (request.stage === "simplify") {
      if (options.simplifyChange === "changed") {
        writeFileSync(join(root, "src", "simplified.txt"), "simplified result\n");
        git(root, ["add", "."]);
        git(root, ["commit", "--quiet", "-m", "simplify selected slice"]);
        change = "changed";
      } else {
        change = "unchanged";
      }
      outcome = "success";
    } else {
      if (options.mutateVerify) writeFileSync(join(root, "verify-mutation.txt"), "forbidden mutation\n");
      outcome = options.verifyOutcome ?? "VERIFIED";
      change = "not-applicable";
    }

    const candidate = options.mutateVerify && request.stage === "verify"
      ? request.candidateBefore
      : captureCleanCandidate(root, gitRunner);
    const envelope: LifecycleOutcomeEnvelope = {
      schemaVersion: 1,
      runId: request.runId,
      stage: request.stage,
      sessionId,
      model: request.model,
      outcome,
      change,
      candidate,
      reportRef: `lifecycle-coordinator/runs/${request.runId}/reports/${request.stage}-fixture.md`,
    };
    return {
      status: "settled",
      outcome: envelope,
      promptStarted: true,
      observed: { sessionId, model: request.model, thinkingLevel: request.thinkingLevel, messageCount: 1 },
      decisions: [],
      progress: [`${request.stage}: fixture settled`],
      stderr: "",
      terminationConfirmed: true,
    };
  };
  return { runner, calls };
}

function baseDeps(fixture: ReturnType<typeof createRepo>, overrides: Partial<ConductorDeps> = {}): {
  deps: ConductorDeps;
  modelSelection: ReturnType<typeof selectionUI>;
  ui: ReturnType<typeof conductorUI>;
  store: LifecycleStateStore;
} {
  const modelSelection = selectionUI();
  const ui = conductorUI();
  const store = new LifecycleStateStore(join(fixture.base, "state"));
  const gitRunner = createGitRunner();
  const stagePaths = {
    execute: "/agent/prompts/execute.md",
    simplify: "/agent/prompts/simplify.md",
    verify: "/agent/prompts/verify.md",
  };
  const deps: ConductorDeps = {
    resolvePlan: (input, cwd) => resolvePlan(input, cwd, gitRunner),
    registry: registry(),
    currentModel: { provider: "fixture", id: "writer-a" },
    modelUI: modelSelection.ui,
    ui,
    stateStore: store,
    coordinatorSessionId: "coordinator-session",
    thinkingLevel: "minimal",
    stagePaths,
    bridgePath: "/agent/extensions/ship-conductor/_bridge.ts",
    captureCandidate: (root) => captureCleanCandidate(root, gitRunner),
    runStage: async () => { throw new Error("test must supply a stage runner"); },
    createRunId: () => "run-test",
    ...overrides,
  };
  return { deps, modelSelection, ui, store };
}

function assertOutcomeStatus(outcome: ConductorOutcome, expected: ConductorOutcome["status"]): void {
  assert.equal(outcome.status, expected);
}

describe("runImplement", () => {
  it("selects one unit, runs execute then simplify then fresh verify, and records a typed report", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(`'${fixture.planPath}'`, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "verified");
    if (outcome.status !== "verified") return;
    assert.deepEqual(depsState.modelSelection.calls, ["execute", "simplify", "verify"]);
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.deepEqual(stages.calls.map((call) => call.unit), [[1], [1], [1]]);
    assert.deepEqual(stages.calls.map((call) => call.model), ["fixture/writer-a", "fixture/writer-b", "fixture/reviewer"]);
    assert.deepEqual(stages.calls.map((call) => call.sessionId), ["session-execute", "session-simplify", "session-verify"]);
    assert.match(readFileSync(fixture.planPath, "utf8"), /- \[ \] Implement the later slice\./);
    assert.match(stages.calls[1]!.prompt, /--implemented-by 'fixture\/writer-a'/);
    assert.match(stages.calls[2]!.prompt, /--implemented-by 'fixture\/writer-a' --simplified-by 'fixture\/writer-b'/);
    assert.ok(stages.calls.every((call) => !call.prompt.includes("fixture settled")));
    assert.equal(outcome.verificationAttempts, 1);
    assert.equal(outcome.blockedVerdicts, 0);
    assert.equal(outcome.runId, "run-test");
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
    const record = JSON.parse(readFileSync(outcome.recordPath, "utf8")) as Record<string, any>;
    assert.equal(record.status, "verified");
    assert.equal(record.verificationAttempts, 1);
    assert.equal(record.blockedVerdicts, 0);
    assert.equal(record.unit.heading, "Slice 1: Current slice");
    assert.deepEqual(record.unit.taskNumbers, [1]);
    assert.equal(record.stages.execute.status, "settled");
    assert.equal(record.stages.simplify.status, "settled");
    assert.equal(record.stages.verify.status, "settled");
    assert.equal(record.prUrl, undefined);
    assert.equal(record.prPresence, "absent");
  });

  it("runs fresh verification after unchanged simplify without making an empty commit", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { simplifyChange: "unchanged" });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "verified");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.equal(git(fixture.root, ["log", "--oneline", "-1"]).includes("simplify selected slice"), false);
  });

  it("stops after a structured blocked stage and records no verification verdict", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { executeOutcome: "blocked" });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute"]);
    assert.equal(outcome.verificationAttempts, 0);
    assert.equal(outcome.blockedVerdicts, 0);
  });

  it("keeps transport failure distinct from a blocked verification verdict", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { failAt: "verify" });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "process-failure");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.equal(outcome.verificationAttempts, 1);
    assert.equal(outcome.blockedVerdicts, 0);
  });

  it("returns BLOCKED when verification mutates candidate state and preserves the mutation", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { mutateVerify: true });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.equal(existsSync(join(fixture.root, "verify-mutation.txt")), true);
    assert.equal(outcome.verificationAttempts, 1);
    assert.equal(outcome.blockedVerdicts, 1);
  });

  it("refuses a worktree already owned by another lifecycle run", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const owner = depsState.store.acquireWorktree(fixture.root, "owned-run", "another-session");
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    try {
      const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);
      assertOutcomeStatus(outcome, "preflight-failure");
      assert.equal(stages.calls.length, 0);
    } finally {
      owner.release();
    }
  });

  it("does not acquire a lock or start a writer when model selection is cancelled", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture, {
      modelUI: {
        select: async (stage, choices) => stage === "execute" ? choices[0] : undefined,
        confirmIndependent: async () => true,
      },
    });
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "cancelled");
    assert.equal(stages.calls.length, 0);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
  });
});
