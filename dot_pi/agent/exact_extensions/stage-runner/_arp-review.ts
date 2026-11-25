import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isWorkGitHubOrg, parseGitHubOwnerRepo, parsePullRequestUrl, scrubbedGhEnv, selectGitHubLogin } from "../_shared/github.ts";
import { getProfile } from "../_shared/profile.ts";
import { arpReviewFixPrompt, createDirectArpCaller, partitionFindingFixes, reviewPublished, type FindingFix } from "./_arp.ts";
import { publisher } from "./_publish.ts";
import { acceptFixes, acquireRun, anchorFinding, attempt, handoff, privateFile, type Options, type Phase } from "./_runner.ts";

const defaultMaxHeads = 5;
const maxAllowedHeads = 10;

export function parseArpReviewArgs(arg: string): { maxHeads: number; prUrl?: string } {
  const usage = `Use /arp-review [<pr-url>] [--max-heads <N>] with an integer from 1 to ${maxAllowedHeads}.`;
  const input = arg.trim();
  if (!input) return { maxHeads: defaultMaxHeads };
  const tokens = input.split(/\s+/);
  let maxHeads: number | undefined;
  let prUrl: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--max-heads" || token.startsWith("--max-heads=")) {
      if (maxHeads !== undefined) throw Error(usage);
      const raw = token === "--max-heads" ? tokens[++i] : token.slice("--max-heads=".length);
      if (!raw || !/^[0-9]+$/.test(raw)) throw Error(usage);
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxAllowedHeads) throw Error(usage);
      maxHeads = parsed;
      continue;
    }
    if (token.startsWith("-") || prUrl !== undefined) throw Error(usage);
    try {
      prUrl = parsePullRequestUrl(token).url;
    } catch {
      throw Error(usage);
    }
  }
  return { maxHeads: maxHeads ?? defaultMaxHeads, ...(prUrl ? { prUrl } : {}) };
}

type ArpReviewOptions = Omit<Options, "plan" | "models" | "approve" | "rexCommand"> & {
  models: Pick<Options["models"], "execute">;
  maxHeads: number;
  prUrl?: string;
};

function runGit(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) {
  return execFileSync("git", args, {
    cwd, env, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function resolvePrWorktree({ owner, repo, branch, cwd, env }: {
  owner: string; repo: string; branch: string; cwd: string; env: NodeJS.ProcessEnv;
}) {
  const home = env.HOME || os.homedir();
  const targetRepo = `${owner}/${repo}`.toLowerCase();
  const candidates = [
    cwd,
    path.join(home, "dd", repo),
    path.join(home, "go", "src", "github.com", owner, repo),
    path.join(home, "go", "src", "github.com", "DataDog", repo),
  ];
  const seen = new Set<string>();
  let checkout: string | undefined;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    let top: string;
    try {
      top = fs.realpathSync(runGit(candidate, env, "rev-parse", "--show-toplevel"));
    } catch {
      continue;
    }
    if (seen.has(top)) continue;
    seen.add(top);
    let remotes: string[];
    try {
      remotes = runGit(top, env, "remote", "get-url", "--all", "origin").split("\n");
    } catch {
      continue;
    }
    if (remotes.some(remote => {
      const parsed = parseGitHubOwnerRepo(remote);
      return parsed && `${parsed.owner}/${parsed.repo}`.toLowerCase() === targetRepo;
    })) {
      checkout = top;
      break;
    }
  }
  if (!checkout) throw Error(`No local checkout found for ${owner}/${repo}`);
  const blocks = runGit(checkout, env, "worktree", "list", "--porcelain").split(/\r?\n\r?\n/);
  const targetRef = `refs/heads/${branch}`;
  const matches: string[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const worktreeLine = lines.find(line => line.startsWith("worktree "));
    if (!worktreeLine) continue;
    if (lines.some(line => line === "prunable" || line.startsWith("prunable "))) continue;
    if (lines.includes(`branch ${targetRef}`)) matches.push(worktreeLine.slice("worktree ".length));
  }
  if (!matches.length) throw Error(`No local worktree found for branch ${branch} of ${owner}/${repo}`);
  if (matches.length > 1) throw Error(`Multiple local worktrees found for branch ${branch}: ${matches.join(", ")}`);
  return fs.realpathSync(matches[0]);
}

export async function runArpReview(o: ArpReviewOptions) {
  if (!Number.isInteger(o.maxHeads) || o.maxHeads < 1 || o.maxHeads > maxAllowedHeads)
    throw Error(`Expected maxHeads from 1 to ${maxAllowedHeads}`);
  const env = scrubbedGhEnv(o.env ?? process.env);
  let cwd: string;
  let branch: string;
  let requestedPrUrl: string | undefined;
  if (o.prUrl) {
    const parsedPr = parsePullRequestUrl(o.prUrl);
    requestedPrUrl = parsedPr.url;
    if (getProfile(env, o.profilePath) !== "work") throw Error("/arp-review requires the work profile");
    if (!isWorkGitHubOrg(parsedPr.owner)) throw Error("/arp-review requires a ddoghq/* or ddoghq-sandbox/* repository");
    const login = selectGitHubLogin(parsedPr.owner);
    const token = execFileSync("gh", ["auth", "token", "--hostname", "github.com", "--user", login], {
      cwd: o.cwd, env, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (!token) throw Error("Missing GitHub API credential");
    const ghEnv = { ...env, GH_TOKEN: token };
    const prView = JSON.parse(execFileSync("gh", [
      "pr", "view", String(parsedPr.number), "--repo", `${parsedPr.owner}/${parsedPr.repo}`,
      "--json", "number,url,state,headRefOid,headRefName,baseRefName,headRepository,headRepositoryOwner,isCrossRepository",
    ], {
      cwd: o.cwd, env: ghEnv, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
    }));
    if (prView.state !== "OPEN") throw Error(`No open PR for ${parsedPr.url} (state: ${prView.state ?? "unknown"})`);
    if (
      prView.isCrossRepository !== false ||
      `${prView.headRepositoryOwner?.login}/${prView.headRepository?.name}`.toLowerCase() !== `${parsedPr.owner}/${parsedPr.repo}`.toLowerCase()
    )
      throw Error("Conflicting PR target");
    branch = prView.headRefName;
    if (!branch || ["main", "master"].includes(branch)) throw Error("Choose a feature branch");
    cwd = resolvePrWorktree({ owner: parsedPr.owner, repo: parsedPr.repo, branch, cwd: o.cwd, env });
  } else {
    cwd = fs.realpathSync(runGit(o.cwd, env, "rev-parse", "--show-toplevel"));
    branch = runGit(cwd, env, "symbolic-ref", "--short", "HEAD");
    if (["main", "master"].includes(branch)) throw Error("Choose a feature branch or pass /arp-review <pr-url>");
  }
  const git = (...args: string[]) => runGit(cwd, env, ...args);
  let defaultBranch: string;
  try {
    defaultBranch = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  } catch {
    throw Error("Cannot establish origin default branch from refs/remotes/origin/HEAD");
  }
  if (branch === defaultBranch) throw Error("Choose a feature branch or pass /arp-review <pr-url>");
  const clean = () => {
    if (git("status", "--porcelain=v1", "--untracked-files=all") || git("symbolic-ref", "--short", "HEAD") !== branch)
      throw Error("Worktree is dirty or branch changed");
  };
  clean();
  const { dir, signal, ownsLock, complete, failure, release } = acquireRun({ ...o, cwd });
  let head: string | undefined, prUrl: string | undefined;
  let openIds = "", operatorDetail = "";
  let pending: { head: string; fixes: FindingFix[] } | undefined;
  const now = o.now ?? (() => performance.now());
  const phase = (phase: Exclude<Phase, "recovery">) => o.onEvent({ type: "phase", phase, at: now() });
  const message = (message: string) => o.onEvent({ type: "message", message });
  try {
    const originalHead = git("rev-parse", "HEAD");
    head = originalHead;
    const checkCandidate = (expectedHead: string) => {
      signal.throwIfAborted();
      clean();
      if (!ownsLock() || git("rev-parse", "HEAD") !== expectedHead) throw Error("Worktree lock or local HEAD changed");
    };
    checkCandidate(originalHead);
    const publication = publisher(cwd, o.profilePath, env, signal);
    const { target, remoteHead, lookup } = await publication.inspect();
    prUrl = target.pr ?? undefined;
    if (target.profile !== "work") throw Error("/arp-review requires the work profile");
    if (!target.review) throw Error("/arp-review requires a ddoghq/* or ddoghq-sandbox/* repository");
    if (target.branch !== branch || target.base !== defaultBranch) throw Error("GitHub target differs from local branch or base");
    if (!prUrl) throw Error("No open PR for the feature branch");
    const pr = await lookup();
    if (pr?.url !== prUrl || (requestedPrUrl && pr.url !== requestedPrUrl))
      throw Error("Open PR changed before confirmation");
    if (remoteHead !== head || pr.headRefOid !== head)
      throw Error(`Heads differ: local ${head}, remote ${remoteHead}, PR ${pr.headRefOid}`);
    let checkRemoteHead = async (readSignal: AbortSignal) => {
      const current = await lookup(readSignal);
      if (current?.url !== pr.url || current.headRefOid !== originalHead)
        throw Error(`PR head changed; expected ${originalHead}, observed ${current?.headRefOid ?? "no matching open PR"}`);
    };
    checkCandidate(originalHead);
    const decision = `Profile: ${target.profile}. SSH repository: ${target.url}. Branch: ${branch}. PR: ${pr.url}. ` +
      `HEAD: ${head}. GitHub login: ${target.login}. Head limit: ${o.maxHeads}. ` +
      "Authorize up to one silent ARP review request per head when ARP permits it. " +
      "The review loop can make non-force pushes of tested fix commits and permanent addressed settlements for fixed findings. " +
      "Cancellation does not undo completed remote writes.";
    const accepted = await o.confirm(decision, signal);
    signal.throwIfAborted();
    if (!accepted) throw Error("ARP review declined; no remote write");
    checkCandidate(originalHead);
    await checkRemoteHead(signal);
    privateFile(path.join(dir, "run.json"), JSON.stringify({ cwd, target, head, models: o.models, maxHeads: o.maxHeads }));
    const arpCall = o.arpCall ?? createDirectArpCaller({ env });
    for (let reviewedHeads = 1; ; reviewedHeads++) {
      signal.throwIfAborted();
      const prev = head;
      const headDir = reviewedHeads === 1 ? dir : path.join(dir, `arp-head-${reviewedHeads}`);
      if (headDir !== dir) fs.mkdirSync(headDir, { mode: 0o700 });
      const label = `head ${reviewedHeads} of ${o.maxHeads}`;
      phase("review");
      message(`Reviewing ${label}: ${pr.url} at ${prev}`);
      const findings = await reviewPublished({
        dir: headDir,
        repo: target.repo,
        number: pr.number,
        url: pr.url,
        head: prev,
        signal,
        clock: o.reviewClock,
        checkHead: async (reviewSignal) => {
          await checkRemoteHead(reviewSignal);
          checkCandidate(prev);
        },
        call: arpCall,
        onEvent: o.onEvent,
        fixes: pending?.fixes,
        settlementReason: "Author-tested fix",
      });
      pending = undefined;
      if (!findings.length) break;
      const open = findings.map(finding => finding.id).join(", ");
      openIds = `; open finding IDs: ${open}`;
      message(`Open findings for ${pr.url} at ${prev}: ${open}`);
      if (reviewedHeads >= o.maxHeads) {
        throw Error(`${label}: head limit reached`);
      }
      phase("fix");
      const fixDir = path.join(dir, `arp-fix-${reviewedHeads}`);
      fs.mkdirSync(fixDir, { mode: 0o700 });
      const fixOut = path.join(fixDir, "handoff.json");
      checkCandidate(prev);
      const anchored = findings.map(finding => anchorFinding(git, prev, finding));
      privateFile(path.join(fixDir, "findings.json"), JSON.stringify(anchored));
      const prompt = arpReviewFixPrompt(prev, target.base, anchored, fixOut);
      await checkRemoteHead(signal);
      checkCandidate(prev);
      await attempt(
        { ...o, cwd, env, models: { execute: o.models.execute, simplify: o.models.execute, verify: o.models.execute } },
        "arp-fix",
        fixDir,
        prompt,
        signal,
        undefined,
        fixOut,
      );
      signal.throwIfAborted();
      clean();
      const candidate = git("rev-parse", "HEAD");
      const { fixes, needsOperator } = partitionFindingFixes(handoff(fixOut, "arp-fix").findings, findings);
      if (needsOperator.length) {
        const details = needsOperator.map(({ id, reason }) => `#${id}: ${reason.replace(/[^\x20-\x7e]/g, "?")}`).join("; ");
        const localNote = candidate !== prev ? `; local HEAD ${candidate}` : "";
        operatorDetail = `; ${details}${localNote}`;
        throw Error("Operator required");
      }
      acceptFixes({ git, prev, candidate, fixes });
      phase("publish");
      await checkRemoteHead(signal);
      const published = await publication.publish(
        target,
        candidate,
        () => checkCandidate(candidate),
        async () => { throw Error("Unexpected PR draft during /arp-review"); },
        (step, error) => { throw Error(`Unexpected PR draft failure during /arp-review (${step}): ${error}`); },
      );
      head = candidate;
      openIds = "";
      pending = { head: candidate, fixes };
      checkRemoteHead = published.checkHead;
      message(`Published ${published.url} at ${candidate}`);
    }
    complete("ARP complete");
    message(`ARP complete - No issues found: ${pr.url} at ${head}`);
    return dir;
  } catch (error) {
    const context = prUrl ? `${prUrl} at ${head}` : head ? `local HEAD ${head}` : "";
    const reason = error instanceof Error ? error.message : String(error);
    const unsettled = pending && !reason.includes("remaining IDs:")
      ? `; pushed SHA ${pending.head}; unsettled finding IDs: ${pending.fixes.map(f => f.id).join(", ")}`
      : "";
    const detail = `${operatorDetail}${openIds}${unsettled}`;
    if (context && reason.startsWith(context)) throw failure(reason, detail);
    throw failure([context, signal.aborted ? "ARP review canceled" : reason].filter(Boolean).join("; "), detail);
  } finally {
    release();
  }
}
