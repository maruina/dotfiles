/**
 * Subprocess plumbing for native Pi RPC lifecycle stages.
 * Spawners are injected to keep process behavior testable.
 */

import { randomUUID } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";
import {
  MAX_DECISION_CONTEXT_BYTES,
  parseDecisionResult,
  parseLifecycleOutcomeEnvelope,
  type DecisionResult,
  type LifecycleOutcomeEnvelope,
  type Stage,
} from "./_protocol.ts";

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

export type RpcExit = { code: number | null; signal: NodeJS.Signals | null | undefined; error: string | undefined };

export type RpcSession = {
  request(type: string, fields?: Record<string, unknown>, timeoutMs?: number): Promise<RpcRecord>;
  send(record: RpcRecord): Promise<void>;
  onRecord(listener: (record: RpcRecord) => void): () => void;
  waitForExit(): Promise<RpcExit>;
  terminate(signal: NodeJS.Signals): boolean;
  close(): Promise<void>;
  stderrTail(): string;
};

export type RpcStagePreflight = {
  commandName: string;
  promptPath: string;
  templates?: Array<{ commandName: string; promptPath: string }>;
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

export function buildRpcChildEnvironment(parent: NodeJS.ProcessEnv, configPath: string): NodeJS.ProcessEnv {
  const child = { ...parent };
  delete child.PI_LIFECYCLE_CHILD_CONFIG;
  child.PI_LIFECYCLE_CHILD_CONFIG = configPath;
  return child;
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
  private readonly closedPromise: Promise<RpcExit>;
  private resolveClosed!: (exit: RpcExit) => void;
  private exitRecord: RpcExit | undefined;
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
    if (this.pending.size > 0) this.fail(new Error(`Pi RPC process closed with pending requests (exit ${code ?? "unknown"}, ${signal ?? "no signal"})`));
    else if (!this.closing && !this.failure) this.fail(new Error(`Pi RPC process exited unexpectedly (exit ${code ?? "unknown"}, ${signal ?? "no signal"})`));
    this.exitRecord = { code, signal, error: this.failure?.message };
    this.resolveClosed(this.exitRecord);
    this.listeners.clear();
  }

  waitForExit(): Promise<RpcExit> {
    return this.exitRecord ? Promise.resolve(this.exitRecord) : this.closedPromise;
  }

  terminate(signal: NodeJS.Signals): boolean {
    return this.closed ? false : this.process.kill(signal);
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

export type RpcObservedState = {
  sessionId: string;
  model: { provider: string; id: string };
  thinkingLevel: string;
  messageCount: number;
};

export async function observeRpcState(session: RpcSession): Promise<RpcObservedState> {
  const stateResponse = await session.request("get_state");
  const state = stateResponse.data as RpcRecord | undefined;
  const observedModel = state?.model as RpcRecord | undefined;
  if (
    typeof state?.sessionId !== "string" ||
    state.isStreaming !== false ||
    state.pendingMessageCount !== 0 ||
    typeof state.thinkingLevel !== "string" ||
    typeof state.messageCount !== "number" ||
    typeof observedModel?.provider !== "string" ||
    typeof observedModel.id !== "string"
  ) {
    throw new Error("Pi RPC get_state omitted the session ID, idle state, empty queue, model, or thinking level");
  }
  return {
    sessionId: state.sessionId,
    model: { provider: observedModel.provider, id: observedModel.id },
    thinkingLevel: state.thinkingLevel,
    messageCount: state.messageCount,
  };
}

export async function preflightRpcStage(session: RpcSession, expected: RpcStagePreflight): Promise<RpcObservedState> {
  const state = await observeRpcState(session);
  if (state.messageCount !== 0) throw new Error(`Pi RPC stage session is not fresh (message count: ${state.messageCount})`);
  if (state.model.provider !== expected.model.provider || state.model.id !== expected.model.id) {
    throw new Error(`Pi RPC model mismatch: expected ${expected.model.provider}/${expected.model.id}, observed ${state.model.provider}/${state.model.id}`);
  }
  if (state.thinkingLevel !== expected.thinkingLevel) {
    throw new Error(`Pi RPC thinking level mismatch: expected ${expected.thinkingLevel}, observed ${state.thinkingLevel}`);
  }

  const commandsResponse = await session.request("get_commands");
  const commandsData = commandsResponse.data as RpcRecord | undefined;
  const commands = Array.isArray(commandsData?.commands) ? commandsData.commands : [];
  const targets = [
    { commandName: expected.commandName, promptPath: expected.promptPath },
    ...(expected.templates ?? []),
  ];
  const seenCommands = new Set<string>();
  for (const target of targets) {
    if (seenCommands.has(target.commandName)) throw new Error(`Duplicate lifecycle prompt target: ${target.commandName}`);
    seenCommands.add(target.commandName);
    const matchingCommands = commands.filter((command) => (command as RpcRecord)?.name === target.commandName) as RpcRecord[];
    const command = matchingCommands.length === 1 ? matchingCommands[0] : undefined;
    const sourceInfo = command?.sourceInfo as RpcRecord | undefined;
    if (
      !command ||
      command.source !== "prompt" ||
      !isAbsolute(target.promptPath) ||
      typeof sourceInfo?.path !== "string" ||
      !isAbsolute(sourceInfo.path) ||
      canonicalFilePath(sourceInfo.path) !== canonicalFilePath(target.promptPath)
    ) {
      throw new Error(`Pi RPC command ${target.commandName} does not resolve to the expected prompt provenance`);
    }
  }
  return state;
}

function canonicalFilePath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export async function promptRpcStage(session: RpcSession, prompt: string): Promise<RpcRecord> {
  const response = await session.request("prompt", { message: prompt });
  const data = response.data as RpcRecord | undefined;
  if (data?.disposition !== "started") {
    throw new Error(`Pi RPC prompt was not started (disposition: ${String(data?.disposition ?? "missing")})`);
  }
  return response;
}

export type RpcStageUI = {
  select(title: string, options: string[]): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  editor(title: string, prefill?: string): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
  setStatus(key: string, text: string | undefined): void;
};

export type RpcStageDecision = {
  uiRequestId: string;
  toolCallId?: string;
  stage: Stage;
  sessionId: string;
  model: { provider: string; id: string };
  decision: "approved" | "rejected" | "cancelled";
  title: string;
  question?: string;
  evidence?: string;
  proposal?: string;
  context?: string;
};

type RpcStageBase = {
  promptStarted: boolean;
  observed: RpcObservedState | undefined;
  decisions: RpcStageDecision[];
  progress: string[];
  stderr: string;
  terminationConfirmed: boolean;
};

export type RpcLifecycleStageResult =
  | (RpcStageBase & { status: "settled"; outcome: LifecycleOutcomeEnvelope })
  | (RpcStageBase & { status: "blocked" | "cancelled" | "failure"; reason: string });

export type RpcLifecycleStageOptions = RpcStagePreflight & {
  runId: string;
  stage: Stage;
  bridgePath: string;
  configPath: string;
  prompt: string;
};

export type RpcStageCallbacks = {
  onObserved?(state: RpcObservedState): void | Promise<void>;
  onProgress?(message: string): void;
  onWaitingForUser?(waiting: boolean, title?: string): void;
  onDecision?(decision: RpcStageDecision): void;
};

const MAX_PROGRESS_ENTRIES = 100;
const MAX_PROGRESS_BYTES = 512;
const MAX_UI_OPTIONS = 100;
const MAX_UI_LABEL_BYTES = 1024;

function boundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== "string") return "";
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let prefix = Buffer.from(value, "utf8").subarray(0, Math.max(0, maxBytes - 3)).toString("utf8");
  if (prefix.endsWith("\uFFFD")) prefix = prefix.slice(0, -1);
  return `${prefix}…`;
}

function decisionTitle(stage: Stage, result: DecisionResult): string {
  return [
    `${stage} decision — ${result.question}`,
    `Evidence: ${result.evidence}`,
    `Proposal: ${result.proposal}`,
    `Context: ${result.context}`,
  ].join("\n\n");
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

async function waitForPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<{ done: true; value: T } | { done: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ done: false }>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ done: false }), timeoutMs);
  });
  const result = await Promise.race([promise.then((value) => ({ done: true as const, value })), timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

export async function runRpcLifecycleStage(
  spawner: RpcSpawner,
  invocation: { command: string; args: string[] },
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: RpcLifecycleStageOptions,
  ui: RpcStageUI,
  signal?: AbortSignal,
  callbacks: RpcStageCallbacks = {},
): Promise<RpcLifecycleStageResult> {
  const decisions: RpcStageDecision[] = [];
  const progress: string[] = [];
  let promptStarted = false;
  let promptAttempted = false;
  let observed: RpcObservedState | undefined;
  let stderr = "";
  let terminationConfirmed = true;
  let session: RpcSession | undefined;
  let unsubscribe: (() => void) | undefined;
  let failure: string | undefined;
  let cancelled = false;
  let rejection: string | undefined;
  let finalOutcome: LifecycleOutcomeEnvelope | undefined;
  let settledRecord: RpcRecord | undefined;
  let agentStarted = false;
  let activeDecisionToolCallId: string | undefined;
  let activeLifecycleDialog: { toolCallId: string; title: string; userAnswer?: string; uiRequestId: string } | undefined;
  let activeUI: {
    id: string;
    method: string;
    responseSent: boolean;
    cancelResolve: () => void;
    lifecycleDecision: boolean;
    title: string;
  } | undefined;
  let uiTask: Promise<void> | undefined;
  let abortRequest: Promise<void> = Promise.resolve();
  let abortRequested = false;
  let eventChain: Promise<void> = Promise.resolve();
  const toolCalls = new Map<string, string>();
  const settled = deferred<RpcRecord>();
  const failed = deferred<string>();

  const recordProgress = (message: string) => {
    const bounded = boundedText(message, MAX_PROGRESS_BYTES);
    if (!bounded || progress.length >= MAX_PROGRESS_ENTRIES || progress.at(-1) === bounded) return;
    progress.push(bounded);
    callbacks.onProgress?.(bounded);
  };

  const requestAbort = () => {
    if (!session || abortRequested || !promptAttempted) return;
    abortRequested = true;
    const activeSession = session;
    abortRequest = (async () => {
      void activeSession.request("abort", {}, 5_000).catch(() => undefined);
      if ((await waitForPromise(settled.promise, 5_000)).done) return;
      activeSession.terminate("SIGTERM");
      if ((await waitForPromise(activeSession.waitForExit(), 5_000)).done) return;
      activeSession.terminate("SIGKILL");
      if ((await waitForPromise(activeSession.waitForExit(), 5_000)).done) return;
      terminationConfirmed = false;
      failure ??= "Pi RPC child did not close after SIGKILL; retain worktree ownership for manual recovery";
      failed.resolve(failure);
    })();
  };

  const sendUiResponse = async (record: RpcRecord, response: RpcRecord) => {
    if (!activeUI || activeUI.id !== record.id || activeUI.responseSent) return;
    activeUI.responseSent = true;
    await session!.send({ type: "extension_ui_response", id: activeUI.id, ...response });
  };

  const cancelPendingUI = (reason: string, userCancelled = false) => {
    if (!activeUI) return;
    const pending = activeUI;
    pending.cancelResolve();
    if (!pending.responseSent && session) {
      pending.responseSent = true;
      void session.send({ type: "extension_ui_response", id: pending.id, cancelled: true }).catch(() => undefined);
    }
    if (userCancelled && pending.lifecycleDecision && activeLifecycleDialog && !activeLifecycleDialog.userAnswer) {
      const decision: RpcStageDecision = {
        uiRequestId: pending.id,
        toolCallId: pending.lifecycleDecision ? activeLifecycleDialog.toolCallId : undefined,
        stage: options.stage,
        sessionId: observed?.sessionId ?? "unknown",
        model: { ...options.model },
        decision: "cancelled",
        title: pending.title,
      };
      decisions.push(decision);
      try {
        callbacks.onDecision?.(decision);
      } catch (error) {
        failure ??= boundedText(error instanceof Error ? error.message : String(error), 2_000);
        failed.resolve(failure);
      }
      activeLifecycleDialog = undefined;
    }
    if (userCancelled) cancelled = true;
    else {
      failure ??= reason;
      failed.resolve(failure);
    }
    requestAbort();
  };

  const onAbort = () => {
    cancelled = true;
    cancelPendingUI("Lifecycle stage was cancelled by the coordinator", true);
    requestAbort();
  };

  const fail = (error: unknown) => {
    if (failure) return;
    failure = error instanceof Error ? error.message : String(error);
    failure = boundedText(failure, 2_000);
    failed.resolve(failure);
    if (activeUI) cancelPendingUI(failure);
    else requestAbort();
  };

  const handleUiRequest = async (record: RpcRecord): Promise<void> => {
    if (typeof record.id !== "string" || !record.id || typeof record.method !== "string") {
      throw new Error("Pi RPC extension UI request is missing its ID or method");
    }
    const method = record.method;
    if (method === "notify") {
      const message = boundedText(record.message, MAX_PROGRESS_BYTES);
      if (!message) throw new Error("Pi RPC notify request has no message");
      const type = record.notifyType === "warning" || record.notifyType === "error" ? record.notifyType : "info";
      ui.notify(message, type);
      return;
    }
    if (method === "setStatus") {
      if (record.statusText !== undefined && typeof record.statusText !== "string") throw new Error("Pi RPC status request has invalid text");
      ui.setStatus("lifecycle-child", boundedText(record.statusText, MAX_PROGRESS_BYTES) || undefined);
      return;
    }

    const dialogMethods = new Set(["select", "confirm", "input", "editor"]);
    if (!dialogMethods.has(method)) throw new Error(`Unsupported Pi RPC extension UI method: ${method}`);
    if (activeUI) throw new Error("Pi RPC child requested more than one outstanding UI dialog");

    const title = record.title;
    if (typeof title !== "string" || !title) throw new Error(`Pi RPC ${method} dialog has no title`);
    const lifecycleDecision = activeDecisionToolCallId !== undefined;
    if (Buffer.byteLength(title, "utf8") > MAX_DECISION_CONTEXT_BYTES) {
      throw new Error(`Pi RPC UI dialog context exceeds ${MAX_DECISION_CONTEXT_BYTES} bytes`);
    }
    if (lifecycleDecision && method !== "select") throw new Error("Lifecycle decision must use the structured select dialog");

    let resolveCancelled!: () => void;
    const cancelledPromise = new Promise<void>((resolveCancelledPromise) => {
      resolveCancelled = resolveCancelledPromise;
    });
    const pending = {
      id: record.id,
      method,
      responseSent: false,
      cancelResolve: resolveCancelled,
      lifecycleDecision,
      title,
    };
    activeUI = pending;
    let uiResponse: RpcRecord | undefined;
    let answer: unknown;

    if (method === "select") {
      if (!Array.isArray(record.options) || record.options.length === 0 || record.options.length > MAX_UI_OPTIONS ||
        record.options.some((option) => typeof option !== "string" || !option || Buffer.byteLength(option, "utf8") > MAX_UI_LABEL_BYTES) ||
        new Set(record.options).size !== record.options.length) {
        throw new Error("Pi RPC select dialog has invalid or excessive options");
      }
      const optionsList = record.options as string[];
      if (lifecycleDecision && (optionsList.length !== 2 || optionsList[0] !== "Approve" || optionsList[1] !== "Reject")) {
        throw new Error("Lifecycle decision dialog has an unexpected option set");
      }
      const toolCallId = activeDecisionToolCallId;
      if (lifecycleDecision && !toolCallId) throw new Error("Lifecycle decision dialog has no correlated tool call");
      if (lifecycleDecision) activeLifecycleDialog = { toolCallId: toolCallId!, title, uiRequestId: record.id };
      callbacks.onWaitingForUser?.(true, title);
      ui.setStatus("lifecycle-stage", `${options.stage}: waiting for user decision`);
      recordProgress(`${options.stage}: waiting for user decision`);
      const selection = ui.select(title, optionsList);
      answer = await Promise.race([selection, cancelledPromise.then(() => undefined)]);
      if (pending.responseSent) {
        activeUI = undefined;
        return;
      }
      if (lifecycleDecision) {
        if (answer === "Approve") {
          uiResponse = { value: answer };
          activeLifecycleDialog!.userAnswer = answer;
          const decisionRecord: RpcStageDecision = { uiRequestId: record.id, toolCallId: toolCallId!, stage: options.stage, sessionId: observed?.sessionId ?? "unknown", model: { ...options.model }, decision: "approved", title };
          decisions.push(decisionRecord);
          callbacks.onDecision?.(decisionRecord);
        } else if (answer === "Reject") {
          uiResponse = { value: answer };
          activeLifecycleDialog!.userAnswer = answer;
          rejection = `User rejected lifecycle decision: ${title}`;
          const decisionRecord: RpcStageDecision = { uiRequestId: record.id, toolCallId: toolCallId!, stage: options.stage, sessionId: observed?.sessionId ?? "unknown", model: { ...options.model }, decision: "rejected", title };
          decisions.push(decisionRecord);
          callbacks.onDecision?.(decisionRecord);
        } else {
          uiResponse = { cancelled: true };
          cancelled = true;
          const decisionRecord: RpcStageDecision = { uiRequestId: record.id, toolCallId: toolCallId!, stage: options.stage, sessionId: observed?.sessionId ?? "unknown", model: { ...options.model }, decision: "cancelled", title };
          decisions.push(decisionRecord);
          callbacks.onDecision?.(decisionRecord);
        }
      } else if (answer === undefined) {
        uiResponse = { cancelled: true };
      } else if (typeof answer === "string" && optionsList.includes(answer)) {
        uiResponse = { value: answer };
      } else {
        throw new Error("Pi TUI returned a value that was not present in the child select options");
      }
    } else if (method === "confirm") {
      if (typeof record.message !== "string" || Buffer.byteLength(record.message, "utf8") > MAX_DECISION_CONTEXT_BYTES) {
        throw new Error("Pi RPC confirm dialog has invalid message text");
      }
      answer = await Promise.race([ui.confirm(title, record.message), cancelledPromise.then(() => undefined)]);
      uiResponse = typeof answer === "boolean" ? { confirmed: answer } : { cancelled: true };
    } else if (method === "input") {
      if (record.placeholder !== undefined && typeof record.placeholder !== "string") throw new Error("Pi RPC input dialog has invalid placeholder");
      answer = await Promise.race([ui.input(title, record.placeholder as string | undefined), cancelledPromise.then(() => undefined)]);
      uiResponse = typeof answer === "string" ? { value: answer } : { cancelled: true };
    } else {
      if (record.prefill !== undefined && typeof record.prefill !== "string") throw new Error("Pi RPC editor dialog has invalid prefill");
      answer = await Promise.race([ui.editor(title, record.prefill as string | undefined), cancelledPromise.then(() => undefined)]);
      uiResponse = typeof answer === "string" ? { value: answer } : { cancelled: true };
    }

    await sendUiResponse(record, uiResponse ?? { cancelled: true });
    callbacks.onWaitingForUser?.(false);
    if (lifecycleDecision && (answer === "Reject" || answer === undefined)) requestAbort();
    if (!lifecycleDecision) ui.setStatus("lifecycle-stage", `${options.stage}: running`);
    activeUI = undefined;
  };

  const handleRecord = async (record: RpcRecord): Promise<void> => {
    if (record.type === "extension_ui_request") {
      const task = handleUiRequest(record).catch(fail).finally(() => {
        if (uiTask === task) uiTask = undefined;
      });
      uiTask = task;
      return;
    }
    if (record.type === "extension_error") {
      throw new Error(`Pi RPC extension error: ${boundedText(record.error, 1_500)}`);
    }
    if (record.type === "auto_retry_end" && record.success === false) {
      throw new Error(`Pi RPC provider retry failed: ${boundedText(record.finalError, 1_500)}`);
    }
    const endedMessage = record.message as RpcRecord | undefined;
    if (record.type === "message_end" && endedMessage?.role === "assistant" && endedMessage.stopReason === "error") {
      throw new Error(`Pi RPC assistant turn failed: ${boundedText(endedMessage.errorMessage, 1_500)}`);
    }
    if (record.type === "agent_start") {
      agentStarted = true;
      recordProgress(`${options.stage}: agent started`);
    }
    if (record.type === "tool_execution_start") {
      if (typeof record.toolCallId !== "string" || typeof record.toolName !== "string") throw new Error("Pi RPC tool start event is malformed");
      if (toolCalls.has(record.toolCallId)) throw new Error(`Duplicate Pi RPC tool call ID: ${record.toolCallId}`);
      if (record.toolName === "lifecycle_request_decision") {
        if (activeDecisionToolCallId) throw new Error("More than one lifecycle decision tool call is active");
        activeDecisionToolCallId = record.toolCallId;
      }
      if (record.toolName === "lifecycle_submit_outcome" && finalOutcome) throw new Error("Lifecycle outcome was submitted more than once");
      toolCalls.set(record.toolCallId, record.toolName);
      recordProgress(`${options.stage}: ${boundedText(record.toolName, 128)} started`);
    }
    if (record.type === "tool_execution_end") {
      if (typeof record.toolCallId !== "string" || toolCalls.get(record.toolCallId) !== record.toolName) {
        throw new Error(`Pi RPC ${String(record.toolName)} result has no matching tool start`);
      }
      toolCalls.delete(record.toolCallId);
      if (record.toolName !== "lifecycle_request_decision" && record.toolName !== "lifecycle_submit_outcome") return;
      if (typeof record.isError !== "boolean") throw new Error(`Pi RPC ${record.toolName} result omitted its error state`);
      const details = (record.result as RpcRecord | undefined)?.details;
      if (record.toolName === "lifecycle_request_decision") {
        const result = parseDecisionResult(details, {
          runId: options.runId,
          stage: options.stage,
          sessionId: observed!.sessionId,
          model: options.model,
          requestId: record.toolCallId,
        });
        const uiDecision = decisions.find((decision) => decision.toolCallId === record.toolCallId);
        if (!uiDecision || uiDecision.title !== decisionTitle(options.stage, result) || uiDecision.decision !== result.decision) {
          throw new Error("Lifecycle decision result does not match the correlated user response and displayed context");
        }
        Object.assign(uiDecision, {
          question: result.question,
          evidence: result.evidence,
          proposal: result.proposal,
          context: result.context,
        });
        callbacks.onDecision?.(uiDecision);
        if (record.isError !== (result.decision !== "approved")) throw new Error("Lifecycle decision error state contradicts the user decision");
        activeDecisionToolCallId = undefined;
        activeLifecycleDialog = undefined;
        if (result.decision === "rejected") {
          rejection = `User rejected lifecycle decision: ${result.question}`;
          requestAbort();
        } else if (result.decision === "cancelled") {
          cancelled = true;
          requestAbort();
        }
      } else {
        if (record.isError) throw new Error("Lifecycle outcome tool returned an error");
        if (finalOutcome) throw new Error("Lifecycle outcome was submitted more than once");
        finalOutcome = parseLifecycleOutcomeEnvelope(details, {
          runId: options.runId,
          stage: options.stage,
          sessionId: observed!.sessionId,
          model: options.model,
        });
      }
    }
    if (record.type === "agent_settled") {
      if (!agentStarted) throw new Error("Pi RPC agent_settled without an agent_start event");
      if (record.aborted === true) cancelled = true;
      if (activeUI && !activeUI.responseSent) cancelPendingUI("Pi RPC settled while a child UI dialog was pending");
    }
  };

  const resultBase = (): RpcStageBase => ({
    promptStarted,
    observed,
    decisions,
    progress,
    stderr,
    terminationConfirmed,
  });

  if (signal?.aborted) {
    return { ...resultBase(), status: "cancelled", reason: "Lifecycle run was cancelled before stage startup" };
  }

  try {
    session = startRpcSession(spawner, invocation, cwd, env);
    unsubscribe = session.onRecord((record) => {
      if (record.type === "agent_settled" && !settledRecord) {
        settledRecord = record;
        settled.resolve(record);
      }
      eventChain = eventChain.then(() => handleRecord(record)).catch(fail);
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    observed = await preflightRpcStage(session, options);
    if (cancelled || signal?.aborted) throw new Error("Lifecycle run was cancelled before the stage prompt started");
    if (observed.model.provider !== options.model.provider || observed.model.id !== options.model.id || observed.thinkingLevel !== options.thinkingLevel) {
      throw new Error("Pi RPC preflight returned unexpected observed settings");
    }
    await callbacks.onObserved?.(observed);
    recordProgress(`${options.stage}: running ${observed.model.provider}/${observed.model.id} (${observed.thinkingLevel})`);
    ui.setStatus("lifecycle-stage", `${options.stage}: running ${observed.model.provider}/${observed.model.id} (${observed.thinkingLevel})`);
    promptAttempted = true;
    await promptRpcStage(session, options.prompt);
    promptStarted = true;
    recordProgress(`${options.stage}: native prompt started`);

    const waitResult = await Promise.race([
      settled.promise.then((record) => ({ kind: "settled" as const, record })),
      failed.promise.then((reason) => ({ kind: "failure" as const, reason })),
      session.waitForExit().then((exit) => ({ kind: "exit" as const, exit })),
    ]);
    if (waitResult.kind === "exit") {
      throw new Error(waitResult.exit.error ?? `Pi RPC child exited before agent_settled (exit ${waitResult.exit.code ?? "unknown"}, ${waitResult.exit.signal ?? "no signal"})`);
    }
    if (waitResult.kind === "failure") throw new Error(waitResult.reason);
    await eventChain;
    if (uiTask) await uiTask;
    if (failure) throw new Error(failure);
    if (activeUI || activeDecisionToolCallId || toolCalls.size > 0) throw new Error("Pi RPC agent_settled with a pending UI request or lifecycle tool call");
    if (waitResult.record.aborted === true || cancelled) throw new Error("Lifecycle stage was cancelled");
    if (rejection) throw new Error(rejection);
    if (!finalOutcome) throw new Error("Pi RPC agent_settled without one structured lifecycle outcome");

    const finalState = await observeRpcState(session);
    if (
      finalState.sessionId !== observed.sessionId || finalState.model.provider !== observed.model.provider ||
      finalState.model.id !== observed.model.id || finalState.thinkingLevel !== observed.thinkingLevel
    ) {
      throw new Error("Pi RPC stage model, thinking level, or session identity changed before settlement");
    }
    recordProgress(`${options.stage}: settled with ${finalOutcome.outcome}`);
  } catch (error) {
    if (cancelled && !failure) failure = undefined;
    else fail(error);
  } finally {
    signal?.removeEventListener("abort", onAbort);
    unsubscribe?.();
    try {
      await abortRequest;
      if (session && terminationConfirmed) await session.close();
    } catch (error) {
      terminationConfirmed = false;
      failure = boundedText(`Pi RPC child termination could not be confirmed: ${error instanceof Error ? error.message : String(error)}`, 2_000);
    }
    stderr = session?.stderrTail() ?? "";
    try {
      ui.setStatus("lifecycle-stage", undefined);
      ui.setStatus("lifecycle-child", undefined);
    } catch {
      // UI cleanup does not change the child termination result.
    }
  }

  const base = resultBase();
  if (!terminationConfirmed) return { ...base, status: "failure", reason: failure ?? "Pi RPC child termination could not be confirmed" };
  if (rejection) return { ...base, status: "blocked", reason: rejection };
  if (cancelled) return { ...base, status: "cancelled", reason: "Lifecycle stage was cancelled by the user or coordinator" };
  if (failure) return { ...base, status: "failure", reason: failure };
  if (!finalOutcome) return { ...base, status: "failure", reason: "Pi RPC stage completed without a structured outcome" };
  return { ...base, status: "settled", outcome: finalOutcome };
}
