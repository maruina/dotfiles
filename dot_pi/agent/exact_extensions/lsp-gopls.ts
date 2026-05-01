/**
 * LSP gopls Extension
 *
 * Spawns gopls as a JSON-RPC language server and exposes LSP operations
 * as pi tools. Provides go-to-definition, find references, hover,
 * document symbols, and diagnostics for Go code.
 *
 * Usage: Copy to ~/.pi/agent/extensions/ or .pi/extensions/ for auto-discovery.
 * Or test with: pi -e /path/to/lsp-gopls.ts
 */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { cwd as cwdFn } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── JSON-RPC types ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ── LSP types (minimal, only what we need) ─────────────────────────────────

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Location {
  uri: string;
  range: Range;
}

interface Diagnostic {
  range: Range;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
}

interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

interface Hover {
  contents:
    | { kind: string; value: string }
    | { language: string; value: string }
    | string
    | Array<{ kind: string; value: string } | { language: string; value: string } | string>;
  range?: Range;
}

interface InitializeResult {
  capabilities: Record<string, unknown>;
  serverInfo?: { name: string; version?: string };
}

// ── JSON-RPC client ─────────────────────────────────────────────────────────

class LspClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private messageId = 0;
  private pending = new Map<number | string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private buffer = "";
  private workspaceRoot: string;
  private initialized = false;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = resolve(workspaceRoot);
  }

  async start(): Promise<InitializeResult> {
    this.process = spawn("gopls", ["serve"], {
      cwd: this.workspaceRoot,
      env: { ...process.env, GOPATH: process.env.GOPATH || "" },
    });

    this.process.stdout.on("data", (chunk: Buffer) => this.onData(chunk.toString()));
    this.process.stderr.on("data", (chunk: Buffer) => {
      // gopls logs to stderr; ignore unless debugging
    });

    return new Promise((resolve, reject) => {
      this.process!.on("error", (err) => reject(err));
      this.process!.on("exit", (code) => {
        if (!this.initialized) {
          reject(new Error(`gopls exited with code ${code ?? "unknown"} before initialization`));
        }
      });

      this.initialize().then(resolve, reject);
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const headerBlock = this.buffer.slice(0, headerEnd);
      let contentLength = 0;
      for (const line of headerBlock.split("\r\n")) {
        const [key, val] = line.split(": ", 2);
        if (key.toLowerCase() === "content-length") {
          contentLength = parseInt(val, 10);
        }
      }

      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) return;

      const body = this.buffer.slice(bodyStart, bodyStart + contentLength);
      this.buffer = this.buffer.slice(bodyStart + contentLength);

      try {
        const msg = JSON.parse(body) as JsonRpcMessage;
        this.onMessage(msg);
      } catch {
        // Malformed JSON; skip
      }
    }
  }

  private onMessage(msg: JsonRpcMessage) {
    // Response to our request
    if ("id" in msg && msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        this.pending.delete(msg.id);
        if ("error" in msg && msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve((msg as JsonRpcResponse).result);
        }
      }
      return;
    }

    // Notification from server
    if ("method" in msg && !("id" in msg)) {
      // Window/logMessage, telemetry, etc. — ignore for now
    }
  }

  private send(msg: JsonRpcRequest | JsonRpcNotification) {
    const body = JSON.stringify(msg);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.process?.stdin.write(header + body);
  }

  private async request<T>(method: string, params: unknown): Promise<T> {
    const id = ++this.messageId;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.send(req);
    });
  }

  private async initialize(): Promise<InitializeResult> {
    const result = await this.request<InitializeResult>("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.workspaceRoot).href,
      workspaceFolders: [
        { uri: pathToFileURL(this.workspaceRoot).href, name: basename(this.workspaceRoot) },
      ],
      capabilities: {
        textDocument: {
          synchronization: { didOpen: true, didClose: true },
          hover: { contentFormat: ["plaintext"] },
          definition: { linkSupport: false },
          references: {},
          publishDiagnostics: { relatedInformation: false },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
        },
        workspace: {
          workspaceFolders: true,
        },
      },
      initializationOptions: {
        // gopls-specific: skip workspace scan for speed
        analyses: {},
        hints: {},
      },
    });

    // Send initialized notification
    this.send({ jsonrpc: "2.0", method: "initialized", params: {} });
    this.initialized = true;
    return result;
  }

  async openDocument(filePath: string) {
    const uri = pathToFileURL(filePath).href;
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      content = "";
    }
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: { uri, languageId: "go", version: 1, text: content },
      },
    });
  }

  async closeDocument(filePath: string) {
    const uri = pathToFileURL(filePath).href;
    this.send({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri } },
    });
  }

  async goToDefinition(filePath: string, line: number, character: number): Promise<Location[]> {
    await this.openDocument(filePath);
    const uri = pathToFileURL(filePath).href;
    const position = toGoplsPosition(line, character);

    const result = await this.request<Location | Location[] | null>(
      "textDocument/definition",
      { textDocument: { uri }, position },
    );

    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  async findReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    await this.openDocument(filePath);
    const uri = pathToFileURL(filePath).href;
    const position = toGoplsPosition(line, character);

    const result = await this.request<Location[] | null>(
      "textDocument/references",
      { textDocument: { uri }, position, context: { includeDeclaration: true } },
    );

    return result ?? [];
  }

  async hover(filePath: string, line: number, character: number): Promise<string> {
    await this.openDocument(filePath);
    const uri = pathToFileURL(filePath).href;
    const position = toGoplsPosition(line, character);

    const result = await this.request<Hover | null>(
      "textDocument/hover",
      { textDocument: { uri }, position },
    );

    if (!result) return "";
    return extractHoverContent(result.contents);
  }

  async documentSymbols(filePath: string): Promise<DocumentSymbol[]> {
    await this.openDocument(filePath);
    const uri = pathToFileURL(filePath).href;

    const result = await this.request<DocumentSymbol[] | SymbolInformation[] | null>(
      "textDocument/documentSymbol",
      { textDocument: { uri } },
    );

    return (result as DocumentSymbol[]) ?? [];
  }

  async diagnostics(filePath?: string): Promise<Map<string, Diagnostic[]>> {
    if (filePath) {
      await this.openDocument(filePath);
    }

    // Request workspace diagnostics
    const result = await this.request<{ items: Diagnostic[] } | Diagnostic[] | null>(
      "workspace/diagnostic",
      { previousResultIds: [] },
    );

    const diagnostics = new Map<string, Diagnostic[]>();
    if (Array.isArray(result)) {
      if (filePath) {
        diagnostics.set(filePath, result);
      }
    } else if (result?.items) {
      if (filePath) {
        diagnostics.set(filePath, result.items);
      }
    }

    return diagnostics;
  }

  async workspaceSymbols(query: string): Promise<SymbolInformation[]> {
    const result = await this.request<SymbolInformation[] | null>(
      "workspace/symbol",
      { query },
    );

    return result ?? [];
  }

  async shutdown() {
    if (!this.process) return;
    try {
      await this.request("shutdown", {});
      this.send({ jsonrpc: "2.0", method: "exit" });
    } catch {
      // Server may already be gone
    }
    this.process.kill();
    this.process = null;
    this.initialized = false;
    // Reject all pending
    for (const [, p] of this.pending) {
      p.reject(new Error("LSP client shut down"));
    }
    this.pending.clear();
  }

  get isRunning() {
    return this.process !== null && !this.process.killed;
  }

  get isInitialized() {
    return this.initialized;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert 1-indexed line/char (user-facing) to 0-indexed LSP Position.
 * gopls uses UTF-16 code units for character offset.
 */
function toGoplsPosition(line: number, character: number): Position {
  return { line: line - 1, character: character - 1 };
}

function uriToPath(uri: string): string {
  try {
    return fileURLToPath(uri);
  } catch {
    return uri;
  }
}

function extractHoverContent(
  contents: Hover["contents"],
): string {
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents)) {
    return contents
      .map((c) => {
        if (typeof c === "string") return c;
        if ("value" in c) return c.value;
        return "";
      })
      .filter(Boolean)
      .join("\n\n");
  }
  if ("value" in contents) return contents.value;
  return "";
}

function formatLocation(loc: Location, workspaceRoot: string): string {
  const path = uriToPath(loc.uri);
  const relPath = isAbsolute(path) && path.startsWith(workspaceRoot)
    ? "." + path.slice(workspaceRoot.length)
    : path;
  const line = loc.range.start.line + 1;
  const col = loc.range.start.character + 1;
  return `${relPath}:${line}:${col}`;
}

/**
 * Resolve file path relative to workspace root.
 */
function resolvePath(input: string, workspaceRoot: string): string {
  if (isAbsolute(input)) return input;
  return resolve(workspaceRoot, input);
}

/**
 * Check if gopls is available on PATH.
 */
function findGopls(): string | null {
  const paths = (process.env.PATH || "").split(":");
  const exts = process.platform === "win32" ? ["", ".exe"] : [""];
  for (const dir of paths) {
    for (const ext of exts) {
      const p = join(dir, "gopls" + ext);
      try {
        statSync(p);
        return p;
      } catch {
        // not found
      }
    }
  }
  return null;
}

// ── Extension ───────────────────────────────────────────────────────────────

interface LspState {
  workspaceRoot: string;
  serverVersion?: string;
}

export default function lspGoplsExtension(pi: ExtensionAPI) {
  let client: LspClient | null = null;
  let workspaceRoot: string;

  // Determine workspace root: use current working directory
  workspaceRoot = resolve(cwdFn());

  // Restore state from session
  pi.on("session_start", async (_event, ctx) => {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === "lsp-gopls-state") {
        const data = entry.data as LspState | undefined;
        if (data?.workspaceRoot) {
          workspaceRoot = data.workspaceRoot;
        }
      }
    }
  });

  function persistState() {
    pi.appendEntry<LspState>("lsp-gopls-state", { workspaceRoot });
  }

  async function ensureClient(): Promise<LspClient> {
    if (client?.isRunning && client.isInitialized) return client;

    const goplsPath = findGopls();
    if (!goplsPath) {
      throw new Error("gopls not found on PATH. Install with: go install golang.org/x/tools/gopls@latest");
    }

    // Clean up old client
    if (client) {
      try { await client.shutdown(); } catch { /* ignore */ }
    }

    client = new LspClient(workspaceRoot);
    const info = await client.start();
    persistState();
    return client;
  }

  // ── Tools ───────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "lsp_go_to_definition",
    label: "Go to Definition",
    description: "Find where a symbol is defined using gopls. Provide file path and 1-indexed line/column.",
    parameters: Type.Object({
      file: Type.String({ description: "File path (relative to workspace root or absolute)" }),
      line: Type.Integer({ description: "1-indexed line number" }),
      column: Type.Integer({ description: "1-indexed column number" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const c = await ensureClient();
        const filePath = resolvePath(params.file, workspaceRoot);
        const locations = await c.goToDefinition(filePath, params.line, params.column);

        if (locations.length === 0) {
          return {
            content: [{ type: "text", text: `No definition found at ${params.file}:${params.line}:${params.column}` }],
            details: { locations: [] },
          };
        }

        const lines = locations.map((loc) => formatLocation(loc, workspaceRoot));
        const text = `Definition found:\n${lines.join("\n")}`;
        return {
          content: [{ type: "text", text }],
          details: { locations: locations.map((loc) => ({
            path: uriToPath(loc.uri),
            line: loc.range.start.line + 1,
            column: loc.range.start.character + 1,
          })) },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `lsp_go_to_definition error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "lsp_find_references",
    label: "Find References",
    description: "Find all references to a symbol using gopls. Provide file path and 1-indexed line/column.",
    parameters: Type.Object({
      file: Type.String({ description: "File path (relative to workspace root or absolute)" }),
      line: Type.Integer({ description: "1-indexed line number" }),
      column: Type.Integer({ description: "1-indexed column number" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const c = await ensureClient();
        const filePath = resolvePath(params.file, workspaceRoot);
        const locations = await c.findReferences(filePath, params.line, params.column);

        if (locations.length === 0) {
          return {
            content: [{ type: "text", text: `No references found at ${params.file}:${params.line}:${params.column}` }],
            details: { locations: [] },
          };
        }

        const lines = locations.map((loc) => formatLocation(loc, workspaceRoot));
        const text = `References found (${locations.length}):\n${lines.join("\n")}`;
        return {
          content: [{ type: "text", text }],
          details: { locations: locations.map((loc) => ({
            path: uriToPath(loc.uri),
            line: loc.range.start.line + 1,
            column: loc.range.start.character + 1,
          })) },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `lsp_find_references error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "lsp_hover",
    label: "LSP Hover",
    description: "Get type information and documentation for a symbol using gopls. Provide file path and 1-indexed line/column.",
    parameters: Type.Object({
      file: Type.String({ description: "File path (relative to workspace root or absolute)" }),
      line: Type.Integer({ description: "1-indexed line number" }),
      column: Type.Integer({ description: "1-indexed column number" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const c = await ensureClient();
        const filePath = resolvePath(params.file, workspaceRoot);
        const hoverText = await c.hover(filePath, params.line, params.column);

        if (!hoverText) {
          return {
            content: [{ type: "text", text: `No hover information at ${params.file}:${params.line}:${params.column}` }],
            details: {},
          };
        }

        return {
          content: [{ type: "text", text: hoverText }],
          details: {},
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `lsp_hover error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "lsp_document_symbols",
    label: "Document Symbols",
    description: "List all symbols (types, functions, variables) in a Go file using gopls.",
    parameters: Type.Object({
      file: Type.String({ description: "File path (relative to workspace root or absolute)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const c = await ensureClient();
        const filePath = resolvePath(params.file, workspaceRoot);
        const symbols = await c.documentSymbols(filePath);

        if (symbols.length === 0) {
          return {
            content: [{ type: "text", text: `No symbols found in ${params.file}` }],
            details: { symbols: [] },
          };
        }

        const lines = formatSymbols(symbols);
        const text = `Symbols in ${params.file}:\n${lines.join("\n")}`;
        return {
          content: [{ type: "text", text }],
          details: { symbols: symbols.map((s) => ({ name: s.name, kind: symbolKindName(s.kind) })) },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `lsp_document_symbols error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "lsp_workspace_symbols",
    label: "Workspace Symbols",
    description: "Search for symbols across the entire workspace by name using gopls.",
    parameters: Type.Object({
      query: Type.String({ description: "Symbol name or partial name to search for" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const c = await ensureClient();
        const symbols = await c.workspaceSymbols(params.query);

        if (symbols.length === 0) {
          return {
            content: [{ type: "text", text: `No workspace symbols found matching "${params.query}"` }],
            details: { symbols: [] },
          };
        }

        const lines = symbols.slice(0, 50).map((s) => {
          const path = uriToPath(s.location.uri);
          const relPath = isAbsolute(path) && path.startsWith(workspaceRoot)
            ? "." + path.slice(workspaceRoot.length)
            : path;
          const line = s.location.range.start.line + 1;
          const container = s.containerName ? ` (${s.containerName})` : "";
          return `${symbolKindName(s.kind)} ${s.name}${container} — ${relPath}:${line}`;
        });

        const text = `Workspace symbols matching "${params.query}" (${symbols.length} found, showing first ${Math.min(symbols.length, 50)}):\n${lines.join("\n")}`;
        return {
          content: [{ type: "text", text }],
          details: { symbols: symbols.slice(0, 50).map((s) => ({
            name: s.name,
            kind: symbolKindName(s.kind),
            path: uriToPath(s.location.uri),
            line: s.location.range.start.line + 1,
          })) },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `lsp_workspace_symbols error: ${err instanceof Error ? err.message : String(err)}` }],
          details: {},
          isError: true,
        };
      }
    },
  });

  // ── Command ─────────────────────────────────────────────────────────────

  pi.registerCommand("lsp", {
    description: "LSP gopls status and control. Usage: /lsp [status|restart|stop]",
    handler: async (args, ctx) => {
      const action = (args || "status").trim().toLowerCase();

      switch (action) {
        case "status": {
          if (client?.isRunning && client.isInitialized) {
            ctx.ui.notify(`gopls running — workspace: ${workspaceRoot}`, "success");
          } else if (client) {
            ctx.ui.notify("gopls exists but is not initialized", "warning");
          } else {
            ctx.ui.notify("gopls not started yet. It will start on first tool call.", "info");
          }
          break;
        }
        case "restart": {
          if (client) {
            try { await client.shutdown(); } catch { /* ignore */ }
          }
          client = null;
          try {
            await ensureClient();
            ctx.ui.notify("gopls restarted", "success");
          } catch (err) {
            ctx.ui.notify(`Failed to restart gopls: ${err instanceof Error ? err.message : String(err)}`, "error");
          }
          break;
        }
        case "stop": {
          if (client) {
            try { await client.shutdown(); } catch { /* ignore */ }
            client = null;
            ctx.ui.notify("gopls stopped", "info");
          } else {
            ctx.ui.notify("gopls was not running", "info");
          }
          break;
        }
        default:
          ctx.ui.notify(`Unknown action: ${action}. Usage: /lsp [status|restart|stop]`, "error");
      }
    },
  });
}

// ── Symbol kind helpers ─────────────────────────────────────────────────────

const symbolKindNames: Record<number, string> = {
  1: "File", 2: "Module", 3: "Namespace", 4: "Package", 5: "Class",
  6: "Method", 7: "Property", 8: "Field", 9: "Constructor", 10: "Enum",
  11: "Interface", 12: "Function", 13: "Variable", 14: "Constant",
  15: "String", 16: "Number", 17: "Boolean", 18: "Array", 19: "Object",
  20: "Key", 21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
  25: "Operator", 26: "TypeParameter",
};

function symbolKindName(kind: number): string {
  return symbolKindNames[kind] || `Kind(${kind})`;
}

function formatSymbols(symbols: DocumentSymbol[], indent = 0): string[] {
  const lines: string[] = [];
  for (const s of symbols) {
    const prefix = "  ".repeat(indent);
    const kind = symbolKindName(s.kind);
    lines.push(`${prefix}${kind} ${s.name}`);
    if (s.children) {
      lines.push(...formatSymbols(s.children, indent + 1));
    }
  }
  return lines;
}
