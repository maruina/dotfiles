import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DIAGNOSTICS_WAIT_MS, REQUEST_TIMEOUT_MS, SHUTDOWN_TIMEOUT_MS, STDERR_LIMIT, type CallHierarchyIncomingCall, type CallHierarchyItem, type CallHierarchyOutgoingCall, type CodeAction, type Diagnostic, type DocumentSymbol, type Hover, type InitializeResult, type JsonRpcId, type JsonRpcMessage, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type Location, type LocationLink, type OpenDocumentState, type Range, type ServerConfig, type SymbolInformation } from "./protocol";
import { lspPositionCandidates, normalizeDocumentSymbols, normalizeLocations, uriToPath } from "./utils";

function extractHoverContent(contents: Hover["contents"]): string { if (typeof contents === "string") return contents; if (Array.isArray(contents)) return contents.map((c) => typeof c === "string" ? c : c.value).filter(Boolean).join("\n\n"); return contents.value; }

export class LspClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private exited = false;
  private messageId = 0;
  private pending = new Map<JsonRpcId, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: NodeJS.Timeout }>();
  private buffer = Buffer.alloc(0);
  private initialized = false;
  private capabilities: Record<string, unknown> = {};
  private openDocuments = new Map<string, OpenDocumentState>();
  private syncingDocuments = new Map<string, Promise<string>>();
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
      if (!match) { this.recordStderr("Malformed LSP header: missing Content-Length\n"); this.buffer = this.buffer.subarray(headerEnd + 4); continue; }
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
    const existingSync = this.syncingDocuments.get(uri);
    if (existingSync) return existingSync;
    const sync = this.syncDocumentUnsafe(filePath, uri).finally(() => this.syncingDocuments.delete(uri));
    this.syncingDocuments.set(uri, sync);
    return sync;
  }
  private async syncDocumentUnsafe(filePath: string, uri: string): Promise<string> {
    const stat = statSync(filePath);
    const existing = this.openDocuments.get(uri);
    if (existing && existing.mtimeMs === stat.mtimeMs && existing.size === stat.size) return uri;
    const text = readFileSync(filePath, "utf8");
    const textHash = createHash("sha256").update(text).digest("hex");
    if (!existing) {
      this.diagnosticsByUri.delete(uri);
      this.send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: this.config.languageId(filePath), version: 1, text } } });
      this.openDocuments.set(uri, { version: 1, mtimeMs: stat.mtimeMs, size: stat.size, textHash });
      return uri;
    }
    if (existing.textHash !== textHash) {
      const version = existing.version + 1;
      this.diagnosticsByUri.delete(uri);
      this.send({ jsonrpc: "2.0", method: "textDocument/didChange", params: { textDocument: { uri, version }, contentChanges: [{ text }] } });
      this.openDocuments.set(uri, { version, mtimeMs: stat.mtimeMs, size: stat.size, textHash });
    } else this.openDocuments.set(uri, { ...existing, mtimeMs: stat.mtimeMs, size: stat.size });
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
  debugState() { return { running: this.isRunning, initialized: this.isInitialized, openDocuments: this.openDocuments.size, diagnostics: [...this.diagnosticsByUri.values()].reduce((sum, items) => sum + items.length, 0), syncingDocuments: this.syncingDocuments.size }; }
  async shutdown() { if (!this.process) return; try { await this.request("shutdown", undefined, undefined, SHUTDOWN_TIMEOUT_MS); this.send({ jsonrpc: "2.0", method: "exit" }); } catch { /* server may already be gone */ } this.process.kill(); this.process = null; this.initialized = false; this.openDocuments.clear(); this.syncingDocuments.clear(); this.failAll(new Error("LSP client shut down")); }
  private failAll(err: Error) { if (!this.pending.size) return; for (const [, p] of this.pending) p.reject(err); this.pending.clear(); }
  get isRunning() { return this.process !== null && !this.exited && this.process.exitCode === null; }
  get isInitialized() { return this.initialized; }
}
