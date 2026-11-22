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
  "reuse",
  "uncertain-create",
  "partial",
  "wrong-login",
  "unknown-login",
  "no-origin",
  "foreign",
  "https",
  "decline",
  "stale",
  "missing-profile",
  "conflict",
  "non-fast-forward",
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
  "recover-progress",
  "recover-progress-unfixed",
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
  "arp-active",
  "arp-draft",
  "arp-retry-uncertain",
  "arp-stale",
  "arp-incomplete",
  "arp-findings",
  "arp-cancel",
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
    const bare = path.join(temp, "bare");
    git("clone", "--bare", repo, bare);
    git("remote", "add", "origin", "git@github.com:fixture/demo.git");
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD").toString().trim());
    git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    if (failure === "no-origin") git("remote", "remove", "origin");
    if (failure === "foreign" || failure === "https")
      git(
        "remote",
        "set-url",
        "--push",
        "origin",
        failure === "foreign" ? "git@github.com:other/demo.git" : "https://github.com/fixture/demo.git",
      );
    if (failure === "reuse" || failure === "conflict") fs.writeFileSync(bare + ".pr", "1");
    if (failure === "non-fast-forward") {
      git("commit", "--allow-empty", "-qm", "other writer");
      git("--git-dir=" + bare, "fetch", repo, "+refs/heads/main:refs/heads/feature");
    }
    const bin = path.join(temp, "bin");
    fs.mkdirSync(bin);
    for (const name of ["ssh", "gh"])
      fs.writeFileSync(
        path.join(bin, name),
        fs.readFileSync(path.join(import.meta.dirname, "_fixtures", name + ".mjs")),
        { mode: 0o700 },
      );
    const profilePath = path.join(temp, "profile.json");
    const arp = failure.startsWith("arp-");
    const profile = arp || failure === "recover-writer" ? "work" : "personal";
    fs.writeFileSync(
      profilePath,
      execFileSync(
        "chezmoi",
        [
          "--source",
          path.resolve(import.meta.dirname, "../../../.."),
          "execute-template",
          "--override-data",
          JSON.stringify({ profile }),
        ],
        { input: fs.readFileSync(path.join(import.meta.dirname, "_profile.json.tmpl")) },
      ),
    );
    const log = path.join(temp, "argv"),
      controller = new AbortController();
    const model = { provider: "p", id: failure ? "a" : "p/a", thinking: "off" };
    const progress: string[] = [];
    let reviewTime = 0;
    const options = {
      cwd,
      reviewClock: {
        now: () => reviewTime,
        sleep: async (ms: number, signal: AbortSignal) => {
          assert.equal(ms, 30000);
          signal.throwIfAborted();
          reviewTime += ms;
        },
      },
      plan: "plans/demo/plan.md",
      root: path.join(temp, "state"),
      models: { execute: model, simplify: model, verify: { ...model, id: "b" } },
      signal: controller.signal,
      idleMs: failure === "timeout" ? 1000 : 60000,
      progress: (message: string) => progress.push(message),
      executable: process.execPath,
      prefix: [path.join(import.meta.dirname, "_fixtures/pi.mjs")],
      profilePath: failure === "missing-profile" ? profilePath + ".absent" : profilePath,
      confirm: async (target: string) => {
        assert.match(target, /fixture\/demo.*feature into main/);
        if (arp) assert.match(target, /silent review/i);
        if (failure === "stale") git("remote", "set-url", "--push", "origin", "git@github.com:other/demo.git");
        return failure !== "decline";
      },
      env: {
        PATH: bin + path.delimiter + process.env.PATH,
        HOME: temp,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GH_TOKEN: "fixture-inherited",
        ARGV_LOG: log,
        FAIL: failure,
        BARE: bare,
      },
    };
    const recovering = failure.startsWith("recover-");
    const socket = path.join(temp, "rex.sock");
    if (recovering) {
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => server.once("error", reject).listen(socket, resolve));
      t.after(() => server.close());
    }
    let approvals = 0;
    const result = run({
      ...options,
      env: {
        ...options.env,
        REX_SERVER: "unix://" + socket,
        REX_SESSION: "session:fixture",
        REX_BLOCK: "block:anchor",
      },
      rexCommand: [process.execPath, path.join(import.meta.dirname, "_fixtures/rex.mjs")],
      approve: async () => {
        approvals++;
        return failure !== "recover-refuse";
      },
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
    if (arp) {
      if (failure === "arp-cancel") {
        for (let i = 0; i < 400 && !fs.existsSync(log + ".review-ready"); i++) await delay(10);
        assert.ok(fs.existsSync(log + ".review-ready"));
        controller.abort();
      }
      if (failure === "arp-stale" || failure === "arp-incomplete") await assert.rejects(result, /deadline/i);
      else if (failure === "arp-findings") await assert.rejects(result, /finding-42/);
      else if (failure === "arp-cancel") await assert.rejects(result, /cancel/i);
      else await result;
      const calls = fs.readFileSync(log + ".review", "utf8").trim().split("\n").map((s) => JSON.parse(s));
      const head = git("--git-dir=" + bare, "rev-parse", "feature").toString().trim();
      const names = calls.map(({ name }) => name.split("agentic_review_").at(-1));
      const statuses = names.filter((name) => name === "get_status");
      assert.equal(statuses.length, failure === "arp-stale" || failure === "arp-incomplete" ? 40 :
        failure === "arp-cancel" || failure === "arp-findings" ? 1 : failure === "arp-retry-uncertain" ? 3 : 2);
      assert.equal(names[0], "get_status");
      const expected = failure === "arp-draft" ? "review_anyway" : failure === "arp-retry-uncertain" ? "retry" : undefined;
      const requests = calls.filter(({ name }) => name.endsWith("request_review"));
      assert.deepEqual(requests.map(({ input }) => input), expected ? [{
        owner: "fixture", repo: "demo", pull_number: 1, action: expected, expected_head_sha: head, silent: true,
      }] : []);
      assert.ok(names.every((name) => ["get_status", "get_findings", "request_review"].includes(name)));
      if (!["arp-stale", "arp-cancel"].includes(failure)) assert.equal(names.at(-1), "get_findings");
      for (const call of calls) assert.equal(call.published, head);
      const entries = fs.readdirSync(options.root);
      assert.equal(entries.length, 1);
      const dir = path.join(options.root, entries[0]!);
      const ledger = path.join(dir, "arp-request.json");
      assert.equal(fs.existsSync(ledger), Boolean(expected));
      if (expected) assert.equal(fs.statSync(ledger).mode & 0o777, 0o600);
      assert.equal(fs.readFileSync(path.join(dir, "completed"), "utf8") === "VERIFIED; ARP complete",
        ["arp-active", "arp-draft", "arp-retry-uncertain"].includes(failure));
      if (failure === "arp-retry-uncertain") assert.ok(progress.some((message) => /request result uncertain/.test(message)));
      return;
    }
    const stopped =
      recovering &&
      !["recover-verify", "recover-writer", "recover-progress", "recover-blocked", "recover-simplify"].includes(
        failure,
      );
    const published = ["", "reuse", "uncertain-create"].includes(failure);
    if (failure === "recover-progress-unfixed") await assert.rejects(result, /No committed task progress/);
    else if (stopped) await assert.rejects(result);
    else if (failure.startsWith("verify-")) await assert.rejects(result, /Verifier Git snapshot changed/);
    else if (!published && !recovering) await assert.rejects(result);
    else await result;
    if (["partial", "non-fast-forward", "stale"].includes(failure)) {
      const remote = git("--git-dir=" + bare, "rev-parse", "feature").toString();
      assert.equal(remote === git("-C", cwd, "rev-parse", "HEAD").toString(), failure === "partial");
      assert.equal(fs.existsSync(bare + ".pr"), false);
      assert.match(fs.readFileSync(log, "utf8"), /\/verify /);
      return;
    }
    if (
      [
        "started",
        "wrong-login",
        "unknown-login",
        "no-origin",
        "foreign",
        "https",
        "decline",
        "missing-profile",
        "conflict",
      ].includes(failure)
    ) {
      assert.equal(fs.existsSync(log), false);
      return;
    }
    const calls = fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s) as string[]);
    if (recovering) {
      if (failure === "recover-writer") {
        assert.match(progress[0]!, /^Starting execute \(attempt 1\); evidence /);
        assert.equal(
          progress[1],
          "Opening Rex recovery for execute (attempt 1). Finish the recovery and exit Pi in that pane.",
        );
      }
      const interactive = calls.filter((a) => !a.includes("--mode"));
      const entries = fs.readdirSync(options.root);
      assert.equal(
        entries.some((n) => n.startsWith("lock-")),
        failure === "recover-uncertain",
      );
      const bundle = path.join(
        options.root,
        entries.find((n) => n.startsWith("run-"))!,
      );
      assert.equal(fs.existsSync(path.join(bundle, "completed")), failure !== "recover-uncertain");
      if (failure === "recover-cancel")
        assert.equal(fs.readFileSync(log + ".term", "utf8"), fs.readFileSync(log + ".ready", "utf8"));
      if (failure.startsWith("recover-progress")) assert.equal(approvals, failure === "recover-progress" ? 1 : 0);
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
        if (["recover-writer", "recover-progress", "recover-simplify"].includes(failure))
          assert.equal(
            a[a.indexOf("--session") + 1],
            fs.realpathSync(
              path.join(bundle, failure === "recover-simplify" ? "simplify-3" : "execute-1", "sessions/saved.jsonl"),
            ),
          );
        else assert.ok(!a.includes("--session"));
      }
      assert.ok(interactive.every((a) => a.includes("--session-dir") && !a.includes("--fork")));
      assert.ok(calls.findLast((a) => a.at(-1)!.startsWith("/verify "))!.at(-1)!.includes("--implemented-by 'p/c'"));
      return;
    }
    assert.deepEqual(
      calls.map((args) => args.at(-1)!.split(" ")[0]),
      !published && !failure.startsWith("verify-") ? ["/execute"] : ["/execute", "/execute", "/simplify", "/verify"],
    );
    const [bundle] = fs.readdirSync(options.root);
    assert.match(bundle, /^run-/);
    if (published) {
      assert.match(progress.at(-1)!, /pull\/1/);
      if (failure === "reuse") assert.equal(fs.existsSync(bare + ".pr.creates"), false);
      else assert.equal(fs.readFileSync(bare + ".pr.creates", "utf8"), "create\n");
    }
    if (!failure) {
      for (const file of fs.readdirSync(options.root, { recursive: true, encoding: "utf8" })) {
        const full = path.join(options.root, file);
        if (fs.statSync(full).isFile())
          assert.doesNotMatch(fs.readFileSync(full, "utf8"), /fixture-(api-secret|inherited)/);
      }
      const verified = JSON.parse(
        fs.readFileSync(path.join(options.root, bundle, "verify-4", "accepted.json"), "utf8"),
      ).head;
      assert.equal(
        git("--git-dir=" + bare, "rev-parse", "feature")
          .toString()
          .trim(),
        verified,
      );
      assert.equal(fs.readFileSync(bare + ".pushes", "utf8").trim(), verified);
      assert.equal(
        calls.some((argv) => argv.some((arg) => /mcp__agentic_review|\/arp-review/.test(arg))),
        false,
      );
      assert.match(progress.at(-1)!, /https:\/\/github.com\/fixture\/demo\/pull\/1/);
      assert.deepEqual(
        progress.slice(0, -1).map((message) => message.split("; evidence ")[0]),
        [
          "Starting execute (attempt 1)",
          "Starting execute (attempt 2)",
          "Starting simplify (attempt 3)",
          "Starting verify (attempt 4)",
        ],
      );
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
