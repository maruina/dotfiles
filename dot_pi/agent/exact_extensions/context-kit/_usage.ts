import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contextKind, type ContextKitDiscovery, type InjectedContextFile, type UsageRecord } from "./_status.ts";

/**
 * Per-session usage persistence for context-kit.
 *
 * One JSON file per session under `<usageDir>/<sessionId>.json`, written
 * atomically (temp + rename) so a crash mid-write cannot leave a partial
 * record that corrupts the aggregate. `loadAllUsageRecords` bounds growth at
 * `MAX_RECORDS` by pruning the oldest by mtime.
 *
 * Historical sessions (before this store existed) are backfilled once from the
 * Pi session transcripts: every `context-kit-discovery` custom message is a
 * record of what was injected that turn, so we can reconstruct past usage
 * without having captured it live. Suppression (`ignored`) is in-memory only
 * and leaves no trace in the transcript, so backfilled records carry an empty
 * `ignored` list; going-forward records capture it exactly.
 */

const MAX_RECORDS = 1000;

export function usageRecordPath(usageDir: string, sessionId: string): string {
  return join(usageDir, `${sessionId}.json`);
}

export function saveUsageRecord(usageDir: string, record: UsageRecord): void {
  mkdirSync(usageDir, { recursive: true });
  const path = usageRecordPath(usageDir, record.sessionId);
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(record));
  renameSync(tmp, path);
}

export function loadUsageRecord(usageDir: string, sessionId: string): UsageRecord | null {
  try {
    return JSON.parse(readFileSync(usageRecordPath(usageDir, sessionId), "utf8")) as UsageRecord;
  } catch {
    return null;
  }
}

/**
 * Load every persisted record, newest first, pruning the oldest beyond
 * `MAX_RECORDS`. Corrupt files are skipped rather than fatal: a single bad
 * record must not break `/context-kit status`.
 */
export function loadAllUsageRecords(usageDir: string): UsageRecord[] {
  if (!existsSync(usageDir)) return [];
  const files = readdirSync(usageDir).filter((f) => f.endsWith(".json") && !f.startsWith("."));
  const records: UsageRecord[] = [];
  for (const f of files) {
    try {
      const rec = JSON.parse(readFileSync(join(usageDir, f), "utf8")) as UsageRecord;
      if (rec && typeof rec.sessionId === "string") records.push(rec);
    } catch {
      // Skip unreadable/invalid records.
    }
  }
  records.sort((a, b) => b.mtime - a.mtime);
  if (records.length <= MAX_RECORDS) return records;
  for (const r of records.slice(MAX_RECORDS)) {
    try {
      unlinkSync(usageRecordPath(usageDir, r.sessionId));
    } catch {
      // Best-effort prune.
    }
  }
  return records.slice(0, MAX_RECORDS);
}

/**
 * Reconstruct usage records from Pi session transcripts. Intended to be run
 * once via the `backfill-context-kit-usage` script after this store ships, so
 * `/context-kit status` has historical data immediately rather than only from
 * the first session after this lands.
 *
 * Only sessions containing `context-kit-discovery` messages produce records:
 * sessions where context-kit injected nothing leave no transcript trace, so
 * they are invisible to backfill. Going-forward, every session gets a record
 * (the extension writes one on first turn), so the recorded/used ratio is
 * accurate from this point on.
 *
 * Returns the number of records written.
 */
export async function backfillFromSessions(sessionsDir: string, usageDir: string): Promise<number> {
  if (!existsSync(sessionsDir)) return 0;
  mkdirSync(usageDir, { recursive: true });
  let written = 0;
  let processed = 0;
  for (const cwdDir of readdirSync(sessionsDir)) {
    const dir = join(sessionsDir, cwdDir);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let files: string[];
    try {
      files = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const filePath = join(dir, f);
      let mtime: number;
      try {
        mtime = statSync(filePath).mtimeMs;
      } catch {
        continue;
      }
      const record = parseSessionFile(filePath, mtime);
      // Only sessions that actually injected context leave a transcript trace;
      // sessions where context-kit did nothing are invisible to backfill.
      if (!record || record.injected.length === 0) continue;
      // A live record (if the session is currently active) is richer: it has
      // ignored files and exact bytes. Don't clobber it with backfill.
      if (existsSync(usageRecordPath(usageDir, record.sessionId))) continue;
      saveUsageRecord(usageDir, record);
      written++;
      // Yield periodically so a large sessions dir doesn't monopolize the
      // event loop while backfilling in the background.
      if (++processed % 25 === 0) await new Promise((r) => setImmediate(r));
    }
  }
  return written;
}

function parseSessionFile(filePath: string, mtime: number): UsageRecord | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  let sessionId: string | undefined;
  let cwd = "";
  let injectionMessages = 0;
  const injected: InjectedContextFile[] = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (sessionId === undefined && entry.type === "session") {
      const id = entry.id;
      if (typeof id === "string") sessionId = id;
      if (typeof entry.cwd === "string") cwd = entry.cwd;
      continue;
    }
    if (entry.type === "custom_message" && entry.customType === "context-kit-discovery") {
      injectionMessages++;
      for (const f of parseDiscoveryMessage(String(entry.content ?? ""))) {
        injected.push({
          path: f.path,
          kind: contextKind(f.path),
          discovery: inferDiscovery(f.path),
          bytes: f.bytes,
        });
      }
    }
  }
  if (sessionId === undefined) return null;
  return { sessionId, cwd, mtime, injectionMessages, injected, ignored: [] };
}

/**
 * Parse a `context-kit-discovery` message body into its constituent files.
 *
 * The body is a header line followed by `## <absolute-path>\n\n<content>`
 * blocks (see `buildDiscoveryMessage` in index.ts). We anchor on paths that
 * start with `/` so ordinary Markdown `##` headings inside file content do
 * not register as block delimiters.
 */
export function parseDiscoveryMessage(content: string): { path: string; bytes: number }[] {
  const files: { path: string; bytes: number }[] = [];
  const regex = /\n## (\/[^\n]+)\n\n/g;
  const matches = [...content.matchAll(regex)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    if (match.index === undefined) continue;
    const path = match[1].trim();
    const bodyStart = match.index + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1]!.index! : content.length;
    const body = content.slice(bodyStart, bodyEnd).trimEnd();
    files.push({ path, bytes: Buffer.byteLength(body, "utf8") });
  }
  return files;
}

/**
 * Best-effort recovery of the discovery mechanism from the path alone, since
 * the discovery message does not record it per file. Ambiguous only for
 * `.local.md` siblings (could be a Pi-loaded sibling or a nested-discovered
 * sibling); we pick the more common Pi-loaded case. The aggregate display
 * does not show discovery, so this only affects record completeness.
 */
function inferDiscovery(path: string): ContextKitDiscovery {
  if (path.includes("/.claude/rules/") || path.includes("/.cursor/rules/")) return "path-scoped rule match";
  if (path.endsWith(".local.md")) return "Pi-loaded local sibling";
  return "nested instruction discovery";
}
