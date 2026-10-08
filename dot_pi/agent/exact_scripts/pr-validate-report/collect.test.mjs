import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const collector = path.join(here, "collect.mjs");
const metadata = {
  title: "Example change",
  body: "PR body",
  author: { login: "author" },
  state: "OPEN",
  baseRefName: "main",
  baseRefOid: "base-sha",
  headRefName: "feature",
  headRefOid: "head-sha",
  labels: [{ name: "area:test" }],
  additions: 4,
  deletions: 2,
  files: [{ path: "src/change.js", additions: 4, deletions: 2, changeType: "MODIFIED" }],
  url: "https://github.com/example-org/example-repo/pull/42",
};

const inlineComment = (id, body) => ({
  id,
  user: { login: `reviewer-${id}`, type: "User" },
  html_url: `https://github.com/example-org/example-repo/pull/42#discussion_r${id}`,
  path: "src/change.js",
  line: id,
  original_line: id - 1,
  body,
});

const fakeGh = String.raw`#!${process.execPath}
import { appendFileSync } from "node:fs";

const args = process.argv.slice(2);
const logPath = process.env.FAKE_GH_CALLS;
appendFileSync(logPath, JSON.stringify({ args, promptDisabled: process.env.GH_PROMPT_DISABLED }) + String.fromCharCode(10));

const pathArg = args.find((arg) => arg.startsWith("repos/") || arg.startsWith("issues/")) ?? "";
let source;
if (args[0] === "pr" && args[1] === "view") source = "metadata";
else if (args[0] === "pr" && args[1] === "diff") source = "diff";
else if (args[0] === "pr" && args[1] === "checks") source = "checks";
else if (args.includes("graphql")) source = "reviewThreads";
else if (pathArg.includes("/pulls/") && pathArg.endsWith("/comments")) source = "inlineComments";
else if (pathArg.includes("/issues/") && pathArg.endsWith("/comments")) source = "topLevelComments";
else if (pathArg.includes("/pulls/") && pathArg.endsWith("/reviews")) source = "reviews";
else {
  console.error("unexpected command");
  process.exit(2);
}

if (process.env.FAKE_GH_SCENARIO === "all-fail" || process.env.FAKE_GH_SCENARIO === "fail-" + source || (process.env.FAKE_GH_SCENARIO === "threads-fail-pending" && source === "reviewThreads")) {
  console.error("request failed: token=fixture-secret");
  process.exit(1);
}

const pages = {
  metadata: ${JSON.stringify(metadata)},
  diff: "diff --git a/src/change.js b/src/change.js\n+change\n",
  inlineComments: [[${JSON.stringify(inlineComment(11, "first page"))}], [${JSON.stringify(inlineComment(12, "second page"))}, ${JSON.stringify(inlineComment(11, "duplicate"))}]],
  topLevelComments: [[{ id: 21, user: { login: "top-reviewer", type: "User" }, html_url: "https://github.com/example-org/example-repo/pull/42#issuecomment-21", body: "Top-level note" }]],
  reviews: [[{ id: 31, user: { login: "reviewer", type: "Bot" }, html_url: "https://github.com/example-org/example-repo/pull/42#pullrequestreview-31", body: "Review body", state: "COMMENTED" }]],
  reviewThreads: [
    { data: { repository: { pullRequest: { reviewThreads: { nodes: [{ id: "thread-1", isResolved: true, isOutdated: false, comments: { nodes: [{ databaseId: 11, outdated: false }], pageInfo: { hasNextPage: false, endCursor: null } } }], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } } } } } },
    { data: { repository: { pullRequest: { reviewThreads: { nodes: [{ id: "thread-2", isResolved: false, isOutdated: true, comments: { nodes: [{ databaseId: 12, outdated: true }], pageInfo: { hasNextPage: false, endCursor: null } } }], pageInfo: { hasNextPage: false, endCursor: "cursor-2" } } } } } },
  ],
  checks: [{ bucket: "pass", name: "unit", state: "SUCCESS", link: "https://github.com/example-org/example-repo/actions/runs/1" }],
};

if (source === "diff" && process.env.FAKE_GH_SCENARIO === "large-diff") {
  process.stdout.write("diff --git a/large b/large\n" + "+".repeat(2 * 1024 * 1024));
} else if (source === "reviewThreads" && process.env.FAKE_GH_SCENARIO === "nested-thread-pagination") {
  pages.reviewThreads[0].data.repository.pullRequest.reviewThreads.nodes[0].comments.pageInfo.hasNextPage = true;
  process.stdout.write(JSON.stringify([pages.reviewThreads[0]]));
} else if (source === "checks" && ["pending", "threads-fail-pending"].includes(process.env.FAKE_GH_SCENARIO)) {
  process.stdout.write(JSON.stringify([{ bucket: "pending", name: "integration", state: "IN_PROGRESS" }]));
  process.exit(8);
} else {
  process.stdout.write(JSON.stringify(pages[source]));
}
`;

function runCollector(t, args, scenario = "complete", extraEnv = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "prv-collector-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = path.join(dir, "bin");
  const ghPath = path.join(bin, "gh");
  const callsPath = path.join(dir, "calls.json");
  mkdirSync(bin);
  writeFileSync(ghPath, fakeGh);
  chmodSync(ghPath, 0o755);
  const result = spawnSync(process.execPath, [collector, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      FAKE_GH_CALLS: callsPath,
      FAKE_GH_SCENARIO: scenario,
      ...extraEnv,
    },
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    result,
    calls: existsSync(callsPath) ? readFileSync(callsPath, "utf8").trim().split(String.fromCharCode(10)).map((line) => JSON.parse(line)) : [],
  };
}

test("--help describes the collector without invoking gh", (t) => {
  const { result, calls } = runCollector(t, ["--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /collect GitHub evidence/i);
  assert.match(result.stdout, /GitHub pull request URL/);
  assert.deepEqual(calls, []);
});

test("valid GitHub PR URL variants are canonicalized before gh calls", (t) => {
  for (const input of [
    "https://github.com/example-org/example-repo/pull/42/",
    "https://github.com/example-org/example-repo/pull/42?tab=files#discussion_r11",
  ]) {
    const { result, calls } = runCollector(t, [input]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).pr.url, "https://github.com/example-org/example-repo/pull/42");
    assert.ok(calls.filter(({ args }) => args[0] === "pr").every(({ args }) => args.includes("https://github.com/example-org/example-repo/pull/42")));
  }
});

test("valid PR URLs collect normalized evidence from every paginated source", (t) => {
  const { result, calls } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"]);
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.collection.status, "complete");
  assert.equal(evidence.pr.headRefOid, "head-sha");
  assert.deepEqual(evidence.pr.labels, ["area:test"]);
  assert.deepEqual(evidence.pr.files, [{ path: "src/change.js", additions: 4, deletions: 2, changeType: "MODIFIED" }]);
  assert.match(evidence.diff, /\+change/);
  assert.deepEqual(evidence.comments.inline.map((comment) => comment.id), [11, 12]);
  assert.deepEqual(evidence.comments.inline[0], {
    id: 11,
    author: "reviewer-11",
    authorType: "User",
    url: "https://github.com/example-org/example-repo/pull/42#discussion_r11",
    path: "src/change.js",
    line: 11,
    body: "first page",
    thread: { resolved: true, outdated: false },
  });
  assert.deepEqual(evidence.comments.inline[1].thread, { resolved: false, outdated: true });
  assert.equal(evidence.comments.topLevel[0].author, "top-reviewer");
  assert.equal(evidence.comments.topLevel[0].thread, "not applicable");
  assert.equal(evidence.comments.reviews[0].authorType, "Bot");
  assert.equal(evidence.comments.reviews[0].body, "Review body");
  assert.equal(evidence.reviewThreads.length, 2);
  assert.equal(evidence.reviewThreads[0].outdated, false);
  assert.equal(evidence.reviewThreads[1].outdated, true);
  assert.deepEqual(evidence.checks, [{ bucket: "pass", name: "unit", state: "SUCCESS", link: "https://github.com/example-org/example-repo/actions/runs/1" }]);
  for (const source of ["metadata", "diff", "inlineComments", "topLevelComments", "reviews", "reviewThreads", "checks"]) {
    assert.equal(evidence.collection.sources[source].status, "complete", source);
  }
  assert.ok(calls.some(({ args }) => args.includes("--paginate") && args.includes("--slurp")));
  assert.ok(calls.every(({ args, promptDisabled }) => promptDisabled === "1" && !args.some((arg) => ["POST", "PATCH", "PUT", "DELETE"].includes(arg))));
});

test("pending checks remain available data when gh exits with status 8", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "pending");
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.collection.sources.checks.status, "complete");
  assert.deepEqual(evidence.checks, [{ bucket: "pending", name: "integration", state: "IN_PROGRESS" }]);
});

test("a source failure preserves other evidence and hides raw gh diagnostics", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "fail-topLevelComments");
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.collection.status, "partial");
  assert.equal(evidence.collection.sources.topLevelComments.status, "unavailable");
  assert.equal(evidence.collection.sources.topLevelComments.error, "gh_exit_1");
  assert.equal(evidence.collection.sources.inlineComments.status, "complete");
  assert.match(evidence.diff, /\+change/);
  assert.match(result.stderr, /topLevelComments/);
  assert.doesNotMatch(result.stderr, /fixture-secret|token=/i);
});

test("a failed thread query leaves comment thread state unknown and keeps pending checks", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "threads-fail-pending");
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.collection.status, "partial");
  assert.equal(evidence.collection.sources.reviewThreads.status, "unavailable");
  assert.equal(evidence.comments.inline[0].thread, "unknown");
  assert.equal(evidence.collection.sources.checks.status, "complete");
  assert.equal(evidence.checks[0].bucket, "pending");
});

test("nested thread comment pagination is reported as unavailable instead of truncated", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "nested-thread-pagination");
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.collection.sources.reviewThreads.status, "unavailable");
  assert.equal(evidence.collection.sources.reviewThreads.error, "nested_pagination");
  assert.equal(evidence.comments.inline[0].thread, "unknown");
});

test("all source failures still produce one valid partial envelope", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "all-fail");
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.collection.status, "partial");
  assert.ok(Object.values(evidence.collection.sources).every((source) => source.status === "unavailable"));
  assert.doesNotMatch(result.stderr, /fixture-secret|token=/i);
});

test("large diffs are collected without the execFile default buffer limit", (t) => {
  const { result } = runCollector(t, ["https://github.com/example-org/example-repo/pull/42"], "large-diff");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).diff.length, "diff --git a/large b/large\n".length + 2 * 1024 * 1024);
});

test("invalid PR URLs fail before invoking gh or emitting evidence", (t) => {
  for (const input of [
    "http://github.com/example-org/example-repo/pull/42",
    "https://github.com.evil.test/example-org/example-repo/pull/42",
    "https://github.com/example-org/example-repo/pull/0",
    "https://github.com/example-org/example-repo/pull/42/files",
    "https://github.com/user@github.com/example-org/example-repo/pull/42",
    "https://github.com:8443/example-org/example-repo/pull/42",
    "https://github.com/example-org/example-repo/pull/not-a-number",
  ]) {
    const { result, calls } = runCollector(t, [input]);
    assert.notEqual(result.status, 0, input);
    assert.equal(result.stdout, "", input);
    assert.deepEqual(calls, [], input);
  }
});
