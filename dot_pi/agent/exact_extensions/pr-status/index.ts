import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseGitHubOwnerRepo, parsePullRequestUrl } from "../_shared/github.ts";
import { getProfile } from "../_shared/profile.ts";
import {
  prKey,
  queryPrByNumber,
  queryPrStatus,
  type AsyncRunner,
  type PrRef,
  type PrStatusResult,
  type TokenCache,
} from "./github.ts";

const STATUS = "pr-status";
const TIMEOUT_MS = 10_000;
const POLL_MS = 120_000;
const MAX_RETRY_MS = 600_000;
const MAX_TRACKED_PRS = 5;
const MERGED_RETENTION_MS = 24 * 60 * 60 * 1000;
const GH_PR_WRITE_COMMAND = /(?:^|[;&|()\n])\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*gh\s+pr\s+(?:create|edit)(?:\s|$|[;&|()])/;
const PR_URL_CANDIDATE = /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[0-9]+/g;
const execFileAsync = promisify(execFile);

type AbortableRunner = (signal: AbortSignal, ...args: Parameters<AsyncRunner>) => ReturnType<AsyncRunner>;
type SetTimer = (callback: () => void, delayMs: number) => () => void;

const runCommand: AbortableRunner = async (signal, command, args = [], cwd, timeout, env) => {
  signal.throwIfAborted();
  try {
    const { stdout } = await execFileAsync(command, args, { encoding: "utf8", cwd, timeout, env, signal });
    return stdout.trim() || null;
  } catch (error) {
    // A missing ref or remote is normal. Transport errors must reach the retry path.
    if (command === "git" && typeof (error as NodeJS.ErrnoException).code !== "number") throw error;
    return null;
  }
};

const startTimer: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
};

function isTrackedGhPrCommand(command: string): boolean {
  return GH_PR_WRITE_COMMAND.test(command);
}

function extractFirstPrUrl(text: string): PrRef | null {
  for (const match of text.matchAll(PR_URL_CANDIDATE)) {
    try {
      const { owner, repo, number } = parsePullRequestUrl(match[0]);
      return { owner, repo, number };
    } catch {
      // Skip invalid URL candidates.
    }
  }
  return null;
}

function extractPrFromBashResult(command: unknown, content: readonly unknown[]): PrRef | null {
  if (typeof command !== "string" || !isTrackedGhPrCommand(command)) return null;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type !== "text" || typeof text !== "string") continue;
    const pr = extractFirstPrUrl(text);
    if (pr) return pr;
  }
  return null;
}

function extractPrFromInput(text: string): PrRef | null {
  const match = /^\/pr-address-feedback(?:\s+|$)(.*)$/s.exec(text.trim());
  if (!match) return null;
  for (const token of match[1].trim().split(/\s+/)) {
    if (!token) continue;
    try {
      const { owner, repo, number } = parsePullRequestUrl(token);
      return { owner, repo, number };
    } catch {
      // Skip non-URL tokens before the PR URL.
    }
  }
  return null;
}

function markStale(line: string): string {
  return line.replace("\t", " stale\t");
}

function shouldPrune(result: PrStatusResult, nowMs: number): boolean {
  if (result.state === "CLOSED") return true;
  if (result.state === "MERGED" && result.mergedAt) {
    const mergedMs = Date.parse(result.mergedAt);
    if (Number.isFinite(mergedMs) && nowMs - mergedMs >= MERGED_RETENTION_MS) return true;
  }
  return false;
}

export function createPrStatusExtension({
  run = runCommand,
  setTimer = startTimer,
  profile = getProfile,
  now = Date.now,
} = {}) {
  return (pi: ExtensionAPI) => {
    let active = false;
    let currentCtx: ExtensionContext | undefined;
    let inFlight: AbortController | undefined;
    let rerunRequested = false;
    let cancelTimer: (() => void) | undefined;
    let retryMs = 0;
    let lastKnownBranch: { scopeKey: string; prKey: string; line: string } | undefined;
    const lastKnownTracked = new Map<string, string>();
    let trackedPrs: PrRef[] = [];
    let published: string | undefined;

    function publish(ctx: ExtensionContext, value: string | undefined) {
      if (published === value) return;
      ctx.ui.setStatus(STATUS, value);
      published = value;
    }

    function triggerRefresh() {
      retryMs = 0;
      if (!active || !currentCtx) return;
      if (inFlight) {
        rerunRequested = true;
        return;
      }
      void refresh(currentCtx);
    }

    function trackPr(ref: PrRef) {
      const key = prKey(ref);
      if (!trackedPrs.some((pr) => prKey(pr) === key)) {
        trackedPrs.push(ref);
        while (trackedPrs.length > MAX_TRACKED_PRS) {
          const evicted = trackedPrs.shift();
          if (evicted) lastKnownTracked.delete(prKey(evicted));
        }
      }
      triggerRefresh();
    }

    async function refresh(ctx: ExtensionContext) {
      if (!active || inFlight) return;
      cancelTimer?.();
      cancelTimer = undefined;
      const controller = new AbortController();
      inFlight = controller;
      const { signal } = controller;
      const runForRefresh: AsyncRunner = (...args) => run(signal, ...args);
      const git = (...args: string[]) => runForRefresh("git", args, ctx.cwd, TIMEOUT_MS);
      let nextDelay: number | undefined;

      try {
        const branch = await git("branch", "--show-current");
        signal.throwIfAborted();
        const defaultRef = branch && branch !== "main" && branch !== "master"
          ? await git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD") : null;
        signal.throwIfAborted();
        const feature = Boolean(branch && branch !== "main" && branch !== "master" && defaultRef !== `origin/${branch}`);
        // Read origin on every refresh (even on main) so cross-repo tracked PRs know whether to prefix repo#N.
        const remote = await git("remote", "get-url", "origin");
        signal.throwIfAborted();
        const sessionRepo = remote ? parseGitHubOwnerRepo(remote) : null;
        const branchScopeKey = feature && sessionRepo && branch
          ? `${sessionRepo.owner.toLowerCase()}/${sessionRepo.repo.toLowerCase()}:${branch}` : undefined;

        if (lastKnownBranch && lastKnownBranch.scopeKey !== branchScopeKey) {
          lastKnownBranch = undefined;
          const remaining = trackedPrs.map((pr) => lastKnownTracked.get(prKey(pr))).filter((line): line is string => Boolean(line));
          publish(ctx, remaining.length > 0 ? remaining.join("\n") : undefined);
        }

        const trackedSnapshot = [...trackedPrs];
        if (!branchScopeKey && trackedSnapshot.length === 0) {
          publish(ctx, undefined);
          retryMs = 0;
          return;
        }

        const currentProfile = profile();
        const tokenCache: TokenCache = new Map();
        const renderedLines: string[] = [];
        const seenKeys = new Set<string>();
        const prunedKeys = new Set<string>();
        let anyFailure = false;
        let branchResult: PrStatusResult | undefined;

        if (branchScopeKey && branch && remote) {
          try {
            branchResult = await queryPrStatus(remote, branch, currentProfile, runForRefresh, { cwd: ctx.cwd, tokenCache });
            if (signal.aborted) return;
            if (branchResult) {
              lastKnownBranch = { scopeKey: branchScopeKey, prKey: branchResult.key, line: branchResult.line };
              seenKeys.add(branchResult.key);
              renderedLines.push(branchResult.line);
            } else {
              lastKnownBranch = undefined;
            }
          } catch {
            if (signal.aborted) return;
            anyFailure = true;
            if (lastKnownBranch && lastKnownBranch.scopeKey === branchScopeKey) {
              seenKeys.add(lastKnownBranch.prKey);
              renderedLines.push(markStale(lastKnownBranch.line));
            } else {
              lastKnownBranch = undefined;
            }
          }
        }

        const nowMs = now();
        for (const ref of trackedSnapshot) {
          const key = prKey(ref);
          if (seenKeys.has(key)) {
            if (branchResult?.key === key && shouldPrune(branchResult, nowMs)) {
              prunedKeys.add(key);
              lastKnownTracked.delete(key);
            }
            continue;
          }
          const showRepo = !sessionRepo
            || sessionRepo.owner.toLowerCase() !== ref.owner.toLowerCase()
            || sessionRepo.repo.toLowerCase() !== ref.repo.toLowerCase();
          try {
            const result = await queryPrByNumber(ref, currentProfile, runForRefresh, {
              cwd: ctx.cwd,
              showRepo,
              tokenCache,
            });
            if (signal.aborted) return;
            if (!result) {
              lastKnownTracked.delete(key);
              continue;
            }
            if (shouldPrune(result, nowMs)) {
              prunedKeys.add(key);
              lastKnownTracked.delete(key);
              continue;
            }
            lastKnownTracked.set(key, result.line);
            seenKeys.add(key);
            renderedLines.push(result.line);
          } catch {
            if (signal.aborted) return;
            anyFailure = true;
            const prev = lastKnownTracked.get(key);
            if (prev) {
              seenKeys.add(key);
              renderedLines.push(markStale(prev));
            }
          }
        }

        if (prunedKeys.size > 0) {
          trackedPrs = trackedPrs.filter((pr) => !prunedKeys.has(prKey(pr)));
        }

        publish(ctx, renderedLines.length > 0 ? renderedLines.join("\n") : undefined);

        if (!branchScopeKey && trackedPrs.length === 0) {
          retryMs = 0;
          return;
        }
        if (anyFailure) {
          retryMs = Math.min(MAX_RETRY_MS, (retryMs || POLL_MS) * 2);
          nextDelay = retryMs;
        } else {
          retryMs = 0;
          nextDelay = POLL_MS;
        }
      } catch {
        if (signal.aborted) return;
        const staleLines: string[] = [];
        const seenKeys = new Set<string>();
        if (lastKnownBranch) {
          seenKeys.add(lastKnownBranch.prKey);
          staleLines.push(markStale(lastKnownBranch.line));
        }
        for (const ref of trackedPrs) {
          const key = prKey(ref);
          if (seenKeys.has(key)) continue;
          const prev = lastKnownTracked.get(key);
          if (prev) {
            seenKeys.add(key);
            staleLines.push(markStale(prev));
          }
        }
        publish(ctx, staleLines.length > 0 ? staleLines.join("\n") : undefined);
        retryMs = Math.min(MAX_RETRY_MS, (retryMs || POLL_MS) * 2);
        nextDelay = retryMs;
      } finally {
        inFlight = undefined;
        if (active && !signal.aborted) {
          if (rerunRequested) {
            rerunRequested = false;
            void refresh(ctx);
          } else if (nextDelay !== undefined) {
            cancelTimer = setTimer(() => {
              cancelTimer = undefined;
              void refresh(ctx);
            }, nextDelay);
          }
        }
      }
    }

    pi.on("session_start", (_event, ctx) => {
      if (!ctx.hasUI || ctx.mode !== "tui") return;
      active = true;
      currentCtx = ctx;
      void refresh(ctx);
    });
    pi.on("tool_result", (event) => {
      if (!active || event.toolName !== "bash" || event.isError) return;
      const pr = extractPrFromBashResult(event.input?.command, event.content);
      if (pr) trackPr(pr);
    });
    pi.on("input", (event) => {
      if (!active) return;
      const pr = extractPrFromInput(event.text);
      if (pr) trackPr(pr);
    });
    pi.on("agent_end", (_event, ctx) => {
      if (!retryMs) void refresh(ctx);
    });
    pi.on("session_shutdown", () => {
      active = false;
      currentCtx = undefined;
      rerunRequested = false;
      cancelTimer?.();
      cancelTimer = undefined;
      inFlight?.abort();
    });
  };
}

export default createPrStatusExtension();
