import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import net from "node:net";
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
  "recover-writer",
  "recover-simplify",
  "recover-verify",
  "recover-blocked",
  "recover-refuse",
  "recover-dirty",
  "recover-cancel",
  "recover-definite",
  "recover-uncertain",
  "recover-dependent",
  "recover-limit",
  "verify-dirty",
  "verify-commit",
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
    const recovering = failure.startsWith("recover-");
    const socket = path.join(temp, "rex.sock");
    if (recovering) {
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => server.once("error", reject).listen(socket, resolve));
      t.after(() => server.close());
    }
    const result = run({
      ...options,
      env: {
        ...options.env,
        REX_SERVER: "unix://" + socket,
        REX_SESSION: "session:fixture",
        REX_BLOCK: "block:anchor",
      },
      rexCommand: [process.execPath, path.join(import.meta.dirname, "_fixtures/rex.mjs")],
      approve: async () => failure !== "recover-refuse",
    });
    if (failure === "hang") {
      for (let i = 0; i < 200 && !fs.existsSync(log); i++) await delay(10);
      await assert.rejects(run(options), /lock/i);
      controller.abort();
    }
    if (failure === "recover-cancel") {
      for (let i = 0; i < 300 && !fs.existsSync(log + ".ready"); i++) await delay(10);
      assert.ok(fs.existsSync(log + ".ready"));
      controller.abort();
    }
    const stopped =
      recovering && !["recover-verify", "recover-writer", "recover-blocked", "recover-simplify"].includes(failure);
    if (stopped) await assert.rejects(result);
    else if (failure.startsWith("verify-")) await assert.rejects(result, /Verifier Git snapshot changed/);
    else if (failure && !recovering) await assert.rejects(result);
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
    if (recovering) {
      const interactive = calls.filter((a) => !a.includes("--mode"));
      const entries = fs.readdirSync(options.root);
      assert.equal(
        entries.some((n) => n.startsWith("lock-")),
        failure === "recover-uncertain",
      );
      const bundle = path.join(options.root, entries.find((n) => n.startsWith("run-"))!);
      assert.equal(fs.existsSync(path.join(bundle, "completed")), failure !== "recover-uncertain");
      if (failure === "recover-cancel")
        assert.equal(fs.readFileSync(log + ".term", "utf8"), fs.readFileSync(log + ".ready", "utf8"));
      if (stopped) {
        assert.equal(
          interactive.length,
          failure === "recover-limit" ? 2 : ["recover-definite", "recover-uncertain"].includes(failure) ? 0 : 1,
        );
        assert.equal(calls.filter((a) => a.includes("--mode")).length, failure === "recover-limit" ? 6 : 1);
        return;
      }
      assert.equal(interactive.length, failure === "recover-verify" ? 2 : 1);
      for (const a of interactive) {
        assert.equal(a[a.indexOf("--model") + 1], "a");
        if (failure === "recover-writer" || failure === "recover-simplify")
          assert.equal(
            a[a.indexOf("--session") + 1],
            fs.realpathSync(
              path.join(bundle, failure === "recover-simplify" ? "simplify-3" : "execute-1", "sessions/saved.jsonl"),
            ),
          );
        else assert.ok(!a.includes("--session"));
      }
      assert.ok(interactive.every((a) => a.includes("--session-dir") && !a.includes("--fork")));
      assert.ok(calls.at(-1)!.at(-1)!.includes("--implemented-by 'p/c'"));
      return;
    }
    assert.deepEqual(
      calls.map((args) => args.at(-1)!.split(" ")[0]),
      failure && !failure.startsWith("verify-") ? ["/execute"] : ["/execute", "/execute", "/simplify", "/verify"],
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
