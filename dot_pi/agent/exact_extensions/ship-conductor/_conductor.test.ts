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

const PLAN = `# Implementation Plan\n\n## Work\n\n### Slice 1: Current slice\n\n#### Task 1: Implement current slice\n**Blocked by:** None\n- [ ] Implement task 1.\n\n### Slice 2: Later slice\n\n#### Task 2: Implement later slice\n**Blocked by:** Task 1\n- [ ] Implement task 2.\n`;
const UNGROUPED_PLAN = `# Implementation Plan\n\n## Work\n\n### Task 1: Implement the change\n**Blocked by:** None\n- [ ] Implement task 1.\n`;

function slicedPlan(count: number): string {
  const slices = Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `### Slice ${number}: Slice ${number}\n\n#### Task ${number}: Implement slice ${number}\n**Blocked by:** ${number === 1 ? "None" : `Task ${number - 1}`}\n- [ ] Implement task ${number}.\n`;
  });
  return `# Implementation Plan\n\n## Work\n\n${slices.join("\n")}`;
}
const DESIGN = "# Design\n\nThe current slice is the only authorized unit.\n";
const fixtures: string[] = [];

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function createRepo(planText = PLAN): { base: string; root: string; planPath: string } {
  const base = mkdtempSync(join(tmpdir(), "implement-coordinator-"));
  fixtures.push(base);
  const root = join(base, "repo");
  const planPath = join(root, "plans", "feature", "plan.md");
  mkdirSync(join(root, "plans", "feature"), { recursive: true });
  writeFileSync(planPath, planText);
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

type StageCall = { stage: string; prompt: string; sessionId: string; unit: number[]; unitBase: string; configPath: string; model: string };

type RunnerOptions = {
  simplifyChange?: "changed" | "unchanged";
  simplifyOutcome?: "success" | "blocked";
  executeOutcome?: "success" | "blocked" | "no-commit";
  verifyOutcome?: "VERIFIED" | "BLOCKED";
  verifyOutcomes?: Array<"VERIFIED" | "BLOCKED">;
  failAt?: "execute" | "simplify" | "verify";
  mutateVerify?: boolean;
  mutateVerifyAfterOutcome?: boolean;
  terminationUnconfirmed?: boolean;
};

function stageRunner(root: string, planPath: string, options: RunnerOptions = {}): {
  runner: LifecycleStageRunner;
  calls: StageCall[];
} {
  const gitRunner = createGitRunner();
  const calls: StageCall[] = [];
  let verifyRound = 0;
  const runner: LifecycleStageRunner = async (request, _signal, callbacks) => {
    const unitKey = request.config.unit.taskNumbers.join("-");
    const sessionId = `session-${request.stage}-${unitKey}`;
    calls.push({
      stage: request.stage,
      prompt: request.prompt,
      sessionId,
      unit: request.config.unit.taskNumbers,
      unitBase: request.config.unitBase,
      configPath: request.configPath,
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
        terminationConfirmed: !options.terminationUnconfirmed,
      };
    }

    let outcome: LifecycleOutcomeEnvelope["outcome"];
    let change: "changed" | "unchanged" | "not-applicable";
    if (request.stage === "execute") {
      if (options.executeOutcome === "blocked") {
        outcome = "blocked";
        change = "unchanged";
      } else if (options.executeOutcome === "no-commit") {
        outcome = "success";
        change = "changed";
      } else {
        let planText = readFileSync(planPath, "utf8");
        for (const number of request.config.unit.taskNumbers) {
          planText = planText.replace(`- [ ] Implement task ${number}.`, `- [x] Implement task ${number}.`);
        }
        writeFileSync(planPath, planText);
        mkdirSync(join(root, "src"), { recursive: true });
        writeFileSync(join(root, "src", "execute.txt"), `execute result ${unitKey}\n`);
        git(root, ["add", "."]);
        git(root, ["commit", "--quiet", "-m", "implement selected slice"]);
        outcome = "success";
        change = "changed";
      }
    } else if (request.stage === "simplify") {
      if (options.simplifyOutcome === "blocked") {
        outcome = "blocked";
        change = "unchanged";
      } else {
        if (options.simplifyChange === "changed") {
          writeFileSync(join(root, "src", "simplified.txt"), `simplified result ${unitKey}\n`);
          git(root, ["add", "."]);
          git(root, ["commit", "--quiet", "-m", "simplify selected slice"]);
          change = "changed";
        } else {
          change = "unchanged";
        }
        outcome = "success";
      }
    } else {
      if (options.mutateVerify) writeFileSync(join(root, "verify-mutation.txt"), "forbidden mutation\n");
      outcome = options.verifyOutcomes?.[verifyRound] ?? options.verifyOutcome ?? "VERIFIED";
      verifyRound++;
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
    if (options.mutateVerifyAfterOutcome && request.stage === "verify") {
      writeFileSync(join(root, "verify-post-result-mutation.txt"), "forbidden untracked mutation\n");
      writeFileSync(join(root, "src", "execute.txt"), "forbidden tracked mutation\n");
    }
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
  it("runs one execute, simplify, and fresh verify round per remaining slice and records each round", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(`'${fixture.planPath}'`, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "verified");
    if (outcome.status !== "verified") return;
    assert.deepEqual(depsState.modelSelection.calls, ["execute", "simplify", "verify"]);
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify", "execute", "simplify", "verify"]);
    assert.deepEqual(stages.calls.map((call) => call.unit), [[1], [1], [1], [2], [2], [2]]);
    assert.deepEqual(stages.calls.map((call) => call.model), [
      "fixture/writer-a", "fixture/writer-b", "fixture/reviewer",
      "fixture/writer-a", "fixture/writer-b", "fixture/reviewer",
    ]);
    assert.equal(new Set(stages.calls.map((call) => call.sessionId)).size, 6);
    assert.equal(new Set(stages.calls.map((call) => call.configPath)).size, 6);
    assert.deepEqual(stages.calls.map((call) => call.configPath.split("/").at(-1)), [
      "1-execute.json", "1-simplify.json", "1-verify.json", "2-execute.json", "2-simplify.json", "2-verify.json",
    ]);
    const baselineCommit = git(fixture.root, ["rev-list", "--max-parents=0", "HEAD"]);
    assert.equal(stages.calls[0]!.unitBase, baselineCommit);
    assert.ok(stages.calls.slice(0, 3).every((call) => call.unitBase === baselineCommit));
    assert.notEqual(stages.calls[3]!.unitBase, baselineCommit);
    assert.ok(stages.calls.slice(3).every((call) => call.unitBase === stages.calls[3]!.unitBase));
    assert.match(readFileSync(fixture.planPath, "utf8"), /- \[x\] Implement task 2\./);
    assert.match(stages.calls[1]!.prompt, /--implemented-by 'fixture\/writer-a'/);
    assert.match(stages.calls[2]!.prompt, /--implemented-by 'fixture\/writer-a' --simplified-by 'fixture\/writer-b'/);
    assert.ok(stages.calls.every((call) => !call.prompt.includes("fixture settled")));
    assert.equal(outcome.verificationAttempts, 2);
    assert.equal(outcome.blockedVerdicts, 0);
    assert.equal(outcome.runId, "run-test");
    assert.match(outcome.summary, /Slice 1: Current slice: verified/);
    assert.match(outcome.summary, /Slice 2: Later slice: verified/);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
    const record = JSON.parse(readFileSync(outcome.recordPath, "utf8")) as Record<string, any>;
    assert.equal(record.status, "verified");
    assert.equal(record.verificationAttempts, 2);
    assert.equal(record.blockedVerdicts, 0);
    assert.equal(record.rounds.length, 2);
    assert.deepEqual(record.rounds.map((round: any) => round.unit.heading), ["Slice 1: Current slice", "Slice 2: Later slice"]);
    assert.deepEqual(record.rounds.map((round: any) => round.unit.taskNumbers), [[1], [2]]);
    assert.deepEqual(record.rounds.map((round: any) => round.status), ["verified", "verified"]);
    for (const round of record.rounds) {
      assert.equal(round.verificationAttempts, 1);
      assert.equal(round.blockedVerdicts, 0);
      for (const stage of ["execute", "simplify", "verify"]) {
        assert.equal(round.stages[stage].status, "settled");
        assert.deepEqual(round.stages[stage].progress, []);
      }
    }
    assert.equal(record.prUrl, undefined);
    assert.equal(record.prPresence, "absent");
  });

  it("runs one round for an ungrouped plan", async () => {
    const fixture = createRepo(UNGROUPED_PLAN);
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "verified");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.equal(outcome.verificationAttempts, 1);
  });

  it("stops the loop after a BLOCKED verdict and reports the remaining slice", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { verifyOutcomes: ["BLOCKED"] });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.equal(outcome.verificationAttempts, 1);
    assert.equal(outcome.blockedVerdicts, 1);
    assert.match(outcome.summary, /Slice 1: Current slice: blocked/);
    assert.match(outcome.summary, /Remaining slices: Slice 2: Later slice/);
    assert.match(readFileSync(fixture.planPath, "utf8"), /- \[ \] Implement task 2\./);
  });

  it("stops the loop when a later round blocks and keeps earlier verified rounds", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { verifyOutcomes: ["VERIFIED", "BLOCKED"] });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.equal(stages.calls.length, 6);
    assert.equal(outcome.verificationAttempts, 2);
    assert.equal(outcome.blockedVerdicts, 1);
    const record = JSON.parse(readFileSync(outcome.status === "blocked" ? outcome.recordPath : "", "utf8")) as Record<string, any>;
    assert.deepEqual(record.rounds.map((round: any) => round.status), ["verified", "blocked"]);
  });

  it("cancels between rounds without dispatching the next slice", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    const controller = new AbortController();
    depsState.deps.runStage = async (request, signal, callbacks) => {
      const result = await stages.runner(request, signal, callbacks);
      if (request.stage === "verify") controller.abort();
      return result;
    };
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, controller.signal);

    assertOutcomeStatus(outcome, "cancelled");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
    assert.match(outcome.summary, /Remaining slices: Slice 2: Later slice/);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
  });

  it("stops the loop when the plan changes outside the coordinator between rounds", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = async (request, signal, callbacks) => {
      const result = await stages.runner(request, signal, callbacks);
      if (request.stage === "verify") {
        writeFileSync(fixture.planPath, `${readFileSync(fixture.planPath, "utf8")}\n#### Task 3: Unplanned work\n**Blocked by:** None\n- [ ] Implement task 3.\n`);
        git(fixture.root, ["commit", "--quiet", "-am", "external plan change"]);
      }
      return result;
    };
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify"]);
  });

  it("stops after the round limit and reports the remaining slices within the record bound", async () => {
    const fixture = createRepo(slicedPlan(21));
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    if (outcome.status !== "blocked") return;
    assert.equal(stages.calls.length, 60);
    assert.equal(outcome.verificationAttempts, 20);
    assert.equal(outcome.blockedVerdicts, 0);
    assert.match(outcome.reason, /round limit/i);
    assert.match(outcome.summary, /Remaining slices: Slice 21: Slice 21/);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
  });

  it("runs fresh verification after unchanged simplify without making an empty commit", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { simplifyChange: "unchanged" });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "verified");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify", "verify", "execute", "simplify", "verify"]);
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

  it("blocks successful execute outcomes without a committed selected unit", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const baseline = git(fixture.root, ["rev-parse", "HEAD"]);
    const stages = stageRunner(fixture.root, fixture.planPath, { executeOutcome: "no-commit" });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute"]);
    assert.equal(git(fixture.root, ["rev-parse", "HEAD"]), baseline);
  });

  it("does not verify after simplify blocks a required push or fails before its commit", async () => {
    for (const options of [{ simplifyOutcome: "blocked" as const }, { failAt: "simplify" as const }]) {
      const fixture = createRepo();
      const depsState = baseDeps(fixture);
      const stages = stageRunner(fixture.root, fixture.planPath, options);
      depsState.deps.runStage = stages.runner;
      const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

      assert.ok(["blocked", "process-failure"].includes(outcome.status));
      assert.deepEqual(stages.calls.map((call) => call.stage), ["execute", "simplify"]);
      assert.match(git(fixture.root, ["log", "--format=%s", "-1"]), /implement selected slice/);
      assert.equal(outcome.verificationAttempts, 0);
    }
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

  it("blocks a verification mutation made after its outcome was submitted", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { mutateVerifyAfterOutcome: true });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assertOutcomeStatus(outcome, "blocked");
    assert.equal(existsSync(join(fixture.root, "verify-post-result-mutation.txt")), true);
    assert.equal(readFileSync(join(fixture.root, "src", "execute.txt"), "utf8"), "forbidden tracked mutation\n");
    assert.equal(outcome.verificationAttempts, 1);
    assert.equal(outcome.blockedVerdicts, 1);
  });

  it("retains worktree ownership when child termination is unconfirmed", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath, { failAt: "execute", terminationUnconfirmed: true });
    depsState.deps.runStage = stages.runner;
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, undefined);

    assert.equal(outcome.status, "process-failure");
    if (outcome.status !== "process-failure") return;
    assert.equal(outcome.ownershipRetained, true);
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute"]);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), true);
    assert.throws(
      () => depsState.store.acquireWorktree(fixture.root, "second-run", "next-session"),
      /already owned/,
    );
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

  it("cancels before preflight without acquiring a lock or selecting models", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    depsState.deps.runStage = stages.runner;
    const controller = new AbortController();
    controller.abort();
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, controller.signal);

    assertOutcomeStatus(outcome, "cancelled");
    assert.deepEqual(depsState.modelSelection.calls, []);
    assert.equal(stages.calls.length, 0);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
  });

  it("cancels between settled stages without dispatching simplify", async () => {
    const fixture = createRepo();
    const depsState = baseDeps(fixture);
    const stages = stageRunner(fixture.root, fixture.planPath);
    const controller = new AbortController();
    depsState.deps.runStage = async (request, signal, callbacks) => {
      const result = await stages.runner(request, signal, callbacks);
      if (request.stage === "execute") controller.abort();
      return result;
    };
    const outcome = await runImplement(fixture.planPath, fixture.root, depsState.deps, controller.signal);

    assertOutcomeStatus(outcome, "cancelled");
    assert.deepEqual(stages.calls.map((call) => call.stage), ["execute"]);
    assert.equal(existsSync(depsState.store.worktreeLockPath(fixture.root)), false);
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
