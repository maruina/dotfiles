import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, it } from "node:test";
import {
  buildRpcChildEnvironment,
  buildRpcStageArgs,
  getPiInvocation,
  startRpcSession,
  preflightRpcStage,
  promptRpcStage,
  runRpcLifecycleStage,
  type RpcRecord,
  type RpcStageUI,
} from "./_spawn.ts";

describe("getPiInvocation", () => {
  it("invokes the current script under the current runtime when one exists", () => {
    const currentScript = process.argv[1];
    if (currentScript && existsSync(currentScript)) {
      const invocation = getPiInvocation(["--mode", "json"]);
      assert.equal(invocation.command, process.execPath);
      assert.deepEqual(invocation.args, [currentScript, "--mode", "json"]);
    }
  });

  it("falls back to the pi binary for a generic runtime without a script", () => {
    const original = process.argv[1];
    try {
      process.argv[1] = "";
      const invocation = getPiInvocation(["-p"]);
      assert.equal(invocation.command, "pi");
      assert.deepEqual(invocation.args, ["-p"]);
    } finally {
      process.argv[1] = original;
    }
  });
});

class FakeRpcProc extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin: Writable;
  requests: RpcRecord[] = [];
  closed = false;
  private input = "";
  private readonly onCommand: (record: RpcRecord) => void;

  constructor(onCommand: (record: RpcRecord) => void) {
    super();
    this.onCommand = onCommand;
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        this.input += chunk.toString("utf8");
        let newline = this.input.indexOf("\n");
        while (newline !== -1) {
          const line = this.input.slice(0, newline).replace(/\r$/, "");
          this.input = this.input.slice(newline + 1);
          const record = JSON.parse(line) as RpcRecord;
          this.requests.push(record);
          this.onCommand(record);
          newline = this.input.indexOf("\n");
        }
        callback();
      },
      final: (callback) => {
        this.closed = true;
        this.stdout.end();
        this.stderr.end();
        setImmediate(() => this.emit("close", 0, null));
        callback();
      },
    });
  }

  emitRecord(record: RpcRecord): void {
    const bytes = Buffer.from(`${JSON.stringify(record)}\r\n`);
    this.stdout.write(bytes.subarray(0, Math.min(5, bytes.length)));
    this.stdout.write(bytes.subarray(Math.min(5, bytes.length)));
  }

  kill(_signal: NodeJS.Signals): boolean {
    if (this.closed) return false;
    this.closed = true;
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit("close", 143, "SIGTERM"));
    return true;
  }
}

type FakeRpcOptions = {
  disposition?: string;
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  isStreaming?: boolean;
  commands?: RpcRecord[];
};

function fakeRpc(options: FakeRpcOptions = {}) {
  let proc: FakeRpcProc;
  proc = new FakeRpcProc((request) => {
    if (request.type === "extension_ui_response") return;
    const data =
      request.type === "get_state"
        ? {
            model: options.model ?? { provider: "fixture", id: "driver" },
            thinkingLevel: options.thinkingLevel ?? "minimal",
            isStreaming: options.isStreaming ?? false,
            pendingMessageCount: 0,
            messageCount: 0,
            sessionId: "session-fixture",
          }
        : request.type === "get_commands"
          ? {
              commands:
                options.commands ?? [
                  { name: "execute", source: "prompt", sourceInfo: { path: "/wt/prompts/execute.md" } },
                ],
            }
          : request.type === "prompt"
            ? { disposition: options.disposition ?? "started" }
            : {};
    setImmediate(() =>
      proc.emitRecord({
        id: request.id,
        type: "response",
        command: request.type,
        success: true,
        data,
      }),
    );
  });
  const session = startRpcSession(
    (_command, _args, spawnOptions) => {
      assert.equal(spawnOptions.cwd, "/wt");
      assert.equal(spawnOptions.env.PI_LIFECYCLE_CHILD_CONFIG, "/tmp/stage.json");
      return proc;
    },
    { command: "pi", args: [] },
    "/wt",
    { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
  );
  return { session, proc };
}

const STAGE_OPTIONS = {
  runId: "run-1",
  stage: "execute" as const,
  commandName: "execute",
  promptPath: "/wt/prompts/execute.md",
  templates: [
    { commandName: "simplify", promptPath: "/wt/prompts/simplify.md" },
    { commandName: "verify", promptPath: "/wt/prompts/verify.md" },
  ],
  model: { provider: "fixture", id: "driver" },
  thinkingLevel: "minimal",
  bridgePath: "/agent/ship-conductor/_bridge.ts",
  configPath: "/tmp/stage.json",
  prompt: "# Execute fixture",
};

function lifecycleOutcome(): RpcRecord {
  return {
    schemaVersion: 1,
    runId: "run-1",
    stage: "execute",
    sessionId: "session-fixture",
    model: { provider: "fixture", id: "driver" },
    outcome: "success",
    change: "changed",
    candidate: { branch: "feature", head: "a".repeat(40), stateDigest: "b".repeat(64) },
    reportRef: "lifecycle-coordinator/runs/run-1/reports/execute-report.md",
  };
}

function decisionResult(decision: "approved" | "rejected" | "cancelled", runId = "run-1"): RpcRecord {
  return {
    protocolVersion: 1,
    runId,
    stage: "execute",
    sessionId: "session-fixture",
    model: { provider: "fixture", id: "driver" },
    requestId: "decision-call",
    decision,
    question: "Run the required focused test?",
    evidence: "The execute stage changed source files.",
    proposal: "Run the documented focused test before commit.",
    context: "This remains within the pinned implementation unit.",
  };
}

function lifecycleRpc(options: { outcome?: boolean; wrongRunId?: boolean } = {}) {
  let proc: FakeRpcProc;
  let promptCount = 0;
  const templates = [
    { name: "execute", source: "prompt", sourceInfo: { path: "/wt/prompts/execute.md" } },
    { name: "simplify", source: "prompt", sourceInfo: { path: "/wt/prompts/simplify.md" } },
    { name: "verify", source: "prompt", sourceInfo: { path: "/wt/prompts/verify.md" } },
  ];
  const respond = (request: RpcRecord, data: RpcRecord) => {
    setImmediate(() => proc.emitRecord({ id: request.id, type: "response", command: request.type, success: true, data }));
  };
  proc = new FakeRpcProc((request) => {
    if (request.type === "extension_ui_response") {
      setTimeout(() => {
        const answer = request.cancelled === true ? undefined : request.value;
        const decision = answer === "Approve" ? "approved" : answer === "Reject" ? "rejected" : "cancelled";
        proc.emitRecord({
          type: "tool_execution_end",
          toolCallId: "decision-call",
          toolName: "lifecycle_request_decision",
          isError: decision !== "approved",
          result: { details: decisionResult(decision, options.wrongRunId ? "run-other" : "run-1") },
        });
        if (decision === "approved" && options.outcome !== false) {
          proc.emitRecord({ type: "tool_execution_start", toolCallId: "outcome-call", toolName: "lifecycle_submit_outcome" });
          proc.emitRecord({
            type: "tool_execution_end",
            toolCallId: "outcome-call",
            toolName: "lifecycle_submit_outcome",
            isError: false,
            result: { details: lifecycleOutcome() },
          });
        }
        proc.emitRecord({ type: "agent_settled", aborted: decision !== "approved" });
      }, 1);
      return;
    }
    if (request.type === "get_state") {
      respond(request, {
        model: { provider: "fixture", id: "driver" },
        thinkingLevel: "minimal",
        isStreaming: false,
        pendingMessageCount: 0,
        messageCount: promptCount,
        sessionId: "session-fixture",
      });
      return;
    }
    if (request.type === "get_commands") {
      respond(request, { commands: templates });
      return;
    }
    if (request.type === "prompt") {
      promptCount++;
      respond(request, { disposition: "started" });
      setTimeout(() => {
        proc.emitRecord({ type: "agent_start" });
        proc.emitRecord({ type: "tool_execution_start", toolCallId: "decision-call", toolName: "lifecycle_request_decision" });
        proc.emitRecord({
          type: "extension_ui_request",
          id: "decision-ui",
          method: "select",
          title: "execute decision — Run the required focused test?\n\nEvidence: The execute stage changed source files.\n\nProposal: Run the documented focused test before commit.\n\nContext: This remains within the pinned implementation unit.",
          options: ["Approve", "Reject"],
        });
      }, 1);
      return;
    }
    if (request.type === "abort") {
      respond(request, {});
      return;
    }
    respond(request, {});
  });
  const spawner = (_command: string, _args: string[], spawnOptions: { cwd: string; env: NodeJS.ProcessEnv }) => {
    assert.equal(spawnOptions.cwd, "/wt");
    assert.equal(spawnOptions.env.PI_LIFECYCLE_CHILD_CONFIG, "/tmp/stage.json");
    return proc;
  };
  return { proc, spawner };
}

function stageUI(answer: string | undefined): RpcStageUI {
  return {
    select: async (_title, options) => {
      assert.deepEqual(options, ["Approve", "Reject"]);
      return answer;
    },
    confirm: async () => true,
    input: async () => "fixture",
    editor: async () => "fixture",
    notify: () => undefined,
    setStatus: () => undefined,
  };
}

const RPC_PREFLIGHT = {
  commandName: "execute",
  promptPath: "/wt/prompts/execute.md",
  model: { provider: "fixture", id: "driver" },
  thinkingLevel: "minimal",
};

describe("buildRpcChildEnvironment", () => {
  it("replaces child-only metadata without mutating the parent environment", () => {
    const parent = { PATH: "/bin", PI_LIFECYCLE_CHILD_CONFIG: "/parent/stage.json" };
    const child = buildRpcChildEnvironment(parent, "/child/stage.json");
    assert.notEqual(child, parent);
    assert.equal(parent.PI_LIFECYCLE_CHILD_CONFIG, "/parent/stage.json");
    assert.equal(child.PI_LIFECYCLE_CHILD_CONFIG, "/child/stage.json");
    assert.equal(child.PATH, parent.PATH);
  });
});

describe("buildRpcStageArgs", () => {
  it("starts a fresh RPC child with the selected provider, model, thinking, and bridge", () => {
    assert.deepEqual(
      buildRpcStageArgs("fixture", "driver", "minimal", "/agent/ship-conductor/_bridge.ts"),
      [
        "--mode",
        "rpc",
        "--no-session",
        "--provider",
        "fixture",
        "--model",
        "driver",
        "--thinking",
        "minimal",
        "-e",
        "/agent/ship-conductor/_bridge.ts",
      ],
    );
  });
});

describe("RPC stage preflight and dispatch", () => {
  it("checks observed model, thinking, session, and native prompt provenance before dispatch", async () => {
    const { session } = fakeRpc();
    try {
      const state = await preflightRpcStage(session, RPC_PREFLIGHT);
      assert.equal(state.sessionId, "session-fixture");
      assert.deepEqual(state.model, { provider: "fixture", id: "driver" });
      assert.equal(state.thinkingLevel, "minimal");
      const response = await promptRpcStage(session, "# Execute\nfixture input");
      assert.equal((response.data as RpcRecord).disposition, "started");
    } finally {
      await session.close();
    }
  });

  it("refuses a model or effective-thinking mismatch", async () => {
    const wrongModel = fakeRpc({ model: { provider: "other", id: "driver" } });
    await assert.rejects(preflightRpcStage(wrongModel.session, RPC_PREFLIGHT), /model/i);
    await wrongModel.session.close();

    const wrongThinking = fakeRpc({ thinkingLevel: "off" });
    await assert.rejects(preflightRpcStage(wrongThinking.session, RPC_PREFLIGHT), /thinking/i);
    await wrongThinking.session.close();

    const streaming = fakeRpc({ isStreaming: true });
    await assert.rejects(preflightRpcStage(streaming.session, RPC_PREFLIGHT), /idle state/i);
    await streaming.session.close();
  });

  it("checks all stage templates and refuses shadowed provenance before dispatch", async () => {
    const allTemplates = [
      { commandName: "simplify", promptPath: "/wt/prompts/simplify.md" },
      { commandName: "verify", promptPath: "/wt/prompts/verify.md" },
    ];
    const allCommands = fakeRpc({
      commands: [
        { name: "execute", source: "prompt", sourceInfo: { path: "/wt/prompts/execute.md" } },
        { name: "simplify", source: "prompt", sourceInfo: { path: "/wt/prompts/simplify.md" } },
        { name: "verify", source: "prompt", sourceInfo: { path: "/wt/prompts/verify.md" } },
      ],
    });
    try {
      await preflightRpcStage(allCommands.session, { ...RPC_PREFLIGHT, templates: allTemplates });
    } finally {
      await allCommands.session.close();
    }

    const missing = fakeRpc();
    await assert.rejects(preflightRpcStage(missing.session, { ...RPC_PREFLIGHT, templates: allTemplates }), /simplify.*prompt provenance/);
    await missing.session.close();
  });

  it("refuses an extension command or a shadowed prompt path", async () => {
    const extensionCommand = fakeRpc({
      commands: [{ name: "execute", source: "extension", sourceInfo: { path: "/agent/extension.ts" } }],
    });
    await assert.rejects(preflightRpcStage(extensionCommand.session, RPC_PREFLIGHT), /prompt provenance/i);
    await extensionCommand.session.close();

    const shadowedCommand = fakeRpc({
      commands: [{ name: "execute", source: "prompt", sourceInfo: { path: "/other/execute.md" } }],
    });
    await assert.rejects(preflightRpcStage(shadowedCommand.session, RPC_PREFLIGHT), /prompt provenance/i);
    await shadowedCommand.session.close();
  });

  it("rejects handled and queued prompts instead of treating them as started work", async () => {
    for (const disposition of ["handled", "queued"]) {
      const { session } = fakeRpc({ disposition });
      try {
        await assert.rejects(promptRpcStage(session, "# Execute"), /not started.*disposition/i);
      } finally {
        await session.close();
      }
    }
  });

  it("reports confirmed process termination and exit failure", async () => {
    const { session, proc } = fakeRpc();
    const exit = session.waitForExit();
    await session.close();
    assert.deepEqual(await exit, { code: 0, signal: null, error: undefined });
    assert.equal(proc.closed, true);
  });

  it("forwards extension UI responses and emits non-response RPC records", async () => {
    const { session, proc } = fakeRpc();
    const observed: RpcRecord[] = [];
    const unsubscribe = session.onRecord((record) => observed.push(record));
    try {
      proc.emitRecord({ type: "extension_ui_request", id: "ui-test", method: "select", options: ["Approve", "Reject"] });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(observed[0]?.type, "extension_ui_request");
      await session.send({ type: "extension_ui_response", id: "ui-test", value: "Approve" });
      assert.deepEqual(proc.requests.at(-1), { type: "extension_ui_response", id: "ui-test", value: "Approve" });
    } finally {
      unsubscribe();
      await session.close();
    }
  });
});

describe("runRpcLifecycleStage", () => {
  it("requires a correlated approval, structured outcome, and settled fresh session", async () => {
    const { proc, spawner } = lifecycleRpc();
    const observed: unknown[] = [];
    const result = await runRpcLifecycleStage(
      spawner,
      { command: "pi", args: ["--mode", "rpc"] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI("Approve"),
      undefined,
      {
        onObserved: (state) => {
          observed.push(state);
        },
        onProgress: (message) => assert.ok(Buffer.byteLength(message, "utf8") <= 512),
      },
    );
    assert.equal(result.status, "settled");
    assert.equal(result.promptStarted, true);
    assert.equal(result.terminationConfirmed, true);
    assert.equal(observed.length, 1);
    if (result.status !== "settled") return;
    assert.equal(result.outcome.outcome, "success");
    assert.equal(result.decisions.length, 1);
    assert.equal(result.decisions[0]?.decision, "approved");
    assert.equal(result.decisions[0]?.uiRequestId, "decision-ui");
    assert.equal(result.decisions[0]?.toolCallId, "decision-call");
    assert.equal(result.decisions[0]?.question, "Run the required focused test?");
    assert.deepEqual(proc.requests.find((request) => request.type === "extension_ui_response"), {
      type: "extension_ui_response",
      id: "decision-ui",
      value: "Approve",
    });
  });

  it("treats rejection as blocked and dismissal as cancelled, never approved", async () => {
    for (const [answer, expectedStatus, expectedDecision] of [
      ["Reject", "blocked", "rejected"],
      [undefined, "cancelled", "cancelled"],
    ] as const) {
      const { spawner } = lifecycleRpc();
      const result = await runRpcLifecycleStage(
        spawner,
        { command: "pi", args: [] },
        "/wt",
        { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
        STAGE_OPTIONS,
        stageUI(answer),
      );
      assert.equal(result.status, expectedStatus);
      assert.equal(result.decisions[0]?.decision, expectedDecision);
      assert.equal(result.promptStarted, true);
      assert.equal(result.terminationConfirmed, true);
    }
  });

  it("rejects missing and wrong-run outcomes after settlement", async () => {
    for (const options of [{ outcome: false }, { wrongRunId: true }]) {
      const { spawner } = lifecycleRpc(options);
      const result = await runRpcLifecycleStage(
        spawner,
        { command: "pi", args: [] },
        "/wt",
        { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
        STAGE_OPTIONS,
        stageUI("Approve"),
      );
      assert.equal(result.status, "failure");
      assert.equal(result.terminationConfirmed, true);
    }
  });
});
