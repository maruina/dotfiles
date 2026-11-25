import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { scrubbedGhEnv } from "../_shared/github.ts";
import { createDirectArpCaller, reviewPublished } from "./_arp.ts";
import { publisher } from "./_publish.ts";
import { acquireRun, privateFile, type Options } from "./_runner.ts";

const defaultMaxHeads = 5;
const maxAllowedHeads = 10;

export function parseArpReviewArgs(arg: string) {
  const input = arg.trim();
  if (!input) return { maxHeads: defaultMaxHeads };
  const match = /^--max-heads(?:[ \t]+|=)([0-9]+)$/.exec(input);
  const maxHeads = Number(match?.[1]);
  if (!Number.isInteger(maxHeads) || maxHeads < 1 || maxHeads > maxAllowedHeads)
    throw Error(`Use /arp-review [--max-heads <N>] with an integer from 1 to ${maxAllowedHeads}.`);
  return { maxHeads };
}

type ArpReviewOptions = Omit<Options, "plan" | "models" | "approve" | "rexCommand"> & {
  models: Pick<Options["models"], "execute">;
  maxHeads: number;
};

export async function runArpReview(o: ArpReviewOptions) {
  if (!Number.isInteger(o.maxHeads) || o.maxHeads < 1 || o.maxHeads > maxAllowedHeads)
    throw Error(`Expected maxHeads from 1 to ${maxAllowedHeads}`);
  const env = scrubbedGhEnv(o.env ?? process.env);
  const git = (...args: string[]) => execFileSync("git", args, {
    cwd: o.cwd, env, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
  const cwd = fs.realpathSync(git("rev-parse", "--show-toplevel"));
  const branch = git("symbolic-ref", "--short", "HEAD");
  if (["main", "master"].includes(branch)) throw Error("Choose a feature branch");
  let defaultBranch: string;
  try {
    defaultBranch = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  } catch {
    throw Error("Cannot establish origin default branch from refs/remotes/origin/HEAD");
  }
  if (branch === defaultBranch) throw Error("Choose a feature branch");
  const clean = () => {
    if (git("status", "--porcelain=v1", "--untracked-files=all") || git("symbolic-ref", "--short", "HEAD") !== branch)
      throw Error("Worktree is dirty or branch changed");
  };
  clean();
  const { dir, signal, ownsLock, complete, failure, release } = acquireRun({ ...o, cwd });
  let head: string | undefined, prUrl: string | undefined;
  let openIds = "";
  const message = (message: string) => o.onEvent({ type: "message", message });
  try {
    const originalHead = git("rev-parse", "HEAD");
    head = originalHead;
    const checkCandidate = () => {
      clean();
      if (!ownsLock() || git("rev-parse", "HEAD") !== originalHead) throw Error("Worktree lock or local HEAD changed");
    };
    checkCandidate();
    const publication = publisher(cwd, o.profilePath, env, signal);
    const { target, remoteHead, lookup } = await publication.inspect();
    prUrl = target.pr ?? undefined;
    if (target.profile !== "work") throw Error("/arp-review requires the work profile");
    if (!target.review) throw Error("/arp-review requires a ddoghq/* or ddoghq-sandbox/* repository");
    if (target.branch !== branch || target.base !== defaultBranch) throw Error("GitHub target differs from local branch or base");
    if (!prUrl) throw Error("No open PR for the feature branch");
    const pr = await lookup();
    if (pr?.url !== prUrl) throw Error("Open PR changed before confirmation");
    if (remoteHead !== head || pr.headRefOid !== head)
      throw Error(`Heads differ: local ${head}, remote ${remoteHead}, PR ${pr.headRefOid}`);
    const checkHead = async (readSignal: AbortSignal) => {
      const current = await lookup(readSignal);
      if (current?.url !== pr.url || current.headRefOid !== head)
        throw Error(`PR head changed; expected ${head}, observed ${current?.headRefOid ?? "no matching open PR"}`);
    };
    checkCandidate();
    const decision = `Profile: ${target.profile}. SSH repository: ${target.url}. Branch: ${branch}. PR: ${pr.url}. ` +
      `HEAD: ${head}. GitHub login: ${target.login}. Head limit: ${o.maxHeads}. ` +
      "Authorize up to one silent ARP review request per head when ARP permits it. " +
      "The review loop can make non-force pushes of tested fix commits and permanent addressed settlements for fixed findings. " +
      "This version reviews only the initial head; it does not push or settle findings. " +
      "Cancellation does not undo completed remote writes.";
    const accepted = await o.confirm(decision, signal);
    signal.throwIfAborted();
    if (!accepted) throw Error("ARP review declined; no remote write");
    checkCandidate();
    await checkHead(signal);
    privateFile(path.join(dir, "run.json"), JSON.stringify({ cwd, target, head, models: o.models, maxHeads: o.maxHeads }));
    const label = `head 1 of ${o.maxHeads}`;
    o.onEvent({ type: "phase", phase: "review", at: (o.now ?? (() => performance.now()))() });
    message(`Reviewing ${label}: ${pr.url} at ${head}`);
    const findings = await reviewPublished({ dir, repo: target.repo, number: pr.number, url: pr.url, head, signal,
      clock: o.reviewClock, checkHead, call: o.arpCall ?? createDirectArpCaller({ env }), onEvent: o.onEvent });
    if (findings.length) {
      // deliberate: Review only the initial head in Slice 1. Slice 2 adds the fix and re-review loop.
      openIds = `; open finding IDs: ${findings.map(finding => finding.id).join(", ")}`;
      throw Error(`${label}: head limit reached (initial review only)`);
    }
    complete("ARP complete");
    message(`ARP complete: ${pr.url} at ${head}`);
    return dir;
  } catch (error) {
    const context = prUrl ? `${prUrl} at ${head}` : head ? `local HEAD ${head}` : "";
    const reason = error instanceof Error ? error.message : String(error);
    if (context && reason.startsWith(context)) throw failure(reason, openIds);
    throw failure([context, signal.aborted ? "ARP review canceled" : reason].filter(Boolean).join("; "), openIds);
  } finally {
    release();
  }
}
