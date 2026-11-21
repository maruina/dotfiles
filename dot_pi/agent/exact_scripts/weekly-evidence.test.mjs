import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectGitHubPrs,
  collectWeeklyEvidence,
  extractJiraKeys,
  mondayOfDate,
  previousMondayToSunday,
  scanPiSessions,
} from "./weekly-evidence.mjs";

const cli = fileURLToPath(new URL("./weekly-evidence.mjs", import.meta.url));

test("previousMondayToSunday resolves the prior Monday-Sunday week", () => {
  // 2026-11-16 is a Monday -> previous week is 2026-11-09..2026-11-15
  assert.deepEqual(previousMondayToSunday("2026-11-16"), {
    from: "2026-11-09",
    to: "2026-11-15",
    monday: "2026-11-09",
  });
  // 2026-11-20 is a Friday -> previous week is still 2026-11-09..2026-11-15
  assert.deepEqual(previousMondayToSunday("2026-11-20"), {
    from: "2026-11-09",
    to: "2026-11-15",
    monday: "2026-11-09",
  });
  assert.equal(mondayOfDate("2026-11-20"), "2026-11-16");
});

test("extractJiraKeys deduplicates and sorts keys", () => {
  assert.deepEqual(extractJiraKeys("Fix COMP-123 and PLAT-42 (dup COMP-123)"), ["COMP-123", "PLAT-42"]);
  assert.deepEqual(extractJiraKeys("no keys here"), []);
});

test("scanPiSessions filters by date range and extracts prompt, Jira keys, and PR URLs", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "weekly-evidence-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projDir = path.join(root, "sessions", "--repo--");
  mkdirSync(projDir, { recursive: true });

  const inRange = path.join(projDir, "in-range.jsonl");
  writeFileSync(
    inRange,
    [
      JSON.stringify({ type: "session", id: "s1", cwd: "/repo" }),
      JSON.stringify({
        type: "message",
        message: { role: "user", content: "Investigate COMP-999 on https://github.com/DataDog/dd-source/pull/42" },
      }),
    ].join("\n") + "\n",
  );
  const inDate = new Date("2026-11-11T12:00:00Z");
  utimesSync(inRange, inDate, inDate);

  const outOfRange = path.join(projDir, "old.jsonl");
  writeFileSync(outOfRange, JSON.stringify({ type: "session", id: "s0", cwd: "/repo" }) + "\n");
  const oldDate = new Date("2026-11-01T12:00:00Z");
  utimesSync(outOfRange, oldDate, oldDate);

  const result = scanPiSessions(path.join(root, "sessions"), "2026-11-09", "2026-11-15");
  assert.equal(result.truncated, false);
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].sessionId, "s1");
  assert.deepEqual(result.sessions[0].jiraKeys, ["COMP-999"]);
  assert.deepEqual(result.sessions[0].prUrls, ["https://github.com/DataDog/dd-source/pull/42"]);
});

test("scanPiSessions includes sessions continued in a later week and captures multiple in-week prompts", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "weekly-evidence-continued-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projDir = path.join(root, "sessions", "--repo--");
  mkdirSync(projDir, { recursive: true });

  const continued = path.join(projDir, "continued.jsonl");
  writeFileSync(
    continued,
    [
      JSON.stringify({ type: "session", id: "s-continued", cwd: "/repo", timestamp: "2026-11-10T09:00:00Z" }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-11-10T09:05:00Z",
        message: { role: "user", content: "Initial triage of kubelet eviction logs" },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-11-12T14:00:00Z",
        message: { role: "user", content: "Second investigation without any ticket or PR link" },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-11-18T10:00:00Z",
        message: { role: "user", content: "Follow-up in next week mentioning LATER-777" },
      }),
    ].join("\n") + "\n",
  );
  const nextWeekDate = new Date("2026-11-18T10:00:00Z");
  utimesSync(continued, nextWeekDate, nextWeekDate);

  const nextWeekOnly = path.join(projDir, "next-week-only.jsonl");
  writeFileSync(
    nextWeekOnly,
    [
      JSON.stringify({ type: "session", id: "s-next-only", cwd: "/repo", timestamp: "2026-11-18T11:00:00Z" }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-11-18T11:05:00Z",
        message: { role: "user", content: "Work done only in the following week" },
      }),
    ].join("\n") + "\n",
  );
  utimesSync(nextWeekOnly, nextWeekDate, nextWeekDate);

  const result = scanPiSessions(path.join(root, "sessions"), "2026-11-09", "2026-11-15");
  assert.equal(result.sessions.length, 1);
  assert.equal(result.sessions[0].sessionId, "s-continued");
  assert.equal(result.sessions[0].updatedAt, "2026-11-12T14:00:00.000Z");
  assert.deepEqual(result.sessions[0].prompts, [
    "Initial triage of kubelet eviction logs",
    "Second investigation without any ticket or PR link",
  ]);
  assert.deepEqual(result.sessions[0].jiraKeys, []);
});

test("collectWeeklyEvidence reads existing Obsidian note and merges Jira keys", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "weekly-evidence-vault-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const snippets = path.join(root, "Datadog", "Snippets");
  mkdirSync(snippets, { recursive: true });
  writeFileSync(path.join(snippets, "Week of 2026-11-09.md"), "# Week of 2026-11-09\n- Worked on COMP-555\n");

  const report = collectWeeklyEvidence({
    from: "2026-11-09",
    to: "2026-11-15",
    today: null,
    sessionsDir: path.join(root, "missing-sessions"),
    obsidianVault: root,
    skipGithub: true,
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.obsidianNote.exists, true);
  assert.deepEqual(report.jiraKeys, ["COMP-555"]);
});

test("CLI --help succeeds and invalid dates exit 2 with structured JSON error", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--from/);

  const bad = spawnSync(process.execPath, [cli, "--from", "not-a-date", "--to", "2026-11-15", "--skip-github"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
  const err = JSON.parse(bad.stderr);
  assert.equal(err.error.code, "invalid_arguments");
});

test("collectGitHubPrs resolves per-account tokens, deduplicates merged/updated PRs, and reports auth failures", () => {
  const calls = [];
  const stubRunGh = (args, opts = {}) => {
    calls.push({ args, token: opts.token ?? null });
    if (args[0] === "auth" && args[1] === "token") {
      const user = args[args.indexOf("--user") + 1];
      if (user === "maruina") return { ok: true, stdout: "tok-maruina\n", error: null };
      return { ok: false, stdout: "", error: "gh_exit_1" };
    }
    if (args.includes("--merged")) {
      return {
        ok: true,
        stdout: JSON.stringify([
          {
            repository: { nameWithOwner: "DataDog/dd-source" },
            number: 101,
            title: "COMP-123: Fix controller",
            url: "https://github.com/DataDog/dd-source/pull/101",
            state: "MERGED",
            createdAt: "2026-11-10T00:00:00Z",
            updatedAt: "2026-11-11T00:00:00Z",
            closedAt: "2026-11-11T00:00:00Z",
          },
        ]),
        error: null,
      };
    }
    return {
      ok: true,
      stdout: JSON.stringify([
        {
          repository: { nameWithOwner: "DataDog/dd-source" },
          number: 101,
          title: "COMP-123: Fix controller",
          url: "https://github.com/DataDog/dd-source/pull/101",
          state: "MERGED",
          createdAt: "2026-11-10T00:00:00Z",
          updatedAt: "2026-11-11T00:00:00Z",
          closedAt: "2026-11-11T00:00:00Z",
        },
        {
          repository: { nameWithOwner: "DataDog/dd-source" },
          number: 99,
          title: "OLD-1: Previously merged PR commented on this week",
          body: "",
          url: "https://github.com/DataDog/dd-source/pull/99",
          state: "MERGED",
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-11-12T00:00:00Z",
          closedAt: "2026-10-05T00:00:00Z",
        },
        {
          repository: { nameWithOwner: "DataDog/dd-source" },
          number: 102,
          title: "Draft work without ticket in title",
          body: "Tracks PLAT-456 for rollout",
          url: "https://github.com/DataDog/dd-source/pull/102",
          state: "OPEN",
          createdAt: "2026-11-12T00:00:00Z",
          updatedAt: "2026-11-13T00:00:00Z",
          closedAt: null,
        },
      ]),
      error: null,
    };
  };

  const result = collectGitHubPrs("2026-11-09", "2026-11-15", { runGh: stubRunGh });
  assert.equal(result.prs.length, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.prs[0].bucket, "merged");
  assert.deepEqual(result.prs[0].jiraKeys, ["COMP-123"]);
  assert.equal(result.prs[1].bucket, "updated");
  assert.deepEqual(result.prs[1].jiraKeys, ["PLAT-456"]);
  assert.deepEqual(result.errors, [{ org: "ddoghq", query: "auth", message: "gh_exit_1" }]);
  assert.ok(calls.some((c) => c.args[0] === "search" && c.token === "tok-maruina"));
  assert.ok(!calls.some((c) => c.args[0] === "search" && c.args.includes("ddoghq")));
});

test("collectGitHubPrs flags truncation when a query hits the 100-result cap", () => {
  const fullPage = Array.from({ length: 100 }, (_, i) => ({
    repository: { nameWithOwner: "DataDog/dd-source" },
    number: i + 1,
    title: `PR ${i + 1}`,
    body: "",
    url: `https://github.com/DataDog/dd-source/pull/${i + 1}`,
    state: "MERGED",
  }));
  const stubRunGh = (args) => {
    if (args[0] === "auth") return { ok: true, stdout: "tok\n", error: null };
    if (args.includes("--owner") && args.includes("DataDog") && args.includes("--merged")) {
      return { ok: true, stdout: JSON.stringify(fullPage), error: null };
    }
    return { ok: true, stdout: "[]", error: null };
  };
  const result = collectGitHubPrs("2026-11-01", "2026-11-30", { runGh: stubRunGh });
  assert.equal(result.truncated, true);
  assert.equal(result.prs.length, 100);
  assert.deepEqual(result.errors, []);
});
