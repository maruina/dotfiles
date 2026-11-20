import { strict as assert } from "node:assert";
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import lifecycleBridge from "./_bridge.ts";
import { runCompletionPhase } from "./_completion.ts";
import { captureCleanCandidate, createGitRunner } from "./_worktree.ts";
import { PROTOCOL_VERSION } from "./_protocol.ts";
import {
  buildRpcStageArgs,
  preflightRpcStage,
  promptRpcStage,
  runRpcLifecycleStage,
  startRpcSession,
  type RpcSession,
  type RpcSpawner,
  type RpcStageUI,
} from "./_spawn.ts";

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

function createFixture(stage: "execute" | "simplify" | "verify" | "arp-review" | "arp-fix" = "execute"): Fixture {
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
    const completionStage = stage === "arp-review" || stage === "arp-fix";
    writeFileSync(
      configPath,
      JSON.stringify(
        completionStage
          ? {
              protocolVersion: PROTOCOL_VERSION,
              scope: "completion",
              runId: "run-test-123",
              stage,
              worktree,
              branch: "fixture",
              planPath,
              baseline: {
                commit: baselineCommit,
                plan: { path: planPath, blob: planBlob },
                design: { path: designPath, blob: designBlob },
              },
              models: {
                execute: { provider: "lifecycle-test", id: "driver" },
                simplify: { provider: "lifecycle-test", id: "simplifier" },
                verify: { provider: "lifecycle-test", id: "verifier" },
              },
              stageModel: { provider: "lifecycle-test", id: "driver" },
              thinkingLevel: "minimal",
              completion: {
                policy: "work",
                candidate: { branch: "fixture", head: baselineCommit, stateDigest: "d".repeat(64) },
                ...(stage === "arp-review"
                  ? {
                      reviewRequest: {
                        prUrl: "https://github.com/DataDog/repo/pull/123",
                        expectedHeadSha: baselineCommit,
                        deadlineAt: "2099-01-01T00:20:00.000Z",
                        maxStatusChecks: 30,
                        pollIntervalsSeconds: [10, 30, 60],
                        silent: true,
                      },
                    }
                  : stage === "arp-fix"
                    ? {
                        fixRequest: {
                          prUrl: "https://github.com/DataDog/repo/pull/123",
                          reviewedHeadSha: baselineCommit,
                          findings: [
                            {
                              findingId: "finding-alpha",
                              filePath: "src/main.ts",
                              startLine: 10,
                              endLine: 12,
                              reviewedSha: baselineCommit,
                              summary: "Fixture finding alpha",
                            },
                            {
                              findingId: "finding-beta",
                              filePath: "src/other.ts",
                              startLine: 20,
                              endLine: 21,
                              reviewedSha: baselineCommit,
                              summary: "Fixture finding beta",
                            },
                          ],
                        },
                      }
                    : {}),
              },
            }
          : {
              protocolVersion: PROTOCOL_VERSION,
              scope: "execution",
              runId: "run-test-123",
              stage,
              worktree,
              branch: "fixture",
              planPath,
              baseline: {
                commit: baselineCommit,
                plan: { path: planPath, blob: planBlob },
                design: { path: designPath, blob: designBlob },
              },
              unitBase: baselineCommit,
              unit: { heading: "Fixture task", taskNumbers: [1] },
              models: {
                execute: { provider: "lifecycle-test", id: stage === "execute" ? "driver" : "executor" },
                simplify: { provider: "lifecycle-test", id: stage === "simplify" ? "driver" : "simplifier" },
                verify: { provider: "lifecycle-test", id: stage === "verify" ? "driver" : "verifier" },
              },
              stageModel: { provider: "lifecycle-test", id: "driver" },
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

function rewriteStageConfig(path: string, mutator: (config: Record<string, unknown>) => Record<string, unknown>): void {
  const current = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const updated = mutator(current);
  writeFileSync(path, JSON.stringify(updated, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
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

function assertPi16x(): void {
  const version = execFileSync("pi", ["--version"], { encoding: "utf8" }).trim();
  assert.match(version, /^1\.6\./, `RPC contract test requires Pi 1.6.x, got ${version}`);
}

function startRpc(
  fixture: Fixture,
  outcomeMode:
    | "success"
    | "error"
    | "missing"
    | "dirty"
    | "blocked-correction"
    | "expansion"
    | "arp-success"
    | "arp-stale-head"
    | "arp-request-error"
    | "arp-discovery-missing"
    | "arp-fix-success"
    | "arp-fix-ambiguous"
    | "arp-fix-invalid-settlement"
    | "auto-partial-resolution",
  promptTemplatePath?: string,
  childConfigPath: string | false = fixture.configPath,
  extraEnv: NodeJS.ProcessEnv = {},
): RpcProcess {
  assertPi16x();
  const args = [
    "--no-extensions",
    "--no-prompt-templates",
    ...buildRpcStageArgs("lifecycle-test", "driver", "minimal", BRIDGE_PATH),
    "-e",
    DRIVER_PATH,
  ];
  if (promptTemplatePath) args.push("--prompt-template", promptTemplatePath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PI_CODING_AGENT_DIR: fixture.agentDir,
    PI_OFFLINE: "1",
    PI_LIFECYCLE_TEST_OUTCOME: outcomeMode,
    ...extraEnv,
  };
  if (childConfigPath !== false) env.PI_LIFECYCLE_CHILD_CONFIG = childConfigPath;
  return new RpcProcess(args, fixture.worktree, env);
}

function messageText(record: RpcRecord): string {
  return (record.message?.content ?? [])
    .filter((part: RpcRecord) => part.type === "text")
    .map((part: RpcRecord) => part.text ?? "")
    .join("");
}

async function runFixture(outcomeMode: "success" | "error" | "missing" | "dirty" | "blocked-correction") {
  const fixture = createFixture();
  if (outcomeMode === "dirty") writeFileSync(join(fixture.worktree, "uncommitted.txt"), "left behind by the stage\n");
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
    const decisionText = decisionResult.result.content.map((part: { text?: string }) => part.text ?? "").join("\n");
    assert.match(decisionText, /The user selected "Approve"/);
    assert.match(decisionText, /Question: May I proceed\?/);
    assert.match(decisionText, /Approved proposal: Continue the deterministic test\./);
    assert.equal(decisionResult.result.details.runId, "run-test-123");
    assert.equal(decisionResult.result.details.stage, "execute");
    assert.equal(decisionResult.result.details.sessionId, state.sessionId);

    let outcomeResult: RpcRecord | undefined;
    if (outcomeMode !== "missing") {
      outcomeResult = await rpc.waitFor(
        (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome",
        "lifecycle outcome tool result",
      );
      assert.equal(outcomeResult.isError, outcomeMode === "error" || outcomeMode === "dirty" || outcomeMode === "blocked-correction");
      if (outcomeMode === "dirty") {
        const text = outcomeResult.result.content.map((part: { text?: string }) => part.text ?? "").join("\n");
        assert.match(text, /uncommitted changes/);
        assert.match(text, /\?\? uncommitted\.txt/);
      }
      if (outcomeMode === "success") {
        const details = outcomeResult.result.details;
        assert.equal(details.schemaVersion, PROTOCOL_VERSION);
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
      outcomeMode === "success" || outcomeMode === "blocked-correction"
        ? /observed a successful outcome/
        : outcomeMode === "error" || outcomeMode === "dirty"
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

async function runArpReviewFixture(
  mode: "arp-success" | "arp-stale-head" | "arp-request-error" | "arp-discovery-missing" | "auto-partial-resolution",
  options: {
    pendingSettlements?: Array<{ findingId: string; fixCommitSha: string; fixChangeSummary: string; reason: string }>;
    expectedHeadSha?: string;
  } = {},
) {
  const fixture = createFixture("arp-review");
  const expectedHeadSha = options.expectedHeadSha ?? fixture.baselineCommit;
  if (options.pendingSettlements && options.pendingSettlements.length > 0) {
    rewriteStageConfig(fixture.configPath, (config) => {
      const completion = { ...((config.completion as Record<string, unknown> | undefined) ?? {}) };
      completion.pendingSettlements = options.pendingSettlements;
      return { ...config, completion };
    });
  }
  const rpc = startRpc(
    fixture,
    mode,
    undefined,
    fixture.configPath,
    {
      PI_LIFECYCLE_TEST_STAGE: "arp-review",
      PI_LIFECYCLE_TEST_EXPECTED_HEAD: expectedHeadSha,
    },
  );
  try {
    const stateResponse = await rpc.request("get_state");
    const state = stateResponse.data;
    assert.equal(state.model.provider, "lifecycle-test");
    assert.equal(state.model.id, "driver");

    const prompt = await rpc.request("prompt", { message: "Run the deterministic arp-review fixture." });
    assert.equal(prompt.data.disposition, "started");

    const discovery = await rpc.waitFor(
      (record) => record.type === "tool_execution_end" && record.toolName === "fixture_discover_agentic_review_tools",
      "fixture_discover_agentic_review_tools result",
    );
    assert.equal(discovery.isError, false);
    const discoveredTools = (discovery.result.details?.tools as Array<{ name?: string }> | undefined) ?? [];
    const discoveredToolNames = discoveredTools.map((tool) => tool.name);
    assert.ok(discoveredToolNames.includes("agentic_review_get_status"));
    assert.ok(discoveredToolNames.includes("agentic_review_get_findings"));
    if (mode === "arp-discovery-missing") {
      assert.equal(discoveredToolNames.includes("agentic_review_request_review"), false);
      assert.equal(discoveredToolNames.includes("agentic_review_resolve_finding"), false);
    } else {
      assert.ok(discoveredToolNames.includes("agentic_review_request_review"));
      assert.ok(discoveredToolNames.includes("agentic_review_resolve_finding"));
    }

    const status = mode === "arp-discovery-missing"
      ? undefined
      : await rpc.waitFor(
          (record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_get_status",
          "agentic_review_get_status result",
        );
    if (status) assert.equal(status.isError, false);

    let request: RpcRecord | undefined;
    if (mode === "arp-success" || mode === "arp-request-error") {
      request = await rpc.waitFor(
        (record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_request_review",
        "agentic_review_request_review result",
      );
      if (mode === "arp-success") {
        assert.equal(request.isError, false);
        assert.equal(request.result.details.action, "review_anyway");
        assert.equal(request.result.details.expected_head_sha, expectedHeadSha);
        assert.equal(request.result.details.silent, true);
      } else {
        assert.equal(request.isError, true);
      }
    }

    const outcome = await rpc.waitFor(
      (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome",
      "lifecycle_submit_outcome result",
    );
    assert.equal(outcome.isError, false);
    assert.equal(outcome.result.details.stage, "arp-review");
    assert.equal(outcome.result.details.change, "not-applicable");
    assert.equal(outcome.result.details.reviewEvidence.targetHeadSha, expectedHeadSha);
    if (mode === "arp-success") {
      assert.equal(outcome.result.details.outcome, "success");
      assert.equal(outcome.result.details.reviewEvidence.reviewedHeadSha, expectedHeadSha);
      assert.equal(outcome.result.details.reviewEvidence.captureState, "complete");
      assert.equal(outcome.result.details.reviewEvidence.result, "clean");
      assert.equal(outcome.result.details.reviewEvidence.silent, true);
    } else if (mode === "arp-stale-head") {
      assert.equal(outcome.result.details.outcome, "blocked");
      assert.notEqual(outcome.result.details.reviewEvidence.reviewedHeadSha, expectedHeadSha);
      assert.equal(outcome.result.details.reviewEvidence.result, "stale");
    } else if (mode === "auto-partial-resolution") {
      assert.equal(outcome.result.details.outcome, "blocked");
      assert.equal(outcome.result.details.reviewEvidence.result, "error");
    } else {
      assert.equal(outcome.result.details.outcome, "blocked");
      assert.equal(outcome.result.details.reviewEvidence.result, "error");
    }

    const settled = await rpc.waitFor((record) => record.type === "agent_settled", "agent_settled event");
    assert.equal(settled.aborted, false);
    return { fixture, rpc, outcome, request };
  } catch (error) {
    await rpc.close();
    rmSync(fixture.root, { recursive: true, force: true });
    throw error;
  }
}

async function runArpFixFixture(mode: "arp-fix-success" | "arp-fix-ambiguous" | "arp-fix-invalid-settlement") {
  const fixture = createFixture("arp-fix");
  const rpc = startRpc(
    fixture,
    mode,
    undefined,
    fixture.configPath,
    {
      PI_LIFECYCLE_TEST_STAGE: "arp-fix",
      PI_LIFECYCLE_TEST_EXPECTED_HEAD: fixture.baselineCommit,
    },
  );
  try {
    const stateResponse = await rpc.request("get_state");
    const state = stateResponse.data;
    assert.equal(state.model.provider, "lifecycle-test");
    assert.equal(state.model.id, "driver");

    const prompt = await rpc.request("prompt", { message: "Run the deterministic arp-fix fixture." });
    assert.equal(prompt.data.disposition, "started");

    const outcome = await rpc.waitFor(
      (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome",
      "lifecycle_submit_outcome result",
    );

    if (mode === "arp-fix-invalid-settlement") {
      assert.equal(outcome.isError, true);
      const text = outcome.result.content.map((part: { text?: string }) => part.text ?? "").join("\n");
      assert.match(text, /unrelated finding/i);
    } else {
      assert.equal(outcome.isError, false);
      assert.equal(outcome.result.details.stage, "arp-fix");
      assert.equal(outcome.result.details.change, "not-applicable");
      if (mode === "arp-fix-success") {
        assert.equal(outcome.result.details.outcome, "success");
        assert.deepEqual(outcome.result.details.commitRefs, [fixture.baselineCommit]);
        assert.deepEqual(
          (outcome.result.details.pendingSettlements ?? []).map((entry: { findingId: string }) => entry.findingId).sort(),
          ["finding-alpha", "finding-beta"],
        );
      } else {
        assert.equal(outcome.result.details.outcome, "blocked");
        assert.equal(outcome.result.details.pendingSettlements, undefined);
      }
    }

    const settled = await rpc.waitFor((record) => record.type === "agent_settled", "agent_settled event");
    assert.equal(settled.aborted, false);
    return { fixture, rpc, outcome };
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

// Pi opens quotes only at token start and escapes the active quote with a backslash.
function quoteNativeArgument(value: string): string {
  return `'${value.replaceAll("'", "\\'")}'`;
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

describe("Pi 1.6.0 lifecycle bridge RPC contract", () => {
  it("leaves ordinary RPC sessions unchanged when the child marker is absent", { timeout: 60_000 }, async () => {
    const fixture = createFixture();
    const rpc = startRpc(fixture, "success", undefined, false);
    try {
      const state = await rpc.request("get_state");
      assert.equal(state.data.model.provider, "lifecycle-test");
      assert.equal(state.data.messageCount, 0);
      assert.equal(rpc.records.some((record) => record.type === "extension_error"), false);
    } finally {
      await rpc.close();
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not register child tools or hooks in an ordinary interactive extension context", () => {
    const previousConfig = process.env.PI_LIFECYCLE_CHILD_CONFIG;
    delete process.env.PI_LIFECYCLE_CHILD_CONFIG;
    const registrations = { events: [] as string[], tools: [] as string[], commands: [] as string[] };
    const pi = {
      on: (event: string) => {
        registrations.events.push(event);
        return () => undefined;
      },
      registerTool: (tool: { name: string }) => registrations.tools.push(tool.name),
      registerCommand: (name: string) => registrations.commands.push(name),
    } as unknown as ExtensionAPI;
    try {
      lifecycleBridge(pi);
      assert.deepEqual(registrations, { events: [], tools: [], commands: [] });
    } finally {
      if (previousConfig === undefined) delete process.env.PI_LIFECYCLE_CHILD_CONFIG;
      else process.env.PI_LIFECYCLE_CHILD_CONFIG = previousConfig;
    }
  });

  const invalidConfigs: Array<{ name: string; reason: RegExp; write(fixture: ReturnType<typeof createFixture>): void }> = [
    {
      name: "malformed JSON",
      reason: /extension|config|invalid|json/i,
      write: (fixture) => writeFileSync(fixture.configPath, "{ invalid json\n", { mode: 0o600 }),
    },
    {
      name: "a unit base outside the pinned history",
      reason: /unit base commit is not between/i,
      write: (fixture) => {
        const config = JSON.parse(readFileSync(fixture.configPath, "utf8")) as Record<string, unknown>;
        writeFileSync(fixture.configPath, JSON.stringify({ ...config, unitBase: "f".repeat(40) }), { mode: 0o600 });
      },
    },
  ];
  for (const invalid of invalidConfigs) it(`fails a child configuration with ${invalid.name} before starting the stage prompt`, { timeout: 60_000 }, async () => {
    assertPi16x();
    const fixture = createFixture();
    invalid.write(fixture);
    const promptPath = join(fixture.root, "execute.md");
    writeFileSync(promptPath, "---\ndescription: Execute fixture\n---\nfixture prompt\n");
    const args = [
      "--no-extensions",
      "--no-prompt-templates",
      ...buildRpcStageArgs("lifecycle-test", "driver", "minimal", BRIDGE_PATH),
      "-e",
      DRIVER_PATH,
      "--prompt-template",
      promptPath,
    ];
    let child: ChildProcessWithoutNullStreams | undefined;
    const spawner: RpcSpawner = (command, childArgs, options) => {
      child = spawn(command, childArgs, { cwd: options.cwd, env: options.env, stdio: ["pipe", "pipe", "pipe"] });
      return child;
    };
    const env = {
      ...process.env,
      PI_CODING_AGENT_DIR: fixture.agentDir,
      PI_OFFLINE: "1",
      PI_LIFECYCLE_CHILD_CONFIG: fixture.configPath,
      PI_LIFECYCLE_TEST_OUTCOME: "success",
    };
    const ui: RpcStageUI = {
      select: async () => "Approve",
      confirm: async () => true,
      input: async () => "fixture",
      editor: async () => "fixture",
      notify: () => undefined,
      setStatus: () => undefined,
    };
    try {
      const result = await runRpcLifecycleStage(
        spawner,
        { command: "pi", args },
        fixture.worktree,
        env,
        {
          runId: "run-test-123",
          stage: "execute",
          commandName: "execute",
          promptPath,
          model: { provider: "lifecycle-test", id: "driver" },
          thinkingLevel: "minimal",
          bridgePath: BRIDGE_PATH,
          configPath: fixture.configPath,
          prompt: "/execute fixture plan",
        },
        ui,
      );
      assert.equal(result.status, "failure");
      if (result.status !== "failure") assert.fail("invalid stage configuration must be a protocol failure");
      assert.match(`${result.reason}\n${result.stderr}`, invalid.reason);
      assert.equal(result.promptStarted, false);
      assert.equal(result.terminationConfirmed, true);
      assert.ok(child);
      assert.notEqual(child!.exitCode, null);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await new Promise<void>((resolve) => child!.once("close", () => resolve()));
      }
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

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

  it("rejects a writer success while the worktree has uncommitted changes so the stage can correct it", { timeout: 60_000 }, async () => {
    const run = await runFixture("dirty");
    try {
      assert.equal(run.outcomeResult?.isError, true);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects an incomplete execute blocker and settles once after correction", { timeout: 60_000 }, async () => {
    const { rpc, fixture, settled } = await runFixture("blocked-correction");
    try {
      const submissions = rpc.records.filter((record) =>
        record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome");
      assert.deepEqual(submissions.map((record) => record.isError), [true, false]);
      assert.match(JSON.stringify(submissions[0]!.result.content), /blocker/i);
      const details = submissions[1]!.result.details;
      assert.equal(details.outcome, "blocked");
      assert.deepEqual(details.blocker, {
        step: "Read the prerequisite file",
        reason: "The prerequisite file is missing",
        evidence: "No fixture-prerequisite.txt in the worktree",
        nextAction: "Create fixture-prerequisite.txt",
      });
      assert.ok(rpc.records.indexOf(submissions[1]!) < rpc.records.indexOf(settled));
      assert.equal(rpc.records.filter((record) => record.type === "agent_settled").length, 1);
    } finally {
      await rpc.close();
      rmSync(fixture.root, { recursive: true, force: true });
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

  it("exercises deferred discovery and exact-head silent ARP requests through the real RPC loop", { timeout: 60_000 }, async () => {
    const run = await runArpReviewFixture("arp-success");
    try {
      const startedDiscovery = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "fixture_discover_agentic_review_tools",
      );
      assert.equal(startedDiscovery, true);
      const startedStatus = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_get_status",
      );
      assert.equal(startedStatus, true);
      const startedRequest = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review",
      );
      assert.equal(startedRequest, true);
      const startedFindings = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_get_findings",
      );
      assert.equal(startedFindings, true);
      assert.equal(run.outcome.result.details.outcome, "success");
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("blocks stale-head ARP status without issuing a silent review request", { timeout: 60_000 }, async () => {
    const run = await runArpReviewFixture("arp-stale-head");
    try {
      const startedRequest = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review",
      );
      assert.equal(startedRequest, false);
      assert.equal(run.outcome.result.details.outcome, "blocked");
      assert.equal(run.outcome.result.details.reviewEvidence.result, "stale");
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("blocks when discovery does not return required ARP tool identities", { timeout: 60_000 }, async () => {
    const run = await runArpReviewFixture("arp-discovery-missing");
    try {
      const startedRequest = run.rpc.records.some(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review",
      );
      assert.equal(startedRequest, false);
      assert.equal(run.outcome.result.details.outcome, "blocked");
      assert.equal(run.outcome.result.details.reviewEvidence.result, "error");
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("returns structured arp-fix success metadata through the real RPC loop", { timeout: 60_000 }, async () => {
    const run = await runArpFixFixture("arp-fix-success");
    try {
      assert.equal(run.outcome.result.details.outcome, "success");
      assert.deepEqual(
        (run.outcome.result.details.pendingSettlements ?? []).map((entry: { findingId: string }) => entry.findingId).sort(),
        ["finding-alpha", "finding-beta"],
      );
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("reports arp-fix ambiguity as blocked without pending settlements", { timeout: 60_000 }, async () => {
    const run = await runArpFixFixture("arp-fix-ambiguous");
    try {
      assert.equal(run.outcome.result.details.outcome, "blocked");
      assert.equal(run.outcome.result.details.pendingSettlements, undefined);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects invalid arp-fix settlement metadata through the real RPC loop", { timeout: 60_000 }, async () => {
    const run = await runArpFixFixture("arp-fix-invalid-settlement");
    try {
      assert.equal(run.outcome.isError, true);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("uses structured pending settlements to call addressed resolution with exact arguments", { timeout: 120_000 }, async () => {
    const pendingSettlement = {
      findingId: "51842",
      fixCommitSha: "b".repeat(40),
      fixChangeSummary: "Fixture applied deterministic fix for finding 51842",
      reason: "Fixture verified the fix locally.",
    };
    const run = await runArpReviewFixture("arp-success", { pendingSettlements: [pendingSettlement] });
    try {
      const findingsCallIndex = run.rpc.records.findIndex(
        (record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_get_findings",
      );
      const resolveCall = run.rpc.records.find(
        (record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_resolve_finding",
      );
      assert.ok(resolveCall, "expected addressed resolution call");
      assert.equal(resolveCall.isError, false);
      assert.deepEqual(resolveCall.result.details, {
        owner: "DataDog",
        repo: "repo",
        finding_id: 51842,
        resolution: "addressed",
        fix_commit_sha: pendingSettlement.fixCommitSha,
        fix_change_summary: pendingSettlement.fixChangeSummary,
        reason: pendingSettlement.reason,
      });

      const resolveCallIndex = run.rpc.records.indexOf(resolveCall);
      const requestCallIndex = run.rpc.records.findIndex(
        (record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review",
      );
      assert.ok(requestCallIndex > resolveCallIndex, "addressed settlement must complete before requesting re-review");
      const captureIndex = run.rpc.records.findIndex(
        (record, index) => index > requestCallIndex && record.type === "tool_execution_end" && record.toolName === "agentic_review_get_findings",
      );
      assert.ok(captureIndex > requestCallIndex, "re-review findings must be captured after the request");
      const outcomeCallIndex = run.rpc.records.findIndex(
        (record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome",
      );
      assert.ok(findingsCallIndex >= 0 && resolveCallIndex > findingsCallIndex, "resolution must follow PR-wide findings retrieval");
      assert.ok(outcomeCallIndex > captureIndex, "outcome must follow complete re-review capture");
      assert.equal(run.outcome.result.details.outcome, "success");
      assert.ok((run.outcome.result.details.settledFindingIds ?? []).includes("51842"));
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });

  it("runs fix, fresh verification, local push, settlement, and re-review through RPC children", { timeout: 120_000 }, async () => {
    const fixture = createFixture("arp-review");
    const remote = join(fixture.root, "remote.git");
    run("git", ["init", "--bare", "--quiet", remote], fixture.root);
    run("git", ["remote", "add", "origin", remote], fixture.worktree);
    const stages: Array<{ stage: string; records: RpcRecord[] }> = [];
    const driver = { provider: "lifecycle-test", id: "driver" };
    const reviewer = { provider: "lifecycle-test", id: "reviewer" };
    const plan = join(fixture.worktree, "plans/fixture/plan.md");
    const design = join(fixture.worktree, "plans/fixture/design.md");
    try {
      const result = await runCompletionPhase({
        policy: { kind: "work" }, runId: "run-test-123", worktree: fixture.worktree, branch: "fixture", planPath: plan,
        baselineCommit: fixture.baselineCommit, baselinePlanPath: plan,
        baselinePlanBlob: run("git", ["rev-parse", "HEAD:plans/fixture/plan.md"], fixture.worktree),
        baselineDesignPath: design, baselineDesignBlob: run("git", ["rev-parse", "HEAD:plans/fixture/design.md"], fixture.worktree),
        candidate: captureCleanCandidate(fixture.worktree, createGitRunner()),
        models: { execute: driver, simplify: driver, verify: reviewer }, writerModelIds: ["lifecycle-test/driver"],
        thinkingLevels: { execute: "minimal", verify: "minimal" },
        publish: async ({ candidate }) => {
          run("git", ["push", "origin", `${candidate.head}:refs/heads/${candidate.branch}`], fixture.worktree);
          const headSha = run("git", ["rev-parse", `refs/heads/${candidate.branch}`], remote);
          return { status: "published", prUrl: "https://github.com/DataDog/repo/pull/123", headSha };
        },
        dispatch: async ({ stage, config }) => {
          writeFileSync(fixture.configPath, JSON.stringify(config), { mode: 0o600 });
          const args = ["--no-extensions", "--no-prompt-templates", ...buildRpcStageArgs(config.stageModel.provider, config.stageModel.id, "minimal", BRIDGE_PATH), "-e", DRIVER_PATH];
          const rpc = new RpcProcess(args, fixture.worktree, { ...process.env, PI_CODING_AGENT_DIR: fixture.agentDir, PI_OFFLINE: "1", PI_LIFECYCLE_CHILD_CONFIG: fixture.configPath, PI_LIFECYCLE_TEST_STAGE: "auto" });
          try {
            await rpc.request("prompt", { message: "Run the deterministic completion fixture." });
            const submitted = await rpc.waitFor((record) => record.type === "tool_execution_end" && record.toolName === "lifecycle_submit_outcome", `${stage} outcome`);
            assert.equal(submitted.isError, false);
            await rpc.waitFor((record) => record.type === "agent_settled", `${stage} settled`);
            stages.push({ stage, records: [...rpc.records] });
            return { status: "settled", outcome: submitted.result.details };
          } finally {
            await rpc.close();
          }
        },
      });
      assert.equal(result.status, "verified");
      assert.deepEqual(stages.map((stage) => stage.stage), ["arp-review", "arp-fix", "verify", "arp-review"]);
      const calls = (index: number, name: string) => stages[index]!.records.filter((record) => record.type === "tool_execution_start" && record.toolName === name);
      assert.deepEqual(calls(0, "agentic_review_resolve_finding")[0]?.args, { owner: "DataDog", repo: "repo", finding_id: 84171, resolution: "invalid", reason: "False positive: fixture evidence does not reproduce on the expected head." });
      assert.equal(calls(1, "bash").length, 1);
      assert.equal(calls(2, "lifecycle_submit_outcome")[0]?.args.outcome, "VERIFIED");
      const review = stages[3]!.records;
      const resolutionIndex = review.findIndex((record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_resolve_finding");
      const requestIndex = review.findIndex((record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review");
      assert.ok(resolutionIndex >= 0 && requestIndex > resolutionIndex);
      const resolution = review[resolutionIndex]!.args;
      assert.deepEqual(resolution, { owner: "DataDog", repo: "repo", finding_id: 84172, resolution: "addressed", fix_commit_sha: result.status === "verified" ? result.reviewedHead : "", fix_change_summary: "Fixture applied deterministic fix for 84172", reason: "Fixture verified the fix locally." });
      assert.ok(review.some((record, index) => index > requestIndex && record.type === "tool_execution_end" && record.toolName === "agentic_review_get_findings"));
      assert.equal(run("git", ["rev-parse", "refs/heads/fixture"], remote), result.status === "verified" ? result.reviewedHead : "");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps partial addressed-resolution failures blocked with remaining findings", { timeout: 120_000 }, async () => {
    const pendingSettlements = ["51842", "51843"].map((findingId) => ({
      findingId,
      fixCommitSha: "b".repeat(40),
      fixChangeSummary: `Fixture applied deterministic fix for finding ${findingId}`,
      reason: "Fixture verified the fix locally.",
    }));
    const run = await runArpReviewFixture("auto-partial-resolution", { pendingSettlements });
    try {
      const resolutionCalls = run.rpc.records.filter(
        (record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_resolve_finding",
      );
      assert.equal(resolutionCalls.length, 2);
      assert.deepEqual(resolutionCalls.map((record) => record.isError), [false, true]);
      assert.deepEqual(resolutionCalls.map((record) => record.result.details.finding_id), [51842, 51843]);
      assert.equal(run.outcome.result.details.outcome, "blocked");
      assert.deepEqual(run.outcome.result.details.settledFindingIds, ["51842"]);
      assert.equal(run.rpc.records.filter((record) => record.type === "tool_execution_end" && record.toolName === "agentic_review_get_findings").length, 2);
      assert.equal(run.rpc.records.some((record) => record.type === "tool_execution_start" && record.toolName === "agentic_review_request_review"), false);
    } finally {
      await run.rpc.close();
      rmSync(run.fixture.root, { recursive: true, force: true });
    }
  });
});
