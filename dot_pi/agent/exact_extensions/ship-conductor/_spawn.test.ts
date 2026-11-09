import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough, Readable, Writable } from "node:stream";
import { describe, it } from "node:test";
import {
  buildStageArgs,
  buildRpcStageArgs,
  describeFailure,
  getPiInvocation,
  isStageFailure,
  runStage,
  startRpcSession,
  preflightRpcStage,
  promptRpcStage,
  stderrTail,
  type Spawner,
  type StageResult,
  type RpcRecord,
} from "./_spawn.ts";

class FakeProc extends EventEmitter {
  stdout = new Readable({ read() {} });
  stderr = new Readable({ read() {} });
  killed = false;
  kill(_signal: NodeJS.Signals): boolean {
    this.killed = true;
    return true;
  }
}

function emitAndClose(proc: FakeProc, stdoutLines: string[], stderrLines: string[], code: number): void {
  for (const line of stdoutLines) proc.stdout.push(line + "\n");
  proc.stdout.push(null);
  for (const line of stderrLines) proc.stderr.push(line + "\n");
  proc.stderr.push(null);
  // Let the stream 'data' events be delivered before the child 'close' fires.
  setTimeout(() => proc.emit("close", code), 10);
}

const ASSISTANT = (text: string, extra: Record<string, string> = {}) =>
  JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text }], ...extra } });

describe("buildStageArgs", () => {
  it("builds the stage argv with model, thinking, and prompt", () => {
    assert.deepEqual(buildStageArgs("baseten/zai-org/GLM-5.3", "# Execute\nbody"), [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--model",
      "baseten/zai-org/GLM-5.3",
      "--thinking",
      "max",
      "# Execute\nbody",
    ]);
  });
});

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

describe("isStageFailure / describeFailure", () => {
  const base: StageResult = {
    exitCode: 0,
    finalMessage: "",
    stopReason: undefined,
    errorMessage: undefined,
    stderr: "",
    aborted: false,
  };

  it("classifies non-zero exit, error, and aborted stop reasons as failures", () => {
    assert.equal(isStageFailure({ ...base, exitCode: 1 }), true);
    assert.equal(isStageFailure({ ...base, stopReason: "error" }), true);
    assert.equal(isStageFailure({ ...base, stopReason: "aborted" }), true);
    assert.equal(isStageFailure(base), false);
    assert.equal(isStageFailure({ ...base, stopReason: "end" }), false);
  });

  it("describes the failure reason", () => {
    assert.equal(describeFailure({ ...base, stopReason: "error", errorMessage: "boom" }), "error");
    assert.equal(describeFailure({ ...base, errorMessage: "boom" }), "boom");
    assert.equal(describeFailure({ ...base, exitCode: 3 }), "exit code 3");
  });

  it("tails stderr beyond the cap", () => {
    const long = "x".repeat(5000);
    assert.equal(stderrTail(long).length, 2003);
    assert.ok(stderrTail(long).startsWith("..."));
    assert.ok(stderrTail(long).endsWith("x".repeat(2000)));
    assert.equal(stderrTail("short"), "short");
  });
});

describe("runStage", () => {
  it("captures the final assistant message, stop reason, and exit code", async () => {
    const spawner: Spawner = (command, args, options) => {
      assert.equal(command, "pi");
      assert.deepEqual(args, buildStageArgs("baseten/zai-org/GLM-5.3", "Task text"));
      assert.equal(options.cwd, "/wt");
      const proc = new FakeProc();
      emitAndClose(
        proc,
        [
          ASSISTANT("first message"),
          ASSISTANT("Implementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`", { stopReason: "end" }),
        ],
        ["some stderr"],
        0,
      );
      return proc;
    };
    const result = await runStage(spawner, { command: "pi", args: buildStageArgs("baseten/zai-org/GLM-5.3", "Task text") }, "/wt", undefined);
    assert.equal(result.exitCode, 0);
    assert.equal(result.finalMessage, "Implementation model: `GLM-5.3 (Baseten) (baseten/zai-org/GLM-5.3)`");
    assert.equal(result.stopReason, "end");
    assert.equal(result.stderr, "some stderr\n");
    assert.equal(result.aborted, false);
  });

  it("ignores non-JSON lines and non-assistant messages", async () => {
    const spawner: Spawner = () => {
      const proc = new FakeProc();
      emitAndClose(
        proc,
        [
          "not json",
          JSON.stringify({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "ignored" }] } }),
          ASSISTANT("final"),
        ],
        [],
        0,
      );
      return proc;
    };
    const result = await runStage(spawner, { command: "pi", args: [] }, "/wt", undefined);
    assert.equal(result.finalMessage, "final");
    assert.equal(result.exitCode, 0);
  });

  it("reports a non-zero exit code", async () => {
    const spawner: Spawner = () => {
      const proc = new FakeProc();
      emitAndClose(proc, [], ["fatal error"], 1);
      return proc;
    };
    const result = await runStage(spawner, { command: "pi", args: [] }, "/wt", undefined);
    assert.equal(result.exitCode, 1);
    assert.equal(result.stderr, "fatal error\n");
  });

  it("kills the child and reports aborted on signal", async () => {
    const abortController = new AbortController();
    let proc: FakeProc | undefined;
    const spawner: Spawner = () => {
      proc = new FakeProc();
      setTimeout(() => {
        proc!.stdout.push(ASSISTANT("partial") + "\n");
        proc!.stdout.push(null);
        proc!.emit("close", 143);
      }, 20);
      return proc;
    };
    const promise = runStage(spawner, { command: "pi", args: [] }, "/wt", abortController.signal);
    setTimeout(() => abortController.abort(), 5);
    const result = await promise;
    assert.equal(result.aborted, true);
    assert.ok(proc?.killed);
  });

  it("resolves when the signal is already aborted", async () => {
    const abortController = new AbortController();
    abortController.abort();
    let proc: FakeProc | undefined;
    const spawner: Spawner = () => {
      proc = new FakeProc();
      setTimeout(() => proc!.emit("close", 143), 20);
      return proc;
    };
    const result = await runStage(spawner, { command: "pi", args: [] }, "/wt", abortController.signal);
    assert.equal(result.aborted, true);
    assert.ok(proc?.killed);
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

const RPC_PREFLIGHT = {
  commandName: "execute",
  promptPath: "/wt/prompts/execute.md",
  model: { provider: "fixture", id: "driver" },
  thinkingLevel: "minimal",
};

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
