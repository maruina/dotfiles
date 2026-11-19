import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import type { CandidateSnapshot } from "./_worktree.ts";

type PublishInput = { worktree: string; candidate: CandidateSnapshot; signal?: AbortSignal };
export type PublishResult =
  | { status: "published"; prUrl: string; headSha: string; reason?: never }
  | { status: "blocked" | "cancelled"; reason: string; prUrl?: string };
export type Publisher = (input: PublishInput) => Promise<PublishResult>;

export type PublishCommand = (
  command: "gh" | "git",
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; signal?: AbortSignal; timeout: number },
) => Promise<string>;

const exec = promisify(execFile);
const runCommand: PublishCommand = async (command, args, options) => {
  try {
    return (await exec(command, args, { ...options, encoding: "utf8", maxBuffer: 1024 * 1024, killSignal: "SIGKILL" })).stdout.trim();
  } catch (error) {
    // Child errors can contain remote URLs or authentication diagnostics.
    const failure = error as NodeJS.ErrnoException & { signal?: string };
    throw new Error(`${command} ${command === "git" && args.includes("push") ? "push" : args[0]} failed (${failure.signal ?? failure.code ?? "unknown"})`);
  }
};

const fields = "url,state,isDraft,isCrossRepository,baseRefName,headRefName,headRefOid";
const sha = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const remotePattern = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i;
const prPattern = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/pull\/[1-9]\d*$/i;

type Draft = { url: string; baseRefName: string; headRefOid: string };

function validateDraft(value: unknown, repository: string, branch: string): Draft {
  const pr = value as Partial<Draft & { state: string; isDraft: boolean; isCrossRepository: boolean; headRefName: string }> | null;
  if (typeof pr?.url !== "string" || prPattern.exec(pr.url)?.[1]?.toLowerCase() !== repository.toLowerCase() ||
      pr.state !== "OPEN" || pr.isDraft !== true || pr.isCrossRepository !== false || pr.headRefName !== branch ||
      typeof pr.baseRefName !== "string" || !pr.baseRefName || typeof pr.headRefOid !== "string" || !sha.test(pr.headRefOid)) {
    throw new Error("Target PR is not a same-repository open draft for the verified branch");
  }
  return { url: pr.url, baseRefName: pr.baseRefName, headRefOid: pr.headRefOid };
}

export async function publishDraft(
  { worktree, candidate, signal }: PublishInput,
  run: PublishCommand = runCommand,
  wait = (pollSignal: AbortSignal) => delay(2_000, undefined, { signal: pollSignal }),
): Promise<PublishResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" };
  for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "GH_DEBUG", "GIT_TRACE", "GIT_TRACE_CURL", "GIT_CURL_VERBOSE"]) delete env[key];
  const { branch, head } = candidate;
  let prUrl: string | undefined;
  let progress = "";
  const command = (program: "git" | "gh", args: string[], timeout = 20_000, commandSignal = signal, token?: string) => {
    commandSignal?.throwIfAborted();
    return run(program, args, { cwd: worktree, env: token ? { ...env, GH_TOKEN: token } : env, timeout, signal: commandSignal });
  };
  const git = (...args: string[]) => command("git", args);
  const assertCandidate = async () => {
    if (await git("branch", "--show-current") !== branch || await git("rev-parse", "--verify", "HEAD") !== head ||
        await git("status", "--porcelain=v1", "--untracked-files=all")) {
      throw new Error("Worktree must be clean and still on the verified branch and commit");
    }
  };

  try {
    if (!sha.test(head) || !branch || branch.startsWith("-")) throw new Error("Invalid verified candidate");
    await assertCandidate();
    const fetchUrl = await git("remote", "get-url", "--all", "origin");
    const pushUrl = await git("remote", "get-url", "--push", "--all", "origin");
    const fetch = remotePattern.exec(fetchUrl);
    const push = remotePattern.exec(pushUrl);
    if (!fetch || !push || fetchUrl.includes("\n") || pushUrl.includes("\n") ||
        fetch.slice(1).join("/").toLowerCase() !== push.slice(1).join("/").toLowerCase() ||
        fetch.slice(1).some((part) => part === "." || part === "..")) {
      throw new Error("origin must have one GitHub fetch and push destination for the same repository");
    }
    const owner = fetch[1]!;
    const repository = `${owner}/${fetch[2]}`;
    const login = /^(?:ddoghq|ddoghq-sandbox)$/i.test(owner) ? "matteo-ruina_ddog" : "maruina";
    const token = await command("gh", ["auth", "token", "--hostname", "github.com", "--user", login]);
    if (!token || /\s/.test(token)) throw new Error("GitHub CLI did not return a usable token for the selected account");
    const gh = (action: string, args: string[], readSignal = signal) =>
      command("gh", ["pr", action, "--repo", repository, ...args], 20_000, readSignal, token);

    const listed: unknown = JSON.parse(await gh("list", ["--state", "open", "--head", branch, "--limit", "2", "--json", fields]));
    if (!Array.isArray(listed) || listed.length > 1) throw new Error("Ambiguous open PR target for the verified branch");
    const existing = listed.length === 1 ? validateDraft(listed[0], repository, branch) : undefined;
    prUrl = existing?.url;
    if (existing?.headRefOid !== head) {
      await assertCandidate();
      // HTTPS uses the selected gh account. SSH uses the repository's configured Git transport.
      const https = /^https:\/\//i.test(pushUrl);
      const credentials = https ? ["-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential"] : [];
      progress = "Push attempted; verify remote state before retrying.";
      await command("git", [...credentials, "-c", "remote.origin.mirror=false", "push", "--no-follow-tags", "--recurse-submodules=no",
        "origin", `${head}:refs/heads/${branch}`], 120_000, signal, https ? token : undefined);
      progress = "Push completed.";
    }

    if (!prUrl) {
      await assertCandidate();
      progress += " Draft creation attempted; check for an existing PR before retrying.";
      // With no --base, gh respects branch.<name>.gh-merge-base or the repository default.
      const created = await gh("create", ["--draft", "--fill", "--head", branch]);
      if (prPattern.exec(created)?.[1]?.toLowerCase() !== repository.toLowerCase()) throw new Error("GitHub CLI did not return a PR URL for the target repository");
      prUrl = created;
    }

    const deadline = AbortSignal.timeout(60_000);
    const pollSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    let observed = "";
    for (let read = 0; read < 6; read++) {
      if (read > 0) await wait(pollSignal);
      const confirmed = validateDraft(JSON.parse(await gh("view", [prUrl, "--json", fields], pollSignal)), repository, branch);
      if (confirmed.url.toLowerCase() !== prUrl.toLowerCase() || (existing && confirmed.baseRefName !== existing.baseRefName)) {
        throw new Error("GitHub returned a different PR or the existing draft's base changed");
      }
      observed = confirmed.headRefOid;
      if (observed === head) {
        signal?.throwIfAborted();
        return { status: "published", prUrl: confirmed.url, headSha: observed };
      }
    }
    throw new Error(`GitHub draft head ${observed} does not match the verified head ${head}`);
  } catch (error) {
    const reason = signal?.aborted ? "Publication cancelled." : deadlineMessage(error);
    return { status: signal?.aborted ? "cancelled" : "blocked", reason: [progress, reason].filter(Boolean).join(" "), ...(prUrl ? { prUrl } : {}) };
  }
}

function deadlineMessage(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return "Timed out confirming the draft PR head.";
  return error instanceof Error ? error.message : "Publication failed.";
}
