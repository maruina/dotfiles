import { homedir } from "node:os";
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

/**
 * Persisted per-session context-kit activity. One record per session, stored
 * under `~/.pi/agent/context-kit-usage/<sessionId>.json` and aggregated by
 * `/context-kit status` to evaluate whether the extension earns its keep.
 *
 * `ignored` is empty for records backfilled from session files: suppression is
 * in-memory only and is not persisted in the session transcript, so it cannot
 * be reconstructed after the fact. Going-forward records capture it exactly.
 */
export type UsageRecord = {
  sessionId: string;
  cwd: string;
  mtime: number;
  injectionMessages: number;
  injected: InjectedContextFile[];
  ignored: IgnoredContextFile[];
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

/**
 * Render the cross-session aggregate that lets you judge whether context-kit is
 * pulling its weight: how many sessions it touched, what it injected and how
 * often, and the total volume it added to prompts.
 */
export function formatContextKitAggregate(records: UsageRecord[], home: string = homedir()): string {
  const recorded = records.length;
  const used = records.filter((r) => r.injected.length > 0 || r.ignored.length > 0).length;
  const totalMessages = records.reduce((n, r) => n + r.injectionMessages, 0);
  const totalInjectedFiles = records.reduce((n, r) => n + r.injected.length, 0);
  const totalInjectedBytes = records.reduce(
    (n, r) => n + r.injected.reduce((b, f) => b + f.bytes, 0),
    0,
  );
  const totalIgnored = records.reduce((n, r) => n + r.ignored.length, 0);

  // Rank injected files by how many distinct sessions pulled them in; break
  // ties by size. `bytes` is the largest instance seen (a proxy for the file's
  // own size, since the same file is stable across sessions).
  const byPath = new Map<string, { sessions: Set<string>; bytes: number }>();
  for (const r of records) {
    for (const f of r.injected) {
      const entry = byPath.get(f.path) ?? { sessions: new Set<string>(), bytes: 0 };
      entry.sessions.add(r.sessionId);
      if (f.bytes > entry.bytes) entry.bytes = f.bytes;
      byPath.set(f.path, entry);
    }
  }
  const top = [...byPath.entries()]
    .map(([path, v]) => ({ path, sessions: v.sessions.size, bytes: v.bytes }))
    .sort((a, b) => b.sessions - a.sessions || b.bytes - a.bytes)
    .slice(0, 5);

  const kindCounts = new Map<string, number>();
  for (const r of records) {
    for (const f of r.injected) {
      kindCounts.set(f.kind, (kindCounts.get(f.kind) ?? 0) + 1);
    }
  }
  const kindTotal = [...kindCounts.values()].reduce((a, b) => a + b, 0);
  const byKind = [...kindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind} ${kindTotal > 0 ? Math.round((n / kindTotal) * 100) : 0}%`)
    .join(", ");

  const lines = [
    "All sessions",
    `Recorded: ${recorded} session(s), ${used} used context-kit`,
    `Total injected: ${totalMessages} message(s), ${totalInjectedFiles} file(s), ${formatBytes(totalInjectedBytes)}`,
    `Total ignored: ${totalIgnored} file(s)`,
    "",
    "Top injected files (by sessions):",
    ...(top.length > 0
      ? top.map((t) => `- ${displayHomePath(t.path, home)} — ${t.sessions} session(s), ${formatBytes(t.bytes)}`)
      : ["- none"]),
  ];
  if (byKind) lines.push("", `By kind: ${byKind}`);
  return lines.join("\n");
}

function displayPath(path: string, cwd: string): string {
  const rel = relative(cwd, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

function displayHomePath(path: string, home: string): string {
  if (home && (path === home || path.startsWith(home + "/"))) return "~" + path.slice(home.length);
  return path;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(1)} KiB`;
}
