import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { Diagnostic, DocumentSymbol, ServerConfig } from "./protocol";
import { diagnosticsDetails, flattenSymbols, relativePath, symbolKindName } from "./utils";

function tsLanguageId(filePath: string): string { const ext = extname(filePath); return ext === ".tsx" ? "typescriptreact" : ext === ".jsx" ? "javascriptreact" : [".js", ".mjs", ".cjs"].includes(ext) ? "javascript" : "typescript"; }
function listFiles(dir: string, extensions: string[]): string[] { try { return readdirSync(dir).filter((name) => extensions.includes(extname(name))).map((name) => join(dir, name)); } catch { return []; } }
function goPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".go"]); const pkg = /^package\s+(\w+)/m.exec(readFileSync(filePath, "utf8"))?.[1] ?? "unknown"; return { packageName: pkg, directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => f.endsWith("_test.go")).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }
function tsPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]); return { directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => /(?:\.test|\.spec)\.[cm]?[tj]sx?$/.test(f)).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name) || [5, 6, 11, 12, 23].includes(s.kind)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }

export const SERVER_CONFIGS: ServerConfig[] = [
  { id: "go", label: "Go", command: "gopls", args: ["serve"], extensions: [".go"], rootMarkers: ["go.work", "go.mod", ".git"], initializationOptions: { analyses: {}, hints: {} }, languageId: () => "go", packageContext: goPackageContext },
  { id: "typescript", label: "TypeScript", command: "typescript-language-server", args: ["--stdio"], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"], rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", ".git"], languageId: tsLanguageId, packageContext: tsPackageContext },
];
