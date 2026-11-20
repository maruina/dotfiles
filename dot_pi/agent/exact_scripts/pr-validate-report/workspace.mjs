import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, mkdtempSync, realpathSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { githubRemoteIdentity, parsePullRequestUrl } from "./github-url.mjs";

const exec = promisify(execFile);
const collector = fileURLToPath(new URL("./collect.mjs", import.meta.url));
const help = `Usage:
  node workspace.mjs preflight <PR URL> <base repository path> <remote>
  node workspace.mjs cleanup <PR URL>

Preflight collects evidence and verifies the fetched PR head without a checkout.
Cleanup removes only a clean, detached review worktree for the specified repository.
Both commands return JSON on stdout.`;

async function run(command, args, label, options) {
  try {
    return (await exec(command, args, { encoding: "utf8", ...options })).stdout;
  } catch (error) {
    throw new Error(`${label} failed (${error.signal ?? error.code ?? "unknown"})`);
  }
}

function runGit(cwd, ...args) {
  return run("git", ["-C", cwd, ...args], `Git ${args[0]}`, {
    timeout: 60_000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

async function collectEvidence(url) {
  const output = await run(process.execPath, [collector, url], "GitHub evidence collection", {
    timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(output);
  } catch {
    throw new Error("GitHub evidence collector returned invalid JSON");
  }
}

function matchesRepository(remote, pr) {
  return githubRemoteIdentity(remote) === `${pr.owner}/${pr.repo}`.toLowerCase();
}

function reviewWorktree(pr, root = process.env.WORKTREES_ROOT || join(homedir(), "dd", ".worktrees")) {
  return join(root, pr.repo, `pr-${pr.number}-review`);
}

export async function preflight({ url, base, remote, git = runGit, collect = collectEvidence, temp = tmpdir() }) {
  const pr = parsePullRequestUrl(url);
  if (!remote || remote.startsWith("-")) throw new Error("Expected a named Git remote");
  const remoteUrls = (await git(base, "remote", "get-url", "--all", remote)).trim().split("\n");
  if (remoteUrls.length !== 1 || !matchesRepository(remoteUrls[0], pr)) {
    throw new Error(`Git remote does not match ${pr.owner}/${pr.repo}`);
  }
  const evidence = await collect(pr.url);
  const headOid = evidence?.pr?.headRefOid;
  if (typeof headOid !== "string" || !/^[0-9a-f]{40}$/.test(headOid)) {
    const status = evidence?.collection?.sources?.metadata?.status;
    throw new Error(`GitHub evidence does not contain a valid headRefOid${status === "unavailable" ? " (metadata unavailable)" : ""}`);
  }

  const ref = `refs/pi-pr-validate/${randomUUID()}`;
  try {
    await git(base, "fetch", "--no-write-fetch-head", "--no-tags", "--no-recurse-submodules", "--refmap=", remote, `refs/pull/${pr.number}/head:${ref}`);
    const fetched = (await git(base, "rev-parse", "--verify", `${ref}^{commit}`)).trim();
    if (fetched !== headOid) throw new Error(`PR head changed: collected ${headOid}, fetched ${fetched}`);
  } finally {
    await git(base, "update-ref", "-d", ref);
  }

  const scratchDir = mkdtempSync(join(temp, `pr-validate-${pr.repo}-${pr.number}-`));
  const evidenceFile = join(scratchDir, "evidence.json");
  try {
    writeFileSync(evidenceFile, `${JSON.stringify(evidence)}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    // Do not delete anything except this run's evidence file and empty directory.
    try { unlinkSync(evidenceFile); } catch { /* Preserve the write error. */ }
    try { rmdirSync(scratchDir); } catch { /* Preserve the write error. */ }
    throw error;
  }
  return { scratchDir, evidenceFile, headOid, worktree: reviewWorktree(pr) };
}

function checkPhysicalPath(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) throw new Error("Review worktree path is not a directory or is a symlink");
  return join(realpathSync(dirname(path)), basename(path));
}

export async function cleanup({ url, root, git = runGit, physicalPath = checkPhysicalPath }) {
  const pr = parsePullRequestUrl(url);
  const worktree = reviewWorktree(pr, root);
  let physical;
  try {
    physical = physicalPath(worktree);
  } catch (error) {
    if (error.code === "ENOENT") return { status: "absent", worktree };
    throw error;
  }
  const entries = (await git(physical, "worktree", "list", "--porcelain", "-z"))
    .split("\0\0").filter(Boolean).map((entry) => entry.split("\0"));
  const base = entries[0]?.[0]?.replace(/^worktree /, "");
  const review = entries.slice(1).find(([path]) => path === `worktree ${physical}`);
  if (!base || !review?.includes("detached") || review.some((field) => /^(locked|prunable)( |$)/.test(field))) {
    throw new Error("Expected a registered, unlocked, detached review worktree");
  }
  const remotes = (await git(base, "remote", "-v")).split("\n");
  if (!remotes.some((entry) => matchesRepository(entry.match(/\t(\S+) \(fetch\)$/)?.[1], pr))) {
    throw new Error(`Review worktree remote does not match ${pr.owner}/${pr.repo}`);
  }
  if (await git(physical, "status", "--porcelain", "--untracked-files=all", "--ignore-submodules=none")) {
    throw new Error(`Review worktree is dirty; retained ${worktree}`);
  }
  await git(base, "worktree", "remove", "--", physical);
  return { status: "removed", worktree };
}

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    console.log(help);
    return 0;
  }
  try {
    if (args[0] === "preflight" && args.length === 4) {
      console.log(JSON.stringify(await preflight({ url: args[1], base: realpathSync(args[2]), remote: args[3] })));
    } else if (args[0] === "cleanup" && args.length === 2) {
      console.log(JSON.stringify(await cleanup({ url: args[1] })));
    } else {
      console.error(help);
      return 2;
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
