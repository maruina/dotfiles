import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parseWorktreeList, resolvePlan, type GitRunner, type ResolvePlanResult } from "./_worktree.ts";

function fakeGit(overrides: Partial<GitRunner>): GitRunner {
  return {
    worktreeListPorcelain: () => "",
    toplevel: () => undefined,
    currentBranch: () => undefined,
    statusPorcelain: () => "",
    exists: (p) => existsSync(p),
    ...overrides,
  };
}

function assertRefused(result: ResolvePlanResult, pattern: RegExp): void {
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
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "ship-wt-"));
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  const writePlan = (dir: string, rel = "plans/feat/plan.md") => {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, "# plan");
  };

  it("resolves a cwd-relative plan path in the current worktree", () => {
    writePlan(cwd);
    const git = fakeGit({ toplevel: () => cwd, currentBranch: () => "maruina/feat", statusPorcelain: () => "" });
    const result = resolvePlan("plans/feat/plan.md", cwd, git);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.planPath, join(cwd, "plans/feat/plan.md"));
    assert.equal(result.root, cwd);
    assert.equal(result.branch, "maruina/feat");
  });

  it("resolves an absolute plan path", () => {
    writePlan(cwd);
    const git = fakeGit({ toplevel: () => cwd, currentBranch: () => "maruina/feat", statusPorcelain: () => "" });
    const result = resolvePlan(join(cwd, "plans/feat/plan.md"), cwd, git);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.planPath, join(cwd, "plans/feat/plan.md"));
  });

  it("resolves a worktree-relative path by searching all worktrees", () => {
    const other = join(tmpdir(), "ship-other-wt");
    const git = fakeGit({
      worktreeListPorcelain: () =>
        [
          `worktree ${cwd}`,
          "HEAD a",
          "branch refs/heads/maruina/current",
          "",
          `worktree ${other}`,
          "HEAD b",
          "branch refs/heads/maruina/other",
        ].join("\n"),
      toplevel: () => other,
      currentBranch: () => "maruina/other",
      statusPorcelain: () => "",
      exists: (p) => p === join(other, "plans/feat/plan.md"),
    });
    const result = resolvePlan("plans/feat/plan.md", cwd, git);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.root, other);
    assert.equal(result.branch, "maruina/other");
  });

  it("refuses a plan on the default branch", () => {
    writePlan(cwd);
    const git = fakeGit({ toplevel: () => cwd, currentBranch: () => "main", statusPorcelain: () => "" });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /default branch main/);
  });

  it("refuses a missing plan", () => {
    const git = fakeGit({ worktreeListPorcelain: () => "" });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /Plan not found/);
  });

  it("refuses an uncommitted plan", () => {
    writePlan(cwd);
    const git = fakeGit({
      toplevel: () => cwd,
      currentBranch: () => "maruina/feat",
      statusPorcelain: () => " M plans/feat/plan.md",
    });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /uncommitted changes/);
  });

  it("refuses an ambiguous plan path matching multiple worktrees", () => {
    const other = join(tmpdir(), "ship-other-wt");
    const other2 = join(tmpdir(), "ship-other2-wt");
    const git = fakeGit({
      worktreeListPorcelain: () =>
        [
          `worktree ${cwd}`,
          "HEAD a",
          "branch refs/heads/maruina/current",
          "",
          `worktree ${other}`,
          "HEAD b",
          "branch refs/heads/maruina/other",
          "",
          `worktree ${other2}`,
          "HEAD c",
          "branch refs/heads/maruina/other2",
        ].join("\n"),
      exists: (p) => p === join(other, "plans/feat/plan.md") || p === join(other2, "plans/feat/plan.md"),
    });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /multiple worktrees/);
  });

  it("refuses a detached HEAD worktree", () => {
    writePlan(cwd);
    const git = fakeGit({ toplevel: () => cwd, currentBranch: () => undefined, statusPorcelain: () => "" });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /detached HEAD/);
  });

  it("refuses a plan outside any git worktree", () => {
    writePlan(cwd);
    const git = fakeGit({ toplevel: () => undefined });
    assertRefused(resolvePlan("plans/feat/plan.md", cwd, git), /not inside a git worktree/);
  });
});
