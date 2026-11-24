import assert from "node:assert/strict";
import test from "node:test";

import prCleanup, {
  formatCleanupOutcome,
  parsePrCleanupArg,
  workspaceScriptPath,
} from "./pr-cleanup.ts";

test("workspaceScriptPath respects PI_CODING_AGENT_DIR and falls back to ~/.pi/agent", () => {
  assert.equal(
    workspaceScriptPath({ PI_CODING_AGENT_DIR: "/custom/agent" }, "/Users/example"),
    "/custom/agent/scripts/pr-validate-report/workspace.mjs",
  );
  assert.equal(
    workspaceScriptPath({}, "/Users/example"),
    "/Users/example/.pi/agent/scripts/pr-validate-report/workspace.mjs",
  );
});

test("parsePrCleanupArg validates single URL and strips optional surrounding quotes", () => {
  assert.deepEqual(
    parsePrCleanupArg("https://github.com/maruina/dotfiles/pull/42"),
    { ok: true, url: "https://github.com/maruina/dotfiles/pull/42" },
  );
  assert.deepEqual(
    parsePrCleanupArg(`  "https://github.com/maruina/dotfiles/pull/42"  `),
    { ok: true, url: "https://github.com/maruina/dotfiles/pull/42" },
  );
  assert.equal(parsePrCleanupArg("   ").ok, false);
  assert.equal(parsePrCleanupArg("https://github.com/a/b/pull/1 extra").ok, false);
});

test("formatCleanupOutcome formats removed, absent, script failure, and invalid JSON", () => {
  assert.deepEqual(
    formatCleanupOutcome({
      code: 0,
      stdout: JSON.stringify({ status: "removed", worktree: "/tmp/wt/pr-42-review" }),
      stderr: "",
    }),
    { ok: true, level: "info", message: "Removed review worktree: /tmp/wt/pr-42-review" },
  );

  assert.deepEqual(
    formatCleanupOutcome({
      code: 0,
      stdout: JSON.stringify({ status: "absent", worktree: "/tmp/wt/pr-42-review" }),
      stderr: "",
    }),
    { ok: true, level: "info", message: "Review worktree already absent: /tmp/wt/pr-42-review" },
  );

  const failed = formatCleanupOutcome({
    code: 1,
    stdout: "",
    stderr: "Review worktree is dirty; retained /tmp/wt/pr-42-review\n",
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.level, "error");
  assert.match(failed.message, /Review worktree is dirty/);

  const badJson = formatCleanupOutcome({ code: 0, stdout: "not-json", stderr: "" });
  assert.equal(badJson.ok, false);
  assert.equal(badJson.level, "error");
  assert.match(badJson.message, /invalid JSON/);
});

test("/pr-cleanup command executes workspace.mjs cleanup directly and notifies outcome", async () => {
  const commands = new Map();
  const execCalls = [];
  const notifications = [];

  prCleanup({
    registerCommand(name, command) {
      commands.set(name, command);
    },
    async exec(cmd, args, opts) {
      execCalls.push({ cmd, args, opts });
      return {
        code: 0,
        stdout: JSON.stringify({ status: "removed", worktree: "/tmp/wt/dotfiles/pr-203-review" }),
        stderr: "",
        killed: false,
        truncated: false,
      };
    },
  });

  assert.ok(commands.has("pr-cleanup"));
  const { handler } = commands.get("pr-cleanup");
  const ctx = {
    ui: { notify: (message, level) => notifications.push({ message, level }) },
  };

  // Missing argument notifies error without invoking exec.
  await handler("   ", ctx);
  assert.equal(execCalls.length, 0);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, "error");
  assert.match(notifications[0].message, /Usage: \/pr-cleanup/);

  // Valid URL invokes workspace.mjs cleanup and reports removed worktree.
  await handler("https://github.com/maruina/dotfiles/pull/203", ctx);
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].cmd, "node");
  assert.match(execCalls[0].args[0], /scripts\/pr-validate-report\/workspace\.mjs$/);
  assert.deepEqual(execCalls[0].args.slice(1), ["cleanup", "https://github.com/maruina/dotfiles/pull/203"]);
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications[1], {
    level: "info",
    message: "Removed review worktree: /tmp/wt/dotfiles/pr-203-review",
  });
});
