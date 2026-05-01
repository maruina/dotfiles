/** Generic LSP extension for Go and TypeScript/JavaScript. */

import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cwd as cwdFn } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUEST_TIMEOUT_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 2_000;
const DIAGNOSTICS_WAIT_MS = 750;
const STDERR_LIMIT = 16_384;
const LOCATION_PREVIEW_LIMIT = 3;
const POSITION_SNAP_MAX_DISTANCE = 32;
const POSITION_SNAP_MAX_CANDIDATES = 8;

type JsonRpcId = number | string;
interface JsonRpcRequest { jsonrpc: "2.0"; id: JsonRpcId; method: string; params?: unknown }
interface JsonRpcResponse { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } }
interface JsonRpcNotification { jsonrpc: "2.0"; method: string; params?: unknown }
type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
interface Position { line: number; character: number }
interface Range { start: Position; end: Position }
interface Location { uri: string; range: Range }
interface LocationLink { targetUri: string; targetRange: Range; targetSelectionRange: Range; originSelectionRange?: Range }
interface Diagnostic { range: Range; severity?: number; code?: string | number; source?: string; message: string }
interface SymbolInformation { name: string; kind: number; location: Location; containerName?: string }
interface DocumentSymbol { name: string; detail?: string; kind: number; range: Range; selectionRange: Range; children?: DocumentSymbol[] }
interface Hover { contents: { kind: string; value: string } | { language: string; value: string } | string | Array<{ kind: string; value: string } | { language: string; value: string } | string>; range?: Range }
interface InitializeResult { capabilities: Record<string, unknown>; serverInfo?: { name: string; version?: string } }
interface CallHierarchyItem { name: string; kind: number; uri: string; range: Range; selectionRange: Range; detail?: string }
interface CallHierarchyIncomingCall { from: CallHierarchyItem; fromRanges: Range[] }
interface CallHierarchyOutgoingCall { to: CallHierarchyItem; fromRanges: Range[] }
interface CodeAction { title: string; kind?: string; diagnostics?: Diagnostic[]; edit?: WorkspaceEdit; command?: unknown }
interface TextEdit { range: Range; newText: string }
interface WorkspaceEdit { changes?: Record<string, TextEdit[]>; documentChanges?: unknown[] }
interface LspState { workspaceRoots: Record<string, string>; serverVersions?: Record<string, string> }
interface ToolLocation { path: string; line: number; column: number; preview?: string }
interface OpenDocumentState { version: number; mtimeMs: number; size: number; textHash: string }
interface ServerConfig { id: string; label: string; command: string; args: string[]; extensions: string[]; rootMarkers: string[]; initializationOptions?: unknown; languageId(filePath: string): string; packageContext?(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>): unknown }

const SERVER_CONFIGS: ServerConfig[] = [
  { id: "go", label: "Go", command: "gopls", args: ["serve"], extensions: [".go"], rootMarkers: ["go.work", "go.mod", ".git"], initializationOptions: { analyses: {}, hints: {} }, languageId: () => "go", packageContext: goPackageContext },
  { id: "typescript", label: "TypeScript", command: "typescript-language-server", args: ["--stdio"], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"], rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", ".git"], languageId: tsLanguageId, packageContext: tsPackageContext },
];

class LspClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private exited = false;
  private messageId = 0;
  private pending = new Map<JsonRpcId, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = Buffer.alloc(0);
  private initialized = false;
  private capabilities: Record<string, unknown> = {};
  private openDocuments = new Map<string, OpenDocumentState>();
  private stderr = "";
  private diagnosticsByUri = new Map<string, Diagnostic[]>();
  private diagnosticsWaiters = new Map<string, Set<() => void>>();

  constructor(private workspaceRoot: string, private config: ServerConfig, private commandPath: string) { this.workspaceRoot = resolve(workspaceRoot); }

  async start(): Promise<InitializeResult> {
    this.process = spawn(this.commandPath, this.config.args, { cwd: this.workspaceRoot, env: { ...process.env, GOPATH: process.env.GOPATH || "" } });
    this.exited = false;
    this.process.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.process.stderr.on("data", (chunk: Buffer) => this.recordStderr(chunk.toString("utf8")));
    this.process.on("error", (err) => this.failAll(new Error(`${this.config.label} LSP error: ${err.message}`)));
    this.process.on("exit", (code, signal) => { this.exited = true; this.initialized = false; this.failAll(new Error(`${this.config.label} LSP exited with ${signal ?? `code ${code ?? "unknown"}`}${this.stderr ? `\n${this.stderr}` : ""}`)); });
    return this.initialize();
  }

  private recordStderr(text: string) { this.stderr = (this.stderr + text).slice(-STDERR_LIMIT); }
  private onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0, headerEnd).toString("ascii"));
      if (!match) { this.buffer = this.buffer.subarray(headerEnd + 4); continue; }
      const contentLength = Number.parseInt(match[1], 10);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + contentLength) return;
      const body = this.buffer.subarray(bodyStart, bodyStart + contentLength).toString("utf8");
      this.buffer = this.buffer.subarray(bodyStart + contentLength);
      try { this.onMessage(JSON.parse(body) as JsonRpcMessage); } catch (err) { this.recordStderr(`Malformed LSP message: ${err instanceof Error ? err.message : String(err)}\n`); }
    }
  }
  private onMessage(msg: JsonRpcMessage) {
    if ("method" in msg) {
      if (msg.method === "textDocument/publishDiagnostics") {
        const params = msg.params as { uri?: string; diagnostics?: Diagnostic[] } | undefined;
        if (params?.uri) {
          this.diagnosticsByUri.set(params.uri, params.diagnostics ?? []);
          this.resolveDiagnosticsWaiters(params.uri);
        }
      } else if ("id" in msg && msg.id !== undefined) this.handleServerRequest(msg as JsonRpcRequest);
      return;
    }
    if ("id" in msg && msg.id !== undefined) {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(msg.id);
      if ("error" in msg && msg.error) pending.reject(new Error(`${msg.error.code}: ${msg.error.message}${msg.error.data ? ` ${JSON.stringify(msg.error.data)}` : ""}`));
      else pending.resolve((msg as JsonRpcResponse).result);
    }
  }
  private handleServerRequest(req: JsonRpcRequest) {
    if (req.method === "workspace/configuration") { const items = (req.params as { items?: unknown[] } | undefined)?.items; return this.send({ jsonrpc: "2.0", id: req.id, result: Array.isArray(items) ? items.map(() => null) : [] }); }
    if (req.method === "client/registerCapability" || req.method === "window/showMessageRequest") return this.send({ jsonrpc: "2.0", id: req.id, result: null });
    if (req.method === "workspace/applyEdit") return this.send({ jsonrpc: "2.0", id: req.id, result: { applied: false, failureReason: "pi LSP extension previews edits but does not apply workspace edits" } });
    this.send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Unsupported server request: ${req.method}` } });
  }
  private resolveDiagnosticsWaiters(uri: string) { const waiters = this.diagnosticsWaiters.get(uri); if (!waiters) return; this.diagnosticsWaiters.delete(uri); for (const resolve of waiters) resolve(); }
  private send(msg: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification) {
    if (!this.process || this.exited) throw new Error(`${this.config.label} LSP is not running`);
    const body = JSON.stringify(msg);
    this.process.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }
  private request<T>(method: string, params?: unknown, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    const id = ++this.messageId;
    const req: JsonRpcRequest = { jsonrpc: "2.0", id, method };
    if (params !== undefined) req.params = params;
    return new Promise((resolve, reject) => {
      const cleanupAbort = () => signal?.removeEventListener("abort", onAbort);
      const timer = setTimeout(() => { cleanupAbort(); this.pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs}ms${this.stderr ? `\n${this.stderr}` : ""}`)); }, timeoutMs);
      const onAbort = () => { clearTimeout(timer); cleanupAbort(); this.pending.delete(id); reject(new Error(`${method} cancelled`)); };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, { resolve: (value) => { clearTimeout(timer); cleanupAbort(); resolve(value as T); }, reject: (err) => { clearTimeout(timer); cleanupAbort(); reject(err); }, timer });
      try { this.send(req); } catch (err) { clearTimeout(timer); cleanupAbort(); this.pending.delete(id); reject(err instanceof Error ? err : new Error(String(err))); }
    });
  }
  private async initialize(): Promise<InitializeResult> {
    const result = await this.request<InitializeResult>("initialize", {
      processId: process.pid,
      rootUri: pathToFileURL(this.workspaceRoot).href,
      workspaceFolders: [{ uri: pathToFileURL(this.workspaceRoot).href, name: basename(this.workspaceRoot) }],
      capabilities: { general: { positionEncodings: ["utf-16"] }, textDocument: { synchronization: { didOpen: true, didChange: true, didClose: true }, hover: { contentFormat: ["plaintext", "markdown"] }, definition: { linkSupport: false }, typeDefinition: { linkSupport: false }, implementation: { linkSupport: false }, references: {}, publishDiagnostics: { relatedInformation: true }, documentSymbol: { hierarchicalDocumentSymbolSupport: true }, callHierarchy: { dynamicRegistration: false }, codeAction: { dynamicRegistration: false, codeActionLiteralSupport: { codeActionKind: { valueSet: ["quickfix", "source", "source.organizeImports", "refactor", "refactor.rewrite"] } } } }, workspace: { workspaceFolders: true, symbol: {}, applyEdit: false } },
      initializationOptions: this.config.initializationOptions,
    });
    this.capabilities = result.capabilities ?? {};
    this.send({ jsonrpc: "2.0", method: "initialized", params: {} });
    this.initialized = true;
    return result;
  }
  async openDocument(filePath: string) { await this.syncDocument(filePath); }
  private async syncDocument(filePath: string): Promise<string> {
    const uri = pathToFileURL(filePath).href;
    const stat = statSync(filePath);
    const text = readFileSync(filePath, "utf8");
    const textHash = createHash("sha256").update(text).digest("hex");
    const existing = this.openDocuments.get(uri);
    if (!existing) {
      this.send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: this.config.languageId(filePath), version: 1, text } } });
      this.openDocuments.set(uri, { version: 1, mtimeMs: stat.mtimeMs, size: stat.size, textHash });
      return uri;
    }
    if (existing.textHash !== textHash) {
      const version = existing.version + 1;
      this.send({ jsonrpc: "2.0", method: "textDocument/didChange", params: { textDocument: { uri, version }, contentChanges: [{ text }] } });
      this.openDocuments.set(uri, { version, mtimeMs: stat.mtimeMs, size: stat.size, textHash });
    } else if (existing.mtimeMs !== stat.mtimeMs || existing.size !== stat.size) {
      this.openDocuments.set(uri, { ...existing, mtimeMs: stat.mtimeMs, size: stat.size });
    }
    return uri;
  }
  private capability(path: string): unknown { return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, this.capabilities); }
  private hasCapability(path: string): boolean { return Boolean(this.capability(path)); }
  private async locations(method: string, capability: string, filePath: string, line: number, character: number, signal?: AbortSignal): Promise<Location[]> { if (!this.hasCapability(capability)) return []; const uri = await this.syncDocument(filePath); for (const position of lspPositionCandidates(filePath, line, character)) { const locations = normalizeLocations(await this.request<Location | Location[] | LocationLink[] | null>(method, { textDocument: { uri }, position }, signal)); if (locations.length) return locations; } return []; }
  goToDefinition(filePath: string, line: number, character: number, signal?: AbortSignal) { return this.locations("textDocument/definition", "definitionProvider", filePath, line, character, signal); }
  typeDefinition(filePath: string, line: number, character: number, signal?: AbortSignal) { return this.locations("textDocument/typeDefinition", "typeDefinitionProvider", filePath, line, character, signal); }
  implementation(filePath: string, line: number, character: number, signal?: AbortSignal) { return this.locations("textDocument/implementation", "implementationProvider", filePath, line, character, signal); }
  async findReferences(filePath: string, line: number, character: number, signal?: AbortSignal): Promise<Location[]> { if (!this.hasCapability("referencesProvider")) return []; const uri = await this.syncDocument(filePath); for (const position of lspPositionCandidates(filePath, line, character)) { const locations = await this.request<Location[] | null>("textDocument/references", { textDocument: { uri }, position, context: { includeDeclaration: true } }, signal) ?? []; if (locations.length) return locations; } return []; }
  async hover(filePath: string, line: number, character: number, signal?: AbortSignal): Promise<string> { if (!this.hasCapability("hoverProvider")) return ""; const uri = await this.syncDocument(filePath); for (const position of lspPositionCandidates(filePath, line, character)) { const result = await this.request<Hover | null>("textDocument/hover", { textDocument: { uri }, position }, signal); const text = result ? extractHoverContent(result.contents) : ""; if (text) return text; } return ""; }
  async documentSymbols(filePath: string, signal?: AbortSignal): Promise<DocumentSymbol[]> { if (!this.hasCapability("documentSymbolProvider")) return []; const uri = await this.syncDocument(filePath); return normalizeDocumentSymbols(await this.request<DocumentSymbol[] | SymbolInformation[] | null>("textDocument/documentSymbol", { textDocument: { uri } }, signal) ?? []); }
  async workspaceSymbols(query: string, signal?: AbortSignal): Promise<SymbolInformation[]> { if (!this.hasCapability("workspaceSymbolProvider")) return []; return await this.request<SymbolInformation[] | null>("workspace/symbol", { query }, signal) ?? []; }
  async prepareCallHierarchy(filePath: string, line: number, character: number, signal?: AbortSignal): Promise<CallHierarchyItem[]> { if (!this.hasCapability("callHierarchyProvider")) return []; const uri = await this.syncDocument(filePath); for (const position of lspPositionCandidates(filePath, line, character)) { const items = await this.request<CallHierarchyItem[] | null>("textDocument/prepareCallHierarchy", { textDocument: { uri }, position }, signal) ?? []; if (items.length) return items; } return []; }
  async incomingCalls(item: CallHierarchyItem, signal?: AbortSignal): Promise<CallHierarchyIncomingCall[]> { if (!this.hasCapability("callHierarchyProvider")) return []; return await this.request<CallHierarchyIncomingCall[] | null>("callHierarchy/incomingCalls", { item }, signal) ?? []; }
  async outgoingCalls(item: CallHierarchyItem, signal?: AbortSignal): Promise<CallHierarchyOutgoingCall[]> { if (!this.hasCapability("callHierarchyProvider")) return []; return await this.request<CallHierarchyOutgoingCall[] | null>("callHierarchy/outgoingCalls", { item }, signal) ?? []; }
  async codeActions(filePath: string, range: Range, diagnostics: Diagnostic[], signal?: AbortSignal): Promise<CodeAction[]> { if (!this.hasCapability("codeActionProvider")) return []; const uri = await this.syncDocument(filePath); return await this.request<CodeAction[] | null>("textDocument/codeAction", { textDocument: { uri }, range, context: { diagnostics } }, signal) ?? []; }
  async waitForDiagnostics(filePath: string, timeoutMs = DIAGNOSTICS_WAIT_MS) { const uri = pathToFileURL(filePath).href; if (this.diagnosticsByUri.has(uri)) return; await new Promise<void>((resolve) => { const waiters = this.diagnosticsWaiters.get(uri) ?? new Set<() => void>(); let timer: NodeJS.Timeout; const done = () => { clearTimeout(timer); waiters.delete(done); if (waiters.size === 0 && this.diagnosticsWaiters.get(uri) === waiters) this.diagnosticsWaiters.delete(uri); resolve(); }; timer = setTimeout(done, timeoutMs); waiters.add(done); this.diagnosticsWaiters.set(uri, waiters); }); }
  diagnostics(filePath?: string): Map<string, Diagnostic[]> { const out = new Map<string, Diagnostic[]>(); for (const [uri, diagnostics] of this.diagnosticsByUri) { const path = uriToPath(uri); if (!filePath || path === filePath) out.set(path, diagnostics); } return out; }
  async shutdown() { if (!this.process) return; try { await this.request("shutdown", undefined, undefined, SHUTDOWN_TIMEOUT_MS); this.send({ jsonrpc: "2.0", method: "exit" }); } catch { /* server may already be gone */ } this.process.kill(); this.process = null; this.initialized = false; this.openDocuments.clear(); this.failAll(new Error("LSP client shut down")); }
  private failAll(err: Error) { for (const [, p] of this.pending) p.reject(err); this.pending.clear(); }
  get isRunning() { return this.process !== null && !this.exited && this.process.exitCode === null; }
  get isInitialized() { return this.initialized; }
}

function toLspPosition(line: number, character: number): Position { if (!Number.isInteger(line) || !Number.isInteger(character) || line < 1 || character < 1) throw new Error("line and column must be positive integers; column is a 1-indexed UTF-16 offset"); return { line: line - 1, character: character - 1 }; }
function lspPositionCandidates(filePath: string, line: number, column: number): Position[] {
  const original = toLspPosition(line, column);
  try {
    const textLine = readFileSync(filePath, "utf8").split(/\r?\n/)[line - 1] ?? "";
    const target = Math.min(Math.max(column - 1, 0), textLine.length);
    const spans: Array<{ start: number; end: number; distance: number; position: Position }> = [];
    for (let i = 0; i < textLine.length;) {
      if (!isIdentifierChar(textLine[i])) { i++; continue; }
      const start = i;
      while (i < textLine.length && isIdentifierChar(textLine[i])) i++;
      const end = i;
      const distance = spanDistance(target, start, end);
      spans.push({ start, end, distance, position: { line: line - 1, character: Math.min(Math.max(target, start), end - 1) } });
    }
    const seen = new Set<string>([`${original.line}:${original.character}`]);
    const add = (positions: Position[], span: { position: Position }) => { const key = `${span.position.line}:${span.position.character}`; if (!seen.has(key)) { seen.add(key); positions.push(span.position); } };
    const selectorSpans = selectorCandidateSpans(textLine, spans, target);
    const snapped: Position[] = [];
    for (const span of selectorSpans) add(snapped, span);
    for (const span of spans.filter((s) => s.distance <= POSITION_SNAP_MAX_DISTANCE).sort((a, b) => a.distance - b.distance || a.start - b.start)) add(snapped, span);
    const originalIsIdentifier = isIdentifierChar(textLine[target]);
    return originalIsIdentifier ? [original, ...snapped.slice(0, POSITION_SNAP_MAX_CANDIDATES - 1)] : [...snapped.slice(0, POSITION_SNAP_MAX_CANDIDATES - 1), original];
  } catch { return [original]; }
}
function selectorCandidateSpans(textLine: string, spans: Array<{ start: number; end: number; distance: number; position: Position }>, target: number) {
  const chains: Array<{ distance: number; spans: typeof spans }> = [];
  for (let i = 0; i < spans.length; i++) {
    const chain = [spans[i]];
    for (let j = i + 1; j < spans.length; j++) {
      const separator = textLine.slice(chain[chain.length - 1].end, spans[j].start);
      if (separator !== "." && separator !== "?.") break;
      chain.push(spans[j]);
    }
    if (chain.length > 1) {
      const distance = spanDistance(target, chain[0].start, chain[chain.length - 1].end);
      if (distance <= POSITION_SNAP_MAX_DISTANCE) chains.push({ distance, spans: orderSelectorChain(chain, target) });
    }
  }
  return chains.sort((a, b) => a.distance - b.distance || a.spans[0].start - b.spans[0].start).flatMap((c) => c.spans);
}
function orderSelectorChain<T extends { start: number; end: number }>(chain: T[], target: number): T[] {
  const containing = chain.findIndex((s) => target >= s.start && target < s.end);
  if (containing >= 0) return [chain[containing], ...chain.slice(containing + 1), ...chain.slice(0, containing)];
  const next = chain.findIndex((s) => target < s.start);
  if (next <= 0) return [...chain.slice(1), chain[0]];
  if (next > 0) return [chain[next], ...chain.slice(next + 1), ...chain.slice(0, next).reverse()];
  return [...chain].reverse();
}
function spanDistance(target: number, start: number, end: number): number { return target < start ? start - target : target >= end ? target - end + 1 : 0; }
function isIdentifierChar(ch: string | undefined): boolean { return Boolean(ch && /[A-Za-z0-9_$]/.test(ch)); }
function positionInRange(pos: Position, range: Range): boolean { return comparePosition(range.start, pos) <= 0 && comparePosition(pos, range.end) < 0; }
function comparePosition(a: Position, b: Position): number { return a.line === b.line ? a.character - b.character : a.line - b.line; }
function rangeSize(range: Range): number { return (range.end.line - range.start.line) * 100_000 + (range.end.character - range.start.character); }
function uriToPath(uri: string): string { try { return fileURLToPath(uri); } catch { return uri; } }
function extractHoverContent(contents: Hover["contents"]): string { if (typeof contents === "string") return contents; if (Array.isArray(contents)) return contents.map((c) => typeof c === "string" ? c : c.value).filter(Boolean).join("\n\n"); return contents.value; }
function relativePath(path: string, workspaceRoot: string): string { if (!isAbsolute(path)) return path; const rel = relative(workspaceRoot, path); return rel && !rel.startsWith("..") && rel !== ".." && !isAbsolute(rel) ? `.${sep}${rel}` : path; }
function formatLocation(loc: Location, workspaceRoot: string): string { return `${relativePath(uriToPath(loc.uri), workspaceRoot)}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`; }
function resolvePath(input: string, workspaceRoot: string): string { return isAbsolute(input) ? input : resolve(workspaceRoot, input); }
function findExecutable(command: string): string | null { for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) for (const ext of process.platform === "win32" ? [".exe", ".cmd", ""] : [""]) { const p = join(dir, command + ext); try { if (statSync(p).isFile()) { if (process.platform !== "win32") accessSync(p, constants.X_OK); return p; } } catch { /* not found */ } } return null; }
function configForFile(filePath: string): ServerConfig | undefined { const ext = extname(filePath); return SERVER_CONFIGS.find((c) => c.extensions.includes(ext)); }
function findWorkspaceRoot(start: string, config: ServerConfig): string { const resolved = resolve(start); const initial = existsSync(resolved) && statSync(resolved).isFile() ? dirname(resolved) : !existsSync(resolved) && extname(resolved) ? dirname(resolved) : resolved; let dir = initial; while (true) { if (config.rootMarkers.some((m) => existsSync(join(dir, m)))) return dir; const parent = dirname(dir); if (parent === dir) return initial; dir = parent; } }
function normalizeLocations(result: Location | Location[] | LocationLink[] | null): Location[] { if (!result) return []; const values = Array.isArray(result) ? result : [result]; return values.map((v) => "targetUri" in v ? { uri: v.targetUri, range: v.targetSelectionRange ?? v.targetRange } : v); }
function normalizeDocumentSymbols(symbols: DocumentSymbol[] | SymbolInformation[]): DocumentSymbol[] { return symbols.map((s) => "selectionRange" in s ? s : { name: s.name, kind: s.kind, range: s.location.range, selectionRange: s.location.range }); }
function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] { return symbols.flatMap((s) => [s, ...flattenSymbols(s.children ?? [])]); }
function findEnclosingSymbol(symbols: DocumentSymbol[], line: number, column: number): DocumentSymbol | null { const pos = toLspPosition(line, column); return flattenSymbols(symbols).filter((s) => positionInRange(pos, s.range)).sort((a, b) => rangeSize(a.range) - rangeSize(b.range))[0] ?? null; }
function linePreview(filePath: string, line: number, limit = LOCATION_PREVIEW_LIMIT): string | undefined { try { const lines = readFileSync(filePath, "utf8").split(/\r?\n/); const start = Math.max(0, line - 1); return lines.slice(start, Math.min(lines.length, start + limit)).join("\n").trimEnd(); } catch { return undefined; } }
function locationsDetails(locations: Location[]): ToolLocation[] { return locations.map((loc) => { const path = uriToPath(loc.uri); const line = loc.range.start.line + 1; return { path, line, column: loc.range.start.character + 1, preview: linePreview(path, line) }; }); }
function diagnosticSeverityName(severity?: number): string { return severity === 1 ? "error" : severity === 2 ? "warning" : severity === 3 ? "info" : severity === 4 ? "hint" : "diagnostic"; }
function formatDiagnostics(items: Array<{ path: string; diagnostic: Diagnostic }>, workspaceRoot: string): string[] { return items.map(({ path, diagnostic }) => `${relativePath(path, workspaceRoot)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${diagnosticSeverityName(diagnostic.severity)} ${diagnostic.message}`); }
function diagnosticsDetails(map: Map<string, Diagnostic[]>): Array<{ path: string; line: number; column: number; severity: string; message: string; source?: string; code?: string | number }> { return [...map.entries()].flatMap(([path, diagnostics]) => diagnostics.map((d) => ({ path, line: d.range.start.line + 1, column: d.range.start.character + 1, severity: diagnosticSeverityName(d.severity), message: d.message, source: d.source, code: d.code }))); }
function rangeToDetails(range: Range) { return { startLine: range.start.line + 1, startColumn: range.start.character + 1, endLine: range.end.line + 1, endColumn: range.end.character + 1 }; }
function formatSymbol(s: DocumentSymbol): string { return `${symbolKindName(s.kind)} ${s.name} ${rangeToDetails(s.range).startLine}-${rangeToDetails(s.range).endLine}`; }
function errorResult(name: string, err: unknown) { return { content: [{ type: "text" as const, text: `${name} error: ${err instanceof Error ? err.message : String(err)}` }], details: {}, isError: true }; }
function tsLanguageId(filePath: string): string { const ext = extname(filePath); return ext === ".tsx" ? "typescriptreact" : ext === ".jsx" ? "javascriptreact" : [".js", ".mjs", ".cjs"].includes(ext) ? "javascript" : "typescript"; }
function listFiles(dir: string, extensions: string[]): string[] { try { return readdirSync(dir).filter((name) => extensions.includes(extname(name))).map((name) => join(dir, name)); } catch { return []; } }
function goPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".go"]); const pkg = /^package\s+(\w+)/m.exec(readFileSync(filePath, "utf8"))?.[1] ?? "unknown"; return { packageName: pkg, directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => f.endsWith("_test.go")).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }
function tsPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]); return { directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => /(?:\.test|\.spec)\.[cm]?[tj]sx?$/.test(f)).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name) || [5, 6, 11, 12, 23].includes(s.kind)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }

export default function lspExtension(pi: ExtensionAPI) {
  const clients = new Map<string, LspClient>();
  const startingClients = new Map<string, Promise<LspClient>>();
  const workspaceRoots = new Map<string, string>();
  const serverVersions = new Map<string, string>();

  pi.on("session_start", async (_event, ctx) => { for (const entry of ctx.sessionManager.getBranch()) if (entry.type === "custom" && entry.customType === "lsp-state") { const data = entry.data as LspState | undefined; for (const [k, v] of Object.entries(data?.workspaceRoots ?? {})) if (typeof k === "string" && typeof v === "string") workspaceRoots.set(k, v); for (const [k, v] of Object.entries(data?.serverVersions ?? {})) if (typeof k === "string" && typeof v === "string") serverVersions.set(k, v); } });
  pi.on("session_shutdown", async () => { await Promise.all([...clients.values()].map((c) => c.shutdown().catch(() => undefined))); });
  function persistState() { pi.appendEntry<LspState>("lsp-state", { workspaceRoots: Object.fromEntries(workspaceRoots), serverVersions: Object.fromEntries(serverVersions) }); }
  function resolveFile(file: string) { const abs = resolvePath(file, cwdFn()); if (!existsSync(abs)) throw new Error(`file does not exist: ${abs}`); const config = configForFile(abs); if (!config) throw new Error(`unsupported file type: ${abs}`); const root = workspaceRoots.get(config.id) ?? findWorkspaceRoot(abs, config); return { filePath: abs, config, root }; }
  async function ensureClient(config: ServerConfig, root: string): Promise<LspClient> { const key = `${config.id}:${root}`; const existing = clients.get(key); if (existing?.isRunning && existing.isInitialized) return existing; const starting = startingClients.get(key); if (starting) return starting; const promise = (async () => { const commandPath = findExecutable(config.command); if (!commandPath) throw new Error(`${config.label} language server not found on PATH. Install ${config.command}${config.id === "typescript" ? " with: npm install -g typescript typescript-language-server" : ""}`); if (existing) await existing.shutdown().catch(() => undefined); const client = new LspClient(root, config, commandPath); const info = await client.start(); clients.set(key, client); if (info.serverInfo?.version) serverVersions.set(config.id, info.serverInfo.version); persistState(); return client; })().finally(() => startingClients.delete(key)); startingClients.set(key, promise); return promise; }
  async function fileClient(file: string) { const r = resolveFile(file); return { ...r, client: await ensureClient(r.config, r.root) }; }

  async function richLocationResult(name: string, label: string, params: { file: string; line: number; column: number }, get: (c: LspClient, filePath: string) => Promise<Location[]>) { try { const { client, filePath, root } = await fileClient(params.file); const locations = await get(client, filePath); return locations.length ? { content: [{ type: "text" as const, text: `${label} found:\n${locations.map((loc) => `${formatLocation(loc, root)}${linePreview(uriToPath(loc.uri), loc.range.start.line + 1, 1) ? `\n  ${linePreview(uriToPath(loc.uri), loc.range.start.line + 1, 1)}` : ""}`).join("\n")}` }], details: { locations: locationsDetails(locations) } } : { content: [{ type: "text" as const, text: `No ${label.toLowerCase()} found at ${params.file}:${params.line}:${params.column}` }], details: { locations: [] } }; } catch (err) { return errorResult(name, err); } }

  pi.registerTool({ name: "lsp_go_to_definition", label: "Go to Definition", description: "Find where a symbol is defined using the file's language server.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { return richLocationResult("lsp_go_to_definition", "Definition", params, (c, f) => c.goToDefinition(f, params.line, params.column, signal)); } });
  pi.registerTool({ name: "lsp_type_definition", label: "Type Definition", description: "Find a symbol's type definition using the file's language server.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { return richLocationResult("lsp_type_definition", "Type definition", params, (c, f) => c.typeDefinition(f, params.line, params.column, signal)); } });
  pi.registerTool({ name: "lsp_implementation", label: "Implementation", description: "Find implementations using the file's language server.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { return richLocationResult("lsp_implementation", "Implementation", params, (c, f) => c.implementation(f, params.line, params.column, signal)); } });
  pi.registerTool({ name: "lsp_find_references", label: "Find References", description: "Find all references to a symbol using the file's language server.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { try { const { client, filePath, root } = await fileClient(params.file); const locations = await client.findReferences(filePath, params.line, params.column, signal); return locations.length ? { content: [{ type: "text", text: `References found (${locations.length}):\n${locations.map((loc) => formatLocation(loc, root)).join("\n")}` }], details: { locations: locationsDetails(locations) } } : { content: [{ type: "text", text: `No references found at ${params.file}:${params.line}:${params.column}` }], details: { locations: [] } }; } catch (err) { return errorResult("lsp_find_references", err); } } });
  pi.registerTool({ name: "lsp_hover", label: "LSP Hover", description: "Get type information and documentation for a symbol.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { try { const { client, filePath } = await fileClient(params.file); const text = await client.hover(filePath, params.line, params.column, signal); return { content: [{ type: "text", text: text || `No hover information at ${params.file}:${params.line}:${params.column}` }], details: {} }; } catch (err) { return errorResult("lsp_hover", err); } } });
  pi.registerTool({ name: "lsp_document_symbols", label: "Document Symbols", description: "List all symbols in a file using its language server.", parameters: Type.Object({ file: Type.String() }), async execute(_id, params, signal) { try { const { client, filePath } = await fileClient(params.file); const symbols = await client.documentSymbols(filePath, signal); return symbols.length ? { content: [{ type: "text", text: `Symbols in ${params.file}:\n${formatSymbols(symbols).join("\n")}` }], details: { symbols: flattenSymbols(symbols).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), range: rangeToDetails(s.range) })) } } : { content: [{ type: "text", text: `No symbols found in ${params.file}` }], details: { symbols: [] } }; } catch (err) { return errorResult("lsp_document_symbols", err); } } });
  pi.registerTool({ name: "lsp_enclosing_symbol", label: "Enclosing Symbol", description: "Return the smallest symbol containing a file position.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { try { const { client, filePath } = await fileClient(params.file); const symbol = findEnclosingSymbol(await client.documentSymbols(filePath, signal), params.line, params.column); return symbol ? { content: [{ type: "text", text: `Enclosing symbol: ${formatSymbol(symbol)}` }], details: { name: symbol.name, kind: symbolKindName(symbol.kind), range: rangeToDetails(symbol.range), selectionRange: rangeToDetails(symbol.selectionRange) } } : { content: [{ type: "text", text: `No enclosing symbol found at ${params.file}:${params.line}:${params.column}` }], details: {} }; } catch (err) { return errorResult("lsp_enclosing_symbol", err); } } });
  pi.registerTool({ name: "lsp_workspace_symbols", label: "Workspace Symbols", description: "Search symbols across the language workspace inferred from an optional file.", parameters: Type.Object({ query: Type.String(), file: Type.Optional(Type.String()) }), async execute(_id, params, signal) { try { const target = params.file ? resolveFile(params.file) : { config: SERVER_CONFIGS[0], root: workspaceRoots.get("go") ?? findWorkspaceRoot(cwdFn(), SERVER_CONFIGS[0]) }; const client = await ensureClient(target.config, target.root); const symbols = await client.workspaceSymbols(params.query, signal); const shown = symbols.slice(0, 50); return symbols.length ? { content: [{ type: "text", text: `Workspace symbols matching "${params.query}" (${symbols.length} found, showing first ${shown.length}):\n${shown.map((s) => `${symbolKindName(s.kind)} ${s.name}${s.containerName ? ` (${s.containerName})` : ""} — ${relativePath(uriToPath(s.location.uri), target.root)}:${s.location.range.start.line + 1}`).join("\n")}` }], details: { symbols: shown.map((s) => ({ name: s.name, kind: symbolKindName(s.kind), path: uriToPath(s.location.uri), line: s.location.range.start.line + 1, preview: linePreview(uriToPath(s.location.uri), s.location.range.start.line + 1, 1) })) } } : { content: [{ type: "text", text: `No workspace symbols found matching "${params.query}"` }], details: { symbols: [] } }; } catch (err) { return errorResult("lsp_workspace_symbols", err); } } });
  pi.registerTool({ name: "lsp_diagnostics", label: "Diagnostics", description: "Return diagnostics collected from opened files. Pass file to choose language/root.", parameters: Type.Object({ file: Type.Optional(Type.String()) }), async execute(_id, params) { try { if (params.file) { const { client, filePath, root } = await fileClient(params.file); await client.openDocument(filePath); await client.waitForDiagnostics(filePath); const map = client.diagnostics(filePath); const items = [...map.entries()].flatMap(([path, diagnostics]) => diagnostics.map((diagnostic) => ({ path, diagnostic }))); return items.length ? { content: [{ type: "text", text: `Diagnostics (${items.length}):\n${formatDiagnostics(items, root).join("\n")}` }], details: { diagnostics: diagnosticsDetails(map) } } : { content: [{ type: "text", text: `No diagnostics for ${params.file}` }], details: { diagnostics: [] } }; } const all = [...clients.entries()].flatMap(([key, c]) => [...c.diagnostics().entries()].map(([path, diagnostics]) => ({ key, path, diagnostics }))); return { content: [{ type: "text", text: all.length ? all.flatMap(({ path, diagnostics }) => diagnostics.map((d) => `${path}:${d.range.start.line + 1}:${d.range.start.character + 1} ${d.message}`)).join("\n") : "No diagnostics collected. Open files with LSP tools first." }], details: { diagnostics: all } }; } catch (err) { return errorResult("lsp_diagnostics", err); } } });
  pi.registerTool({ name: "lsp_prepare_edit_context", label: "Prepare Edit Context", description: "Collect hover, definition, enclosing symbol, document symbols, diagnostics, package context, and optional references for a position.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer(), includeReferences: Type.Optional(Type.Boolean()), includeDiagnostics: Type.Optional(Type.Boolean()) }), async execute(_id, params, signal) { try { const { client, filePath, root, config } = await fileClient(params.file); const [hover, definitions, symbols] = await Promise.all([client.hover(filePath, params.line, params.column, signal), client.goToDefinition(filePath, params.line, params.column, signal), client.documentSymbols(filePath, signal)]); const references = params.includeReferences ? await client.findReferences(filePath, params.line, params.column, signal) : []; const diagnostics = params.includeDiagnostics === false ? new Map<string, Diagnostic[]>() : client.diagnostics(filePath); const enclosing = findEnclosingSymbol(symbols, params.line, params.column); const pkg = config.packageContext?.(filePath, root, symbols, diagnostics); const text = [`Language: ${config.label}`, `Hover:\n${hover || "none"}`, `Definition:\n${definitions.map((loc) => formatLocation(loc, root)).join("\n") || "none"}`, `Enclosing:\n${enclosing ? formatSymbol(enclosing) : "none"}`, `References: ${references.length}`, `Diagnostics: ${diagnosticsDetails(diagnostics).length}`].join("\n\n"); return { content: [{ type: "text", text }], details: { language: config.id, hover, definitions: locationsDetails(definitions), enclosing: enclosing ? { name: enclosing.name, kind: symbolKindName(enclosing.kind), range: rangeToDetails(enclosing.range) } : null, references: locationsDetails(references), diagnostics: diagnosticsDetails(diagnostics), package: pkg, symbols: flattenSymbols(symbols).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), range: rangeToDetails(s.range) })) } }; } catch (err) { return errorResult("lsp_prepare_edit_context", err); } } });
  pi.registerTool({ name: "lsp_incoming_calls", label: "Incoming Calls", description: "Find callers of the symbol at a position.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { try { const { client, filePath, root } = await fileClient(params.file); const items = await client.prepareCallHierarchy(filePath, params.line, params.column, signal); const calls = items.length ? await client.incomingCalls(items[0], signal) : []; return calls.length ? { content: [{ type: "text", text: `Incoming calls (${calls.length}):\n${calls.map((call) => `${call.from.name} — ${formatLocation({ uri: call.from.uri, range: call.from.selectionRange }, root)}`).join("\n")}` }], details: { calls } } : { content: [{ type: "text", text: `No incoming calls found at ${params.file}:${params.line}:${params.column}` }], details: { calls: [] } }; } catch (err) { return errorResult("lsp_incoming_calls", err); } } });
  pi.registerTool({ name: "lsp_outgoing_calls", label: "Outgoing Calls", description: "Find calls made by the symbol at a position.", parameters: Type.Object({ file: Type.String(), line: Type.Integer(), column: Type.Integer() }), async execute(_id, params, signal) { try { const { client, filePath, root } = await fileClient(params.file); const items = await client.prepareCallHierarchy(filePath, params.line, params.column, signal); const calls = items.length ? await client.outgoingCalls(items[0], signal) : []; return calls.length ? { content: [{ type: "text", text: `Outgoing calls (${calls.length}):\n${calls.map((call) => `${call.to.name} — ${formatLocation({ uri: call.to.uri, range: call.to.selectionRange }, root)}`).join("\n")}` }], details: { calls } } : { content: [{ type: "text", text: `No outgoing calls found at ${params.file}:${params.line}:${params.column}` }], details: { calls: [] } }; } catch (err) { return errorResult("lsp_outgoing_calls", err); } } });
  pi.registerTool({ name: "lsp_code_actions", label: "Code Actions", description: "List LSP code actions for a file/range. Preview only; does not apply edits.", parameters: Type.Object({ file: Type.String(), startLine: Type.Optional(Type.Integer()), startColumn: Type.Optional(Type.Integer()), endLine: Type.Optional(Type.Integer()), endColumn: Type.Optional(Type.Integer()) }), async execute(_id, params, signal) { try { const { client, filePath } = await fileClient(params.file); const range = { start: toLspPosition(params.startLine ?? 1, params.startColumn ?? 1), end: toLspPosition(params.endLine ?? params.startLine ?? 1, params.endColumn ?? params.startColumn ?? 1) }; const actions = await client.codeActions(filePath, range, client.diagnostics(filePath).get(filePath) ?? [], signal); return actions.length ? { content: [{ type: "text", text: `Code actions (${actions.length}):\n${actions.map((a, i) => `${i + 1}. ${a.title}${a.kind ? ` [${a.kind}]` : ""}${a.edit ? " (has edit)" : ""}`).join("\n")}` }], details: { actions: actions.map((a, i) => ({ index: i + 1, title: a.title, kind: a.kind, hasEdit: Boolean(a.edit), hasCommand: Boolean(a.command), diagnostics: a.diagnostics?.map((d) => d.message) ?? [] })) } } : { content: [{ type: "text", text: `No code actions for ${params.file}` }], details: { actions: [] } }; } catch (err) { return errorResult("lsp_code_actions", err); } } });
  pi.registerTool({ name: "lsp_package_context", label: "Package Context", description: "Return language package/module context for a file.", parameters: Type.Object({ file: Type.String() }), async execute(_id, params, signal) { try { const { client, filePath, root, config } = await fileClient(params.file); const symbols = await client.documentSymbols(filePath, signal); const diagnostics = client.diagnostics(filePath); const pkg = config.packageContext?.(filePath, root, symbols, diagnostics) ?? {}; return { content: [{ type: "text", text: `${config.label} context\nDir: ${relativePath(dirname(filePath), root)}\nDiagnostics: ${diagnosticsDetails(diagnostics).length}` }], details: pkg }; } catch (err) { return errorResult("lsp_package_context", err); } } });

  pi.registerCommand("lsp", { description: "LSP status/control. Usage: /lsp [status|restart|stop|root <language> [path]]", handler: async (args, ctx) => { const [action = "status", lang, ...rest] = (args || "status").trim().split(/\s+/); switch (action.toLowerCase()) { case "status": ctx.ui.notify(`LSP clients: ${clients.size || 0}. Roots: ${[...workspaceRoots.entries()].map(([k, v]) => `${k}=${v}`).join(", ") || "auto"}`, "info"); break; case "restart": await Promise.all([...clients.values()].map((c) => c.shutdown().catch(() => undefined))); clients.clear(); ctx.ui.notify("LSP clients stopped; they restart on next tool call", "success"); break; case "stop": await Promise.all([...clients.values()].map((c) => c.shutdown().catch(() => undefined))); clients.clear(); ctx.ui.notify("LSP clients stopped", "info"); break; case "root": { const config = SERVER_CONFIGS.find((c) => c.id === lang); if (!config) { ctx.ui.notify(`Unknown language: ${lang}. Known: ${SERVER_CONFIGS.map((c) => c.id).join(", ")}`, "error"); break; } const next = rest.join(" "); if (!next) { ctx.ui.notify(`${config.label} root: ${workspaceRoots.get(config.id) ?? "auto"}`, "info"); break; } workspaceRoots.set(config.id, findWorkspaceRoot(resolvePath(next, cwdFn()), config)); for (const [key, c] of clients) if (key.startsWith(`${config.id}:`)) { await c.shutdown().catch(() => undefined); clients.delete(key); } persistState(); ctx.ui.notify(`${config.label} root set to ${workspaceRoots.get(config.id)}`, "success"); break; } default: ctx.ui.notify(`Unknown action: ${action}. Usage: /lsp [status|restart|stop|root <language> [path]]`, "error"); } } });
}

const symbolKindNames: Record<number, string> = { 1: "File", 2: "Module", 3: "Namespace", 4: "Package", 5: "Class", 6: "Method", 7: "Property", 8: "Field", 9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function", 13: "Variable", 14: "Constant", 15: "String", 16: "Number", 17: "Boolean", 18: "Array", 19: "Object", 20: "Key", 21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event", 25: "Operator", 26: "TypeParameter" };
function symbolKindName(kind: number): string { return symbolKindNames[kind] || `Kind(${kind})`; }
function formatSymbols(symbols: DocumentSymbol[], indent = 0): string[] { return symbols.flatMap((s) => [`${"  ".repeat(indent)}${symbolKindName(s.kind)} ${s.name}`, ...formatSymbols(s.children ?? [], indent + 1)]); }
