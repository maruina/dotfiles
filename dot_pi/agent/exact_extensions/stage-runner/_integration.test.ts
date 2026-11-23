import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { phaseDisplay } from "./index.ts";
import { run } from "./_runner.ts";
for (const [failure, error] of Object.entries({ blocker: "needs-human", "blocker-cancel": "abort", "blocker-uncertain": "uncertain recovery", "blocker-session": "identity mismatch", corrected: "", "corrected-stale": "Design changed", "corrected-other": "Design changed", "corrected-header": "Draft header", "": "", early: "handoff", header: "Draft header", path: "artifact path", overlap: "author model", stale: "Design changed", invalid: "pi --session", "no-plan": "handoff", reverted: "unrelated path", dirty: "dirty", switch: "Author used reviewer", "pre-check": "Design changed", "approval-race": "expected parent [a-f0-9]+, observed [a-f0-9]+" }))
 test((failure.startsWith("blocker") ? "design blocker: " : failure.startsWith("corrected") ? "corrected design: " : "clean design: ") + (failure || "committed plan without publication"), async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "design-test-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const cwd = path.join(temp, "work");
  fs.mkdirSync(cwd);
  const env = { ...process.env, HOME: temp, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    PI_STAGE_RUNNER_CHILD: "", FAIL: failure, ARGV_LOG: path.join(temp, "argv"), REX_SERVER: "unix://" + path.join(temp, "rex.sock"),
    REX_SESSION: "session:fixture", REX_BLOCK: "block:anchor" };
  if (["pre-check", "approval-race"].includes(failure)) {
    const bin = path.join(temp, "bin"); fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "git"), fs.readFileSync(path.join(import.meta.dirname, "_fixtures/design-git.mjs")), {mode: 0o700});
    Object.assign(env, {REAL_GIT: execFileSync("which", ["git"], {encoding:"utf8"}).trim(), PATH: bin + path.delimiter + process.env.PATH});
  }
  const git = (...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trimEnd();
  git("init", "-qb", "feature");
  git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.org");
  git("commit", "--allow-empty", "-qm", "start");
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(path.join(temp, "rex.sock"), resolve));
  t.after(() => server.close());
  const model = { provider: "p", id: "author", thinking: "off" };
  const { runDesign } = await import("./_runner.ts");
  const controller = new AbortController();
  const result = runDesign({ cwd, env, root: path.join(temp, "state"), brief: "fixture design", author: model,
    reviewer: { ...model, id: "reviewer" }, signal: controller.signal, progress: () => {},
    executable: process.execPath, prefix: [path.join(import.meta.dirname, "_fixtures/design-pi.mjs")],
    rexCommand: [process.execPath, path.join(import.meta.dirname, "_fixtures/rex.mjs")] });
  if (error) {
    if (failure === "blocker-cancel") {
      const wait = async () => {
        for (let i = 0; i < 500 && !fs.existsSync(env.ARGV_LOG+".resumed"); i++) await delay(10);
        controller.abort();
      };
      await Promise.all([assert.rejects(result, /abort/i), wait()]);
    } else await assert.rejects(result, new RegExp(error));
    if (failure.startsWith("blocker")) {
      assert.equal(git("log","-1","--format=%s"),"draft");
      const state = path.join(temp,"state"), files = fs.readdirSync(state);
      assert.equal(files.some(s => s.startsWith("lock-")), failure === "blocker-uncertain");
      if (failure === "blocker" || failure === "blocker-cancel") {
        assert.equal(fs.readFileSync(env.ARGV_LOG+".resumed","utf8"),"fixture-design-review\n");
      }
      if (failure === "blocker") assert.equal(fs.readFileSync(path.join(state,files.find(s => s.startsWith("run-"))!,"completed"),"utf8"),"needs-human");
    }
    if (["approval-race", "pre-check"].includes(failure)) {
      const competing = fs.readFileSync(env.ARGV_LOG + ".competing", "utf8").trim();
      git("merge-base", "--is-ancestor", competing, "HEAD");
      assert.equal(git("show", competing + ":plans/demo/design.md"), "# Competing edit\nStatus: Draft");
    }
    if (!["no-plan", "reverted"].includes(failure)) assert.ok(!fs.readFileSync(env.ARGV_LOG, "utf8").includes("design-plan"));
    return;
  }
  if (failure === "corrected") await result;
  else try {
    for (let i = 0; i < 500 && !fs.existsSync(env.ARGV_LOG + ".first-turn"); i++) await delay(10);
    assert.equal(fs.readFileSync(env.ARGV_LOG, "utf8"), "design-draft\n");
    fs.writeFileSync(env.ARGV_LOG + ".continue", "confirmed");
    await result;
  } finally { controller.abort(); await result.catch(() => {}); }
  assert.equal(fs.readFileSync(env.ARGV_LOG,"utf8"),"design-draft\ndesign-review\ndesign-plan\n");
  const revisionBytes = (rev: string) => execFileSync("git", ["cat-file", "blob", rev + ":plans/demo/design.md"], {cwd,env});
  assert.deepEqual(revisionBytes("HEAD~2"), Buffer.from("# Demo\nStatus: Draft\n" + (failure ? "See correct.md\n" : "")));
  assert.deepEqual(revisionBytes("HEAD~"), Buffer.from("# Demo\nStatus: Approved\n" + (failure ? "See correct.md\n" : "")));
  assert.equal(git("show", "-s", "--format=%P", "HEAD~"), git("rev-parse", "HEAD~2"));
  assert.equal(git("diff", "--name-only", "HEAD~2", "HEAD~"), "plans/demo/design.md");
  assert.equal(git("diff", "--name-only", "HEAD~", "HEAD"), "plans/demo/plan.md");
  assert.equal(git("status", "--porcelain"), "");
});

for (const failure of [
  "",
  "reuse",
  "draft-malformed",
  "draft-oversized",
  "draft-dirty",
  "draft-pr-race",
  "draft-cancel",
  "draft-base-unavailable",
  "work-personal-repo",
  "uncertain-create",
  "partial",
  "wrong-login",
  "unknown-login",
  "no-origin",
  "foreign",
  "alias-foreign",
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
  "arp-ssh-alias",
  "arp-draft",
  "arp-retry-uncertain",
  "arp-stale",
  "arp-incomplete",
  "arp-findings",
  "arp-cancel",
  "arp-fix-two-heads",
  "arp-fix-missing",
  "arp-fix-duplicate",
  "arp-fix-unknown",
  "arp-fix-range",
  "arp-fix-plan",
  "arp-fix-verify",
  "arp-fix-partial",
  "arp-fix-uncertain",
  "arp-fix-limit",
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
    const arp = failure.startsWith("arp-");
    const owner = arp ? "ddoghq" : failure === "work-personal-repo" ? "maruina" : "fixture";
    git("remote", "add", "origin", `git@github.com:${owner}/demo.git`);
    if (failure === "arp-ssh-alias" || failure === "alias-foreign")
      git("config", `url.git@ddoghq.github.com:${owner}/.insteadOf`, `git@github.com:${owner}/`);
    git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD").toString().trim());
    git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    if (!failure) {
      fs.writeFileSync(path.join(repo, "base-only"), "already on main\n");
      git("add", "base-only");
      git("commit", "-qm", "advance main");
      git("--git-dir=" + bare, "fetch", repo, "refs/heads/main:refs/heads/main");
      git("-C", cwd, "merge", "--ff-only", "main");
      fs.writeFileSync(path.join(cwd, "before-startup"), "existing feature change\n");
      git("-C", cwd, "add", "before-startup");
      git("-C", cwd, "commit", "-qm", "start feature");
    }
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
    if (failure === "draft-pr-race") git("--git-dir=" + bare, "update-ref", "refs/heads/feature", "main");
    if (failure === "draft-base-unavailable") git("--git-dir=" + bare, "update-ref", "-d", "refs/heads/main");
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
    const profile = arp || ["recover-writer", "work-personal-repo", "alias-foreign"].includes(failure) ? "work" : "personal";
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
    fs.writeFileSync(path.join(temp, "draft-fixture.json"), JSON.stringify({ ARGV_LOG: log, FAIL: failure, BARE: bare }));
    const model = { provider: "p", id: failure ? "a" : "p/a", thinking: "off" };
    const progress: string[] = [];
    const phases: string[] = [];
    let clock = 0;
    const summaries: string[] = [];
    let widget: string[] | undefined;
    const skillLines: string[] = [];
    const display = phaseDisplay(lines => {
      widget = lines;
      if (!failure && lines) skillLines.push(lines[0]);
    }, entry => summaries.push(entry),
      message => progress.push(message), () => clock);
    t.after(() => {
      assert.equal(summaries.length, 1);
      assert.equal(widget, undefined);
    });
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
      now: () => (clock += 1000),
      onEvent: (event: import("./_runner.ts").RunnerEvent) => {
        display.onEvent(event);
        assert.deepEqual(summaries, []);
        if (event.type === "phase") {
          assert.equal(event.at, clock);
          phases.push(event.phase + (event.launch === undefined ? "" : ":" + event.launch));
        }
      },
      executable: process.execPath,
      prefix: [path.join(import.meta.dirname, "_fixtures/pi.mjs")],
      profilePath: failure === "missing-profile" ? profilePath + ".absent" : profilePath,
      confirm: async (target: string) => {
        assert.ok(target.includes(`${owner}/demo.git (feature into main)`));
        if (arp) assert.match(target, /silent review/i);
        if (failure === "arp-ssh-alias") assert.match(target, /git@ddoghq\.github\.com:ddoghq\/demo\.git/);
        if (failure === "work-personal-repo") assert.doesNotMatch(target, /\b(ARP|review|findings)\b/i);
        if (failure === "stale") git("remote", "set-url", "--push", "origin", "git@github.com:other/demo.git");
        return failure !== "decline";
      },
      env: {
        PATH: bin + path.delimiter + process.env.PATH,
        HOME: temp,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GH_TOKEN: "fixture-inherited",
        GH_ENTERPRISE_TOKEN: "fixture-enterprise",
        GH_CONFIG_DIR: path.join(temp, "gh"),
        SSH_AUTH_SOCK: path.join(temp, "ssh-socket"),
        ARGV_LOG: log,
        FAIL: failure,
        BARE: bare,
        REPO_OWNER: owner,
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
    }).then(value => {
      display.finish("complete");
      return value;
    }, error => {
      display.finish(controller.signal.aborted ? "canceled" : "stopped");
      throw error;
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
    if (failure.startsWith("arp-fix-")) {
      const failures: Record<string, RegExp> = {
        missing: /Missing finding/, duplicate: /Duplicate finding/, unknown: /Unknown finding/,
        range: /outside the fix range/, plan: /changed plan/, verify: /Pi did not settle/,
        partial: /43.*not confirmed/, limit: /three reviewed heads/,
      };
      const key = failure.slice("arp-fix-".length);
      if (failures[key]) await assert.rejects(result, failures[key]);
      else await result;
      if (key === "two-heads") assert.deepEqual(phases.slice(-5), ["review", "fix", "verify", "publish", "review"]);
      const trace = fs.readFileSync(log + ".timeline", "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const fixes = trace.filter(({ event }) => event === "fix");
      const settlements = trace.filter(({ event }) => event === "resolve_finding");
      const statuses = trace.filter(({ event }) => event === "get_status");
      assert.equal(fixes.length, key === "limit" ? 2 : 1);
      assert.equal(statuses.length, key === "limit" ? 3 : ["two-heads", "uncertain"].includes(key) ? 2 : 1);
      const baseHead = statuses[0].head;
      const publishedHead = git("--git-dir=" + bare, "rev-parse", "feature").toString().trim();
      if (!["two-heads", "uncertain", "partial", "limit"].includes(key)) {
        assert.equal(publishedHead, baseHead);
        assert.deepEqual(settlements, []);
      } else {
        assert.equal(publishedHead, fixes.at(-1).head);
        for (const fix of fixes) {
          const i = trace.indexOf(fix);
          assert.deepEqual(trace[i + 1], { event: "verify", head: fix.head, model: "b", hasFixScope: true });
          const settle = trace.find((e, j) => j > i && e.event === "resolve_finding");
          assert.equal(settle.head, fix.head);
          assert.equal(settle.published, fix.head);
          assert.equal(settle.input.fix_commit_sha, fix.head);
          assert.equal(settle.input.resolution, "addressed");
          if (key !== "partial") assert.ok(trace.indexOf(settle) < trace.indexOf(statuses.find((s) => s.head === fix.head)));
        }
        assert.equal(settlements.length, ["partial", "limit"].includes(key) ? 2 : 1);
        if (key === "partial") assert.ok(progress.some((message) => /42.*addressed/.test(message)));
      }
      return;
    }
    if (arp) {
      if (failure === "arp-cancel") {
        for (let i = 0; i < 400 && !fs.existsSync(log + ".review-ready"); i++) await delay(10);
        assert.ok(fs.existsSync(log + ".review-ready"));
        controller.abort();
      }
      if (failure === "arp-stale" || failure === "arp-incomplete") await assert.rejects(result, /deadline/i);
      else if (failure === "arp-findings") await assert.rejects(result, /42/);
      else if (failure === "arp-cancel") await assert.rejects(result, /cancel/i);
      else await result;
      const calls = fs.readFileSync(log + ".review", "utf8").trim().split("\n").map((s) => JSON.parse(s));
      const head = git("--git-dir=" + bare, "rev-parse", "feature").toString().trim();
      const names = calls.map(({ name }) => name.split("agentic_review_").at(-1));
      const statuses = names.filter((name) => name === "get_status");
      assert.equal(statuses.length, failure === "arp-stale" || failure === "arp-incomplete" ? 40 :
        ["arp-cancel", "arp-findings", "arp-ssh-alias"].includes(failure) ? 1 : failure === "arp-retry-uncertain" ? 3 : 2);
      assert.equal(names[0], "get_status");
      const expected = failure === "arp-draft" ? "review_anyway" : failure === "arp-retry-uncertain" ? "retry" : undefined;
      const requests = calls.filter(({ name }) => name.endsWith("request_review"));
      assert.deepEqual(requests.map(({ input }) => input), expected ? [{
        owner, repo: "demo", pull_number: 1, action: expected, expected_head_sha: head, silent: true,
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
        ["arp-active", "arp-ssh-alias", "arp-draft", "arp-retry-uncertain"].includes(failure));
      if (failure === "arp-retry-uncertain") assert.ok(progress.some((message) => /request result uncertain/.test(message)));
      return;
    }
    const stopped =
      recovering &&
      !["recover-verify", "recover-writer", "recover-progress", "recover-blocked", "recover-simplify"].includes(
        failure,
      );
    const published = ["", "reuse", "uncertain-create", "work-personal-repo"].includes(failure);
    if (failure === "recover-progress-unfixed") await assert.rejects(result, /No committed task progress/);
    else if (stopped) await assert.rejects(result);
    else if (failure.startsWith("verify-")) await assert.rejects(result, /Verifier Git snapshot changed/);
    else if (failure.startsWith("draft-")) {
      if (failure === "draft-cancel") {
        for (let i = 0; i < 400 && !fs.existsSync(log + ".draft-ready"); i++) await delay(10);
        assert.ok(fs.existsSync(log + ".draft-ready"));
        controller.abort();
      }
      const reasons: Record<string, RegExp> = {
        "draft-dirty": /Drafting stopped: verified candidate changed/,
        "draft-pr-race": /Drafting stopped: could not reconfirm the publication target/,
        "draft-cancel": /Drafting stopped: cancelled/,
        "draft-base-unavailable": /Drafting stopped: could not supply the full pinned comparison/,
      };
      await assert.rejects(result, reasons[failure] ?? /Drafting stopped: invalid or oversized title or body/);
      assert.equal(fs.existsSync(bare + ".pushes"), false);
      assert.equal(fs.existsSync(bare + ".pr.creates"), false);
      return;
    } else if (failure === "alias-foreign") {
      await assert.rejects(result, /Expected matching GitHub SSH origin and single push destination/);
      assert.equal(fs.existsSync(log), false);
      return;
    } else if (!published && !recovering) await assert.rejects(result);
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
      if (failure === "recover-verify") {
        assert.deepEqual(phases.slice(-6), ["verify:1", "recovery", "verify:2", "recovery", "verify:3", "publish"]);
        assert.match(summaries[0]!, /verify 00:03 · recovery 00:02/);
      }
      if (failure === "recover-cancel") assert.match(summaries[0]!, /^canceled .*recovery/);
      if (failure === "recover-refuse") assert.match(summaries[0]!, /^stopped .*recovery/);
      if (failure === "recover-writer") {
        assert.deepEqual(phases, ["execute:1", "recovery", "execute:2", "simplify", "verify:1", "publish"]);
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
    const drafting = calls.filter(args => args.at(-1)!.startsWith("Prepare a PR draft."));
    assert.equal(drafting.length, published && failure !== "reuse" ? 1 : 0);
    const stages = calls.filter(args => !drafting.includes(args));
    assert.deepEqual(
      stages.map((args) => args.at(-1)!.split(" ")[0]),
      !published && !failure.startsWith("verify-") ? ["/execute"] : ["/execute", "/execute", "/simplify", "/verify"],
    );
    const [bundle] = fs.readdirSync(options.root);
    assert.match(bundle, /^run-/);
    if (published) {
      assert.match(progress.at(-1)!, /pull\/1/);
      if (failure === "reuse") assert.equal(fs.existsSync(bare + ".pr.creates"), false);
      else assert.equal(fs.readFileSync(bare + ".pr.creates", "utf8"), "create\n");
    }
    if (failure === "work-personal-repo") {
      assert.equal(fs.readFileSync(path.join(options.root, bundle, "completed"), "utf8"), "VERIFIED");
    }
    if (!failure) {
      assert.match(stages.at(-1)!.at(-1)!, /Set "findings" to a flat JSON array of finding objects \(use \[\] when there are none\)/);
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
        phases, ["execute:1", "execute:2", "simplify", "verify:1", "publish"],
      );
      const labels = Array.from({ length: 16 }, (_, i) => "skill-" + i);
      const observed = skillLines.filter(line => line.includes("skills: "));
      assert.deepEqual([...new Set(observed)], labels.map((_, i) =>
        "simplify · 00:00 | execute 00:02 | skills: " + labels.slice(0, i + 1).join(", ")));
      const first = path.join(options.root, bundle, "execute-1");
      assert.equal(fs.statSync(path.join(first, "stderr")).size, 16384);
      assert.equal(fs.statSync(path.join(first, "sessions")).mode & 0o777, 0o700);
      assert.equal(fs.statSync(path.join(first, "session-id")).mode & 0o777, 0o600);
      assert.ok(stages.at(-1)!.at(-1)!.includes("--implemented-by 'p/a' --simplified-by 'p/a'"));
      const [argv] = drafting;
      assert.equal(argv![argv!.indexOf("--tools") + 1], "read");
      assert.ok(argv!.includes("--no-extensions"));
      const prompt = argv!.at(-1)!;
      assert.match(prompt, /diff --git a\/before-startup b\/before-startup/);
      assert.doesNotMatch(prompt, /diff --git a\/base-only b\/base-only/);
      assert.ok(prompt.includes(git("rev-parse", "main").toString().trim()));
      const create = JSON.parse(fs.readFileSync(bare + ".pr.argv", "utf8"));
      assert.equal(create[create.indexOf("--title") + 1], "Explain the verified feature");
      assert.equal(create[create.indexOf("--body") + 1], "## What is this PR?\nFixture explanation.");
    }
    assert.ok(
      calls.every((args) => args.includes("--session-dir") && args.includes("--mode") && args.includes("--thinking")),
    );
  });
