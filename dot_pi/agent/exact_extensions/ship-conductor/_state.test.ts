import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { LifecycleStateStore, MAX_RUN_RECORD_BYTES } from "./_state.ts";

function record(runId: string, worktree: string, status = "preflight", updatedAt = "2026-01-01T00:00:00.000Z") {
  return {
    schemaVersion: 1,
    runId,
    coordinatorSessionId: "parent-session",
    status,
    worktree,
    updatedAt,
  };
}

function createWorktree(base: string, name = "repo"): string {
  const worktree = join(base, name);
  mkdirSync(worktree, { recursive: true });
  return worktree;
}

describe("LifecycleStateStore", () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it("acquires an exclusive worktree lock and releases only its own lock", () => {
    root = mkdtempSync(join(tmpdir(), "lifecycle-state-"));
    const worktree = createWorktree(root);
    const store = new LifecycleStateStore(join(root, "agent", "lifecycle-coordinator"));
    const lease = store.acquireWorktree(worktree, "run-test-1", "parent-session");
    assert.throws(
      () => store.acquireWorktree(worktree, "run-test-2", "other-session"),
      /already owned/,
    );
    lease.release();
    const second = store.acquireWorktree(worktree, "run-test-2", "other-session");
    second.release();
  });

  it("refuses an existing stale or unreadable lock without taking it over", () => {
    root = mkdtempSync(join(tmpdir(), "lifecycle-state-"));
    const worktree = createWorktree(root);
    const store = new LifecycleStateStore(join(root, "agent", "lifecycle-coordinator"));
    const lockPath = store.worktreeLockPath(worktree);
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });
    writeFileSync(join(lockPath, "owner.json"), "not valid json", { mode: 0o600 });
    assert.throws(() => store.acquireWorktree(worktree, "run-test-2", "parent-session"), /already owned/);
    assert.equal(readFileSync(join(lockPath, "owner.json"), "utf8"), "not valid json");
  });

  it("writes private atomic run records and immutable stage configs", () => {
    root = mkdtempSync(join(tmpdir(), "lifecycle-state-"));
    const worktree = createWorktree(root);
    const store = new LifecycleStateStore(join(root, "agent", "lifecycle-coordinator"));
    const lease = store.acquireWorktree(worktree, "run-test-1", "parent-session");
    const initial = record("run-test-1", lease.worktree);
    lease.writeRecord(initial);
    const recordPath = lease.recordPath;
    assert.deepEqual(JSON.parse(readFileSync(recordPath, "utf8")), initial);
    assert.equal(statSync(recordPath).mode & 0o777, 0o600);
    assert.equal(lease.writeStageConfig("execute", { ...initial, stage: "execute" }), join(lease.runDirectory, "configs", "execute.json"));
    assert.equal(statSync(join(lease.runDirectory, "configs", "execute.json")).mode & 0o777, 0o600);
    assert.throws(() => lease.writeStageConfig("execute", initial), /EEXIST|already exists/);
    lease.release();
  });

  it("rejects oversized run records without replacing the last valid record", () => {
    root = mkdtempSync(join(tmpdir(), "lifecycle-state-"));
    const worktree = createWorktree(root);
    const store = new LifecycleStateStore(join(root, "agent", "lifecycle-coordinator"));
    const lease = store.acquireWorktree(worktree, "run-test-1", "parent-session");
    const initial = record("run-test-1", lease.worktree);
    lease.writeRecord(initial);
    assert.throws(
      () => lease.writeRecord({ ...initial, diagnostic: "x".repeat(MAX_RUN_RECORD_BYTES) }),
      /record exceeds/,
    );
    assert.deepEqual(JSON.parse(readFileSync(lease.recordPath, "utf8")), initial);
    lease.release();
  });

  it("prunes only old completed bundles and retains unresolved runs", () => {
    root = mkdtempSync(join(tmpdir(), "lifecycle-state-"));
    const store = new LifecycleStateStore(join(root, "agent", "lifecycle-coordinator"));
    store.pruneCompletedRuns();
    for (let index = 0; index < 101; index++) {
      const runId = `run-${index}`;
      const worktree = createWorktree(root, `repo-${index}`);
      const lease = store.acquireWorktree(worktree, runId, "parent-session");
      lease.writeRecord(record(runId, lease.worktree, "verified", new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()));
      lease.release();
    }
    const unresolvedWorktree = createWorktree(root, "repo-unresolved");
    const unresolved = store.acquireWorktree(unresolvedWorktree, "run-unresolved", "parent-session");
    unresolved.writeRecord(record("run-unresolved", unresolved.worktree, "running"));
    unresolved.release();
    store.pruneCompletedRuns();
    assert.equal(store.listRunIds().length, 101);
    assert.ok(store.listRunIds().includes("run-unresolved"));
  });
});
