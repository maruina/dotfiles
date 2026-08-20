import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { contextKind, formatContextKitAggregate, formatContextKitStatus, type UsageRecord } from "./_status.ts";

describe("formatContextKitStatus", () => {
  it("classifies instructions and rule files", () => {
    assert.equal(contextKind("/repo/AGENTS.md"), "AGENTS.md");
    assert.equal(contextKind("/repo/CLAUDE.local.md"), "CLAUDE.local.md");
    assert.equal(contextKind("/repo/.claude/rules/go.md"), "Claude rule");
    assert.equal(contextKind("/repo/.cursor/rules/go.mdc"), "Cursor rule");
  });

  it("reports injected and ignored context with session totals",  () => {
    const status = formatContextKitStatus({
      cwd: "/repo",
      injectionMessages: 2,
      injected: [
        {
          path: "/repo/service/AGENTS.md",
          kind: "AGENTS.md",
          discovery: "nested instruction discovery",
          bytes: 1_536,
        },
        {
          path: "/repo/.claude/rules/api.md",
          kind: "Claude rule",
          discovery: "path-scoped rule match",
          bytes: 512,
        },
      ],
      ignored: [
        {
          path: "/repo/legacy/AGENTS.md",
          kind: "AGENTS.md",
          discovery: "nested instruction discovery",
          reason: ".pi/agentsignore",
        },
      ],
    });

    assert.match(status, /Injected: 2 message\(s\), 2 file\(s\), 2\.0 KiB/);
    assert.match(status, /\[AGENTS\.md\] nested instruction discovery — service\/AGENTS\.md \(1\.5 KiB\)/);
    assert.match(status, /\[Claude rule\] path-scoped rule match — \.claude\/rules\/api\.md \(512 B\)/);
    assert.match(status, /Ignored by configuration:/);
    assert.match(status, /\[AGENTS\.md\] nested instruction discovery — legacy\/AGENTS\.md \(\.pi\/agentsignore\)/);
  });

  it("reports an empty session explicitly", () => {
    const status = formatContextKitStatus({
      cwd: "/repo",
      injectionMessages: 0,
      injected: [],
      ignored: [],
    });

    assert.match(status, /Injected: 0 message\(s\), 0 file\(s\), 0 B/);
    assert.match(status, /Injected files:\n- none/);
    assert.match(status, /Ignored by configuration:\n- none/);
  });
});

describe("formatContextKitAggregate", () => {
  const home = "/Users/test";

  function record(partial: Partial<UsageRecord> & { sessionId: string }): UsageRecord {
    return {
      cwd: "/repo",
      mtime: 0,
      injectionMessages: 0,
      injected: [],
      ignored: [],
      ...partial,
    };
  }

  it("reports an empty store", () => {
    const status = formatContextKitAggregate([], home);

    assert.match(status, /Recorded: 0 session\(s\), 0 used context-kit/);
    assert.match(status, /Total injected: 0 message\(s\), 0 file\(s\), 0 B/);
    assert.match(status, /Total ignored: 0 file\(s\)/);
    assert.match(status, /Top injected files \(by sessions\):\n- none/);
    assert.doesNotMatch(status, /By kind:/);
  });

  it("aggregates totals across sessions and ranks top files", () => {
    const status = formatContextKitAggregate(
      [
        record({
          sessionId: "s1",
          injectionMessages: 2,
          injected: [
            { path: "/Users/test/repo/service/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", bytes: 1_536 },
            { path: "/Users/test/repo/.claude/rules/api.md", kind: "Claude rule", discovery: "path-scoped rule match", bytes: 512 },
          ],
          ignored: [{ path: "/Users/test/repo/legacy/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", reason: ".pi/agentsignore" }],
        }),
        record({
          sessionId: "s2",
          injectionMessages: 1,
          injected: [
            { path: "/Users/test/repo/service/AGENTS.md", kind: "AGENTS.md", discovery: "nested instruction discovery", bytes: 1_536 },
          ],
        }),
        record({ sessionId: "s3", injectionMessages: 0 }),
      ],
      home,
    );

    assert.match(status, /Recorded: 3 session\(s\), 2 used context-kit/);
    assert.match(status, /Total injected: 3 message\(s\), 3 file\(s\), 3\.5 KiB/);
    assert.match(status, /Total ignored: 1 file\(s\)/);
    assert.match(status, /- ~\/repo\/service\/AGENTS\.md — 2 session\(s\), 1\.5 KiB/);
    assert.match(status, /- ~\/repo\/\.claude\/rules\/api\.md — 1 session\(s\), 512 B/);
    assert.match(status, /By kind: AGENTS\.md 67%, Claude rule 33%/);
  });

  it("caps top injected files at five", () => {
    const injected = Array.from({ length: 7 }, (_, i) => ({
      path: `/repo/f${i}/AGENTS.md`,
      kind: "AGENTS.md" as const,
      discovery: "nested instruction discovery" as const,
      bytes: 100,
    }));
    const records = injected.map((file, i) =>
      record({ sessionId: `s${i}`, injectionMessages: 1, injected: [file] }),
    );
    const status = formatContextKitAggregate(records, home);

    const topLines = status
      .split("\n")
      .filter((l) => l.startsWith("- /repo/f"));
    assert.equal(topLines.length, 5);
  });
});
