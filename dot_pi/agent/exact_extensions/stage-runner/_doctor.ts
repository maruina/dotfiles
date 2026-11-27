import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { qualifiedId } from "../_shared/model.ts";
import { getProfile } from "../_shared/profile.ts";
import { publisher } from "./_publish.ts";

const exec = promisify(execFile);

export type DoctorStatus = "pass" | "warn" | "fail";
export type DoctorCheck = { name: string; status: DoctorStatus; detail: string };
export type DoctorReport = { ok: boolean; checks: DoctorCheck[] };

export type ScopedModelLike = { provider: string; id: string };
export type PublishedTargetSummary = {
  profile: string;
  repo: string;
  branch: string;
  login: string;
  pr: string | null;
  review: boolean;
};

export type DoctorInput = {
  cwd: string;
  root: string;
  piVersion: string;
  scopedModels: ScopedModelLike[];
  env?: NodeJS.ProcessEnv;
  profilePath?: string;
  signal?: AbortSignal;
  checkRex: () => Promise<void>;
  execCommand?: (bin: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<string>;
  inspectTarget?: (cwd: string, profilePath: string | undefined, env: NodeJS.ProcessEnv, signal: AbortSignal) => Promise<PublishedTargetSummary>;
  exists?: (filePath: string) => boolean;
  realpath?: (filePath: string) => string;
};

function sanitize(value: unknown): string {
  return String(value instanceof Error ? value.message : value)
    .replace(/[\x00-\x1f\x7f-\x9f]+/g, " ")
    .trim()
    .slice(0, 240);
}

function vendorOf(model: ScopedModelLike): string {
  const combined = `${model.provider}/${model.id}`.toLowerCase();
  if (combined.includes("anthropic") || combined.includes("claude")) return "anthropic";
  if (combined.includes("google") || combined.includes("gemini")) return "google";
  if (combined.includes("openai") || combined.includes("gpt") || combined.includes("o1") || combined.includes("o3") || combined.includes("o4")) return "openai";
  return model.provider.toLowerCase();
}

async function defaultExec(bin: string, args: string[], cwd: string, signal?: AbortSignal): Promise<string> {
  const { stdout } = await exec(bin, args, {
    cwd,
    timeout: 5000,
    signal,
    killSignal: "SIGKILL",
    maxBuffer: 256 * 1024,
  });
  return stdout.trim();
}

async function defaultInspectTarget(
  cwd: string,
  profilePath: string | undefined,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
): Promise<PublishedTargetSummary> {
  const { target } = await publisher(cwd, profilePath, env, signal).inspect();
  return target;
}

export async function runDoctor(input: DoctorInput): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const env = input.env ?? process.env;
  const signal = input.signal ?? AbortSignal.timeout(30000);
  const runCmd = input.execCommand ?? defaultExec;
  const inspectTarget = input.inspectTarget ?? defaultInspectTarget;
  const exists = input.exists ?? fs.existsSync;
  const realpath = input.realpath ?? fs.realpathSync;

  // 1. Pi version
  if (/^1\.6\./.test(input.piVersion)) {
    checks.push({ name: "Pi version", status: "pass", detail: input.piVersion });
  } else {
    checks.push({ name: "Pi version", status: "fail", detail: `Requires 1.6.x (found ${input.piVersion})` });
  }

  // 2. Rex connectivity and API revision
  try {
    await input.checkRex();
    checks.push({ name: "Rex", status: "pass", detail: "Local Rex verified (API revision >= 18)" });
  } catch (error) {
    checks.push({ name: "Rex", status: "fail", detail: sanitize(error) });
  }

  // 3. Scoped models
  const uniqueModels = new Map<string, ScopedModelLike>();
  for (const model of input.scopedModels) {
    uniqueModels.set(qualifiedId(model.provider, model.id), model);
  }
  const vendors = new Set([...uniqueModels.values()].map(vendorOf));
  if (uniqueModels.size < 2) {
    checks.push({
      name: "Scoped models",
      status: "fail",
      detail: `Found ${uniqueModels.size} scoped model(s); need at least 2 distinct models for an independent verifier`,
    });
  } else if (vendors.size < 2) {
    checks.push({
      name: "Scoped models",
      status: "warn",
      detail: `${uniqueModels.size} distinct models available, but all share one vendor (${[...vendors].join(", ")})`,
    });
  } else {
    checks.push({
      name: "Scoped models",
      status: "pass",
      detail: `${uniqueModels.size} distinct models across ${vendors.size} vendors (${[...vendors].sort().join(", ")})`,
    });
  }

  // 4. Git worktree state
  let topLevel: string | undefined;
  let branch: string | undefined;
  try {
    topLevel = await runCmd("git", ["rev-parse", "--show-toplevel"], input.cwd, signal);
    try {
      branch = await runCmd("git", ["symbolic-ref", "--short", "HEAD"], topLevel, signal);
    } catch {
      branch = undefined;
    }
    const status = await runCmd("git", ["status", "--porcelain=v1", "--untracked-files=all"], topLevel, signal);
    const dirty = status.length > 0;
    const onDefault = branch === "main" || branch === "master";
    if (!branch) {
      checks.push({ name: "Worktree", status: "warn", detail: `Detached HEAD in ${topLevel}${dirty ? " (dirty)" : ""}` });
    } else if (dirty) {
      checks.push({ name: "Worktree", status: "warn", detail: `Branch ${branch} has uncommitted changes` });
    } else if (onDefault) {
      checks.push({ name: "Worktree", status: "warn", detail: `Clean checkout on ${branch} (/stage-runner requires a feature branch; /stage-runner-design can create one)` });
    } else {
      checks.push({ name: "Worktree", status: "pass", detail: `Clean feature branch ${branch}` });
    }
  } catch (error) {
    checks.push({ name: "Worktree", status: "fail", detail: `Not a Git worktree: ${sanitize(error)}` });
  }

  // 5. Worktree lock
  if (topLevel) {
    let canonical = topLevel;
    try {
      canonical = realpath(topLevel);
    } catch {
      // Fall back to the reported top-level path when realpath is unavailable.
    }
    const lockPath = path.join(input.root, "lock-" + createHash("sha256").update(canonical).digest("hex"));
    if (exists(lockPath)) {
      checks.push({ name: "Worktree lock", status: "fail", detail: `Lock file present: ${lockPath}` });
    } else {
      checks.push({ name: "Worktree lock", status: "pass", detail: "No active or retained lock" });
    }
  }

  // 6. Commit signing readiness
  if (topLevel) {
    let gpgSign = "";
    try {
      gpgSign = (await runCmd("git", ["config", "--get", "commit.gpgsign"], topLevel, signal)).toLowerCase();
    } catch {
      gpgSign = "false";
    }
    if (gpgSign !== "true") {
      checks.push({ name: "Commit signing", status: "pass", detail: "Not enabled in Git config" });
    } else {
      let format = "openpgp";
      try {
        format = (await runCmd("git", ["config", "--get", "gpg.format"], topLevel, signal)).toLowerCase() || "openpgp";
      } catch {
        format = "openpgp";
      }
      try {
        if (format === "ssh") {
          const keys = await runCmd("ssh-add", ["-L"], topLevel, signal);
          if (!keys) throw Error("No SSH keys loaded in agent");
          checks.push({ name: "Commit signing", status: "pass", detail: "SSH signing agent reachable" });
        } else {
          await runCmd("gpg-connect-agent", ["/bye"], topLevel, signal);
          checks.push({ name: "Commit signing", status: "pass", detail: "GPG signing agent reachable" });
        }
      } catch (error) {
        checks.push({ name: "Commit signing", status: "fail", detail: `${format.toUpperCase()} signing enabled but agent check failed: ${sanitize(error)}` });
      }
    }
  }

  // 7. Profile & GitHub publication target
  let profile = "unknown";
  try {
    profile = getProfile(env, input.profilePath);
  } catch (error) {
    checks.push({ name: "GitHub target", status: "fail", detail: `Invalid profile: ${sanitize(error)}` });
    return { ok: checks.every((c) => c.status !== "fail"), checks };
  }

  if (topLevel) {
    if (!branch || branch === "main" || branch === "master") {
      checks.push({
        name: "GitHub target",
        status: "warn",
        detail: `Profile ${profile}; switch to a feature branch to verify push and PR target`,
      });
    } else {
      try {
        const target = await inspectTarget(topLevel, input.profilePath, env, signal);
        const prText = target.pr ? `PR ${target.pr}` : "new draft PR";
        const arpText = target.review ? "ARP eligible" : "no ARP";
        checks.push({
          name: "GitHub target",
          status: "pass",
          detail: `${target.profile} profile · ${target.repo} (${target.login}) · ${prText} · ${arpText}`,
        });
      } catch (error) {
        checks.push({
          name: "GitHub target",
          status: "fail",
          detail: `${profile} profile · ${sanitize(error)}`,
        });
      }
    }
  }

  return { ok: checks.every((c) => c.status !== "fail"), checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const tag: Record<DoctorStatus, string> = { pass: "[PASS]", warn: "[WARN]", fail: "[FAIL]" };
  const lines = [
    report.ok ? "Stage runner doctor: ready" : "Stage runner doctor: issues found",
    ...report.checks.map((c) => `${tag[c.status]} ${c.name}: ${c.detail}`),
  ];
  return lines.join("\n");
}
