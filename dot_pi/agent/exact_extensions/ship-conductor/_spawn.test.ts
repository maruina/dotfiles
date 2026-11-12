import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, it, mock } from "node:test";
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

type FakeRpcProcessOptions = {
  writeError?: Error;
  blockRequestType?: string;
  ignoreSignals?: boolean;
};

class FakeRpcProc extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin: Writable;
  requests: RpcRecord[] = [];
  killSignals: NodeJS.Signals[] = [];
  closed = false;
  private input = "";
  private readonly onCommand: (record: RpcRecord) => void;
  private blockedWriteCallback: ((error?: Error | null) => void) | undefined;
  private resolveBlockedWrite!: () => void;
  private readonly blockedWrite: Promise<void>;
  private readonly options: FakeRpcProcessOptions;

  constructor(onCommand: (record: RpcRecord) => void, options: FakeRpcProcessOptions = {}) {
    super();
    this.onCommand = onCommand;
    this.options = options;
    this.blockedWrite = new Promise((resolve) => {
      this.resolveBlockedWrite = resolve;
    });
    this.stdin = new Writable({
      write: (chunk, _encoding, callback) => {
        if (options.writeError) {
          callback(options.writeError);
          return;
        }
        this.input += chunk.toString("utf8");
        let newline = this.input.indexOf("\n");
        while (newline !== -1) {
          const line = this.input.slice(0, newline).replace(/\r$/, "");
          this.input = this.input.slice(newline + 1);
          const record = JSON.parse(line) as RpcRecord;
          if (record.type === options.blockRequestType) {
            this.blockedWriteCallback = callback;
            this.resolveBlockedWrite();
            return;
          }
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

  waitForBlockedWrite(): Promise<void> {
    return this.blockedWrite;
  }

  releaseBlockedWrite(error?: Error): void {
    const callback = this.blockedWriteCallback;
    this.blockedWriteCallback = undefined;
    callback?.(error);
  }

  emitRaw(data: Buffer | string): void {
    this.stdout.write(data);
  }

  emitRecord(record: RpcRecord): void {
    const bytes = Buffer.from(`${JSON.stringify(record)}\r\n`);
    this.stdout.write(bytes.subarray(0, Math.min(5, bytes.length)));
    this.stdout.write(bytes.subarray(Math.min(5, bytes.length)));
  }

  kill(signal: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    if (this.options.ignoreSignals) return true;
    if (this.closed) return false;
    this.closed = true;
    this.releaseBlockedWrite(new Error("fake child closed while writing"));
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit("close", 143, signal));
    return true;
  }
}

function openFakeSession(proc: FakeRpcProc) {
  return startRpcSession(
    () => proc,
    { command: "pi", args: [] },
    "/wt",
    { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
  );
}

function trackedAbortSignal() {
  let aborted = false;
  const listeners = new Map<EventListenerOrEventListenerObject, EventListener>();
  const signal = {
    get aborted() { return aborted; },
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type !== "abort" || !listener) return;
      const handler = typeof listener === "function" ? listener : (event: Event) => listener.handleEvent(event);
      listeners.set(listener, handler);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) {
      if (type === "abort" && listener) listeners.delete(listener);
    },
  } as unknown as AbortSignal;
  return {
    signal,
    abort() {
      aborted = true;
      for (const listener of [...listeners.values()]) listener(new Event("abort"));
    },
    get listenerCount() { return listeners.size; },
  };
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

function lifecycleRpc(options: {
  outcome?: boolean;
  wrongRunId?: boolean;
  duplicateOutcome?: boolean;
  rejectedOutcome?: boolean;
  modelDrift?: boolean;
  resistAbort?: boolean;
  ignoreSignals?: boolean;
  progressBurst?: boolean;
} = {}) {
  let proc: FakeRpcProc;
  let promptCount = 0;
  let stateCount = 0;
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
      if (request.cancelled === true && options.resistAbort) return;
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
        if (decision === "approved" && options.rejectedOutcome) {
          proc.emitRecord({ type: "tool_execution_start", toolCallId: "rejected-outcome-call", toolName: "lifecycle_submit_outcome" });
          proc.emitRecord({
            type: "tool_execution_end",
            toolCallId: "rejected-outcome-call",
            toolName: "lifecycle_submit_outcome",
            isError: true,
            result: { content: [{ type: "text", text: "Cannot submit success: the worktree has uncommitted changes." }] },
          });
        }
        if (decision === "approved" && options.outcome !== false) {
          for (const toolCallId of options.duplicateOutcome ? ["outcome-call", "duplicate-outcome-call"] : ["outcome-call"]) {
            proc.emitRecord({ type: "tool_execution_start", toolCallId, toolName: "lifecycle_submit_outcome" });
            proc.emitRecord({
              type: "tool_execution_end",
              toolCallId,
              toolName: "lifecycle_submit_outcome",
              isError: false,
              result: { details: lifecycleOutcome() },
            });
          }
        }
        proc.emitRecord({ type: "agent_settled", aborted: decision !== "approved" });
      }, 1);
      return;
    }
    if (request.type === "get_state") {
      stateCount++;
      respond(request, {
        model: { provider: "fixture", id: options.modelDrift && stateCount > 1 ? "changed" : "driver" },
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
        if (options.progressBurst) {
          for (let index = 0; index < 120; index++) {
            proc.emitRecord({ type: "tool_execution_start", toolCallId: `fixture-${index}`, toolName: "🧪".repeat(300) });
          }
          proc.emitRecord({ type: "agent_settled", aborted: false });
          return;
        }
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
  }, { ignoreSignals: options.ignoreSignals });
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

describe("RPC session framing and bounds", () => {
  it("frames CRLF records across split UTF-8 and preserves Unicode separators", async () => {
    const proc = new FakeRpcProc(() => undefined);
    const session = openFakeSession(proc);
    let resolveRecord!: (record: RpcRecord) => void;
    const recordPromise = new Promise<RpcRecord>((resolve) => {
      resolveRecord = resolve;
    });
    const unsubscribe = session.onRecord((record) => resolveRecord(record));
    const expected = { type: "fixture_event", text: "left 🧪\u2028middle\u2029right" };
    const bytes = Buffer.from(`${JSON.stringify(expected)}\r\n`);
    const symbolOffset = bytes.indexOf(Buffer.from("🧪"));
    proc.emitRaw(bytes.subarray(0, symbolOffset + 1));
    proc.emitRaw(bytes.subarray(symbolOffset + 1, symbolOffset + 3));
    proc.emitRaw(bytes.subarray(symbolOffset + 3));
    try {
      assert.deepEqual(await recordPromise, expected);
    } finally {
      unsubscribe();
      await session.close();
    }
  });

  it("rejects malformed and oversized JSONL records and closes the child", async () => {
    for (const [input, expected] of [
      [Buffer.from("{not-json\n"), /Pi RPC stdout|JSON/],
      [Buffer.alloc(1024 * 1024 + 1, 0x61), /record exceeds 1048576 bytes/],
    ] as const) {
      const proc = new FakeRpcProc(() => undefined);
      const session = openFakeSession(proc);
      const exitPromise = session.waitForExit();
      proc.emitRaw(input);
      const exit = await exitPromise;
      assert.match(exit.error ?? "", expected);
      assert.equal(proc.closed, true);
    }
  });

  it("waits for stdin drain before completing a backpressured RPC request", async () => {
    let proc!: FakeRpcProc;
    proc = new FakeRpcProc((request) => {
      setImmediate(() => proc.emitRecord({ id: request.id, type: "response", command: request.type, success: true, data: { ready: true } }));
    });
    const write = proc.stdin.write.bind(proc.stdin);
    proc.stdin.write = ((chunk: string | Uint8Array, callback?: (error?: Error | null) => void) => {
      write(chunk, callback);
      return false;
    }) as typeof proc.stdin.write;
    const session = openFakeSession(proc);
    let settled = false;
    const request = session.request("get_state").then((response) => {
      settled = true;
      return response;
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(settled, false);
      proc.stdin.emit("drain");
      assert.deepEqual((await request).data, { ready: true });
      assert.equal(settled, true);
    } finally {
      await session.close();
    }
  });

  it("keeps stderr within its UTF-8 byte limit", async () => {
    const proc = new FakeRpcProc(() => undefined);
    const session = openFakeSession(proc);
    proc.stderr.write("🧪".repeat(5_000));
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.ok(Buffer.byteLength(session.stderrTail(), "utf8") <= 16 * 1024);
    await session.close();
  });

  it("rejects excessive pending requests and write failures", async () => {
    const pendingProc = new FakeRpcProc(() => undefined);
    const pendingSession = openFakeSession(pendingProc);
    const pending = Array.from({ length: 32 }, () => pendingSession.request("get_state").catch((error: unknown) => error));
    await assert.rejects(pendingSession.request("get_state"), /pending request limit/);
    await pendingSession.close();
    await Promise.all(pending);

    const writeProc = new FakeRpcProc(() => undefined, { writeError: new Error("fixture pipe failure") });
    const writeSession = openFakeSession(writeProc);
    await assert.rejects(writeSession.request("get_state"), /fixture pipe failure/);
    assert.equal((await writeSession.waitForExit()).signal, "SIGTERM");
  });
});

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

  it("bounds progress entry count and UTF-8 size", async () => {
    const { spawner } = lifecycleRpc({ progressBurst: true });
    const result = await runRpcLifecycleStage(
      spawner,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI("Approve"),
    );
    assert.equal(result.status, "failure");
    assert.ok(result.progress.length <= 100);
    assert.ok(result.progress.every((message) => Buffer.byteLength(message, "utf8") <= 512));
  });

  it("stops on post-settlement model drift and duplicate outcomes", async () => {
    for (const options of [{ modelDrift: true }, { duplicateOutcome: true }]) {
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

  it("returns cancelled before spawning when the coordinator signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let spawned = false;
    const result = await runRpcLifecycleStage(
      () => {
        spawned = true;
        throw new Error("must not spawn");
      },
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI(undefined),
      controller.signal,
    );
    assert.equal(result.status, "cancelled");
    assert.equal(result.promptStarted, false);
    assert.equal(spawned, false);
  });

  it("cancels an outstanding approval and clears the parent waiting state", async () => {
    const { proc, spawner } = lifecycleRpc();
    const trackedSignal = trackedAbortSignal();
    let resolveWaiting!: () => void;
    const waitingStarted = new Promise<void>((resolve) => {
      resolveWaiting = resolve;
    });
    const waitingStates: boolean[] = [];
    const pendingUI: RpcStageUI = {
      ...stageUI(undefined),
      select: () => new Promise<string | undefined>(() => undefined),
    };
    const run = runRpcLifecycleStage(
      spawner,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      pendingUI,
      trackedSignal.signal,
      {
        onWaitingForUser: (waiting) => {
          waitingStates.push(waiting);
          if (waiting) resolveWaiting();
        },
      },
    );
    await waitingStarted;
    trackedSignal.abort();
    const result = await run;
    assert.equal(result.status, "cancelled");
    assert.equal(result.terminationConfirmed, true);
    assert.equal(trackedSignal.listenerCount, 0);
    assert.deepEqual(waitingStates, [true, false]);
    assert.equal(result.decisions[0]?.decision, "cancelled");
    assert.equal(proc.requests.find((request) => request.type === "extension_ui_response")?.cancelled, true);
  });

  it("cancels while a prompt write is blocked and confirms child exit", { timeout: 15_000 }, async () => {
    let proc!: FakeRpcProc;
    const templates = [
      { name: "execute", source: "prompt", sourceInfo: { path: "/wt/prompts/execute.md" } },
      { name: "simplify", source: "prompt", sourceInfo: { path: "/wt/prompts/simplify.md" } },
      { name: "verify", source: "prompt", sourceInfo: { path: "/wt/prompts/verify.md" } },
    ];
    const respond = (request: RpcRecord, data: RpcRecord) => {
      setImmediate(() => proc.emitRecord({ id: request.id, type: "response", command: request.type, success: true, data }));
    };
    proc = new FakeRpcProc((request) => {
      if (request.type === "get_state") {
        respond(request, {
          model: { provider: "fixture", id: "driver" },
          thinkingLevel: "minimal",
          isStreaming: false,
          pendingMessageCount: 0,
          messageCount: 0,
          sessionId: "session-fixture",
        });
      } else if (request.type === "get_commands") respond(request, { commands: templates });
    }, { blockRequestType: "prompt" });
    const controller = new AbortController();
    const resultPromise = runRpcLifecycleStage(
      () => proc,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI(undefined),
      controller.signal,
    );
    await proc.waitForBlockedWrite();
    controller.abort();
    const result = await resultPromise;
    assert.equal(result.status, "cancelled");
    assert.equal(result.promptStarted, false);
    assert.equal(result.terminationConfirmed, true);
    assert.equal(proc.closed, true);
  });

  it("retains an unconfirmed termination failure after SIGTERM and SIGKILL", { timeout: 10_000 }, async () => {
    const { proc, spawner } = lifecycleRpc({ resistAbort: true, ignoreSignals: true });
    const controller = new AbortController();
    let resolveWaiting!: () => void;
    const waitingStarted = new Promise<void>((resolve) => {
      resolveWaiting = resolve;
    });
    const pendingUI: RpcStageUI = {
      ...stageUI(undefined),
      select: () => new Promise<string | undefined>(() => undefined),
    };
    const run = runRpcLifecycleStage(
      spawner,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      pendingUI,
      controller.signal,
      { onWaitingForUser: (waiting) => { if (waiting) resolveWaiting(); } },
    );
    await waitingStarted;
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      controller.abort();
      for (let attempt = 0; attempt < 4; attempt++) {
        mock.timers.tick(5_000);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const result = await run;
      assert.equal(result.status, "failure");
      assert.equal(result.terminationConfirmed, false);
      assert.match(result.reason, /did not close after SIGKILL/);
      assert.ok(proc.killSignals.includes("SIGTERM"));
      assert.ok(proc.killSignals.includes("SIGKILL"));
    } finally {
      mock.timers.reset();
    }
  });

  it("lets a stage correct a rejected outcome call and resubmit", async () => {
    const { spawner } = lifecycleRpc({ rejectedOutcome: true });
    const result = await runRpcLifecycleStage(
      spawner,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI("Approve"),
    );
    assert.equal(result.status, "settled", result.status === "settled" ? "" : result.reason);
    assert.ok(result.progress.some((entry) => /outcome rejected: Cannot submit success/.test(entry)));
  });

  it("fails when a rejected outcome call is never corrected", async () => {
    const { spawner } = lifecycleRpc({ rejectedOutcome: true, outcome: false });
    const result = await runRpcLifecycleStage(
      spawner,
      { command: "pi", args: [] },
      "/wt",
      { PI_LIFECYCLE_CHILD_CONFIG: "/tmp/stage.json" },
      STAGE_OPTIONS,
      stageUI("Approve"),
    );
    assert.equal(result.status, "failure");
    if (result.status === "failure") assert.match(result.reason, /rejected outcome.*Cannot submit success/i);
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
