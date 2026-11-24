#!/usr/bin/env node
import { spawn } from "node:child_process";
import { parsePullRequestUrl, scrubbedGhEnv, selectGitHubLogin as githubAccountForOwner } from "../_github.mjs";

const HELP = `Usage: node collect.mjs <GitHub pull request URL>

Collect GitHub evidence: pull request metadata, diff, comments, review threads, and checks
with read-only gh commands. Print one schemaVersion 1 JSON evidence envelope.

Accepts https://github.com/OWNER/REPO/pull/NUMBER with an optional trailing
slash, query, or fragment. Source failures appear in collection.sources; valid
URLs still produce an envelope when some sources are unavailable.
`;

const METADATA_FIELDS = [
  "title",
  "body",
  "author",
  "state",
  "baseRefName",
  "baseRefOid",
  "headRefName",
  "headRefOid",
  "isCrossRepository",
  "labels",
  "additions",
  "deletions",
  "files",
  "changedFiles",
  "url",
].join(",");

const THREAD_QUERY = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $endCursor) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 100) {
            nodes { databaseId outdated }
            pageInfo { hasNextPage endCursor }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const SOURCE_NAMES = [
  "metadata",
  "diff",
  "inlineComments",
  "topLevelComments",
  "reviews",
  "reviewThreads",
  "checks",
];

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_STDOUT_BYTES = 32 * 1024 * 1024;
const KILL_GRACE_MS = 2_000;

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function runGh(args, { allowPendingExit = false, token } = {}) {
  return new Promise((resolve) => {
    const timeoutMs = positiveIntEnv("PR_VALIDATE_GH_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
    const maxBytes = positiveIntEnv("PR_VALIDATE_GH_MAX_BYTES", DEFAULT_MAX_STDOUT_BYTES);
    let child;
    const chunks = [];
    let totalBytes = 0;
    let abortedError = null;
    let settled = false;
    let timeoutTimer = null;
    let killTimer = null;
    const env = scrubbedGhEnv(process.env, token);
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };
    const terminate = (errorCode) => {
      if (abortedError) return;
      abortedError = errorCode;
      chunks.length = 0;
      try { child.kill("SIGTERM"); } catch { /* Process already exited. */ }
      killTimer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* Process already exited. */ }
      }, KILL_GRACE_MS);
      killTimer.unref?.();
    };
    try {
      child = spawn("gh", args, {
        env,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (error) {
      finish({ ok: false, error: spawnErrorCode(error) });
      return;
    }

    timeoutTimer = setTimeout(() => terminate("timeout"), timeoutMs);
    timeoutTimer.unref?.();

    child.stdout.on("data", (chunk) => {
      if (abortedError) return;
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        terminate("output_too_large");
        return;
      }
      chunks.push(chunk);
    });
    child.once("error", (error) => finish({ ok: false, error: abortedError ?? spawnErrorCode(error) }));
    child.once("close", (code, signal) => {
      if (abortedError) {
        finish({ ok: false, error: abortedError });
        return;
      }
      const output = Buffer.concat(chunks, totalBytes).toString("utf8");
      if (code === 0 || (allowPendingExit && code === 8)) {
        finish({ ok: true, output, exitCode: code });
        return;
      }
      finish({ ok: false, error: signal ? `signal_${signal}` : `gh_exit_${code ?? "unknown"}` });
    });
  });
}

function spawnErrorCode(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : "UNKNOWN";
  return `spawn_${code}`;
}

async function runJson(args, { pendingIsAvailable = false, token } = {}) {
  const result = await runGh(args, { allowPendingExit: pendingIsAvailable, token });
  if (!result.ok) return result;
  try {
    return { ok: true, value: JSON.parse(result.output) };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function restPages(value) {
  if (!Array.isArray(value)) throw new Error("invalid_response");
  const records = value.flatMap((page) => {
    if (!Array.isArray(page)) throw new Error("invalid_response");
    return page;
  });
  const seen = new Set();
  return records.filter((record) => {
    if (!record || typeof record !== "object") throw new Error("invalid_response");
    if (record.id === undefined || record.id === null) return true;
    const id = String(record.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function threadPages(value) {
  if (!Array.isArray(value)) throw new Error("invalid_response");
  const threads = [];
  const seen = new Set();
  for (const page of value) {
    if (Array.isArray(page?.errors) && page.errors.length > 0) throw new Error("graphql_errors");
    const connection = page?.data?.repository?.pullRequest?.reviewThreads;
    if (!connection || !Array.isArray(connection.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean") {
      throw new Error("invalid_response");
    }
    for (const thread of connection.nodes) {
      if (!thread || typeof thread.id !== "string") throw new Error("invalid_response");
      if (seen.has(thread.id)) continue;
      seen.add(thread.id);
      const comments = thread.comments;
      if (!comments || !Array.isArray(comments.nodes) || typeof comments.pageInfo?.hasNextPage !== "boolean") {
        throw new Error("invalid_response");
      }
      if (comments.pageInfo.hasNextPage) throw new Error("nested_pagination");
      if (typeof thread.isResolved !== "boolean" || typeof thread.isOutdated !== "boolean") throw new Error("invalid_response");
      if (comments.nodes.some((comment) => typeof comment.databaseId !== "number" || typeof comment.outdated !== "boolean")) {
        throw new Error("invalid_response");
      }
      threads.push(thread);
    }
  }
  return threads;
}

function sourceStatus(result) {
  return result.ok ? { status: "complete" } : { status: "unavailable", error: result.error };
}

function normalizeMetadata(raw, canonicalUrl) {
  if (!raw || typeof raw !== "object") throw new Error("invalid_response");
  return {
    url: typeof raw.url === "string" ? raw.url : canonicalUrl,
    title: raw.title ?? null,
    body: raw.body ?? null,
    author: raw.author?.login ?? null,
    state: raw.state ?? null,
    baseRefName: raw.baseRefName ?? null,
    baseRefOid: raw.baseRefOid ?? null,
    headRefName: raw.headRefName ?? null,
    headRefOid: raw.headRefOid ?? null,
    isCrossRepository: typeof raw.isCrossRepository === "boolean" ? raw.isCrossRepository : null,
    labels: Array.isArray(raw.labels) ? raw.labels.map((label) => label.name).filter((name) => typeof name === "string") : [],
    additions: raw.additions ?? null,
    deletions: raw.deletions ?? null,
    changedFiles: Number.isSafeInteger(raw.changedFiles) && raw.changedFiles >= 0 ? raw.changedFiles : null,
    files: Array.isArray(raw.files)
      ? raw.files.map(({ path, additions, deletions, changeType }) => ({ path, additions, deletions, changeType }))
      : [],
  };
}

function normalizeComment(raw, threadByCommentId) {
  const id = raw.id ?? null;
  const thread = id === null ? undefined : threadByCommentId.get(String(id));
  return {
    id,
    author: raw.user?.login ?? raw.author?.login ?? null,
    authorType: raw.user?.type ?? raw.author?.__typename ?? null,
    url: raw.html_url ?? raw.url ?? null,
    path: raw.path ?? null,
    line: raw.line ?? null,
    body: raw.body ?? "",
    thread: thread ?? "unknown",
  };
}

function normalizeThread(raw) {
  return {
    id: raw.id ?? null,
    resolved: raw.isResolved,
    outdated: raw.isOutdated,
    comments: raw.comments.nodes.map((comment) => ({
      id: comment.databaseId,
      outdated: comment.outdated,
    })),
  };
}

function safeSource(result, name) {
  if (!result.ok) console.error(`source unavailable: ${name} (${result.error})`);
  return result;
}

async function collect(prUrl) {
  const { owner, repo, number, url } = parsePullRequestUrl(prUrl);
  const repoPath = `repos/${owner}/${repo}`;
  const pullPath = `${repoPath}/pulls/${number}`;
  const issuePath = `${repoPath}/issues/${number}`;
  const threadArgs = [
    "api",
    "graphql",
    "--paginate",
    "--slurp",
    "-F",
    `owner=${owner}`,
    "-F",
    `name=${repo}`,
    "-F",
    `number=${number}`,
    "-f",
    `query=${THREAD_QUERY}`,
  ];

  const auth = await runGh(["auth", "token", "--hostname", "github.com", "--user", githubAccountForOwner(owner)]);
  const token = auth.ok ? auth.output.trim() : "";
  const settled = token && !/\s/.test(token) ? await Promise.all([
    runJson(["pr", "view", url, "--json", METADATA_FIELDS], { token }),
    runGh(["pr", "diff", url], { token }),
    runJson(["api", "--paginate", "--slurp", `${pullPath}/comments`], { token }),
    runJson(["api", "--paginate", "--slurp", `${issuePath}/comments`], { token }),
    runJson(["api", "--paginate", "--slurp", `${pullPath}/reviews`], { token }),
    runJson(threadArgs, { token }),
    runJson(["pr", "checks", url, "--json", "bucket,completedAt,description,event,link,name,startedAt,state,workflow"], { pendingIsAvailable: true, token }),
  ]) : SOURCE_NAMES.map(() => ({ ok: false, error: "auth_unavailable" }));
  const results = Object.fromEntries(SOURCE_NAMES.map((name, index) => [name, safeSource(settled[index], name)]));

  for (const name of ["inlineComments", "topLevelComments", "reviews"]) {
    if (!results[name].ok) continue;
    try {
      results[name] = { ok: true, value: restPages(results[name].value) };
    } catch (error) {
      results[name] = { ok: false, error: error.message };
      console.error(`source unavailable: ${name} (${error.message})`);
    }
  }
  if (results.reviewThreads.ok) {
    try {
      results.reviewThreads = { ok: true, value: threadPages(results.reviewThreads.value) };
    } catch (error) {
      results.reviewThreads = { ok: false, error: error.message };
      console.error(`source unavailable: reviewThreads (${error.message})`);
    }
  }
  if (results.checks.ok && !Array.isArray(results.checks.value)) {
    results.checks = { ok: false, error: "invalid_response" };
    console.error("source unavailable: checks (invalid_response)");
  }

  let pr = { url, title: null, body: null, author: null, state: null, baseRefName: null, baseRefOid: null, headRefName: null, headRefOid: null, isCrossRepository: null, labels: [], additions: null, deletions: null, changedFiles: null, files: [] };
  if (results.metadata.ok) {
    try {
      pr = normalizeMetadata(results.metadata.value, url);
    } catch (error) {
      results.metadata = { ok: false, error: error.message };
      console.error(`source unavailable: metadata (${error.message})`);
    }
  }

  const threads = results.reviewThreads.ok ? results.reviewThreads.value : [];
  const threadByCommentId = new Map();
  for (const thread of threads) {
    for (const comment of thread.comments.nodes) {
      if (comment.databaseId === null || comment.databaseId === undefined) continue;
      const state = typeof thread.isResolved === "boolean" && typeof comment.outdated === "boolean"
        ? { resolved: thread.isResolved, outdated: comment.outdated }
        : "unknown";
      threadByCommentId.set(String(comment.databaseId), state);
    }
  }

  const sourceStates = Object.fromEntries(SOURCE_NAMES.map((name) => [name, sourceStatus(results[name])]));
  const available = Object.values(sourceStates).every((source) => source.status === "complete");
  return {
    schemaVersion: 1,
    collection: { status: available ? "complete" : "partial", sources: sourceStates },
    pr,
    diff: results.diff.ok ? results.diff.output : null,
    comments: {
      inline: results.inlineComments.ok ? results.inlineComments.value.map((comment) => normalizeComment(comment, threadByCommentId)) : [],
      topLevel: results.topLevelComments.ok ? results.topLevelComments.value.map((comment) => ({ ...normalizeComment(comment, new Map()), thread: "not applicable" })) : [],
      reviews: results.reviews.ok ? results.reviews.value.map((review) => ({ ...normalizeComment(review, new Map()), thread: "not applicable" })) : [],
    },
    reviewThreads: threads.map(normalizeThread),
    checks: results.checks.ok && Array.isArray(results.checks.value) ? results.checks.value : [],
  };
}

async function main(args) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.length !== 1) {
    console.error(HELP.trim());
    return 2;
  }

  let parsedUrl;
  try {
    parsedUrl = parsePullRequestUrl(args[0]);
  } catch {
    console.error("invalid GitHub pull request URL; expected https://github.com/OWNER/REPO/pull/NUMBER");
    return 2;
  }

  try {
    process.stdout.write(`${JSON.stringify(await collect(parsedUrl.url))}\n`);
    return 0;
  } catch {
    console.error("collection failed (internal_error)");
    return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
