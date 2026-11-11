import { createHash, randomUUID } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync, linkSync, rmdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";

export const MAX_RUN_RECORD_BYTES = 256 * 1024;
export const MAX_COMPLETED_RUNS = 100;
const MAX_RUN_DIRECTORIES = 1000;
const TERMINAL_STATUSES = new Set(["verified", "blocked", "process-failure", "cancelled"]);
const STAGES = new Set(["execute", "simplify", "verify"]);

type LockOwner = {
  schemaVersion: 1;
  runId: string;
  coordinatorSessionId: string;
  worktree: string;
  createdAt: string;
};

function ensurePrivateDirectory(path: string): void {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) {
    throw new Error(`Lifecycle state directory is not private: ${path}`);
  }
}

function validateRunId(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new Error("Lifecycle run ID is invalid");
}

function canonicalWorktree(worktree: string): string {
  if (!worktree || !resolve(worktree)) throw new Error("Lifecycle worktree path is required");
  return realpathSync(worktree);
}

function readOwner(path: string): LockOwner | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<LockOwner>;
    if (
      parsed.schemaVersion !== 1 || typeof parsed.runId !== "string" ||
      typeof parsed.coordinatorSessionId !== "string" || typeof parsed.worktree !== "string" ||
      typeof parsed.createdAt !== "string"
    ) return undefined;
    return parsed as LockOwner;
  } catch {
    return undefined;
  }
}

function atomicWrite(path: string, content: string): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The original storage error is the useful failure.
    }
    throw error;
  }
}

export class LifecycleRunLease {
  readonly runId: string;
  readonly coordinatorSessionId: string;
  readonly worktree: string;
  readonly lockPath: string;
  readonly runDirectory: string;
  readonly recordPath: string;
  private readonly store: LifecycleStateStore;
  private released = false;

  constructor(
    store: LifecycleStateStore,
    runId: string,
    coordinatorSessionId: string,
    worktree: string,
    lockPath: string,
  ) {
    this.store = store;
    this.runId = runId;
    this.coordinatorSessionId = coordinatorSessionId;
    this.worktree = worktree;
    this.lockPath = lockPath;
    this.runDirectory = join(store.runsDirectory, runId);
    this.recordPath = join(this.runDirectory, "record.json");
  }

  writeRecord(record: Record<string, unknown>): void {
    if (this.released) throw new Error("Lifecycle worktree ownership has been released");
    if (record.runId !== this.runId || record.coordinatorSessionId !== this.coordinatorSessionId || record.worktree !== this.worktree) {
      throw new Error("Lifecycle run record identity does not match its owner");
    }
    const content = JSON.stringify(record, null, 2);
    if (Buffer.byteLength(content, "utf8") > MAX_RUN_RECORD_BYTES) {
      throw new Error(`Lifecycle run record exceeds ${MAX_RUN_RECORD_BYTES} bytes`);
    }
    atomicWrite(this.recordPath, `${content}\n`);
    if (typeof record.status === "string" && TERMINAL_STATUSES.has(record.status)) {
      this.store.pruneCompletedRuns(this.runId);
    }
  }

  writeStageConfig(round: number, stage: string, config: unknown): string {
    if (this.released) throw new Error("Lifecycle worktree ownership has been released");
    if (!Number.isSafeInteger(round) || round < 1) throw new Error(`Invalid lifecycle round: ${round}`);
    if (!STAGES.has(stage)) throw new Error(`Unknown lifecycle stage: ${stage}`);
    const configDirectory = join(this.runDirectory, "configs");
    ensurePrivateDirectory(configDirectory);
    const path = join(configDirectory, `${round}-${stage}.json`);
    const content = JSON.stringify(config, null, 2);
    if (Buffer.byteLength(content, "utf8") > MAX_RUN_RECORD_BYTES) {
      throw new Error(`Lifecycle stage configuration exceeds ${MAX_RUN_RECORD_BYTES} bytes`);
    }
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${content}\n`, { flag: "wx", mode: 0o600 });
      chmodSync(temporary, 0o600);
      linkSync(temporary, path);
      unlinkSync(temporary);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // The original storage error is the useful failure.
      }
      throw error;
    }
    return path;
  }

  release(): void {
    if (this.released) return;
    const ownerPath = join(this.lockPath, "owner.json");
    const owner = readOwner(ownerPath);
    if (!owner || owner.runId !== this.runId || owner.coordinatorSessionId !== this.coordinatorSessionId || owner.worktree !== this.worktree) {
      throw new Error("Lifecycle worktree lock ownership could not be confirmed; retain the lock for manual recovery");
    }
    unlinkSync(ownerPath);
    rmdirSync(this.lockPath);
    this.released = true;
  }
}

export class LifecycleStateStore {
  readonly rootDirectory: string;
  readonly runsDirectory: string;
  readonly locksDirectory: string;

  constructor(rootDirectory: string) {
    if (!rootDirectory) throw new Error("Lifecycle state directory is required");
    this.rootDirectory = resolve(rootDirectory);
    this.runsDirectory = join(this.rootDirectory, "runs");
    this.locksDirectory = join(this.rootDirectory, "locks");
  }

  private ensureDirectories(): void {
    ensurePrivateDirectory(this.rootDirectory);
    ensurePrivateDirectory(this.runsDirectory);
    ensurePrivateDirectory(this.locksDirectory);
  }

  worktreeLockPath(worktree: string): string {
    const canonical = canonicalWorktree(worktree);
    const key = createHash("sha256").update(canonical).digest("hex");
    return join(this.locksDirectory, key);
  }

  acquireWorktree(worktreePath: string, runId: string, coordinatorSessionId: string): LifecycleRunLease {
    validateRunId(runId);
    if (!coordinatorSessionId) throw new Error("Coordinator session ID is required");
    const worktree = canonicalWorktree(worktreePath);
    this.ensureDirectories();
    this.pruneCompletedRuns();

    const lockPath = this.worktreeLockPath(worktree);
    try {
      mkdirSync(lockPath, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new Error(`Worktree ${worktree} is already owned by another lifecycle run`);
      }
      throw error;
    }

    try {
      chmodSync(lockPath, 0o700);
      const owner: LockOwner = {
        schemaVersion: 1,
        runId,
        coordinatorSessionId,
        worktree,
        createdAt: new Date().toISOString(),
      };
      writeFileSync(join(lockPath, "owner.json"), `${JSON.stringify(owner, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      chmodSync(join(lockPath, "owner.json"), 0o600);

      const runDirectory = join(this.runsDirectory, runId);
      mkdirSync(runDirectory, { mode: 0o700 });
      const runStat = lstatSync(runDirectory);
      if (!runStat.isDirectory() || runStat.isSymbolicLink() || (runStat.mode & 0o077) !== 0) {
        throw new Error(`Lifecycle run directory is not private: ${runDirectory}`);
      }
      ensurePrivateDirectory(join(runDirectory, "reports"));
      ensurePrivateDirectory(join(runDirectory, "configs"));
      const lease = new LifecycleRunLease(this, runId, coordinatorSessionId, worktree, lockPath);
      return lease;
    } catch (error) {
      try {
        rmSync(lockPath, { recursive: true, force: true });
      } catch {
        // Keep the original acquisition failure visible.
      }
      throw error;
    }
  }

  listRunIds(): string[] {
    this.ensureDirectories();
    const entries = readdirSync(this.runsDirectory, { withFileTypes: true });
    if (entries.length > MAX_RUN_DIRECTORIES) throw new Error(`Lifecycle state contains more than ${MAX_RUN_DIRECTORIES} run bundles`);
    return entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name).sort();
  }

  pruneCompletedRuns(protectedRunId?: string): void {
    this.ensureDirectories();
    const entries = readdirSync(this.runsDirectory, { withFileTypes: true });
    if (entries.length > MAX_RUN_DIRECTORIES) throw new Error(`Lifecycle state contains more than ${MAX_RUN_DIRECTORIES} run bundles`);
    const completed: Array<{ id: string; path: string; updatedAt: string; locked: boolean }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const runDirectory = join(this.runsDirectory, entry.name);
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(readFileSync(join(runDirectory, "record.json"), "utf8")) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (record.runId !== entry.name || typeof record.status !== "string" || !TERMINAL_STATUSES.has(record.status)) continue;
      let locked = false;
      if (typeof record.worktree === "string") {
        try {
          locked = lstatSync(this.worktreeLockPath(record.worktree)).isDirectory();
        } catch {
          locked = false;
        }
      }
      completed.push({
        id: entry.name,
        path: runDirectory,
        updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
        locked,
      });
    }
    if (completed.length <= MAX_COMPLETED_RUNS) return;

    completed.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id));
    let remaining = completed.length;
    for (const run of completed) {
      if (remaining <= MAX_COMPLETED_RUNS) break;
      if (run.locked || run.id === protectedRunId) continue;
      const stat = lstatSync(run.path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      rmSync(run.path, { recursive: true, force: false });
      remaining--;
    }
    if (remaining > MAX_COMPLETED_RUNS) {
      throw new Error("Lifecycle completed-run retention is full; safe pruning cannot preserve all locked or unresolved evidence");
    }
  }
}
