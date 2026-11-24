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
for (const [failure, error] of Object.entries({ blocker: "needs-human", "blocker-cancel": "abort", "blocker-uncertain": "uncertain recovery", "blocker-session": "identity mismatch", "pane-close": "Cannot confirm recovery exit", "cancel-after-exit": "abort", "wait-failure-running": "Cannot confirm recovery exit; lock retained: Rex wait returned invalid exit JSON", corrected: "", "corrected-stale": "Design changed", "corrected-other": "Design changed", "corrected-header": "Draft header", "": "", early: "handoff", header: "Draft header", path: "artifact path", overlap: "author model", stale: "Design changed", invalid: "pi --session", "no-plan": "handoff", reverted: "unrelated path", dirty: "dirty", switch: "Author used reviewer", "pre-check": "Design changed", "approval-race": "expected parent [a-f0-9]+, observed [a-f0-9]+" }))
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
  const cancelAfterExit = failure === "cancel-after-exit", waitFailureRunning = failure === "wait-failure-running";
  const kill = cancelAfterExit || waitFailureRunning ? t.mock.method(process, "kill") : undefined;
  const result = runDesign({ cwd, env, root: path.join(temp, "state"), brief: "fixture design", author: model,
    reviewer: { ...model, id: "reviewer" }, signal: controller.signal, progress: () => {},
    executable: process.execPath, prefix: [path.join(import.meta.dirname, "_fixtures/design-pi.mjs")],
    rexCommand: [process.execPath, path.join(import.meta.dirname, "_fixtures/rex.mjs")] });
  if (cancelAfterExit || waitFailureRunning) {
    const pidFile = env.ARGV_LOG + ".pid";
    const exited = () => fs.existsSync(pidFile + ".exit");
    const waitForExit = async () => {
      for (let i = 0; i < 500 && !exited(); i++) await delay(10);
      assert.ok(exited(), "Fixture Pi did not exit");
    };
    try {
      const rejected = assert.rejects(result, new RegExp(error, "i"));
      if (cancelAfterExit) {
        await Promise.all([rejected, (async () => {
          await waitForExit();
          for (let i = 0; i < 500 && !fs.existsSync(pidFile + ".waiting"); i++) await delay(10);
          assert.ok(fs.existsSync(pidFile + ".waiting"), "Rex waiter did not start");
          controller.abort();
        })()]);
      } else {
        await rejected;
        assert.ok(fs.existsSync(env.ARGV_LOG + ".first-turn"));
        assert.ok(!exited(), "Fixture Pi exited before waiter failure was handled");
      }
      assert.equal(kill?.mock.callCount(), 0);
      assert.equal(fs.existsSync(pidFile + ".closed"), cancelAfterExit);
      assert.equal(fs.readdirSync(path.join(temp, "state")).some(s => s.startsWith("lock-")), waitFailureRunning);
      assert.equal(fs.readFileSync(env.ARGV_LOG, "utf8"), "design-draft\n");
    } finally {
      if (waitFailureRunning && fs.existsSync(env.ARGV_LOG + ".first-turn") && !exited()) {
        fs.writeFileSync(env.ARGV_LOG + ".continue", "");
        await waitForExit();
      }
      controller.abort();
      await result.catch(() => {});
    }
    return;
  }
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
    if (failure === "pane-close" || failure === "early") {
      assert.equal(fs.readdirSync(path.join(temp, "state")).some(s => s.startsWith("lock-")), failure === "pane-close");
      assert.equal(fs.readFileSync(env.ARGV_LOG, "utf8"), "design-draft\n");
      assert.ok(fs.existsSync(env.ARGV_LOG + ".pid.closed"));
      assert.deepEqual(JSON.parse(fs.readFileSync(env.ARGV_LOG + ".pid.exit", "utf8")),
        { exit_code: failure === "early" ? 7 : 0 });
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
  "startup-rewrite", "startup-reuse", "startup-remote-only", "startup-lease-race", "startup-ancestor", "startup-push-unknown",
  "startup-fits", "startup-blocked", "startup-invalid", "startup-commit", "startup-branch", "startup-detached", "startup-conflict", "startup-blob", "startup-pin", "startup-decline",
  "work-personal-repo",
  "uncertain-create",
  "partial",
  "wrong-login",
  "unknown-login",
  "no-origin",
  "foreign",
  "alias-foreign",
  "non-branch-rules",
  "branch-rule",
  "unknown-rule",
  "malformed-rule",
  "malformed-rules-response",
  "classic-protected",
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
  "recover-cancel-identity",
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
      `### Slice 1${failure ? "" : ": First"}\n` + (failure === "started" ? "- [x]" : "- [ ]") +
        ` first\n### Slice 2${failure ? "" : ": Second"}\n- [ ] second\n`,
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
      fs.writeFileSync(path.join(cwd, "before-startup"), "existing feature change\n" + ("x".repeat(99) + "\n").repeat(1000) + "end of large patch\n");
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
    if (failure === "draft-pr-race" || failure === "classic-protected")
      git("--git-dir=" + bare, "update-ref", "refs/heads/feature", "main");
    if (failure.startsWith("startup-")) {
      const plan = "plans/demo/plan.md";
      git("--git-dir=" + bare, "update-ref", "-d", "refs/heads/feature");
      if (failure === "startup-conflict") {
        fs.appendFileSync(path.join(cwd, plan), "fixture feature edit\n");
        git("-C", cwd, "commit", "-qam", "feature edit");
      } else {
        git("-C", cwd, "commit", "--allow-empty", "-qm", "feature edit");
      }
      if (["startup-blob", "startup-conflict"].includes(failure)) {
        fs.appendFileSync(path.join(repo, plan), "fixture upstream edit\n");
        git("commit", "-qam", "advance main");
      } else {
        git("commit", "--allow-empty", "-qm", "advance main");
      }
      git("--git-dir=" + bare, "fetch", repo, "refs/heads/main:refs/heads/main");
      if (["startup-rewrite", "startup-reuse", "startup-lease-race", "startup-push-unknown"].includes(failure))
        git("--git-dir=" + bare, "fetch", cwd, "HEAD:refs/heads/feature");
      if (failure === "startup-ancestor")
        git("--git-dir=" + bare, "update-ref", "refs/heads/feature", "main~");
      if (failure === "startup-remote-only")
        git("--git-dir=" + bare, "update-ref", "refs/heads/feature", "main");
      if (failure === "startup-reuse") fs.writeFileSync(bare + ".pr", "1");
      if (failure === "startup-pin") git("--git-dir=" + bare, "update-ref", "-d", "refs/heads/main");
    }
    const originalHead = git("-C", cwd, "rev-parse", "HEAD").toString().trim();
    const pinnedBase = git("rev-parse", "main").toString().trim();
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
        { input: fs.readFileSync(path.join(import.meta.dirname, "../_shared/profile.json.tmpl")) },
      ),
    );
    const log = path.join(temp, "argv"),
      controller = new AbortController();
    fs.writeFileSync(path.join(temp, "draft-fixture.json"), JSON.stringify({ ARGV_LOG: log, FAIL: failure, BARE: bare }));
    const model = { provider: "p", id: failure ? "a" : "p/a", thinking: "off" };
    const progress: string[] = [];
    const phases: string[] = [];
    const recoveryMessages: string[] = [];
    let clock = 0;
    const summaries: string[] = [];
    let widget: string[] | undefined;
    const widgetLines: string[] = [];
    const display = phaseDisplay(lines => {
      widget = lines;
      if (!failure && lines) widgetLines.push(lines[0]);
    }, entry => summaries.push(entry),
      message => progress.push(message), () => clock);
    t.after(() => {
      assert.equal(summaries.length, 1);
      assert.equal(widget, undefined);
    });
    let reviewTime = 0;
    const arpFixtureCall: NonNullable<import("./_runner.ts").Options["arpCall"]> = async ({ name, input, head }, reviewSignal) => {
      const reviewLog = log + ".review";
      const prior = fs.existsSync(reviewLog) ? fs.readFileSync(reviewLog, "utf8") : "";
      const published = git("--git-dir=" + bare, "rev-parse", "feature").toString().trim();
      if (!fs.existsSync(bare + ".pr")) throw Error("Review started before publication");
      fs.appendFileSync(reviewLog, JSON.stringify({ name, input, published }) + "\n");
      if (failure === "arp-cancel") {
        fs.writeFileSync(reviewLog + "-ready", "ready");
        await new Promise<void>((_, reject) => {
          const onAbort = () => reject(Error("ARP review cancelled"));
          if (reviewSignal.aborted) onAbort();
          else reviewSignal.addEventListener("abort", onAbort, { once: true });
        });
      }
      const target = { owner: input.owner, repo: input.repo, pull_number: input.pull_number };
      const original = prior ? JSON.parse(prior.split("\n")[0]).published : published;
      const reviewIndex = new Set(prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).concat(published)).size;
      const opened = (id: number, reviewed_sha = published) => ({
        finding_id: id, reviewed_sha, status: "open", file_path: "plans/demo/plan.md", start_line: 1, end_line: 1, body: "Fixture finding",
      });
      if (failure.startsWith("arp-fix-")) {
        fs.appendFileSync(log + ".timeline", JSON.stringify({ event: name.split("agentic_review_").at(-1), head, published, input }) + "\n");
      }
      if (name.endsWith("resolve_finding")) {
        if (failure === "arp-fix-partial" && input.finding_id === 43) throw Error("Fixture partial settlement failure");
        const reviewed = prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).filter((sha: string) => sha !== published).at(-1);
        const finding = { ...opened(Number(input.finding_id), reviewed), status: "addressed", settlement: { resolution: "addressed", fix_commit_sha: input.fix_commit_sha } };
        fs.appendFileSync(reviewLog + ".settled", JSON.stringify(finding) + "\n");
        if (failure === "arp-fix-uncertain") throw Error("Fixture uncertain settlement");
        return { finding };
      }
      if (name.endsWith("get_status")) {
        const checks = prior.split("get_status").length - 1;
        let status = "NO_ISSUES_FOUND", action: string | undefined;
        if ((failure === "arp-draft" && checks === 0) || failure === "arp-stale") {
          status = "SKIPPED";
          action = "REVIEW_ACTION_REVIEW_ANYWAY";
        } else if (failure === "arp-retry-uncertain" && checks < 2) {
          status = "FAILED";
          action = "REVIEW_ACTION_RETRY";
        } else if (failure === "arp-active" && checks === 0) status = "IN_PROGRESS";
        return { ...target, head_sha: failure === "arp-stale" ? "0".repeat(40) : head, status: "REVIEW_STATUS_" + status, ...(action ? { allowed_action: action } : {}) };
      }
      if (name.endsWith("request_review")) {
        if (failure === "arp-retry-uncertain") throw Error("Fixture uncertain request");
        return { ...target, head_sha: head, status: "REVIEW_STATUS_QUEUED" };
      }
      const settled = fs.existsSync(reviewLog + ".settled") ? fs.readFileSync(reviewLog + ".settled", "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
      const priorHeads = [...new Set(prior.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line).published).filter((sha: string) => sha !== published))];
      const originalFindings = failure === "arp-fix-limit" && input.status === "all"
        ? priorHeads.map((sha, i) => opened(42 + i, sha))
        : [opened(42, original), ...(failure === "arp-fix-partial" ? [opened(43, original)] : [])];
      const findings = input.status === "all"
        ? originalFindings.map((f) => settled.find((s: { finding_id: number }) => s.finding_id === f.finding_id) ?? f)
        : failure === "arp-findings"
          ? [opened(42)]
          : failure.startsWith("arp-fix-") && reviewIndex === 1
            ? originalFindings
            : failure === "arp-fix-limit"
              ? [opened(41 + reviewIndex)]
              : [];
      return { ...target, scope: "pull_request", status_filter: input.status, reviewed_sha: head, review_in_progress: failure === "arp-incomplete", finding_count: findings.length, findings };
    };
    const options = {
      cwd,
      arpCall: arpFixtureCall,
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
          if (event.phase === "recovery") recoveryMessages.push(event.message);
        }
      },
      executable: process.execPath,
      prefix: [path.join(import.meta.dirname, "_fixtures/pi.mjs")],
      profilePath: failure === "missing-profile" ? profilePath + ".absent" : profilePath,
      confirm: async (target: string) => {
        if (["startup-pin", "startup-remote-only"].includes(failure)) assert.fail("Must stop before confirmation");
        if (["startup-rewrite", "startup-reuse", "startup-lease-race", "startup-push-unknown"].includes(failure)) {
          assert.ok(target.includes(originalHead));
          assert.match(target, /force-push.*lease.*before slice 1.*outdated.*does not undo/i);
        }
        if (failure.startsWith("startup-")) assert.ok(target.includes(pinnedBase));
        assert.ok(target.includes(`${owner}/demo.git (feature into main)`));
        if (arp) assert.match(target, /silent review/i);
        if (failure === "arp-ssh-alias") assert.match(target, /git@ddoghq\.github\.com:ddoghq\/demo\.git/);
        if (failure === "work-personal-repo") assert.doesNotMatch(target, /\b(ARP|review|findings)\b/i);
        if (failure === "stale") git("remote", "set-url", "--push", "origin", "git@github.com:other/demo.git");
        return !["decline", "startup-decline"].includes(failure);
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
    if (failure.startsWith("startup-")) {
      const caseName = failure.slice(8);
      const reason: Record<string, RegExp> = {
        blocked: /Startup check.*blocked/i, invalid: /Startup check.*Invalid/i,
        commit: /Startup check stopped: Error: Startup checker changed HEAD/,
        branch: /Startup check.*refs\/heads\/other.*no reset attempted.*keep the lock/i,
        detached: /Startup check.*detached/i, conflict: /Startup rebase/i,
        blob: /Startup check.*plan blob/i, pin: /Startup pin/i, decline: /declined/i,
      };
      if (caseName === "push-unknown") {
        await assert.rejects(result, /Startup push.*unknown.*keep the lock/i);
        const head = git("-C", cwd, "rev-parse", "HEAD").toString().trim();
        assert.notEqual(head, originalHead);
        assert.equal(git("--git-dir=" + bare, "rev-parse", "feature").toString().trim(), head);
        assert.deepEqual(phases, ["startup"]);
        assert.ok(fs.readdirSync(options.root).some(name => name.startsWith("lock-")));
      } else if (caseName === "lease-race") {
        await assert.rejects(result, new RegExp(`Startup push.*observed ${pinnedBase}`));
        assert.equal(git("-C", cwd, "rev-parse", "HEAD").toString().trim(), originalHead);
        assert.equal(git("--git-dir=" + bare, "rev-parse", "feature").toString().trim(), pinnedBase);
        assert.deepEqual(phases, ["startup"]);
        assert.equal(fs.existsSync(bare + ".pushes"), false);
      } else if (["fits", "rewrite", "reuse", "ancestor"].includes(caseName)) {
        const dir = await result;
        const startup = JSON.parse(fs.readFileSync(path.join(dir, "startup.json"), "utf8"));
        const runInfo = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
        assert.equal(runInfo.originalHead, originalHead);
        assert.equal(runInfo.pinnedBase, pinnedBase);
        assert.notEqual(startup.base, originalHead);
        assert.equal(startup.verdict.status, "fits");
        assert.deepEqual(phases.slice(0, 2), ["startup", "execute:1"]);
        const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line).at(-1));
        assert.match(calls[0], /^Startup check: /);
        assert.ok(calls[1].includes(`Feature baseline ${startup.base}`));
        const pushes = fs.readFileSync(bare + ".pushes", "utf8").trim().split("\n");
        assert.deepEqual(pushes, [...(["rewrite", "reuse"].includes(caseName) ? [startup.base] : []), git("-C", cwd, "rev-parse", "HEAD").toString().trim()]);
        if (caseName === "reuse") assert.equal(fs.existsSync(bare + ".pr.creates"), false);
      } else {
        await assert.rejects(result, caseName === "remote-only" ? /Startup rebase.*remote-only/i : reason[caseName]);
        if (caseName === "blocked") await assert.rejects(run({ ...options, onEvent: () => {} }), reason.blocked);
        assert.equal(approvals, 0);
        assert.equal(fs.existsSync(bare + ".pushes"), false);
        const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line).at(-1)) : [];
        assert.equal(calls.length, caseName === "blocked" ? 2 : ["branch", "detached", "invalid", "commit"].includes(caseName) ? 1 : 0);
        assert.ok(calls.every(prompt => prompt.startsWith("Startup check: ")));
        const drift = ["branch", "detached"].includes(caseName);
        assert.equal(fs.readdirSync(options.root).some(name => name.startsWith("lock-")), drift);
        if (drift) {
          const checked = fs.readFileSync(log + ".rebased", "utf8");
          assert.equal(git("rev-parse", "feature").toString().trim(), checked);
          assert.equal(git("-C", cwd, "rev-parse", "HEAD").toString().trim(), pinnedBase);
          if (caseName === "branch") assert.equal(git("rev-parse", "other").toString().trim(), pinnedBase);
        } else {
          assert.equal(git("-C", cwd, "rev-parse", "HEAD").toString().trim(), originalHead);
          assert.equal(git("-C", cwd, "status", "--porcelain").toString(), "");
        }
      }
      return;
    }
    if (failure === "hang") {
      for (let i = 0; i < 200 && !fs.existsSync(log); i++) await delay(10);
      await assert.rejects(run(options), /lock/i);
      controller.abort();
    }
    if (failure.startsWith("recover-cancel")) {
      const ready = () => fs.existsSync(log + ".ready") && fs.existsSync(log + ".pid.waiting");
      for (let i = 0; i < 300 && !ready(); i++) await delay(10);
      assert.ok(ready());
      controller.abort();
      if (failure === "recover-cancel-identity") {
        const pid = Number(fs.readFileSync(log + ".ready", "utf8"));
        try {
          await assert.rejects(result, /Cannot confirm recovery exit/);
          assert.equal(fs.existsSync(log + ".term"), false);
          assert.equal(fs.existsSync(log + ".pid.closed"), false);
        } finally {
          process.kill(pid, "SIGKILL");
          for (let i = 0; i < 200 && !fs.existsSync(log + ".pid.exit"); i++) await delay(10);
          assert.ok(fs.existsSync(log + ".pid.exit"));
        }
      }
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
      if (key === "two-heads") {
        assert.deepEqual(phases.slice(-5), ["review", "fix", "verify", "publish", "review"]);
        const argvCalls = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[]);
        const reviewCall = argvCalls.find((args) => args.some((a) => a.includes("_arp.ts")));
        const fixCall = argvCalls.find((args) => args.at(-1)?.startsWith("ARP fix."));
        assert.equal(reviewCall, undefined, "ARP review operations must not spawn Pi child sessions");
        assert.ok(fixCall?.some((a) => a.endsWith("dd-ai-gateway/extensions/dd-ai-gateway/index.ts")));
        assert.ok(fixCall?.some((a) => a.endsWith("pi-client-session-id/index.ts")));
        assert.ok(fixCall?.some((a) => a.endsWith("compute-guardrails.ts")));
        assert.ok(fixCall?.some((a) => a.endsWith("context-kit/index.ts")));
      }
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
    const published = ["", "reuse", "uncertain-create", "work-personal-repo", "non-branch-rules"].includes(failure);
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
    } else if (["branch-rule", "unknown-rule", "malformed-rule", "malformed-rules-response", "classic-protected"].includes(failure)) {
      await assert.rejects(result, failure === "classic-protected" ? /Protected branch/ : /Cannot publish to protected branch/);
      assert.equal(fs.existsSync(log), false);
      assert.equal(fs.existsSync(bare + ".pushes"), false);
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
      const retained = ["recover-uncertain", "recover-cancel-identity"].includes(failure);
      assert.equal(entries.some((n) => n.startsWith("lock-")), retained);
      const bundle = path.join(
        options.root,
        entries.find((n) => n.startsWith("run-"))!,
      );
      assert.equal(fs.existsSync(path.join(bundle, "completed")), !retained);
      if (failure === "recover-cancel") {
        assert.equal(fs.readFileSync(log + ".term", "utf8"), fs.readFileSync(log + ".ready", "utf8"));
        assert.deepEqual(JSON.parse(fs.readFileSync(log + ".pid.exit", "utf8")), { exit_code: -1 });
        assert.ok(fs.existsSync(log + ".pid.closed"));
      }
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
      const splits = fs.readFileSync(log + ".splits", "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
      const stageName = failure === "recover-simplify" ? "Simplify" : ["recover-verify", "recover-blocked"].includes(failure) ? "Verify" : "Execute";
      assert.ok(splits.every(flags => flags.includes("--label")));
      assert.deepEqual(splits.map(flags => flags[flags.indexOf("--label") + 1]), interactive.map(() => `Recovery: ${stageName}`));
      assert.deepEqual(recoveryMessages, interactive.map(() => `Fix the ${stageName} failure in the Recovery pane, then exit Pi to continue.`));
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
      assert.ok(widgetLines.some(line => line.startsWith("execute slice 1: First · ")));
      assert.ok(widgetLines.some(line => line.startsWith("execute slice 2: Second · ")));
      const observed = widgetLines.filter(line => line.includes("skills: "));
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
      const draftEvidencePath = path.join(options.root, bundle, "draft", "evidence.json");
      assert.equal(fs.statSync(draftEvidencePath).mode & 0o777, 0o600);
      assert.ok(prompt.includes(draftEvidencePath));
      const draftEvidence = JSON.parse(fs.readFileSync(draftEvidencePath, "utf8")) as {
        diff: string;
        baseTip: string;
      };
      assert.match(draftEvidence.diff, /diff --git a\/before-startup b\/before-startup/);
      assert.match(draftEvidence.diff, /\+end of large patch/);
      assert.doesNotMatch(draftEvidence.diff, /diff --git a\/base-only b\/base-only/);
      assert.equal(draftEvidence.baseTip, git("rev-parse", "main").toString().trim());
      const create = JSON.parse(fs.readFileSync(bare + ".pr.argv", "utf8"));
      assert.equal(create[create.indexOf("--title") + 1], "Explain the verified feature");
      assert.equal(create[create.indexOf("--body") + 1], "## What is this PR?\nFixture explanation.");
    }
    assert.ok(
      calls.every((args) => args.includes("--session-dir") && args.includes("--mode") && args.includes("--thinking")),
    );
  });
