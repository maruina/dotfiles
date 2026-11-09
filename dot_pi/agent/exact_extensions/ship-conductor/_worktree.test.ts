import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { captureCleanCandidate, createGitRunner, parseWorktreeList, resolvePlan, type GitRunner } from "./_worktree.ts";

const PLAN = "# Plan\n\n### Task 1: Work\n- [ ] Do the work.\n";
const DESIGN = "# Design\n\nApproved behavior.\n";

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function createRepo(options: { defaultBranch?: string; branch?: string; design?: boolean } = {}): {
  base: string;
  root: string;
  planPath: string;
} {
  const base = mkdtempSync(join(tmpdir(), "implement-wt-"));
  const root = join(base, "repo with spaces");
  const planPath = join(root, "plans", "feature", "plan with spaces.md");
  mkdirSync(join(root, "plans", "feature"), { recursive: true });
  writeFileSync(planPath, PLAN);
  if (options.design !== false) writeFileSync(join(root, "plans", "feature", "design.md"), DESIGN);
  git(root, ["init", "--quiet", `--initial-branch=${options.defaultBranch ?? "trunk"}`]);
  git(root, ["config", "user.name", "Lifecycle test"]);
  git(root, ["config", "user.email", "lifecycle-test@example.invalid"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["remote", "add", "origin", "https://example.invalid/repo.git"]);
  git(root, ["symbolic-ref", "refs/remotes/origin/HEAD", `refs/remotes/origin/${options.defaultBranch ?? "trunk"}`]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "baseline"]);
  const branch = options.branch ?? "feature";
  if (branch !== (options.defaultBranch ?? "trunk")) git(root, ["switch", "--quiet", "-c", branch]);
  return { base, root, planPath };
}

function assertRefused(result: ReturnType<typeof resolvePlan>, pattern: RegExp): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, pattern);
}

describe("parseWorktreeList", () => {
  it("parses porcelain worktree entries with branches", () => {
    const porcelain = [
      "worktree /home/u/.worktrees/repo/feat",
      "HEAD abc123",
      "branch refs/heads/maruina/feat",
      "",
      "worktree /home/u/repo",
      "HEAD def456",
      "branch refs/heads/main",
    ].join("\n");
    assert.deepEqual(parseWorktreeList(porcelain), [
      { root: "/home/u/.worktrees/repo/feat", branch: "maruina/feat" },
      { root: "/home/u/repo", branch: "main" },
    ]);
  });

  it("keeps entries without a branch (detached HEAD)", () => {
    const porcelain = ["worktree /home/u/repo", "HEAD abc123", "detached"].join("\n");
    assert.deepEqual(parseWorktreeList(porcelain), [{ root: "/home/u/repo", branch: undefined }]);
  });
});

describe("resolvePlan", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("resolves and pins one tracked plan and its design in a clean feature worktree", () => {
    const fixture = createRepo();
    root = fixture.base;
    const result = resolvePlan("plans/feature/plan with spaces.md", fixture.root, createGitRunner());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.planPath, realpathSync(fixture.planPath));
    assert.equal(result.root, realpathSync(fixture.root));
    assert.equal(result.branch, "feature");
    assert.equal(result.defaultBranch, "trunk");
    assert.equal(result.planText, PLAN);
    assert.equal(result.designText, DESIGN);
    assert.equal(result.baseline.commit, git(fixture.root, ["rev-parse", "HEAD"]));
    assert.equal(result.baseline.plan.blob, git(fixture.root, ["rev-parse", `HEAD:plans/feature/plan with spaces.md`]));
  });

  it("uses the plan itself when no separate tracked design document exists", () => {
    const fixture = createRepo({ design: false });
    root = fixture.base;
    const result = resolvePlan(fixture.planPath, fixture.root, createGitRunner());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.baseline.design, result.baseline.plan);
    assert.equal(result.designText, PLAN);
  });

  it("discovers the repository default branch instead of assuming main or master", () => {
    const fixture = createRepo({ defaultBranch: "release" });
    root = fixture.base;
    const result = resolvePlan(fixture.planPath, fixture.root, createGitRunner());
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.defaultBranch, "release");
  });

  it("refuses the discovered default branch", () => {
    const fixture = createRepo({ defaultBranch: "release", branch: "release" });
    root = fixture.base;
    assertRefused(resolvePlan(fixture.planPath, fixture.root, createGitRunner()), /default branch release/);
  });

  it("refuses a dirty or untracked candidate worktree", () => {
    const fixture = createRepo();
    root = fixture.base;
    writeFileSync(join(fixture.root, "untracked.txt"), "candidate change\n");
    assertRefused(resolvePlan(fixture.planPath, fixture.root, createGitRunner()), /uncommitted or untracked changes/);
  });

  it("refuses a missing or untracked plan", () => {
    const fixture = createRepo();
    root = fixture.base;
    assertRefused(resolvePlan("plans/missing.md", fixture.root, createGitRunner()), /Plan not found/);
    const extra = join(fixture.root, "plans", "feature", "untracked.md");
    writeFileSync(extra, PLAN);
    assertRefused(resolvePlan(extra, fixture.root, createGitRunner()), /Plan is not tracked/);
  });

  it("refuses symlinked plans and uncommitted lifecycle documents", () => {
    const fixture = createRepo();
    root = fixture.base;
    const link = join(fixture.root, "plans", "feature", "alias.md");
    symlinkSync(fixture.planPath, link);
    assertRefused(resolvePlan(link, fixture.root, createGitRunner()), /must not be a symbolic link/);
    rmSync(link);
    writeFileSync(join(fixture.root, "plans", "feature", "design.md"), "changed\n");
    assertRefused(resolvePlan(fixture.planPath, fixture.root, createGitRunner()), /uncommitted or untracked changes/);
  });

  it("refuses a detached worktree", () => {
    const fixture = createRepo();
    root = fixture.base;
    git(fixture.root, ["switch", "--quiet", "--detach"]);
    assertRefused(resolvePlan(fixture.planPath, fixture.root, createGitRunner()), /detached HEAD/);
  });

  it("refuses when the repository default branch cannot be discovered", () => {
    const fixture = createRepo();
    root = fixture.base;
    git(fixture.root, ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
    assertRefused(resolvePlan(fixture.planPath, fixture.root, createGitRunner()), /Cannot determine the repository default branch/);
  });

  it("refuses ambiguous relative plan paths across worktrees", () => {
    const fixture = createRepo();
    root = fixture.base;
    const other = join(fixture.base, "other-worktree");
    git(fixture.root, ["worktree", "add", "--quiet", "--detach", other, "HEAD"]);
    const result = resolvePlan("plans/feature/plan with spaces.md", fixture.root, createGitRunner());
    assertRefused(result, /multiple worktrees/);
  });

  it("fails closed when Git status inspection fails", () => {
    const fixture = createRepo();
    root = fixture.base;
    const real = createGitRunner();
    const broken: GitRunner = { ...real, statusPorcelain: () => { throw new Error("git status unavailable"); } };
    assertRefused(resolvePlan(fixture.planPath, fixture.root, broken), /Cannot safely inspect.*git status unavailable/);
  });
});

describe("captureCleanCandidate", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("captures a clean committed candidate and refuses dirty state", () => {
    const fixture = createRepo();
    root = fixture.base;
    const snapshot = captureCleanCandidate(fixture.root, createGitRunner());
    assert.equal(snapshot.branch, "feature");
    assert.equal(snapshot.head, git(fixture.root, ["rev-parse", "HEAD"]));
    assert.match(snapshot.stateDigest, /^[0-9a-f]{64}$/);
    writeFileSync(join(fixture.root, "changed.txt"), "dirty\n");
    assert.throws(() => captureCleanCandidate(fixture.root, createGitRunner()), /not clean/);
  });
});
