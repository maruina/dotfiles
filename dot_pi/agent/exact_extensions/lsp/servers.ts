import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { Diagnostic, DocumentSymbol, ServerConfig } from "./protocol";
import { diagnosticsDetails, flattenSymbols, isInsidePath, relativePath, symbolKindName } from "./utils";

const YAML_EXTENSIONS = [".yaml", ".yml"];
const HELM_TEMPLATE_EXTENSIONS = [".yaml", ".yml", ".tpl", ".txt"];

function tsLanguageId(filePath: string): string { const ext = extname(filePath); return ext === ".tsx" ? "typescriptreact" : ext === ".jsx" ? "javascriptreact" : [".js", ".mjs", ".cjs"].includes(ext) ? "javascript" : "typescript"; }
function listFiles(dir: string, extensions: string[]): string[] { try { return readdirSync(dir).filter((name) => extensions.includes(extname(name))).map((name) => join(dir, name)); } catch { return []; } }
function goPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".go"]); const pkg = /^package\s+(\w+)/m.exec(readFileSync(filePath, "utf8"))?.[1] ?? "unknown"; return { packageName: pkg, directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => f.endsWith("_test.go")).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }
function tsPackageContext(filePath: string, workspaceRoot: string, symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const dir = dirname(filePath); const files = listFiles(dir, [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]); return { directory: dir, workspaceRoot, files: files.map((f) => relativePath(f, workspaceRoot)), tests: files.filter((f) => /(?:\.test|\.spec)\.[cm]?[tj]sx?$/.test(f)).map((f) => relativePath(f, workspaceRoot)), exportedSymbols: flattenSymbols(symbols).filter((s) => /^[A-Z]/.test(s.name) || [5, 6, 11, 12, 23].includes(s.kind)).map((s) => ({ name: s.name, kind: symbolKindName(s.kind), line: s.selectionRange.start.line + 1 })), diagnostics: diagnosticsDetails(diagnostics) }; }
function yamlPackageContext(filePath: string, workspaceRoot: string, _symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { return { directory: dirname(filePath), workspaceRoot, diagnostics: diagnosticsDetails(diagnostics) }; }
function helmPackageContext(filePath: string, workspaceRoot: string, _symbols: DocumentSymbol[], diagnostics: Map<string, Diagnostic[]>) { const chartRoot = findHelmChartRoot(filePath); return { chartRoot, directory: dirname(filePath), workspaceRoot, diagnostics: diagnosticsDetails(diagnostics) }; }

export function findHelmChartRoot(filePath: string): string | null {
  const resolved = resolve(filePath);
  let dir = existsSync(resolved) && statSync(resolved).isFile() ? dirname(resolved) : resolved;
  while (true) {
    if (existsSync(join(dir, "Chart.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isHelmFile(filePath: string): boolean {
  const name = basename(filePath);
  const ext = extname(filePath);
  const chartRoot = findHelmChartRoot(filePath);
  if (!chartRoot) return false;
  if (name === "Chart.yaml" || /^values(?:[-.].*)?\.ya?ml$/.test(name)) return true;
  const templatesDir = join(chartRoot, "templates");
  return HELM_TEMPLATE_EXTENSIONS.includes(ext) && isInsidePath(filePath, templatesDir);
}

const yamlSettings = {
  yaml: {
    validate: true,
    hover: true,
    completion: true,
    format: { enable: true },
    schemaStore: { enable: true },
    schemas: {
      "https://json.schemastore.org/github-workflow.json": ".github/workflows/*.{yml,yaml}",
      "https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/master-standalone-strict/all.json": ["k8s/**/*.yaml", "k8s/**/*.yml", "manifests/**/*.yaml", "manifests/**/*.yml", "**/*.k8s.yaml", "**/*.k8s.yml"],
    },
  },
};

const helmSettings = {
  "helm-ls": {
    helmLint: { enabled: true },
    yamlls: {
      enabled: true,
      enabledForFilesGlob: "*.{yaml,yml}",
      diagnosticsLimit: 50,
      showDiagnosticsDirectly: false,
      path: "yaml-language-server",
      config: {
        schemas: { kubernetes: "templates/**" },
        completion: true,
        hover: true,
      },
    },
  },
};

export const SERVER_CONFIGS: ServerConfig[] = [
  { id: "go", label: "Go", command: "gopls", args: ["serve"], extensions: [".go"], rootMarkers: ["go.work", "go.mod", ".git"], initializationOptions: { analyses: {}, hints: {} }, workspaceOverrides: [{ rootMarker: ".bazelversion", command: "dd-gopls", env: { GOPACKAGESDRIVER: "", GOPLS_DISABLE_MODULE_LOADS: "1" }, initializationOptions: { usePlaceholders: true, completeUnimported: true, memoryMode: "DegradeClosed", experimentalWorkspaceModule: false, expandWorkspaceToModule: false, diagnosticsDelay: "2s", analysisProgressReporting: false, staticcheck: false, vulncheck: "Off", directoryFilters: ["-bazel-bin", "-bazel-out", "-bazel-testlogs", "-bazel-dd-source", "-**/node_modules", "-**/vendor", "-**/target", "-**/.git", "-**/rules/go/export/dist", "-**/.cache", "-**/.venv", "-**/.venv-Linux", "-**/.venv-Darwin"], codelenses: { generate: false, regenerate_cgo: false, run_govulncheck: false, tidy: false, upgrade_dependency: false, vendor: false }, hints: { assignVariableTypes: false, compositeLiteralFields: false, compositeLiteralTypes: false, constantValues: false, functionTypeParameters: false, parameterNames: false, rangeVariableTypes: false } } }], languageId: () => "go", packageContext: goPackageContext },
  { id: "typescript", label: "TypeScript", command: "typescript-language-server", args: ["--stdio"], extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"], rootMarkers: ["tsconfig.json", "jsconfig.json", "package.json", ".git"], languageId: tsLanguageId, packageContext: tsPackageContext },
  { id: "helm", label: "Helm", command: "helm_ls", args: ["serve"], extensions: [".yaml", ".yml", ".tpl", ".txt"], rootMarkers: ["Chart.yaml", ".git"], settings: helmSettings, matches: isHelmFile, languageId: () => "helm", packageContext: helmPackageContext },
  { id: "yaml", label: "YAML", command: "yaml-language-server", args: ["--stdio"], extensions: YAML_EXTENSIONS, rootMarkers: [".git"], settings: yamlSettings, languageId: () => "yaml", packageContext: yamlPackageContext },
];
