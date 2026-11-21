import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { loadAllUsageRecords, loadUsageRecord, saveUsageRecord } from "./_usage.ts";
import type { UsageRecord } from "./_status.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `ck-${prefix}-`));
}

describe("usage store persistence", () => {
  let usageDir: string;

  beforeEach(() => {
    usageDir = tempDir("store");
  });
  afterEach(() => {
    rmSync(usageDir, { recursive: true, force: true });
  });

  function record(id: string, mtime: number, injected = 1): UsageRecord {
    return {
      sessionId: id,
      cwd: "/repo",
      mtime,
      injectionMessages: 1,
      injected: Array.from({ length: injected }, (_, i) => ({
        path: `/repo/f${i}/AGENTS.md`,
        kind: "AGENTS.md" as const,
        discovery: "nested instruction discovery" as const,
        bytes: 100,
      })),
    };
  }

  it("round-trips a record through save and load", () => {
    saveUsageRecord(usageDir, record("s1", 1000));
    const loaded = loadUsageRecord(usageDir, "s1");

    assert.deepEqual(loaded, record("s1", 1000));
  });

  it("returns null for a missing record", () => {
    assert.equal(loadUsageRecord(usageDir, "nope"), null);
  });

  it("loads all records newest-first", () => {
    saveUsageRecord(usageDir, record("old", 1000));
    saveUsageRecord(usageDir, record("new", 2000));
    const all = loadAllUsageRecords(usageDir);

    assert.deepEqual(all.map((r) => r.sessionId), ["new", "old"]);
  });

  it("skips corrupt files without failing", () => {
    saveUsageRecord(usageDir, record("good", 1000));
    writeFileSync(join(usageDir, "bad.json"), "{not json");
    const all = loadAllUsageRecords(usageDir);

    assert.equal(all.length, 1);
    assert.equal(all[0]?.sessionId, "good");
  });

  it("prunes the oldest records beyond the cap", () => {
    const cap = 1000;
    for (let i = 0; i < cap + 3; i++) {
      saveUsageRecord(usageDir, record(`s${i}`, i));
    }
    const all = loadAllUsageRecords(usageDir);

    assert.equal(all.length, cap);
    assert.equal(loadUsageRecord(usageDir, "s0"), null);
    assert.equal(loadUsageRecord(usageDir, "s2"), null);
    assert.ok(loadUsageRecord(usageDir, "s3"));
    assert.equal(all[0]?.sessionId, `s${cap + 2}`);
  });
});
