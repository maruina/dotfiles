import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { contextKind, formatContextKitStatus } from "./_status.ts";

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
