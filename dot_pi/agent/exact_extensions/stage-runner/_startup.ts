import { spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

import type { publisher } from "./_publish.ts";
import { attempt, handoff, privateFile, safe, type Options } from "./_runner.ts";

type Publisher = ReturnType<typeof publisher>;
type PublicationTarget = Awaited<ReturnType<Publisher["inspect"]>>["target"];

export type StartupRebaseParams = {
  o: Options;
  cwd: string;
  env: NodeJS.ProcessEnv;
  dir: string;
  branch: string;
  rel: string;
  blob: string;
  originalHead: string;
  pinnedBase: string;
  remoteHead: string;
  target: PublicationTarget;
  publication: Publisher;
  signal: AbortSignal;
  git: (...args: string[]) => string;
  clean: () => void;
  ancestor: (older: string, newer: string) => boolean;
  onStartupPhase: () => void;
  message: (text: string) => void;
  markUncertain: () => void;
};

export async function runStartupRebase(params: StartupRebaseParams): Promise<string> {
  const {
    o,
    cwd,
    env,
    dir,
    branch,
    rel,
    blob,
    originalHead,
    pinnedBase,
    remoteHead,
    target,
    publication,
    signal,
    git,
    clean,
    ancestor,
    onStartupPhase,
    message,
    markUncertain,
  } = params;
  onStartupPhase();
  const context = `original ${originalHead}, pinned ${pinnedBase}`;
  const gitState = () => ({
    head: git("rev-parse", "HEAD"),
    branch: git("rev-parse", "--symbolic-full-name", "HEAD"),
    status: git("status", "--porcelain=v1", "--untracked-files=all"),
  });
  const featureRef = `refs/heads/${branch}`;
  const gitOperation = ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "BISECT_START", "sequencer"]
    .find((name) => fs.existsSync(path.resolve(cwd, git("rev-parse", "--git-path", name))));
  if (gitOperation) throw Error(`Startup rebase stopped: ${gitOperation} exists; ${context}; no remote write`);
  const mergeBase = git("merge-base", originalHead, pinnedBase);
  const assertRestored = () => {
    clean();
    if (git("rev-parse", "HEAD") !== originalHead) throw Error("Original HEAD not restored");
  };
  let uncertain = false;
  const setUncertain = () => {
    uncertain = true;
    markUncertain();
  };
  function recoveryFailed(step: string, error: unknown, rebased?: string): never {
    setUncertain();
    let state: unknown = "unavailable";
    try {
      state = gitState();
    } catch {
      /* Keep the lock without Git state. */
    }
    privateFile(
      path.join(dir, "startup-stop.json"),
      JSON.stringify({ step, error: safe(String(error)), originalHead, pinnedBase, rebased, featureRef, state }),
    );
    throw Error(
      `${step}; ${context}${rebased ? `, rebased ${rebased}` : ""}; ${safe(String(error))}; no remote write; keep the lock and inspect Git state before manual recovery: ${safe(JSON.stringify(state))}`,
    );
  }
  signal.throwIfAborted();
  const rebaseSignal = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "git",
        [
          "-c",
          "core.hooksPath=/dev/null",
          "-c",
          "rebase.rebaseMerges=false",
          "rebase",
          "--no-autostash",
          "--no-autosquash",
          "--no-update-refs",
          pinnedBase,
        ],
        { cwd, env, stdio: "ignore", detached: true },
      );
      let failure: Error | undefined;
      const abort = () => {
        if (!child.pid) return;
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") failure = Error("Could not stop Git rebase");
        }
      };
      child.once("error", (error) => {
        failure = error;
      });
      child.once("close", (code) => {
        rebaseSignal.removeEventListener("abort", abort);
        if (failure || code !== 0)
          reject(failure ?? Error(rebaseSignal.aborted ? "Rebase canceled or timed out" : `Git rebase exited with ${code}`));
        else resolve();
      });
      rebaseSignal.addEventListener("abort", abort, { once: true });
      if (rebaseSignal.aborted) abort();
    });
  } catch (error) {
    try {
      git("-c", "core.hooksPath=/dev/null", "rebase", "--abort");
      assertRestored();
    } catch (restoreError) {
      recoveryFailed("Startup rebase abort failed", `${error}; ${restoreError}`);
    }
    throw Error(`Startup rebase stopped: ${error}; ${context}; restored ${originalHead}; no remote write`);
  }
  let rebased: string | undefined;
  let step = "check";
  let remoteEffect = "no remote write";
  try {
    rebased = git("rev-parse", "HEAD");
    clean();
    signal.throwIfAborted();
    if (git("merge-base", pinnedBase, rebased) !== pinnedBase || git("rev-parse", `${rebased}:${rel}`) !== blob)
      throw Error("Rebased HEAD does not contain the pinned base and exact reviewed plan blob");
    message(`Rebased ${originalHead} to ${rebased} onto ${pinnedBase}`);
    const folder = path.join(dir, "startup-check");
    fs.mkdirSync(folder, { mode: 0o700 });
    const out = path.join(folder, "handoff.json");
    await attempt(
      o,
      "startup-check",
      folder,
      `Startup check: Review whether the committed plan at ${JSON.stringify(rel)} still fits.\n` +
        `Original HEAD: ${originalHead}. Pinned base: ${pinnedBase}. Rebased HEAD: ${rebased}. Reviewed plan blob: ${blob}.\n` +
        `Inspect upstream changes in ${mergeBase}..${pinnedBase} that touch plan-referenced paths. Check binding assumptions, referenced files and symbols, and validation commands. Do not edit, commit, or push.\n` +
        `Submit the handoff with submit_stage_handoff (head ${rebased}, planBlob ${blob}, status "fits" or "blocked" with reason).\n` +
        `Handoff path: ${out}`,
      signal,
      undefined,
      out,
    );
    clean();
    if (git("rev-parse", "HEAD") !== rebased) throw Error("Startup checker changed HEAD");
    const verdict = handoff(out, "startup-check");
    if (verdict.head !== rebased || verdict.planBlob !== blob)
      throw Error("Startup verdict does not match the rebased snapshot");
    if (verdict.status === "blocked") throw Error("Startup check blocked: " + safe(String(verdict.reason)));
    signal.throwIfAborted();
    privateFile(path.join(dir, "startup.json"), JSON.stringify({ base: rebased, verdict }));
    message("Startup check: fits");
    if (remoteHead !== "absent" && !ancestor(remoteHead, rebased)) {
      step = "push";
      const pushed = await publication.pushStartup(target, remoteHead, rebased, () => {
        clean();
        if (gitState().branch !== featureRef || git("rev-parse", "HEAD") !== rebased)
          throw Error("Rebased snapshot changed before push");
      });
      if (pushed.state === "rejected") throw Error(`Lease rejected; observed ${pushed.observed}`);
      remoteEffect =
        pushed.state === "unknown"
          ? `remote outcome unknown; observed ${pushed.observed}`
          : `remote changed to ${pushed.observed}`;
      if (pushed.state === "unknown" || pushed.state === "changed") {
        setUncertain();
        throw Error(pushed.state === "changed" ? pushed.reason : "Push result not confirmed");
      }
      message(`Pushed ${rebased} to ${branch} with lease on ${remoteHead}`);
      if (signal.aborted) {
        setUncertain();
        throw Error("Canceled after the push");
      }
    }
    return rebased;
  } catch (error) {
    if (remoteEffect !== "no remote write") {
      privateFile(
        path.join(dir, "startup-stop.json"),
        JSON.stringify({ step, originalHead, pinnedBase, rebased, remoteHead, remoteEffect, reason: safe(String(error)) }),
      );
      throw Error(
        `Startup ${step} stopped: ${error}; ${context}, captured ${remoteHead}, rebased ${rebased}; ${remoteEffect}${uncertain ? "; keep the lock for manual recovery" : ""}`,
      );
    }
    try {
      const state = gitState();
      if (state.branch !== featureRef)
        throw Error(
          `Expected branch ${featureRef}; found ${state.branch === "HEAD" ? "detached HEAD" : state.branch} at ${state.head}; no reset attempted`,
        );
      git("-c", "core.hooksPath=/dev/null", "reset", "--keep", originalHead);
      assertRestored();
    } catch (restoreError) {
      recoveryFailed(`Startup ${step} restore failed`, `${error}; ${restoreError}`, rebased);
    }
    privateFile(
      path.join(dir, "startup-stop.json"),
      JSON.stringify({ step, originalHead, pinnedBase, rebased, remoteHead, reason: safe(String(error)) }),
    );
    message(`Restored ${originalHead} after startup ${step} stopped`);
    throw Error(
      `Startup ${step} stopped: ${error}; ${context}, captured ${remoteHead}, rebased ${rebased ?? "unknown"}; restored ${originalHead}; no remote write`,
    );
  }
}
