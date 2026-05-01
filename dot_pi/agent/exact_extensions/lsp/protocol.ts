export const REQUEST_TIMEOUT_MS = 30_000;
export const SHUTDOWN_TIMEOUT_MS = 2_000;
export const DIAGNOSTICS_WAIT_MS = 750;
export const STDERR_LIMIT = 16_384;
export const LOCATION_PREVIEW_LIMIT = 3;
export const POSITION_SNAP_MAX_DISTANCE = 32;
export const POSITION_SNAP_MAX_CANDIDATES = 8;

export type JsonRpcId = number | string;
export interface JsonRpcRequest { jsonrpc: "2.0"; id: JsonRpcId; method: string; params?: unknown }
export interface JsonRpcResponse { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } }
export interface JsonRpcNotification { jsonrpc: "2.0"; method: string; params?: unknown }
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;
export interface Position { line: number; character: number }
export interface Range { start: Position; end: Position }
export interface Location { uri: string; range: Range }
export interface LocationLink { targetUri: string; targetRange: Range; targetSelectionRange: Range; originSelectionRange?: Range }
export interface Diagnostic { range: Range; severity?: number; code?: string | number; source?: string; message: string }
export interface SymbolInformation { name: string; kind: number; location: Location; containerName?: string }
export interface DocumentSymbol { name: string; detail?: string; kind: number; range: Range; selectionRange: Range; children?: DocumentSymbol[] }
export interface Hover { contents: { kind: string; value: string } | { language: string; value: string } | string | Array<{ kind: string; value: string } | { language: string; value: string } | string>; range?: Range }
export interface InitializeResult { capabilities: Record<string, unknown>; serverInfo?: { name: string; version?: string } }
export interface CallHierarchyItem { name: string; kind: number; uri: string; range: Range; selectionRange: Range; detail?: string }
export interface CallHierarchyIncomingCall { from: CallHierarchyItem; fromRanges: Range[] }
export interface CallHierarchyOutgoingCall { to: CallHierarchyItem; fromRanges: Range[] }
export interface CodeAction { title: string; kind?: string; diagnostics?: Diagnostic[]; edit?: WorkspaceEdit; command?: unknown }
export interface TextEdit { range: Range; newText: string }
export interface WorkspaceEdit { changes?: Record<string, TextEdit[]>; documentChanges?: unknown[] }
export interface LspState { workspaceRoots: Record<string, string>; serverVersions?: Record<string, string> }
export interface ToolLocation { path: string; line: number; column: number; preview?: string }
export interface OpenDocumentState { version: number; mtimeMs: number; size: number; textHash: string }
export interface ServerConfig { id: string; label: string; command: string; args: string[]; extensions: string[]; rootMarkers: string[]; initializationOptions?: unknown; settings?: unknown; matches?(filePath: string): boolean; languageId(filePath: string): string; packageContext?(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>): unknown }
