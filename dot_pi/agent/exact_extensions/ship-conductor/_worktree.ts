import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type WorktreeEntry = { root: string; branch: string | undefined };
export type BaselineFile = { path: string; blob: string };
export type PlanBaseline = { commit: string; plan: BaselineFile; design: BaselineFile };

export type GitRunner = {
  worktreeListPorcelain(cwd: string): string;
  currentBranch(root: string): string | undefined;
  defaultBranch(root: string): string | undefined;
  statusPorcelain(root: string): string;
  exists(path: string): boolean;
  realpath(path: string): string;
  isRegularFile(path: string): boolean;
  isSymbolicLink(path: string): boolean;
  readFile(path: string): string;
  isTracked(root: string, relPath: string): boolean;
  objectId(root: string, ref: string): string;
};

export type ResolvePlanResult =
  | {
      ok: true;
      planPath: string;
      root: string;
      branch: string;
      defaultBranch: string;
      planText: string;
      designText: string;
      baseline: PlanBaseline;
    }
  | { ok: false; reason: string };

function runGit(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024 });
}

function pathWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function validObjectId(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

function canonicalWorktrees(entries: WorktreeEntry[], git: GitRunner): WorktreeEntry[] {
  const roots = new Map<string, WorktreeEntry>();
  for (const entry of entries) {
    try {
      const root = git.realpath(entry.root);
      roots.set(root, { root, branch: entry.branch });
    } catch {
      // A prunable worktree entry cannot own an existing plan path.
    }
  }
  return [...roots.values()];
}

function findPlanCandidates(input: string, cwd: string, roots: WorktreeEntry[], git: GitRunner): string[] {
  const candidates = new Map<string, string>();
  const add = (path: string) => {
    if (!git.exists(path)) return;
    const canonical = git.realpath(path);
    if (!candidates.has(canonical)) candidates.set(canonical, path);
  };
  if (isAbsolute(input)) {
    add(input);
  } else {
    add(resolve(cwd, input));
    for (const entry of roots) add(resolve(entry.root, input));
  }
  return [...candidates.values()];
}

function trackedFile(root: string, path: string, git: GitRunner, label: string): string {
  if (!pathWithin(root, path)) throw new Error(`${label} resolves outside worktree ${root}: ${path}`);
  if (git.isSymbolicLink(path)) throw new Error(`${label} must not be a symbolic link: ${path}`);
  if (!git.isRegularFile(path)) throw new Error(`${label} must be a regular file: ${path}`);
  const relPath = relative(root, path);
  if (!git.isTracked(root, relPath)) throw new Error(`${label} is not tracked: ${path}`);
  return relPath.split(sep).join("/");
}

export function resolvePlan(input: string, cwd: string, git: GitRunner): ResolvePlanResult {
  if (!input || input.trim() !== input || /[\0\r\n]/.test(input)) {
    return { ok: false, reason: "Plan path must be one non-empty path without control characters" };
  }

  try {
    const canonicalCwd = git.realpath(cwd);
    const roots = canonicalWorktrees(parseWorktreeList(git.worktreeListPorcelain(canonicalCwd)), git);
    const candidates = findPlanCandidates(input, canonicalCwd, roots, git);
    if (candidates.length === 0) return { ok: false, reason: `Plan not found in a Git worktree: ${input}` };
    if (candidates.length > 1) return { ok: false, reason: `Plan path matches multiple worktrees: ${candidates.join(", ")}` };

    const candidatePath = candidates[0];
    if (git.isSymbolicLink(candidatePath)) return { ok: false, reason: `Plan must not be a symbolic link: ${candidatePath}` };
    const planPath = git.realpath(candidatePath);
    const owners = roots.filter((entry) => pathWithin(entry.root, planPath));
    if (owners.length !== 1) {
      return { ok: false, reason: `Plan must resolve to exactly one registered Git worktree: ${planPath}` };
    }
    const owner = owners[0];
    const root = owner.root;
    if (!owner.branch) return { ok: false, reason: `Worktree ${root} is on a detached HEAD` };
    const branch = git.currentBranch(root);
    if (!branch) return { ok: false, reason: `Cannot determine current branch for worktree ${root}` };
    if (branch !== owner.branch) return { ok: false, reason: `Git worktree branch changed during plan resolution (${owner.branch} to ${branch})` };

    const defaultBranch = git.defaultBranch(root);
    if (!defaultBranch) return { ok: false, reason: `Cannot determine the repository default branch for ${root}; refusing lifecycle execution` };
    if (branch === defaultBranch) return { ok: false, reason: `Refusing to implement on default branch ${defaultBranch} (${root})` };

    const planRelPath = trackedFile(root, planPath, git, "Plan");
    const designCandidate = join(dirname(planPath), "design.md");
    const designInputPath = git.exists(designCandidate) ? designCandidate : planPath;
    const designRelPath = trackedFile(root, designInputPath, git, "Design document");
    const designPath = git.realpath(designInputPath);

    const status = git.statusPorcelain(root);
    if (status.trim() !== "") return { ok: false, reason: `Worktree ${root} has uncommitted or untracked changes:\n${status.trim()}` };

    const commit = git.objectId(root, "HEAD");
    const planBlob = git.objectId(root, `${commit}:${planRelPath}`);
    const designBlob = git.objectId(root, `${commit}:${designRelPath}`);
    if (!validObjectId(commit) || !validObjectId(planBlob) || !validObjectId(designBlob)) {
      return { ok: false, reason: `Git returned an invalid baseline object ID for ${planPath}` };
    }
    return {
      ok: true,
      planPath,
      root,
      branch,
      defaultBranch,
      planText: git.readFile(planPath),
      designText: git.readFile(designPath),
      baseline: {
        commit,
        plan: { path: planPath, blob: planBlob },
        design: { path: designPath, blob: designBlob },
      },
    };
  } catch (error) {
    return { ok: false, reason: `Cannot safely inspect plan and Git state: ${reasonFrom(error)}` };
  }
}

export type CandidateSnapshot = { branch: string; head: string; stateDigest: string };

export function captureCleanCandidate(rootPath: string, git: GitRunner): CandidateSnapshot {
  const root = git.realpath(rootPath);
  const branch = git.currentBranch(root);
  if (!branch) throw new Error(`Candidate worktree ${root} is on a detached HEAD`);
  const head = git.objectId(root, "HEAD");
  if (!validObjectId(head)) throw new Error(`Git returned an invalid candidate HEAD for ${root}`);
  const status = git.statusPorcelain(root);
  if (status.trim() !== "") throw new Error(`Candidate worktree is not clean:\n${status.trim()}`);
  const stateDigest = createCleanDigest(branch, head, status);
  return { branch, head, stateDigest };
}

function createCleanDigest(branch: string, head: string, status: string): string {
  return createHash("sha256").update(branch).update("\0").update(head).update("\0").update(status).digest("hex");
}

export function createGitRunner(): GitRunner {
  return {
    worktreeListPorcelain(cwd) {
      return runGit(cwd, ["worktree", "list", "--porcelain"]);
    },
    currentBranch(root) {
      const branch = runGit(root, ["branch", "--show-current"]).trim();
      return branch || undefined;
    },
    defaultBranch(root) {
      const remotes = runGit(root, ["remote"]).split(/\r?\n/).map((remote) => remote.trim()).filter(Boolean);
      const branches = new Set<string>();
      for (const remote of remotes) {
        try {
          const target = runGit(root, ["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`]).trim();
          const prefix = `${remote}/`;
          if (target.startsWith(prefix) && target.length > prefix.length) branches.add(target.slice(prefix.length));
        } catch (error) {
          if ((error as NodeJS.ErrnoException & { status?: number }).status !== 1) throw error;
        }
      }
      return branches.size === 1 ? [...branches][0] : undefined;
    },
    statusPorcelain(root) {
      return runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"]);
    },
    exists(path) {
      return existsSync(path);
    },
    realpath(path) {
      return realpathSync(path);
    },
    isRegularFile(path) {
      return lstatSync(path).isFile();
    },
    isSymbolicLink(path) {
      return lstatSync(path).isSymbolicLink();
    },
    readFile(path) {
      return readFileSync(path, "utf8");
    },
    isTracked(root, relPath) {
      const output = runGit(root, ["--literal-pathspecs", "ls-files", "-z", "--", relPath]);
      return output.split("\0").includes(relPath);
    },
    objectId(root, ref) {
      return runGit(root, ["rev-parse", "--verify", "--end-of-options", ref]).trim();
    },
  };
}
