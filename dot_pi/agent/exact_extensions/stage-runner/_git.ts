import { execFileSync } from "node:child_process";

export type GitRunner = (...args: string[]) => string;

export function runGit(cwd: string, env: NodeJS.ProcessEnv | undefined, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 10000,
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

export function createGitRunner(cwd: string, env: NodeJS.ProcessEnv | undefined): GitRunner {
  return (...args: string[]) => runGit(cwd, env, ...args);
}

export function assertCleanBranch(git: GitRunner, expectedBranch: string): void {
  if (git("status", "--porcelain=v1", "--untracked-files=all") || git("symbolic-ref", "--short", "HEAD") !== expectedBranch) {
    throw Error("Worktree is dirty or branch changed");
  }
}

export function resolveOriginDefaultBranch(git: GitRunner, { requireOrigin = false } = {}): string {
  try {
    return git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  } catch {
    if (requireOrigin || git("remote").split("\n").includes("origin")) {
      throw Error("Cannot establish origin default branch");
    }
    return "";
  }
}
