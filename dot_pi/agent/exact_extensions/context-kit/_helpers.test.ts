import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findLocalSibling, walkUpForAgents } from "./_agents.ts";
import { contextKind, formatContextKitAggregate, formatContextKitStatus, type UsageRecord } from "./_status.ts";
import { loadAllUsageRecords, loadUsageRecord, saveUsageRecord } from "./_usage.ts";
import register from "./index.ts";

test("walkUpForAgents orders shallowest-first with AGENTS.md before CLAUDE.md and stops at cwd", () => {
  const cwd = mkdtempSync(join(tmpdir(), "context-kit-walk-"));
  const elsewhere = mkdtempSync(join(tmpdir(), "context-kit-walk-out-"));
  try {
    const write = (rel: string) => {
      const full = join(cwd, rel);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, "x");
    };
    write("AGENTS.md");
    write("a/AGENTS.md");
    write("a/CLAUDE.md");
    write("a/b/c/AGENTS.md");

    assert.deepEqual(walkUpForAgents(join(cwd, "a/b/c"), cwd), [
      join(cwd, "a/AGENTS.md"),
      join(cwd, "a/CLAUDE.md"),
      join(cwd, "a/b/c/AGENTS.md"),
    ]);
    assert.deepEqual(walkUpForAgents(cwd, cwd), []);
    assert.deepEqual(walkUpForAgents(elsewhere, cwd), []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
});

test("findLocalSibling resolves .local.md siblings without recursing", () => {
  const dir = mkdtempSync(join(tmpdir(), "context-kit-sibling-"));
  try {
    writeFileSync(join(dir, "AGENTS.md"), "base");
    writeFileSync(join(dir, "CLAUDE.md"), "base");
    writeFileSync(join(dir, "CLAUDE.local.md"), "local");
    assert.equal(findLocalSibling(join(dir, "AGENTS.md")), null);
    assert.equal(findLocalSibling(join(dir, "CLAUDE.md")), join(dir, "CLAUDE.local.md"));
    assert.equal(findLocalSibling(join(dir, "CLAUDE.local.md")), null);
    assert.equal(findLocalSibling(join(dir, "notes.txt")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("status formatters classify kinds, aggregate across sessions, and cap top files at five", () => {
  assert.equal(contextKind("/repo/AGENTS.md"), "AGENTS.md");
  assert.equal(contextKind("/repo/CLAUDE.local.md"), "CLAUDE.local.md");
  assert.equal(contextKind("/repo/.claude/rules/go.md"), "Claude rule");
  assert.equal(contextKind("/repo/.cursor/rules/go.mdc"), "Cursor rule");

  const status = formatContextKitStatus({
    cwd: "/repo",
    injectionMessages: 2,
    blockedMutations: 1,
    injected: [
      { path: "/repo/service/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", bytes: 1_536 },
      { path: "/repo/.claude/rules/api.md", kind: "Claude rule", discovery: "path-scoped rule match", bytes: 512 },
    ],
  });
  assert.match(status, /Injected: 2 message\(s\), 2 file\(s\), 2\.0 KiB/);
  assert.match(status, /Blocked mutations: 1/);

  const records: UsageRecord[] = Array.from({ length: 7 }, (_, i) => ({
    sessionId: `s${i}`,
    cwd: "/repo",
    mtime: i,
    injectionMessages: 1,
    injected: [{ path: `/Users/test/repo/f${i}/AGENTS.md`, kind: "AGENTS.md", discovery: "nested instruction discovery", bytes: 100 }],
  }));
  const aggregate = formatContextKitAggregate(records, "/Users/test");
  assert.match(aggregate, /Recorded: 7 session\(s\), 7 used context-kit/);
  assert.equal(aggregate.split("\n").filter((l) => l.startsWith("- ~/repo/f")).length, 5);
});

test("usage store round-trips, orders newest-first, and skips corrupt files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ck-usage-"));
  try {
    const rec = (sessionId: string, mtime: number): UsageRecord => ({
      sessionId, cwd: "/repo", mtime, injectionMessages: 1, injected: [],
    });
    assert.equal(loadUsageRecord(dir, "missing"), null);
    saveUsageRecord(dir, rec("old", 1000));
    saveUsageRecord(dir, rec("new", 2000));
    writeFileSync(join(dir, "corrupt.json"), "{bad");
    assert.deepEqual(loadUsageRecord(dir, "old"), rec("old", 1000));
    assert.deepEqual(loadAllUsageRecords(dir).map((r) => r.sessionId), ["new", "old"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("/context-kit command reports status and rejects unknown actions", async () => {
  const usageDir = mkdtempSync(join(tmpdir(), "ck-cmd-"));
  const prev = process.env.PI_CONTEXT_KIT_USAGE_DIR;
  process.env.PI_CONTEXT_KIT_USAGE_DIR = usageDir;
  try {
    const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<void> }>();
    register({
      on() {},
      registerMessageRenderer() {},
      registerCommand(name: string, command: { handler: (args: string, ctx: unknown) => Promise<void> }) {
        commands.set(name, command);
      },
    } as never);
    const notes: Array<{ text: string; level: string }> = [];
    const ctx = { cwd: "/repo", ui: { notify: (text: string, level: string) => notes.push({ text, level }) } };
    await commands.get("context-kit")?.handler("status", ctx);
    await commands.get("context-kit")?.handler("reset", ctx);
    assert.equal(notes[0]?.level, "info");
    assert.match(notes[0]?.text ?? "", /Context-kit status/);
    assert.deepEqual(notes[1], { text: "Usage: /context-kit [status]", level: "error" });
  } finally {
    if (prev === undefined) delete process.env.PI_CONTEXT_KIT_USAGE_DIR;
    else process.env.PI_CONTEXT_KIT_USAGE_DIR = prev;
    rmSync(usageDir, { recursive: true, force: true });
  }
});
