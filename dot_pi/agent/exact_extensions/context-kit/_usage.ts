import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { writeAtomicJson } from "../_shared/fs.ts";
import type { UsageRecord } from "./_status.ts";

/**
 * Per-session usage persistence for context-kit.
 *
 * One JSON file per session under `<usageDir>/<sessionId>.json`, written
 * atomically (temp + rename) so a crash mid-write cannot leave a partial
 * record that corrupts the aggregate. `loadAllUsageRecords` bounds growth at
 * `MAX_RECORDS` by pruning the oldest by mtime.
 */

const MAX_RECORDS = 1000;

export function usageRecordPath(usageDir: string, sessionId: string): string {
  return join(usageDir, `${sessionId}.json`);
}

export function saveUsageRecord(usageDir: string, record: UsageRecord): void {
  mkdirSync(usageDir, { recursive: true });
  writeAtomicJson(usageRecordPath(usageDir, record.sessionId), record);
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
