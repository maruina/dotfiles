import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseGitHubOwnerRepo } from "../_shared/github.ts";
import { getProfile } from "../_shared/profile.ts";
import { queryPrStatus, type AsyncRunner } from "./github.ts";

const STATUS = "pr-status";
const TIMEOUT_MS = 10_000;
const POLL_MS = 120_000;
const MAX_RETRY_MS = 600_000;
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

export function createPrStatusExtension({ run = runCommand, setTimer = startTimer, profile = getProfile } = {}) {
  return (pi: ExtensionAPI) => {
    let active = false;
    let inFlight: AbortController | undefined;
    let cancelTimer: (() => void) | undefined;
    let retryMs = 0;
    let lastKnown: { key: string; value: string } | undefined;
    let published: string | undefined;

    function publish(ctx: ExtensionContext, value: string | undefined) {
      if (published === value) return;
      ctx.ui.setStatus(STATUS, value);
      published = value;
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
      let key: string | undefined;
      let nextDelay: number | undefined;

      try {
        const branch = await git("branch", "--show-current");
        signal.throwIfAborted();
        const defaultRef = branch && branch !== "main" && branch !== "master"
          ? await git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD") : null;
        signal.throwIfAborted();
        const feature = branch && branch !== "main" && branch !== "master" && defaultRef !== `origin/${branch}`;
        const remote = feature ? await git("remote", "get-url", "origin") : null;
        signal.throwIfAborted();
        const repo = remote ? parseGitHubOwnerRepo(remote) : null;
        if (repo && branch) key = `${repo.owner.toLowerCase()}/${repo.repo.toLowerCase()}:${branch}`;
        if (lastKnown && lastKnown.key !== key) {
          lastKnown = undefined;
          publish(ctx, undefined);
        }
        if (!key || !branch || !remote) {
          retryMs = 0;
          return;
        }

        const value = await queryPrStatus(remote, branch, profile(), runForRefresh, { cwd: ctx.cwd });
        if (signal.aborted) return;
        lastKnown = value ? { key, value } : undefined;
        publish(ctx, value);
        retryMs = 0;
        nextDelay = POLL_MS;
      } catch {
        if (signal.aborted) return;
        if (lastKnown && lastKnown.key === key) {
          publish(ctx, lastKnown.value.replace("\t", " stale\t"));
        } else {
          lastKnown = undefined;
          publish(ctx, undefined);
        }
        retryMs = Math.min(MAX_RETRY_MS, (retryMs || POLL_MS) * 2);
        nextDelay = retryMs;
      } finally {
        inFlight = undefined;
        if (active && !signal.aborted && nextDelay !== undefined) {
          cancelTimer = setTimer(() => {
            cancelTimer = undefined;
            void refresh(ctx);
          }, nextDelay);
        }
      }
    }

    pi.on("session_start", (_event, ctx) => {
      if (!ctx.hasUI || ctx.mode !== "tui") return;
      active = true;
      void refresh(ctx);
    });
    pi.on("agent_end", (_event, ctx) => {
      if (!retryMs) void refresh(ctx);
    });
    pi.on("session_shutdown", () => {
      active = false;
      cancelTimer?.();
      cancelTimer = undefined;
      inFlight?.abort();
    });
  };
}

export default createPrStatusExtension();
