/**
 * Resolve a /ship plan path to its owning worktree and refuse unsafe targets
 * before any stage spawns: default branch, missing, uncommitted, ambiguous, or
 * detached-HEAD targets. The git runner is injected so the resolution logic is
 * unit-testable without a real repository.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type WorktreeEntry = {
  root: string;
  branch: string | undefined;
};

export type GitRunner = {
  worktreeListPorcelain(): string;
  toplevel(dir: string): string | undefined;
  currentBranch(root: string): string | undefined;
  statusPorcelain(root: string, relPath: string): string;
  exists(path: string): boolean;
};

export type ResolvePlanResult =
  | { ok: true; planPath: string; root: string; branch: string }
  | { ok: false; reason: string };

export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { root: line.slice("worktree ".length), branch: undefined };
    } else if (line.startsWith("branch refs/heads/") && current) {
      current.branch = line.slice("branch refs/heads/".length);
    }
  }
  if (current) entries.push(current);
  return entries;
}

export function resolvePlan(input: string, cwd: string, git: GitRunner): ResolvePlanResult {
  // A path that exists relative to cwd or as an absolute path wins outright;
  // otherwise search every worktree for a file matching the input.
  const direct = isAbsolute(input) ? input : resolve(cwd, input);
  let candidates: string[] = [];
  if (git.exists(direct)) {
    candidates = [direct];
  } else {
    for (const entry of parseWorktreeList(git.worktreeListPorcelain())) {
      const candidate = join(entry.root, input);
      if (git.exists(candidate)) candidates.push(candidate);
    }
  }

  if (candidates.length === 0) {
    return { ok: false, reason: `Plan not found: ${input}` };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: `Plan path matches multiple worktrees: ${candidates.join(", ")}` };
  }

  const planPath = candidates[0];
  const root = git.toplevel(dirname(planPath));
  if (!root) {
    return { ok: false, reason: `Plan is not inside a git worktree: ${planPath}` };
  }
  const branch = git.currentBranch(root);
  if (!branch) {
    return { ok: false, reason: `Worktree ${root} is on a detached HEAD` };
  }
  if (branch === "main" || branch === "master") {
    return { ok: false, reason: `Refusing to ship on default branch ${branch} (${root})` };
  }
  const rel = relative(root, planPath);
  if (git.statusPorcelain(root, rel).trim() !== "") {
    return { ok: false, reason: `Plan has uncommitted changes: ${planPath}` };
  }
  return { ok: true, planPath, root, branch };
}

export function createGitRunner(): GitRunner {
  return {
    worktreeListPorcelain() {
      return execFileSync("git", ["worktree", "list", "--porcelain"], { encoding: "utf8" });
    },
    toplevel(dir) {
      try {
        return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
      } catch {
        return undefined;
      }
    },
    currentBranch(root) {
      try {
        const out = execFileSync("git", ["-C", root, "branch", "--show-current"], { encoding: "utf8" }).trim();
        return out || undefined;
      } catch {
        return undefined;
      }
    },
    statusPorcelain(root, relPath) {
      try {
        return execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--", relPath], { encoding: "utf8" });
      } catch {
        return "";
      }
    },
    exists(path) {
      return existsSync(path);
    },
  };
}
