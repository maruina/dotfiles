/**
 * Subprocess plumbing for /ship stages: resolve the pi invocation, build the
 * stage argv, and accumulate the JSON event stream into a StageResult. The
 * spawner is injected so parsing and classification are unit-testable.
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";

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
