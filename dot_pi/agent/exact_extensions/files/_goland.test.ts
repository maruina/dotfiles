import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { openWithGoLand } from "../files.ts";

for (const scenario of ["file in worktree", "directory in worktree", "file outside Git", "missing file", "launcher failure"]) {
  it(`opens GoLand: ${scenario}`, async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "goland worktree "));
    try {
      const targetPath = scenario === "directory in worktree" ? root : path.join(root, "selected file.go");
      if (targetPath !== root && scenario !== "missing file") writeFileSync(targetPath, "package main\n");
      const calls: Array<{ command: string; args: string[] }> = [];
      const notifications: unknown[][] = [];
      const pi = {
        exec: async (command: string, args: string[]) => {
          calls.push({ command, args });
          if (command === "git") return { code: scenario === "file outside Git" ? 1 : 0, stdout: root, stderr: "" };
          return { code: scenario === "launcher failure" ? 1 : 0, stdout: "", stderr: "launcher failed" };
        },
      };
      const ctx = { ui: { notify: (...args: unknown[]) => notifications.push(args) } };
      await openWithGoLand(pi as never, ctx as never, { resolvedPath: targetPath, displayPath: targetPath } as never);
      if (scenario === "missing file") {
        assert.equal(calls.length, 0);
        assert.deepEqual(notifications, [[`File not found: ${targetPath}`, "error"]]);
        return;
      }
      const paths = scenario === "directory in worktree" || scenario === "file outside Git" ? [targetPath] : [root, targetPath];
      assert.deepEqual(calls[1], process.platform === "darwin"
        ? { command: "open", args: ["-na", "GoLand.app", "--args", ...paths] }
        : { command: "goland", args: paths });
      assert.deepEqual(notifications, scenario === "launcher failure" ? [["launcher failed", "error"]] : []);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
