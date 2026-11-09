/**
 * Subprocess plumbing for lifecycle stages: legacy JSON helpers and a bounded
 * native RPC adapter. Spawners are injected to keep process behavior testable.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";

export type StageResult = {
  exitCode: number;
  finalMessage: string;
  stopReason: string | undefined;
  errorMessage: string | undefined;
  stderr: string;
  aborted: boolean;
};

export type SpawnedProcess = {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: "close", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal: NodeJS.Signals): boolean;
  killed: boolean;
};

export type Spawner = (command: string, args: string[], options: { cwd: string }) => SpawnedProcess;

export function buildStageArgs(modelId: string, prompt: string): string[] {
  return ["--mode", "json", "-p", "--no-session", "--model", modelId, "--thinking", "max", prompt];
}

// deliberate: copied from the pi subagent example (getPiInvocation is not
// exported); revisit if pi exports it in a future version.
export function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) {
    return { command: process.execPath, args };
  }
  return { command: "pi", args };
}

export function isStageFailure(result: StageResult): boolean {
  return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

export function describeFailure(result: StageResult): string {
  if (result.stopReason === "error" || result.stopReason === "aborted") return result.stopReason;
  if (result.errorMessage) return result.errorMessage;
  return `exit code ${result.exitCode}`;
}

export function stderrTail(stderr: string, maxChars = 2000): string {
  if (stderr.length <= maxChars) return stderr;
  return `...${stderr.slice(-maxChars)}`;
}

type JsonEvent = {
  type?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    stopReason?: string;
    errorMessage?: string;
  };
};

export async function runStage(
  spawner: Spawner,
  invocation: { command: string; args: string[] },
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<StageResult> {
  const proc = spawner(invocation.command, invocation.args, { cwd });
  let buffer = "";
  let stderr = "";
  let finalMessage = "";
  let stopReason: string | undefined;
  let errorMessage: string | undefined;
  let exitCode = 0;
  let aborted = false;

  const processLine = (line: string) => {
    if (!line.trim()) return;
    let event: JsonEvent;
    try {
      event = JSON.parse(line) as JsonEvent;
    } catch {
      return;
    }
    if (event.type !== "message_end" || !event.message) return;
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason) stopReason = message.stopReason;
    if (message.errorMessage) errorMessage = message.errorMessage;
    const text = (message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("");
    if (text) finalMessage = text;
  };

  proc.stdout.on("data", (data: Buffer | string) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) processLine(line);
  });
  proc.stderr.on("data", (data: Buffer | string) => {
    stderr += data.toString();
  });

  await new Promise<void>((resolve) => {
    const finish = (code: number | null) => {
      if (buffer.trim()) processLine(buffer);
      exitCode = code ?? 0;
      resolve();
    };
    proc.on("close", finish);
    proc.on("error", () => {
      exitCode = 1;
      resolve();
    });

    if (signal) {
      const killProc = () => {
        aborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (signal.aborted) killProc();
      else signal.addEventListener("abort", killProc, { once: true });
    }
  });

  return { exitCode, finalMessage, stopReason, errorMessage, stderr, aborted };
}

export type RpcRecord = Record<string, unknown>;

export type RpcSpawnedProcess = {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(event: "close", listener: (code: number | null, signal?: NodeJS.Signals | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal: NodeJS.Signals): boolean;
};

export type RpcSpawner = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => RpcSpawnedProcess;

export type RpcSession = {
  request(type: string, fields?: Record<string, unknown>, timeoutMs?: number): Promise<RpcRecord>;
  send(record: RpcRecord): Promise<void>;
  onRecord(listener: (record: RpcRecord) => void): () => void;
  close(): Promise<void>;
  stderrTail(): string;
};

export type RpcStagePreflight = {
  commandName: string;
  promptPath: string;
  model: { provider: string; id: string };
  thinkingLevel: string;
};

const MAX_RPC_RECORD_BYTES = 1024 * 1024;
const MAX_RPC_PENDING_REQUESTS = 32;
const MAX_RPC_RECORD_LISTENERS = 64;
const MAX_RPC_STDERR_BYTES = 16 * 1024;
const RPC_CONTROL_TIMEOUT_MS = 30_000;
const RPC_CLOSE_GRACE_MS = 5_000;

export function buildRpcStageArgs(provider: string, modelId: string, thinkingLevel: string, bridgePath: string): string[] {
  if (!provider || !modelId || !thinkingLevel || !isAbsolute(bridgePath)) {
    throw new Error("RPC stage requires a provider, model, thinking level, and absolute bridge path");
  }
  return [
    "--mode",
    "rpc",
    "--no-session",
    "--provider",
    provider,
    "--model",
    modelId,
    "--thinking",
    thinkingLevel,
    "-e",
    bridgePath,
  ];
}

type PendingRpcRequest = {
  command: string;
  resolve(response: RpcRecord): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

class RpcSessionImplementation implements RpcSession {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  private readonly pending = new Map<string, PendingRpcRequest>();
  private readonly listeners = new Set<(record: RpcRecord) => void>();
  private readonly closedPromise: Promise<void>;
  private resolveClosed!: () => void;
  private buffer = "";
  private stderr = "";
  private failure: Error | undefined;
  private closed = false;
  private closing = false;
  private stdinEnded = false;
  private writeChain: Promise<void> = Promise.resolve();
  private readonly process: RpcSpawnedProcess;

  constructor(process: RpcSpawnedProcess) {
    this.process = process;
    this.closedPromise = new Promise((resolveClosed) => {
      this.resolveClosed = resolveClosed;
    });
    process.stdout.on("data", (chunk: Buffer | string) => this.readStdout(chunk));
    process.stdout.on("end", () => this.finishStdout());
    process.stderr.on("data", (chunk: Buffer | string) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-MAX_RPC_STDERR_BYTES);
    });
    process.stdin.on("error", (error: Error) => this.fail(new Error(`Pi RPC stdin failed: ${error.message}`)));
    process.on("error", (error) => this.fail(new Error(`Pi RPC process failed to start: ${error.message}`)));
    process.on("close", (code, signal) => this.handleClose(code, signal));
  }

  stderrTail(): string {
    return this.stderr;
  }

  onRecord(listener: (record: RpcRecord) => void): () => void {
    this.ensureActive();
    if (this.listeners.size >= MAX_RPC_RECORD_LISTENERS) throw new Error("Pi RPC record listener limit reached");
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  async request(type: string, fields: Record<string, unknown> = {}, timeoutMs = RPC_CONTROL_TIMEOUT_MS): Promise<RpcRecord> {
    this.ensureActive();
    if (!type) throw new Error("Pi RPC command type is required");
    if (this.pending.size >= MAX_RPC_PENDING_REQUESTS) throw new Error("Pi RPC pending request limit reached");

    const id = `rpc-${randomUUID()}`;
    const response = new Promise<RpcRecord>((resolveResponse, rejectResponse) => {
      const timer = setTimeout(() => this.fail(new Error(`Pi RPC ${type} request timed out after ${timeoutMs}ms`)), timeoutMs);
      this.pending.set(id, { command: type, resolve: resolveResponse, reject: rejectResponse, timer });
    });

    try {
      await this.send({ ...fields, type, id });
    } catch (error) {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    return response;
  }

  async send(record: RpcRecord): Promise<void> {
    this.ensureActive();
    const write = this.writeChain.then(() => this.writeRecord(record));
    this.writeChain = write.catch((error: unknown) => {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    });
    return write;
  }

  private ensureActive(): void {
    if (this.failure) throw this.failure;
    if (this.closed || this.closing) throw new Error("Pi RPC process is closed");
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
    if (!this.closed) this.process.kill("SIGTERM");
  }

  private readStdout(chunk: Buffer | string): void {
    if (this.failure) return;
    try {
      this.buffer += this.decoder.decode(typeof chunk === "string" ? Buffer.from(chunk) : chunk, { stream: true });
      let newline = this.buffer.indexOf("\n");
      while (newline !== -1) {
        let line = this.buffer.slice(0, newline);
        this.buffer = this.buffer.slice(newline + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (Buffer.byteLength(line, "utf8") > MAX_RPC_RECORD_BYTES) {
          throw new Error(`Pi RPC record exceeds ${MAX_RPC_RECORD_BYTES} bytes`);
        }
        this.handleRecord(line);
        newline = this.buffer.indexOf("\n");
      }
      if (Buffer.byteLength(this.buffer, "utf8") > MAX_RPC_RECORD_BYTES) {
        throw new Error(`Pi RPC record exceeds ${MAX_RPC_RECORD_BYTES} bytes`);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private finishStdout(): void {
    if (this.failure) return;
    try {
      this.buffer += this.decoder.decode();
      if (this.buffer.length !== 0) throw new Error("Pi RPC stdout ended with an incomplete JSONL record");
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleRecord(line: string): void {
    if (!line) throw new Error("Pi RPC emitted an empty record");
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Pi RPC emitted a non-object record");
    const record = parsed as RpcRecord;
    if (typeof record.type !== "string" || record.type.length === 0) throw new Error("Pi RPC record has no type");

    if (record.type === "response") this.handleResponse(record);
    for (const listener of [...this.listeners]) {
      try {
        listener(record);
      } catch (error) {
        this.fail(new Error(`Pi RPC record listener failed: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
    }
  }

  private handleResponse(record: RpcRecord): void {
    if (typeof record.id !== "string" || typeof record.command !== "string") {
      throw new Error("Pi RPC response is missing its request ID or command");
    }
    const pending = this.pending.get(record.id);
    if (!pending) throw new Error(`Pi RPC response has no matching request: ${record.id}`);
    if (record.command !== pending.command) throw new Error(`Pi RPC response command mismatch for ${record.id}`);
    clearTimeout(pending.timer);
    this.pending.delete(record.id);
    if (record.success !== true) {
      pending.reject(new Error(`Pi RPC ${pending.command} failed: ${typeof record.error === "string" ? record.error : "unknown error"}`));
      return;
    }
    pending.resolve(record);
  }

  private async writeRecord(record: RpcRecord): Promise<void> {
    this.ensureActive();
    const line = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(line, "utf8") > MAX_RPC_RECORD_BYTES) throw new Error(`Pi RPC request exceeds ${MAX_RPC_RECORD_BYTES} bytes`);
    await new Promise<void>((resolveWrite, rejectWrite) => {
      let callbackDone = false;
      let drainDone = true;
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) return;
        if (error) {
          settled = true;
          this.process.stdin.off("error", onError);
          rejectWrite(error);
          return;
        }
        if (callbackDone && drainDone) {
          settled = true;
          this.process.stdin.off("error", onError);
          resolveWrite();
        }
      };
      const onError = (error: Error) => finish(error);
      this.process.stdin.once("error", onError);
      try {
        const canContinue = this.process.stdin.write(line, (error?: Error | null) => {
          callbackDone = true;
          finish(error);
        });
        if (!canContinue) {
          drainDone = false;
          this.process.stdin.once("drain", () => {
            drainDone = true;
            finish();
          });
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private handleClose(code: number | null, signal: NodeJS.Signals | null | undefined): void {
    this.closed = true;
    this.resolveClosed();
    if (this.pending.size > 0) this.fail(new Error(`Pi RPC process closed with pending requests (exit ${code ?? "unknown"}, ${signal ?? "no signal"})`));
    else if (!this.closing && !this.failure) this.fail(new Error(`Pi RPC process exited unexpectedly (exit ${code ?? "unknown"}, ${signal ?? "no signal"})`));
    this.listeners.clear();
  }

  private async waitForClose(timeoutMs: number): Promise<boolean> {
    if (this.closed) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout(false), timeoutMs);
    });
    const closed = this.closedPromise.then(() => true);
    const result = await Promise.race([closed, timeout]);
    if (timer) clearTimeout(timer);
    return result;
  }

  async close(): Promise<void> {
    if (this.closed) {
      this.listeners.clear();
      return;
    }
    this.closing = true;
    await this.writeChain;
    if (!this.stdinEnded) {
      this.stdinEnded = true;
      this.process.stdin.end();
    }
    if (!(await this.waitForClose(RPC_CLOSE_GRACE_MS))) {
      this.process.kill("SIGTERM");
      if (!(await this.waitForClose(RPC_CLOSE_GRACE_MS))) {
        this.process.kill("SIGKILL");
        if (!(await this.waitForClose(RPC_CLOSE_GRACE_MS))) {
          throw new Error("Pi RPC child termination could not be confirmed; retain worktree ownership");
        }
      }
    }
    this.listeners.clear();
  }
}

export function startRpcSession(
  spawner: RpcSpawner,
  invocation: { command: string; args: string[] },
  cwd: string,
  env: NodeJS.ProcessEnv,
): RpcSession {
  return new RpcSessionImplementation(spawner(invocation.command, invocation.args, { cwd, env }));
}

export async function preflightRpcStage(session: RpcSession, expected: RpcStagePreflight): Promise<{
  sessionId: string;
  model: { provider: string; id: string };
  thinkingLevel: string;
}> {
  const stateResponse = await session.request("get_state");
  const state = stateResponse.data as RpcRecord | undefined;
  const observedModel = state?.model as RpcRecord | undefined;
  if (
    typeof state?.sessionId !== "string" ||
    state.isStreaming !== false ||
    typeof state.thinkingLevel !== "string" ||
    typeof observedModel?.provider !== "string" ||
    typeof observedModel.id !== "string"
  ) {
    throw new Error("Pi RPC get_state omitted the session ID, idle state, model, or thinking level");
  }
  if (observedModel.provider !== expected.model.provider || observedModel.id !== expected.model.id) {
    throw new Error(`Pi RPC model mismatch: expected ${expected.model.provider}/${expected.model.id}, observed ${observedModel.provider}/${observedModel.id}`);
  }
  if (state.thinkingLevel !== expected.thinkingLevel) {
    throw new Error(`Pi RPC thinking level mismatch: expected ${expected.thinkingLevel}, observed ${state.thinkingLevel}`);
  }

  const commandsResponse = await session.request("get_commands");
  const commandsData = commandsResponse.data as RpcRecord | undefined;
  const commands = Array.isArray(commandsData?.commands) ? commandsData.commands : [];
  const matchingCommands = commands.filter((command) => (command as RpcRecord)?.name === expected.commandName) as RpcRecord[];
  const command = matchingCommands.length === 1 ? matchingCommands[0] : undefined;
  const sourceInfo = command?.sourceInfo as RpcRecord | undefined;
  if (
    !command ||
    command.source !== "prompt" ||
    !isAbsolute(expected.promptPath) ||
    typeof sourceInfo?.path !== "string" ||
    !isAbsolute(sourceInfo.path) ||
    resolve(sourceInfo.path) !== resolve(expected.promptPath)
  ) {
    throw new Error(`Pi RPC command ${expected.commandName} does not resolve to the expected prompt provenance`);
  }
  return {
    sessionId: state.sessionId,
    model: { provider: observedModel.provider, id: observedModel.id },
    thinkingLevel: state.thinkingLevel,
  };
}

export async function promptRpcStage(session: RpcSession, prompt: string): Promise<RpcRecord> {
  const response = await session.request("prompt", { message: prompt });
  const data = response.data as RpcRecord | undefined;
  if (data?.disposition !== "started") {
    throw new Error(`Pi RPC prompt was not started (disposition: ${String(data?.disposition ?? "missing")})`);
  }
  return response;
}
