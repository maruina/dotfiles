import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { run } from "./_runner.ts";
for (const failure of [
  "",
  "absent",
  "abort",
  "exit",
  "hang",
  "header",
  "progress",
  "dirty",
  "missing",
  "started",
  "timeout",
])
  test("real Git with fixture Pi: " + (failure || "complete"), async (t) => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "stage-test-"));
    t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
    const repo = path.join(temp, "repo"),
      cwd = path.join(temp, "work");
    fs.mkdirSync(repo);
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: repo,
        stdio: "pipe",
        env: { ...process.env, HOME: temp, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      });
    git("init", "-b", "main");
    git("config", "core.hooksPath", "/dev/null");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.org");
    git("config", "commit.gpgsign", "false");
    fs.mkdirSync(path.join(repo, "plans/demo"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, "plans/demo/plan.md"),
      "### Slice 1\n" + (failure === "started" ? "- [x]" : "- [ ]") + " first\n### Slice 2\n- [ ] second\n",
    );
    git("add", ".");
    git("commit", "-qm", "plan");
    git("worktree", "add", "-qb", "feature", cwd);
    const log = path.join(temp, "argv"),
      controller = new AbortController();
    const model = { provider: "p", id: "a", thinking: "off" };
    const options = {
      cwd,
      plan: "plans/demo/plan.md",
      root: path.join(temp, "state"),
      models: { execute: model, simplify: model, verify: { ...model, id: "b" } },
      signal: controller.signal,
      idleMs: failure === "timeout" ? 1000 : 60000,
      progress: () => {},
      executable: process.execPath,
      prefix: [path.join(import.meta.dirname, "_fixtures/pi.mjs")],
      env: { ...process.env, HOME: temp, ARGV_LOG: log, FAIL: failure },
    };
    const result = run(options);
    if (failure === "hang") {
      for (let i = 0; i < 200 && !fs.existsSync(log); i++) await delay(10);
      await assert.rejects(run(options), /lock/i);
      controller.abort();
    }
    if (failure) await assert.rejects(result);
    else await result;
    if (failure === "started") {
      assert.equal(fs.existsSync(log), false);
      return;
    }
    const calls = fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s) as string[]);
    assert.deepEqual(
      calls.map((args) => args.at(-1)!.split(" ")[0]),
      failure ? ["/execute"] : ["/execute", "/execute", "/simplify", "/verify"],
    );
    const [bundle] = fs.readdirSync(options.root);
    assert.match(bundle, /^run-/);
    if (!failure) {
      const first = path.join(options.root, bundle, "execute-1");
      assert.equal(fs.statSync(path.join(first, "stderr")).size, 16384);
      assert.equal(fs.statSync(path.join(first, "sessions")).mode & 0o777, 0o700);
      assert.equal(fs.statSync(path.join(first, "session-id")).mode & 0o777, 0o600);
      assert.ok(calls.at(-1)!.at(-1)!.includes("--implemented-by 'p/a' --simplified-by 'p/a'"));
    }
    assert.ok(
      calls.every((args) => args.includes("--session-dir") && args.includes("--mode") && args.includes("--thinking")),
    );
  });
