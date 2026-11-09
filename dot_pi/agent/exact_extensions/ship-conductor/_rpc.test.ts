import { strict as assert } from "node:assert";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { buildRpcStageArgs, preflightRpcStage, promptRpcStage, startRpcSession, type RpcSession } from "./_spawn.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = join(TEST_DIR, "_bridge.ts");
const DRIVER_PATH = join(TEST_DIR, "_fixtures", "rpc-driver.ts");
const RPC_TIMEOUT_MS = 20_000;

type RpcRecord = Record<string, any>;

type Fixture = {
  root: string;
  worktree: string;
  agentDir: string;
  configPath: string;
  baselineCommit: string;
};

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function createFixture(stage: "execute" | "simplify" | "verify" = "execute"): Fixture {
  const root = mkdtempSync(join(tmpdir(), "pi-lifecycle-rpc-"));
  chmodSync(root, 0o700);
  const worktree = join(root, "repo");
  const agentDir = join(root, "agent");
  const planPath = join(worktree, "plans", "fixture", "plan.md");
  const designPath = join(worktree, "plans", "fixture", "design.md");
  const configPath = join(root, "stage.json");

  try {
    mkdirSync(join(worktree, "plans", "fixture"), { recursive: true });
    mkdirSync(agentDir, { recursive: true, mode: 0o700 });
    writeFileSync(planPath, "# Fixture plan\n\n- [ ] Run the deterministic RPC test.\n");
    writeFileSync(designPath, "# Fixture design\n\nNo candidate files need to change.\n");
    run("git", ["init", "--quiet", "--initial-branch=fixture"], worktree);
    run("git", ["config", "user.name", "Pi lifecycle test"], worktree);
    run("git", ["config", "user.email", "pi-lifecycle-test@example.invalid"], worktree);
    run("git", ["config", "commit.gpgsign", "false"], worktree);
    run("git", ["add", "plans/fixture/plan.md", "plans/fixture/design.md"], worktree);
    run("git", ["commit", "--quiet", "-m", "fixture baseline"], worktree);

    const baselineCommit = run("git", ["rev-parse", "HEAD"], worktree);
    const planBlob = run("git", ["rev-parse", "HEAD:plans/fixture/plan.md"], worktree);
    const designBlob = run("git", ["rev-parse", "HEAD:plans/fixture/design.md"], worktree);
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          protocolVersion: 1,
          runId: "run-test-123",
          stage,
          worktree,
          planPath,
          baseline: {
            commit: baselineCommit,
            plan: { path: planPath, blob: planBlob },
            design: { path: designPath, blob: designBlob },
          },
          unit: { heading: "Fixture task", taskNumbers: [1] },
          model: { provider: "lifecycle-test", id: "driver" },
          thinkingLevel: "minimal",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    chmodSync(configPath, 0o600);
    return { root, worktree, agentDir, configPath, baselineCommit };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

class RpcProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly records: RpcRecord[] = [];
  readonly session: RpcSession;
  private readonly pendingRecords: RpcRecord[] = [];
  private readonly emitter = new EventEmitter();
  private stderr = "";
  private closed = false;
  private closeCode: number | null = null;
  private closeSignal: NodeJS.Signals | null = null;
  private spawnError: Error | undefined;

  constructor(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    let child: ChildProcessWithoutNullStreams | undefined;
    this.session = startRpcSession(
      (command, commandArgs, options) => {
        child = spawn(command, commandArgs, { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
        return child;
      },
      { command: "pi", args },
      cwd,
      env,
    );
    if (!child) throw new Error("Pi RPC child was not spawned");
    this.child = child;
    this.session.onRecord((record) => {
      this.records.push(record);
      if (record.type !== "response") this.pendingRecords.push(record);
      this.emitter.emit("change");
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString("utf8")).slice(-16 * 1024);
    });
    this.child.on("error", (error) => {
      this.spawnError = error;
      this.emitter.emit("change");
    });
    this.child.on("close", (code, signal) => {
      this.closed = true;
      this.closeCode = code;
      this.closeSignal = signal;
      this.emitter.emit("change");
    });
  }

  private takeRecord(predicate: (record: RpcRecord) => boolean): RpcRecord | undefined {
    const index = this.pendingRecords.findIndex(predicate);
    if (index === -1) return undefined;
    return this.pendingRecords.splice(index, 1)[0];
  }

  waitFor(predicate: (record: RpcRecord) => boolean, description: string, timeoutMs = RPC_TIMEOUT_MS): Promise<RpcRecord> {
    const immediate = this.takeRecord(predicate);
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve, reject) => {
      const finish = (error?: Error, record?: RpcRecord) => {
        clearTimeout(timer);
        this.emitter.off("change", check);
        if (error) reject(error);
        else resolve(record!);
      };
      const check = () => {
        const record = this.takeRecord(predicate);
        if (record) {
          finish(undefined, record);
        } else if (this.closed || this.spawnError) {
          finish(
            new Error(
              `${description}: pi exited (${this.closeCode ?? "unknown"}, ${this.closeSignal ?? "no signal"})` +
                `${this.spawnError ? `; spawn error: ${this.spawnError.message}` : ""}` +
                `${this.stderr ? `; stderr: ${this.stderr}` : ""}`,
            ),
          );
        }
      };
      const timer = setTimeout(() => {
        finish(new Error(`${description}: timed out after ${timeoutMs}ms${this.stderr ? `; stderr: ${this.stderr}` : ""}`));
      }, timeoutMs);
      this.emitter.on("change", check);
      check();
    });
  }

  async send(record: RpcRecord): Promise<void> {
    await this.session.send(record);
  }

  async request(type: string, fields: RpcRecord = {}): Promise<RpcRecord> {
    return this.session.request(type, fields);
  }

  async close(): Promise<void> {
    await this.session.close();
    assert.ok(this.closed, "Pi child close was not confirmed");
  }
}

function startRpc(
  fixture: Fixture,
  outcomeMode: "success" | "error" | "missing" | "expansion",
  promptTemplatePath?: string,
): RpcProcess {
  const version = execFileSync("pi", ["--version"], { encoding: "utf8" }).trim();
  assert.equal(version, "1.5.0", `RPC contract test requires Pi 1.5.0, got ${version}`);
  const args = [
    "--no-extensions",
    "--no-prompt-templates",
    ...buildRpcStageArgs("lifecycle-test", "driver", "minimal", BRIDGE_PATH),
    "-e",
    DRIVER_PATH,
  ];
  if (promptTemplatePath) args.push("--prompt-template", promptTemplatePath);
  return new RpcProcess(args, fixture.worktree, {
    ...process.env,
    PI_CODING_AGENT_DIR: fixture.agentDir,
    PI_OFFLINE: "1",
    PI_LIFECYCLE_CHILD_CONFIG: fixture.configPath,
    PI_LIFECYCLE_TEST_OUTCOME: outcomeMode,
  });
}

function messageText(record: RpcRecord): string {
  return (record.message?.content ?? [])
    .filter((part: RpcRecord) => part.type === "text")
    .map((part: RpcRecord) => part.text ?? "")
    .join("");
}

async function runFixture(outcomeMode: "success" | "error" | "missing") {
  const fixture = createFixture();
  const rpc = startRpc(fixture, outcomeMode);
  try {
    const stateResponse = await rpc.request("get_state");
    const state = stateResponse.data;
    assert.equal(state.model.provider, "lifecycle-test");
    assert.equal(state.model.id, "driver");
    assert.equal(state.thinkingLevel, "minimal");
    assert.equal(typeof state.sessionId, "string");
    await rpc.request("get_commands");

    const prompt = await rpc.request("prompt", { message: "Run the deterministic lifecycle bridge fixture." });
    assert.equal(prompt.data.disposition, "started");

    const uiRequest = await rpc.waitFor(
      (record) => record.type === "extension_ui_request",
      "lifecycle approval request",
    );
    assert.equal(uiRequest.method, "select");
    assert.match(uiRequest.title, /May I proceed\?/);
    assert.match(uiRequest.title, /fixture reached its approval gate/i);
    assert.match(uiRequest.title, /continue the deterministic test/i);
    assert.match(uiRequest.title, /does not modify candidate files/i);
    assert.deepEqual(uiRequest.options, ["Approve", "Reject"]);
    await rpc.send({ type: "extension_ui_response", id: uiRequest.id, value: "Approve" });

    const decisionResult = await rpc.waitFor(
      (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_request_decision",
      "lifecycle decision tool result",
    );
    assert.equal(decisionResult.isError, false);
    assert.equal(decisionResult.result.details.decision, "approved");
    assert.equal(decisionResult.result.details.runId, "run-test-123");
    assert.equal(decisionResult.result.details.stage, "execute");
    assert.equal(decisionResult.result.details.sessionId, state.sessionId);

    let outcomeResult: RpcRecord | undefined;
    if (outcomeMode !== "missing") {
      outcomeResult = await rpc.waitFor(
        (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome",
        "lifecycle outcome tool result",
      );
      assert.equal(outcomeResult.isError, outcomeMode === "error");
      if (outcomeMode === "success") {
        const details = outcomeResult.result.details;
        assert.equal(details.schemaVersion, 1);
        assert.equal(details.runId, "run-test-123");
        assert.equal(details.stage, "execute");
        assert.equal(details.sessionId, state.sessionId);
        assert.deepEqual(details.model, { provider: "lifecycle-test", id: "driver" });
        assert.equal(details.outcome, "success");
        assert.equal(details.change, "unchanged");
        assert.equal(details.candidate.head, fixture.baselineCommit);
        assert.equal(typeof details.reportRef, "string");
      } else {
        assert.equal(outcomeResult.result.details, undefined);
      }
    }

    const settled = await rpc.waitFor((record) => record.type === "agent_settled", "agent_settled event");
    assert.equal(settled.aborted, false);
    const agentEndRecords = rpc.records.filter((record) => record.type === "agent_end");
    assert.ok(agentEndRecords.length > 0, "expected a low-level agent_end event");
    const settledIndex = rpc.records.indexOf(settled);
    assert.ok(agentEndRecords.some((record) => rpc.records.indexOf(record) < settledIndex));

    const finalMessage = rpc.records.find(
      (record) => record.type === "message_end" && record.message?.role === "assistant" && messageText(record).startsWith("fixture "),
    );
    assert.ok(finalMessage, "expected the fixture provider's terminal assistant response");
    assert.match(
      messageText(finalMessage!),
      outcomeMode === "success"
        ? /observed a successful outcome/
        : outcomeMode === "error"
          ? /observed an outcome tool error/
          : /without a structured outcome/,
    );
    return { fixture, rpc, outcomeResult, settled };
  } catch (error) {
    await rpc.close();
    rmSync(fixture.root, { recursive: true, force: true });
    throw error;
  }
}

type ExpansionCase = {
  stage: "execute" | "simplify" | "verify";
  input: string;
  arguments: string;
};

const EXPANSION_CASES: ExpansionCase[] = [
  {
    stage: "execute",
    input: "/execute --task 'Preserve  two spaces, \"quotes\", --literal-flag, and $ARGUMENTS.'",
    arguments: '--task Preserve  two spaces, "quotes", --literal-flag, and $ARGUMENTS.',
  },
  {
    stage: "simplify",
    input: "/simplify --implemented-by exec-123 --task 'Review  this text with \"quotes\", --literal-flag, and $ARGUMENTS.'",
    arguments: '--implemented-by exec-123 --task Review  this text with "quotes", --literal-flag, and $ARGUMENTS.',
  },
  {
    stage: "verify",
    input: "/verify --implemented-by exec-123 --simplified-by simp-456 --task 'Check  exact behavior, \"quoted\", --literal-flag, and $ARGUMENTS.'",
    arguments: '--implemented-by exec-123 --simplified-by simp-456 --task Check  exact behavior, "quoted", --literal-flag, and $ARGUMENTS.',
  },
];

async function runPromptExpansionFixture() {
  const fixture = createFixture();
  const promptDir = join(fixture.root, "prompt-templates");
  mkdirSync(promptDir, { recursive: true, mode: 0o700 });
  const promptPaths = new Map<string, string>();
  for (const stage of ["execute", "simplify", "verify"] as const) {
    const promptPath = join(promptDir, `${stage}.md`);
    writeFileSync(promptPath, `---\ndescription: Fixture ${stage}\n---\nstage=${stage}\narguments=<$ARGUMENTS>\n`);
    promptPaths.set(stage, promptPath);
  }

  const rpc = startRpc(fixture, "expansion", promptDir);
  try {
    for (const stage of ["execute", "simplify", "verify"] as const) {
      const state = await preflightRpcStage(rpc.session, {
        commandName: stage,
        promptPath: promptPaths.get(stage)!,
        model: { provider: "lifecycle-test", id: "driver" },
        thinkingLevel: "minimal",
      });
      assert.equal(typeof state.sessionId, "string");
    }

    for (const expansion of EXPANSION_CASES) {
      const prompt = await promptRpcStage(rpc.session, expansion.input);
      assert.equal((prompt.data as RpcRecord).disposition, "started");
      const terminal = await rpc.waitFor(
        (record) => record.type === "message_end" && record.message?.role === "assistant" && messageText(record).startsWith("fixture-expanded:"),
        `expanded /${expansion.stage} prompt result`,
      );
      const observed = JSON.parse(messageText(terminal).slice("fixture-expanded:".length));
      assert.equal(observed, `stage=${expansion.stage}\narguments=<${expansion.arguments}>`);
      await rpc.waitFor((record) => record.type === "agent_settled", `/${expansion.stage} agent_settled`);
    }

    return { fixture, rpc };
  } catch (error) {
    await rpc.close();
    rmSync(fixture.root, { recursive: true, force: true });
    throw error;
  }
}

type CandidateExpansionCase = {
  stage: "execute" | "simplify" | "verify";
  input: string;
  arguments: string;
};

// Pi switches quote delimiters but does not process backslash escapes inside them.
function quoteNativeArgument(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function expandTemplateForAssertion(template: string, argumentText: string): string {
  const end = template.indexOf("\n---\n", 4);
  assert.notEqual(end, -1, "lifecycle template must have closed frontmatter");
  return template.slice(end + 5).replaceAll("$ARGUMENTS", argumentText).trim();
}

async function runCandidateTemplateExpansion(): Promise<void> {
  const promptDir = join(dirname(dirname(TEST_DIR)), "exact_prompts");
  const planPath = "/tmp/plans/fixture/plan with spaces.md";
  const task = `Preserve  whitespace, "double quotes", 'single quotes', --literal-flag --implemented-by nested, and $ARGUMENTS.`;
  const quotedTask = quoteNativeArgument(task);
  const cases: CandidateExpansionCase[] = [
    { stage: "execute", input: `/execute '${planPath}'`, arguments: planPath },
    { stage: "execute", input: `/execute --task ${quotedTask}`, arguments: `--task ${task}` },
    {
      stage: "simplify",
      input: `/simplify '${planPath}' --implemented-by fixture/executor --base origin/main`,
      arguments: `${planPath} --implemented-by fixture/executor --base origin/main`,
    },
    {
      stage: "simplify",
      input: `/simplify --implemented-by fixture/executor --task ${quotedTask}`,
      arguments: `--implemented-by fixture/executor --task ${task}`,
    },
    {
      stage: "verify",
      input: `/verify '${planPath}' --implemented-by fixture/executor --simplified-by fixture/simplifier`,
      arguments: `${planPath} --implemented-by fixture/executor --simplified-by fixture/simplifier`,
    },
    {
      stage: "verify",
      input: `/verify --implemented-by fixture/executor --simplified-by fixture/simplifier --task ${quotedTask}`,
      arguments: `--implemented-by fixture/executor --simplified-by fixture/simplifier --task ${task}`,
    },
  ];

  for (const stage of ["execute", "simplify", "verify"] as const) {
    const fixture = createFixture(stage);
    const rpc = startRpc(fixture, "expansion", promptDir);
    try {
      const promptPath = join(promptDir, `${stage}.md`);
      await preflightRpcStage(rpc.session, {
        commandName: stage,
        promptPath,
        model: { provider: "lifecycle-test", id: "driver" },
        thinkingLevel: "minimal",
      });
      const template = readFileSync(promptPath, "utf8");

      for (const expansion of cases.filter((candidate) => candidate.stage === stage)) {
        await promptRpcStage(rpc.session, expansion.input);
        const terminal = await rpc.waitFor(
          (record) => record.type === "message_end" && record.message?.role === "assistant" && messageText(record).startsWith("fixture-expanded:"),
          `native /${stage} expansion result`,
        );
        const observed = JSON.parse(messageText(terminal).slice("fixture-expanded:".length));
        assert.equal(
          observed,
          expandTemplateForAssertion(template, expansion.arguments),
          `native /${stage} expansion changed handoff input`,
        );
        await rpc.waitFor((record) => record.type === "agent_settled", `native /${stage} agent_settled`);
      }
    } finally {
      await rpc.close();
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
}

describe("Pi 1.5.0 lifecycle bridge RPC contract", () => {
  it("expands the candidate lifecycle templates with exact handoff and task arguments", { timeout: 60_000 }, async () => {
    await runCandidateTemplateExpansion();
  });

  it("expands temporary fixture templates with exact arguments", { timeout: 60_000 }, async () => {
    const run = await runPromptExpansionFixture();
    try {
      assert.ok(run.rpc.records.some((record) => record.type === "agent_settled"));
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("round-trips a coordinator approval and emits a structured settled outcome", { timeout: 60_000 }, async () => {
    const run = await runFixture("success");
    try {
      assert.equal(run.outcomeResult?.isError, false);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("does not treat an actual outcome tool error as a submitted result", { timeout: 60_000 }, async () => {
    const run = await runFixture("error");
    try {
      assert.equal(run.outcomeResult?.isError, true);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps a settled run without a structured outcome distinct from success", { timeout: 60_000 }, async () => {
    const run = await runFixture("missing");
    try {
      assert.equal(run.outcomeResult, undefined);
      assert.equal(run.settled.aborted, false);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });
});
