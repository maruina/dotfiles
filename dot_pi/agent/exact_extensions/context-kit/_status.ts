import { isAbsolute, relative } from "node:path";

export type ContextKitSourceKind = "AGENTS.md" | "CLAUDE.md" | "AGENTS.local.md" | "CLAUDE.local.md" | "Claude rule" | "Cursor rule";
export type ContextKitDiscovery = "Pi-loaded context" | "Pi-loaded local sibling" | "nested instruction discovery" | "path-scoped rule match";

export type InjectedContextFile = {
  path: string;
  kind: ContextKitSourceKind;
  discovery: ContextKitDiscovery;
  bytes: number;
};

export type IgnoredContextFile = Omit<InjectedContextFile, "bytes"> & {
  reason: ".pi/agentsignore" | ".pi/ruleignore";
};

export function contextKind(path: string): ContextKitSourceKind {
  if (path.includes("/.claude/rules/")) return "Claude rule";
  if (path.includes("/.cursor/rules/")) return "Cursor rule";
  if (path.endsWith("/AGENTS.local.md")) return "AGENTS.local.md";
  if (path.endsWith("/CLAUDE.local.md")) return "CLAUDE.local.md";
  if (path.endsWith("/CLAUDE.md")) return "CLAUDE.md";
  return "AGENTS.md";
}

export function formatContextKitStatus(status: {
  cwd: string;
  injectionMessages: number;
  injected: InjectedContextFile[];
  ignored: IgnoredContextFile[];
}): string {
  const bytes = status.injected.reduce((total, file) => total + file.bytes, 0);
  const lines = [
    "Context-kit status (current session)",
    `Injected: ${status.injectionMessages} message(s), ${status.injected.length} file(s), ${formatBytes(bytes)}`,
    "",
    "Injected files:",
    ...(status.injected.length > 0
      ? status.injected.map((file) => `- [${file.kind}] ${file.discovery} — ${displayPath(file.path, status.cwd)} (${formatBytes(file.bytes)})`)
      : ["- none"]),
    "",
    "Ignored by configuration:",
    ...(status.ignored.length > 0
      ? status.ignored.map((file) => `- [${file.kind}] ${file.discovery} — ${displayPath(file.path, status.cwd)} (${file.reason})`)
      : ["- none"]),
  ];
  return lines.join("\n");
}

function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(1)} KiB`;
}
