import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import {
  buildStageArgs,
  describeFailure,
  getPiInvocation,
  isStageFailure,
  runStage,
  stderrTail,
  type Spawner,
  type StageResult,
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
