import { createLocalBashOperations, formatSize, truncateTail, type BashToolDetails, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";

const BASH_MAX_BYTES = 16 * 1024;
const MCP_MAX_BYTES = 6 * 1024;
const MAX_OUTPUT_LINES = 2_000;

interface CommandOutput {
  text: string;
  truncated: boolean;
  totalBytes: number;
  totalLines: number;
  fullOutputPath?: string;
}

async function captureCommandOutput(
  run: (onData: (data: Buffer) => void) => Promise<number | null>,
  maxBytes: number,
  tempFilePrefix: string,
): Promise<{ exitCode: number | null; output: CommandOutput }> {
  const tempDir = await mkdtemp(join(tmpdir(), `${tempFilePrefix}-`));
  const fullOutputPath = join(tempDir, "output.log");
  const fullOutput = createWriteStream(fullOutputPath);
  const decoder = new TextDecoder();
  let tail = "";
  let totalBytes = 0;
  let totalLines = 0;
  let hasOpenLine = false;

  const append = (data: Buffer): void => {
    totalBytes += data.length;
    fullOutput.write(data);

    const text = decoder.decode(data, { stream: true });
    tail += text;
    if (Buffer.byteLength(tail, "utf8") > maxBytes * 2) {
      tail = Buffer.from(tail, "utf8").subarray(-maxBytes * 2).toString("utf8");
    }

    for (const character of text) {
      if (character === "\n") {
        totalLines++;
        hasOpenLine = false;
      } else {
        hasOpenLine = true;
      }
    }
  };

  let exitCode: number | null;
  try {
    exitCode = await run(append);
  } finally {
    const remaining = decoder.decode();
    tail += remaining;
    for (const character of remaining) {
      if (character === "\n") {
        totalLines++;
        hasOpenLine = false;
      } else {
        hasOpenLine = true;
      }
    }
    await new Promise<void>((resolve, reject) => {
      fullOutput.once("finish", resolve);
      fullOutput.once("error", reject);
      fullOutput.end();
    });
  }

  if (hasOpenLine) totalLines++;
  const truncated = totalBytes > maxBytes || totalLines > MAX_OUTPUT_LINES;
  const preview = truncateTail(tail, { maxBytes, maxLines: MAX_OUTPUT_LINES });

  if (!truncated) {
    await rm(tempDir, { recursive: true, force: true });
  }

  return {
    exitCode,
    output: {
      text: preview.content,
      truncated,
      totalBytes,
      totalLines,
      fullOutputPath: truncated ? fullOutputPath : undefined,
    },
  };
}

function formatOutput(output: CommandOutput): string {
  if (!output.truncated) return output.text || "(no output)";

  return `${output.text}\n\n[Output truncated: showing the last ${formatSize(Buffer.byteLength(output.text, "utf8"))} of ${formatSize(output.totalBytes)} across ${output.totalLines} lines. Full output: ${output.fullOutputPath}]`;
}

function mcpIdentifier(value: string, name: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(`${name} must contain only letters, numbers, dots, underscores, or hyphens`);
  }
  return value;
}

async function runMcpCli(args: string[], signal: AbortSignal | undefined): Promise<{ exitCode: number | null; output: CommandOutput }> {
  return captureCommandOutput(
    (onData) =>
      new Promise<number | null>((resolve, reject) => {
        const child = spawn("mcp-cli", args, { stdio: ["ignore", "pipe", "pipe"] });
        const abort = (): void => child.kill("SIGTERM");

        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
        child.once("error", reject);
        child.once("close", (code) => resolve(code));
        signal?.addEventListener("abort", abort, { once: true });
        child.once("close", () => signal?.removeEventListener("abort", abort));
      }),
    MCP_MAX_BYTES,
    "pi-mcp",
  );
}

export default function (pi: ExtensionAPI) {
  const bashOperations = createLocalBashOperations();

  pi.registerTool({
    name: "bash",
    label: "bash",
    description: "Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to the last 2000 lines or 16KiB, whichever is hit first. If truncated, full output is saved to a temporary file. Optionally provide a timeout in seconds.",
    promptSnippet: "Execute bash commands (ls, grep, find, etc.)",
    parameters: Type.Object({
      command: Type.String({ description: "Bash command to execute" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      let commandError: unknown;
      const result = await captureCommandOutput(
        async (onData) => {
          try {
            return (await bashOperations.exec(params.command, ctx.cwd, { onData, signal, timeout: params.timeout, env: process.env })).exitCode;
          } catch (error) {
            commandError = error;
            return null;
          }
        },
        BASH_MAX_BYTES,
        "pi-bash",
      );

      const text = formatOutput(result.output);
      if (commandError) throw new Error(`${text}\n\n${commandError instanceof Error ? commandError.message : String(commandError)}`);
      if (result.exitCode !== 0 && result.exitCode !== null) throw new Error(`${text}\n\nCommand exited with code ${result.exitCode}`);

      const details: BashToolDetails | undefined = result.output.truncated
        ? {
            truncation: {
              content: result.output.text,
              truncated: true,
              truncatedBy: result.output.totalBytes > BASH_MAX_BYTES ? "bytes" : "lines",
              totalLines: result.output.totalLines,
              totalBytes: result.output.totalBytes,
              outputLines: result.output.text.split("\n").filter(Boolean).length,
              outputBytes: Buffer.byteLength(result.output.text, "utf8"),
              lastLinePartial: false,
              firstLineExceedsLimit: false,
              maxLines: MAX_OUTPUT_LINES,
              maxBytes: BASH_MAX_BYTES,
            },
            fullOutputPath: result.output.fullOutputPath,
          }
        : undefined;

      return { content: [{ type: "text", text }], details };
    },
  });

  pi.registerTool({
    name: "mcps_list",
    label: "MCP list",
    description: "List MCP servers and their tools from the active profile's mcp-cli configuration.",
    promptSnippet: "List configured MCP servers and tools",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      const result = await runMcpCli([], signal);
      const text = formatOutput(result.output);
      if (result.exitCode !== 0 && result.exitCode !== null) throw new Error(text);
      return { content: [{ type: "text", text }], details: result.output };
    },
  });

  pi.registerTool({
    name: "mcps_describe",
    label: "MCP describe",
    description: "Describe an MCP server or one of its tools. Call mcps_list first when the server or tool name is unknown.",
    promptSnippet: "Describe a configured MCP server or tool",
    parameters: Type.Object({
      server: Type.String({ description: "MCP server name" }),
      tool: Type.Optional(Type.String({ description: "MCP tool name; omit to describe the server" })),
    }),
    async execute(_toolCallId, params, signal) {
      const args = ["info", mcpIdentifier(params.server, "server")];
      if (params.tool) args.push(mcpIdentifier(params.tool, "tool"));
      const result = await runMcpCli(args, signal);
      const text = formatOutput(result.output);
      if (result.exitCode !== 0 && result.exitCode !== null) throw new Error(text);
      return { content: [{ type: "text", text }], details: result.output };
    },
  });

  pi.registerTool({
    name: "mcps_call",
    label: "MCP call",
    description: "Call a configured MCP tool with JSON arguments. Output is truncated to the last 2000 lines or 6KiB, whichever is hit first. If truncated, full output is saved to a temporary file.",
    promptSnippet: "Call a configured MCP tool",
    promptGuidelines: ["Use mcps_describe before mcps_call when the MCP tool schema is unknown."],
    parameters: Type.Object({
      server: Type.String({ description: "MCP server name" }),
      tool: Type.String({ description: "MCP tool name" }),
      arguments: Type.Optional(Type.Unknown({ description: "JSON arguments accepted by the MCP tool" })),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await runMcpCli(
        ["call", mcpIdentifier(params.server, "server"), mcpIdentifier(params.tool, "tool"), JSON.stringify(params.arguments ?? {})],
        signal,
      );
      const text = formatOutput(result.output);
      if (result.exitCode !== 0 && result.exitCode !== null) throw new Error(text);
      return { content: [{ type: "text", text }], details: result.output };
    },
  });
}
