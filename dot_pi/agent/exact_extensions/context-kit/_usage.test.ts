import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  backfillFromSessions,
  loadAllUsageRecords,
  loadUsageRecord,
  parseDiscoveryMessage,
  saveUsageRecord,
} from "./_usage.ts";
import type { UsageRecord } from "./_status.ts";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `ck-${prefix}-`));
}

function discoveryMessage(files: { path: string; content: string }[]): string {
  const header =
    "[Project-specific context discovered for files being worked on in this session. " +
    "Apply these guidelines; do not acknowledge this message or its delivery mechanism.]\n";
  const body = files.map((f) => `\n## ${f.path}\n\n${f.content.trimEnd()}\n`).join("\n");
  return header + body;
}

describe("parseDiscoveryMessage", () => {
  it("extracts path and byte size from each block", () => {
    const content = discoveryMessage([
      { path: "/repo/service/AGENTS.md", content: "# Service\n\nDo things." },
      { path: "/repo/.claude/rules/api.md", content: "Be RESTful." },
    ]);
    const files = parseDiscoveryMessage(content);

    assert.equal(files.length, 2);
    assert.equal(files[0]?.path, "/repo/service/AGENTS.md");
    assert.equal(files[0]?.bytes, Buffer.byteLength("# Service\n\nDo things.", "utf8"));
    assert.equal(files[1]?.path, "/repo/.claude/rules/api.md");
    assert.equal(files[1]?.bytes, Buffer.byteLength("Be RESTful.", "utf8"));
  });

  it("ignores markdown headings that are not absolute paths", () => {
    const content = discoveryMessage([
      {
        path: "/repo/AGENTS.md",
        content: "# Title\n\n## Not a path\n\nbody",
      },
    ]);
    const files = parseDiscoveryMessage(content);

    assert.equal(files.length, 1);
    assert.equal(files[0]?.path, "/repo/AGENTS.md");
  });

  it("returns nothing for a message with no blocks", () => {
    assert.deepEqual(parseDiscoveryMessage("[header only]\n"), []);
  });
});

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
      ignored: [],
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
    // Save MAX_RECORDS + a few, with ascending mtime so the oldest are clear.
    const cap = 1000;
    for (let i = 0; i < cap + 3; i++) {
      saveUsageRecord(usageDir, record(`s${i}`, i));
    }
    const all = loadAllUsageRecords(usageDir);

    assert.equal(all.length, cap);
    // The three oldest (s0, s1, s2) should have been deleted from disk.
    assert.equal(loadUsageRecord(usageDir, "s0"), null);
    assert.equal(loadUsageRecord(usageDir, "s2"), null);
    assert.ok(loadUsageRecord(usageDir, "s3"));
    // Newest retained.
    assert.equal(all[0]?.sessionId, `s${cap + 2}`);
  });
});

describe("backfillFromSessions", () => {
  let sessionsDir: string;
  let usageDir: string;

  beforeEach(() => {
    sessionsDir = tempDir("sessions");
    usageDir = tempDir("usage");
  });
  afterEach(() => {
    rmSync(sessionsDir, { recursive: true, force: true });
    rmSync(usageDir, { recursive: true, force: true });
  });

  function writeSession(cwdSlug: string, fileName: string, sessionId: string, cwd: string, messages: string[]): void {
    const dir = join(sessionsDir, cwdSlug);
    mkdirSync(dir, { recursive: true });
    const header = JSON.stringify({ type: "session", version: 3, id: sessionId, timestamp: "2026-08-20T08:00:00.000Z", cwd });
    writeFileSync(join(dir, fileName), [header, ...messages].join("\n") + "\n");
  }

  it("reconstructs records from context-kit-discovery messages", async () => {
    const msg = JSON.stringify({
      type: "custom_message",
      customType: "context-kit-discovery",
      content: discoveryMessage([
        { path: "/repo/service/AGENTS.md", content: "# Service\n\nDo things." },
      ]),
    });
    writeSession("--repo--", "2026-08-20T08-00-00-000Z_s1.jsonl", "s1", "/repo", [msg]);

    const written = await backfillFromSessions(sessionsDir, usageDir);
    assert.equal(written, 1);

    const all = loadAllUsageRecords(usageDir);
    assert.equal(all.length, 1);
    assert.equal(all[0]?.sessionId, "s1");
    assert.equal(all[0]?.cwd, "/repo");
    assert.equal(all[0]?.injectionMessages, 1);
    assert.equal(all[0]?.injected.length, 1);
    assert.equal(all[0]?.injected[0]?.path, "/repo/service/AGENTS.md");
    assert.equal(all[0]?.injected[0]?.kind, "AGENTS.md");
    assert.deepEqual(all[0]?.ignored, []);
  });

  it("skips sessions with no context-kit injections", async () => {
    writeSession("--repo--", "2026-08-20T08-00-00-000Z_s1.jsonl", "s1", "/repo", [
      JSON.stringify({ type: "user", content: "hello" }),
    ]);

    const written = await backfillFromSessions(sessionsDir, usageDir);
    assert.equal(written, 0);
    assert.equal(loadAllUsageRecords(usageDir).length, 0);
  });

  it("does not clobber an existing live record", async () => {
    writeSession("--repo--", "2026-08-20T08-00-00-000Z_s1.jsonl", "s1", "/repo", [
      JSON.stringify({ type: "custom_message", customType: "context-kit-discovery", content: discoveryMessage([{ path: "/repo/AGENTS.md", content: "x" }]) }),
    ]);
    // Simulate a live record with richer data (ignored files).
    saveUsageRecord(usageDir, {
      sessionId: "s1",
      cwd: "/repo",
      mtime: 9999,
      injectionMessages: 1,
      injected: [{ path: "/repo/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", bytes: 1 }],
      ignored: [{ path: "/repo/legacy/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", reason: ".pi/agentsignore" }],
    });

    const written = await backfillFromSessions(sessionsDir, usageDir);
    assert.equal(written, 0);

    const loaded = loadUsageRecord(usageDir, "s1");
    assert.equal(loaded?.ignored.length, 1, "live record's ignored list must survive backfill");
    assert.equal(loaded?.mtime, 9999);
  });
});
