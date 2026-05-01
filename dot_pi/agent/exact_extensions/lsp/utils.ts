import { accessSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCATION_PREVIEW_LIMIT, POSITION_SNAP_MAX_CANDIDATES, POSITION_SNAP_MAX_DISTANCE, type Diagnostic, type DocumentSymbol, type Location, type LocationLink, type Position, type Range, type ServerConfig, type SymbolInformation, type ToolLocation } from "./protocol";

export function toLspPosition(line: number, character: number): Position { if (!Number.isInteger(line) || !Number.isInteger(character) || line < 1 || character < 1) throw new Error("line and column must be positive integers; column is a 1-indexed UTF-16 offset"); return { line: line - 1, character: character - 1 }; }
export function lspPositionCandidates(filePath: string, line: number, column: number): Position[] {
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
export function uriToPath(uri: string): string { try { return fileURLToPath(uri); } catch { return uri; } }
export function relativePath(path: string, workspaceRoot: string): string { if (!isAbsolute(path)) return path; const rel = relative(workspaceRoot, path); return rel && !rel.startsWith("..") && rel !== ".." && !isAbsolute(rel) ? `.${sep}${rel}` : path; }
export function isInsidePath(path: string, parent: string): boolean { const rel = relative(resolve(parent), resolve(path)); return rel === "" || Boolean(rel && !rel.startsWith("..") && rel !== ".." && !isAbsolute(rel)); }
export function formatLocation(loc: Location, workspaceRoot: string): string { return `${relativePath(uriToPath(loc.uri), workspaceRoot)}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`; }
export function resolvePath(input: string, workspaceRoot: string): string { return isAbsolute(input) ? input : resolve(workspaceRoot, input); }
export function findExecutable(command: string): string | null { for (const dir of (process.env.PATH || "").split(delimiter).filter(Boolean)) for (const ext of process.platform === "win32" ? [".exe", ".cmd", ""] : [""]) { const p = join(dir, command + ext); try { if (statSync(p).isFile()) { if (process.platform !== "win32") accessSync(p, constants.X_OK); return p; } } catch { /* not found */ } } return null; }
export function configForFile(filePath: string, configs: ServerConfig[]): ServerConfig | undefined { const ext = extname(filePath); return configs.find((c) => c.matches?.(filePath) ?? c.extensions.includes(ext)); }
export function findWorkspaceRoot(start: string, config: ServerConfig): string { const resolved = resolve(start); const initial = existsSync(resolved) && statSync(resolved).isFile() ? dirname(resolved) : !existsSync(resolved) && extname(resolved) ? dirname(resolved) : resolved; let dir = initial; while (true) { if (config.rootMarkers.some((m) => existsSync(join(dir, m)))) return dir; const parent = dirname(dir); if (parent === dir) return initial; dir = parent; } }
export function normalizeLocations(result: Location | Location[] | LocationLink[] | null): Location[] { if (!result) return []; const values = Array.isArray(result) ? result : [result]; return values.map((v) => "targetUri" in v ? { uri: v.targetUri, range: v.targetSelectionRange ?? v.targetRange } : v); }
export function normalizeDocumentSymbols(symbols: DocumentSymbol[] | SymbolInformation[]): DocumentSymbol[] { return symbols.map((s) => "selectionRange" in s ? s : { name: s.name, kind: s.kind, range: s.location.range, selectionRange: s.location.range }); }
export function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] { return symbols.flatMap((s) => [s, ...flattenSymbols(s.children ?? [])]); }
export function findEnclosingSymbol(symbols: DocumentSymbol[], line: number, column: number): DocumentSymbol | null { const pos = toLspPosition(line, column); return flattenSymbols(symbols).filter((s) => positionInRange(pos, s.range)).sort((a, b) => rangeSize(a.range) - rangeSize(b.range))[0] ?? null; }
export function linePreview(filePath: string, line: number, limit = LOCATION_PREVIEW_LIMIT): string | undefined { try { const lines = readFileSync(filePath, "utf8").split(/\r?\n/); const start = Math.max(0, line - 1); return lines.slice(start, Math.min(lines.length, start + limit)).join("\n").trimEnd(); } catch { return undefined; } }
export function locationsDetails(locations: Location[]): ToolLocation[] { return locations.map((loc) => { const path = uriToPath(loc.uri); const line = loc.range.start.line + 1; return { path, line, column: loc.range.start.character + 1, preview: linePreview(path, line) }; }); }
export function diagnosticSeverityName(severity?: number): string { return severity === 1 ? "error" : severity === 2 ? "warning" : severity === 3 ? "info" : severity === 4 ? "hint" : "diagnostic"; }
export function formatDiagnostics(items: Array<{ path: string; diagnostic: Diagnostic }>, workspaceRoot: string): string[] { return items.map(({ path, diagnostic }) => `${relativePath(path, workspaceRoot)}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1} ${diagnosticSeverityName(diagnostic.severity)} ${diagnostic.message}`); }
export function diagnosticsDetails(map: Map<string, Diagnostic[]>): Array<{ path: string; line: number; column: number; severity: string; message: string; source?: string; code?: string | number }> { return [...map.entries()].flatMap(([path, diagnostics]) => diagnostics.map((d) => ({ path, line: d.range.start.line + 1, column: d.range.start.character + 1, severity: diagnosticSeverityName(d.severity), message: d.message, source: d.source, code: d.code }))); }
export function rangeToDetails(range: Range) { return { startLine: range.start.line + 1, startColumn: range.start.character + 1, endLine: range.end.line + 1, endColumn: range.end.character + 1 }; }
export function formatSymbol(s: DocumentSymbol): string { return `${symbolKindName(s.kind)} ${s.name} ${rangeToDetails(s.range).startLine}-${rangeToDetails(s.range).endLine}`; }
export function errorResult(name: string, err: unknown) { return { content: [{ type: "text" as const, text: `${name} error: ${err instanceof Error ? err.message : String(err)}` }], details: {}, isError: true }; }
export const symbolKindNames: Record<number, string> = { 1: "File", 2: "Module", 3: "Namespace", 4: "Package", 5: "Class", 6: "Method", 7: "Property", 8: "Field", 9: "Constructor", 10: "Enum", 11: "Interface", 12: "Function", 13: "Variable", 14: "Constant", 15: "String", 16: "Number", 17: "Boolean", 18: "Array", 19: "Object", 20: "Key", 21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event", 25: "Operator", 26: "TypeParameter" };
export function symbolKindName(kind: number): string { return symbolKindNames[kind] || `Kind(${kind})`; }
export function formatSymbols(symbols: DocumentSymbol[], indent = 0): string[] { return symbols.flatMap((s) => [`${"  ".repeat(indent)}${symbolKindName(s.kind)} ${s.name}`, ...formatSymbols(s.children ?? [], indent + 1)]); }
