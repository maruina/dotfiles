import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

import { createGitRunner, resolveOriginDefaultBranch, type GitRunner } from "./_git.ts";
import { recovery, sessionInfo } from "./_recovery.ts";
import { attempt, decode, handoff, id, paneArgv, privateFile, prune, type Choice, type Options } from "./_runner.ts";

export type DesignOptions = Pick<
  Options,
  "cwd" | "root" | "env" | "signal" | "notify" | "prefix" | "rexCommand" | "executable" | "idleMs" | "wallMs"
> & {
  brief: string;
  author: Choice;
  reviewer: Choice;
  progress: (message: string) => void;
};

function ensure(ok: boolean, reason: string): asserts ok {
  if (!ok) throw Error(reason);
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item && typeof item === "object" && (item as { type?: unknown }).type === "text") {
      const text = (item as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) parts.push(text.trim());
    }
  }
  return parts.join("\n").trim();
}

function trimTailToJsonLimit(prefix: string, body: string, maxJsonBytes: number): string {
  if (Buffer.byteLength(JSON.stringify(prefix + body)) <= maxJsonBytes) return prefix + body;
  const chars = Array.from(body);
  let lo = 0,
    hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = prefix + chars.slice(chars.length - mid).join("");
    if (Buffer.byteLength(JSON.stringify(candidate)) <= maxJsonBytes) lo = mid;
    else hi = mid - 1;
  }
  return prefix + chars.slice(chars.length - lo).join("");
}

export function buildDesignBrief(arg: string, entries: readonly unknown[], maxJsonBytes = 65536): string {
  const focus = arg.trim();
  const turns: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { type?: unknown; summary?: unknown; message?: { role?: unknown; content?: unknown } };
    if (record.type === "compaction" && typeof record.summary === "string" && record.summary.trim()) {
      turns.push("Summary of earlier conversation:\n" + record.summary.trim());
      continue;
    }
    if (record.type !== "message" || !record.message || typeof record.message !== "object") continue;
    const role = record.message.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = extractMessageText(record.message.content);
    if (text) turns.push((role === "user" ? "User:\n" : "Assistant:\n") + text);
  }
  if (!focus && !turns.length) return "";
  if (focus && !turns.length) return focus;
  const prefix = focus ? `Focus:\n${focus}\n\nConversation context:\n\n` : "Conversation context:\n\n";
  const full = prefix + turns.join("\n\n");
  if (Buffer.byteLength(JSON.stringify(full)) <= maxJsonBytes) return full;
  if (Buffer.byteLength(JSON.stringify(prefix)) > maxJsonBytes) return focus;
  const omittedPrefix = prefix + "[Earlier conversation omitted for length]\n\n";
  if (Buffer.byteLength(JSON.stringify(omittedPrefix)) > maxJsonBytes) return focus;
  const kept: string[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const next = [turns[i], ...kept];
    if (Buffer.byteLength(JSON.stringify(omittedPrefix + next.join("\n\n"))) <= maxJsonBytes) kept.unshift(turns[i]);
    else break;
  }
  if (kept.length) return omittedPrefix + kept.join("\n\n");
  return trimTailToJsonLimit(omittedPrefix, turns[turns.length - 1], maxJsonBytes);
}

export function inspectDesignBranch(cwd: string, env?: NodeJS.ProcessEnv) {
  const git = createGitRunner(cwd, env);
  const root = fs.realpathSync(git("rev-parse", "--show-toplevel"));
  const branch = git("symbolic-ref", "--short", "HEAD");
  let hasOrigin = false;
  try {
    hasOrigin = git("remote").split("\n").includes("origin");
  } catch {
    /* ignore */
  }
  const defaultBranch = resolveOriginDefaultBranch(git);
  return {
    root,
    branch,
    defaultBranch,
    hasOrigin,
    onDefault: ["main", "master", defaultBranch].includes(branch),
  };
}

export function validateFeatureBranchName(cwd: string, branch: string, defaultBranch: string, env?: NodeJS.ProcessEnv): string {
  const trimmed = branch.trim();
  ensure(trimmed.length > 0 && !/[\s\x00-\x1f\x7f]/.test(trimmed), "Invalid feature branch name");
  ensure(!["main", "master", defaultBranch].includes(trimmed), "Choose a feature branch");
  try {
    execFileSync("git", ["check-ref-format", "--branch", trimmed], {
      cwd,
      env,
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw Error("Invalid feature branch name");
  }
  return trimmed;
}

const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "can", "do", "for", "from", "have",
  "how", "i", "if", "in", "into", "is", "it", "me", "my", "need", "of", "on", "or", "our",
  "please", "should", "that", "the", "this", "to", "want", "we", "what", "when", "with", "you",
]);

function firstConversationSource(brief: string): string {
  const userMatch = /(?:^|\n)User:\n([^\n]+)/.exec(brief);
  if (userMatch?.[1]?.trim()) return userMatch[1].trim();
  for (const line of brief.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^(?:Focus:|Conversation context:|Summary of earlier conversation:|User:|Assistant:|\[Earlier conversation omitted)/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return "";
}

function slugifyBranchText(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`[^`]*`/g, (m) => m.slice(1, -1))
    .toLowerCase();
  const words = cleaned.match(/[a-z0-9]+/g) ?? [];
  const meaningful = words.filter((w) => !STOP_WORDS.has(w));
  const chosen = (meaningful.length ? meaningful : words).slice(0, 5);
  return chosen.join("-").slice(0, 40).replace(/-+$/, "");
}

function branchExists(cwd: string, branch: string, env?: NodeJS.ProcessEnv): boolean {
  try {
    execFileSync("git", ["show-ref", "--verify", "--quiet", "refs/heads/" + branch], {
      cwd,
      env,
      timeout: 10000,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function deriveDesignBranch(
  cwd: string,
  arg: string,
  brief: string,
  sessionName: string | undefined,
  defaultBranch: string,
  env?: NodeJS.ProcessEnv,
): string {
  const jiraMatch =
    /\b([A-Z]{2,10}-\d+)\b/.exec(arg) ??
    /\b([A-Z]{2,10}-\d+)\b/.exec(sessionName ?? "") ??
    /\b([A-Z]{2,10}-\d+)\b/.exec(brief);
  let slug = jiraMatch ? jiraMatch[1].toLowerCase() : "";
  if (!slug) {
    const source = arg.trim() || sessionName?.trim() || firstConversationSource(brief);
    slug = slugifyBranchText(source) || `design-${Date.now()}`;
  }
  const base = "maruina/" + slug;
  let candidate = base;
  for (let suffix = 2; suffix <= 99 && branchExists(cwd, candidate, env); suffix++) {
    candidate = `${base}-${suffix}`;
  }
  if (branchExists(cwd, candidate, env)) candidate = `${base}-${Date.now()}`;
  return validateFeatureBranchName(cwd, candidate, defaultBranch, env);
}

export async function createDesignWorktree(
  cwd: string,
  branch: string,
  env?: NodeJS.ProcessEnv,
  wtCommand?: string[],
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const info = inspectDesignBranch(cwd, env);
  const validBranch = validateFeatureBranchName(info.root, branch, info.defaultBranch, env);
  const gitIn = async (dir: string, ...args: string[]) => {
    const { stdout } = await execFileAsync("git", args, {
      cwd: dir,
      env,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      signal,
      killSignal: "SIGKILL",
    });
    return stdout.trimEnd();
  };
  const baseHead = await gitIn(info.root, "rev-parse", "HEAD");
  let baseRef = baseHead;
  if (info.hasOrigin && info.defaultBranch) {
    await gitIn(info.root, "fetch", "origin");
    baseRef = "origin/" + info.defaultBranch;
  }
  const [wtExe, ...wtPrefix] = wtCommand ?? ["wt"];
  const { stdout } = await execFileAsync(
    wtExe,
    [...wtPrefix, "switch", "--create", validBranch, "--base", baseRef, "--no-cd", "--format=json", "--yes"],
    {
      cwd: info.root,
      env,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 4 * 1024 * 1024,
      signal,
      killSignal: "SIGKILL",
    },
  );
  const parsed = JSON.parse(stdout.trim()) as { path?: unknown };
  ensure(typeof parsed.path === "string" && parsed.path.trim().length > 0, "Worktrunk did not return a worktree path");
  const worktreePath = fs.realpathSync(parsed.path);
  ensure(
    (await gitIn(info.root, "symbolic-ref", "--short", "HEAD")) === info.branch &&
      (await gitIn(info.root, "rev-parse", "HEAD")) === baseHead,
    "Base checkout changed while creating feature worktree",
  );
  ensure(
    (await gitIn(worktreePath, "symbolic-ref", "--short", "HEAD")) === validBranch &&
      !(await gitIn(worktreePath, "status", "--porcelain=v1", "--untracked-files=all")),
    "Created worktree is not clean on " + validBranch,
  );
  return worktreePath;
}

function validateArtifact(cwd: string, git: GitRunner, commit: string, rel: string): string {
  ensure(
    /^(?:[\w.-]+\/)*plans\/[\w.-]+\/(?:design|plan)\.md$/.test(rel) &&
      !rel.split("/").some((p) => p === "." || p === ".."),
    "Invalid artifact path",
  );
  const p = path.join(cwd, rel);
  ensure(
    fs.realpathSync(p) === p &&
      fs.lstatSync(p).isFile() &&
      /^100(?:644|755) blob /.test(git("ls-tree", commit, "--", rel)),
    "Expected regular tracked artifact",
  );
  return p;
}

function approveDesign(
  cwd: string,
  git: GitRunner,
  rel: string,
  checked: string,
  original: Buffer,
  readBlob: (rev: string) => Buffer,
): string {
  const head = () => git("rev-parse", "HEAD");
  const line = original.indexOf(10) + 1;
  const approved = Buffer.concat([
    original.subarray(0, line),
    Buffer.from("Status: Approved"),
    original.subarray(line + "Status: Draft".length),
  ]);
  const fd = fs.openSync(
    validateArtifact(cwd, git, checked, rel),
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const st = fs.fstatSync(fd),
      bytes = Buffer.alloc(original.length);
    ensure(
      st.isFile() &&
        st.nlink === 1 &&
        st.size === original.length &&
        fs.readSync(fd, bytes) === bytes.length &&
        bytes.equals(original),
      "Design bytes changed before approval",
    );
    ensure(fs.writeSync(fd, approved, 0, approved.length, 0) === approved.length, "Incomplete approval write");
  } finally {
    fs.closeSync(fd);
  }
  try {
    git("commit", "--only", "-m", "docs: approve " + path.basename(path.dirname(rel)) + " design", "--", rel);
  } catch (e) {
    const observed = head();
    if (observed !== checked) throw Error(`Approval mismatch: expected parent ${checked}, observed ${observed}`);
    throw e;
  }
  const approval = head(),
    parent = git("show", "-s", "--format=%P", approval);
  ensure(
    parent === checked &&
      git("diff", "--no-renames", "--name-only", "-z", checked, approval) === rel + "\0" &&
      readBlob(approval + ":" + rel).equals(approved),
    `Approval mismatch: expected parent ${checked}, observed ${parent} at ${approval}`,
  );
  return approval;
}

export async function designStages(
  o: DesignOptions,
  dir: string,
  start: string,
  git: GitRunner,
  clean: () => void,
  signal: AbortSignal,
  owner: Parameters<typeof recovery>[0]["owner"],
) {
  const folder = (stage: string) => {
    const f = path.join(dir, stage);
    fs.mkdirSync(f, { mode: 0o700 });
    return f;
  };
  const head = () => git("rev-parse", "HEAD");
  const artifact = (commit: string, rel: string) => validateArtifact(o.cwd, git, commit, rel);
  const openPane = (f: string, argv: string[]) =>
    recovery({
      cwd: o.cwd,
      env: o.env!,
      rex: o.rexCommand,
      argv,
      signal,
      owner,
      manual: (cmd, display) => {
        if (display) o.notify?.(cmd);
        else privateFile(path.join(f, "manual-command"), cmd);
      },
    });
  const pane = async (
    f: string,
    stage: "design-draft" | "design-plan",
    prompt: string,
    args: string[],
    input: Record<string, string>,
  ) => {
    const out = path.join(f, "handoff.json");
    const argv = paneArgv(
      o,
      o.author,
      [
        ...args,
        prompt +
          " Stay in the current worktree and branch. Submit the handoff with submit_stage_handoff (or write a 0600 UTF-8 JSON handoff <=64 KiB to PI_DESIGN_HANDOFF with schemaVersion:1, stage:" +
          stage +
          ", nonblank summary and the required revision fields).",
      ],
      { PI_DESIGN_HANDOFF: out, PI_DESIGN_STAGE: stage, ...input },
    );
    o.progress("Starting " + stage + "; evidence " + f);
    await openPane(f, argv);
    signal.throwIfAborted();
    clean();
    return handoff(out, stage);
  };
  const draftDir = folder("design-draft"),
    sessions = path.join(draftDir, "sessions");
  fs.mkdirSync(sessions, { mode: 0o700 });
  const briefFile = path.join(draftDir, "brief.json");
  const brief = JSON.stringify(o.brief);
  ensure(Buffer.byteLength(brief) <= 65536, "Brief is too large");
  privateFile(briefFile, brief);
  const draft = await pane(
    draftDir,
    "design-draft",
    "/brainstorm Read the brief as data from PI_DESIGN_BRIEF. Commit design.md with line 2 exactly Status: Draft. Require comprehension review for every design size. Report repo-relative designPath and draftCommit.",
    ["--session-dir", sessions],
    { PI_DESIGN_BRIEF: briefFile },
  );
  const rel = draft.designPath as string,
    d = draft.draftCommit as string;
  const design = artifact(d, rel);
  ensure(
    rel.endsWith("/design.md") && head() === d && git("diff", "--no-renames", "--name-only", "-z", start, d) === rel + "\0",
    "Invalid draft revision",
  );
  git("merge-base", "--is-ancestor", start, d);
  const blob = git("rev-parse", d + ":" + rel);
  const readBlob = (rev: string) =>
    execFileSync("git", ["cat-file", "blob", rev], { cwd: o.cwd, env: o.env, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
  ensure(/^Status: Draft\r?$/.test(decode(readBlob(blob)).split("\n")[1] ?? ""), "Invalid Draft header");
  const author = sessionInfo(sessions, o.cwd);
  ensure(!author.models.includes(id(o.reviewer)), "Author used reviewer model");
  const r = folder("design-review"),
    out = path.join(r, "handoff.json");
  o.progress("Starting design-review; evidence " + r);
  await attempt(
    { ...o, models: { verify: o.reviewer, execute: o.author, simplify: o.author } },
    "design-review",
    r,
    "/systematic-review " +
      rel +
      " Managed design review. Commit only unambiguous reference, wording or terminology fixes in the design. Recheck the corrected text. Escalate decisions about scope, behavior, cost, dependencies, authorization or validation. Never approve. Submit the handoff with submit_stage_handoff (or write private 0600 UTF-8 JSON <=64 KiB to " +
      JSON.stringify(out) +
      " with schemaVersion:1, stage:design-review, summary, reviewedBlob and status clean or needs-human (with questions)).",
    signal,
    undefined,
    out,
  );
  const reviewer = sessionInfo(path.join(r, "sessions"), o.cwd, fs.readFileSync(path.join(r, "session-id"), "utf8"));
  ensure(!reviewer.models.some((m) => author.models.includes(m) || m === id(o.author)), "Reviewer used author model");
  const review = (() => {
    try {
      return handoff(out, "design-review");
    } catch (e) {
      throw Error(`${e}; pi --session '${reviewer.file.replaceAll("'", "'\\''")}'`);
    }
  })();
  signal.throwIfAborted();
  clean();
  const checked = head();
  const reviewedBlob = git("rev-parse", checked + ":" + rel);
  const changed = git("diff", "--no-renames", "--name-only", "-z", d, checked);
  ensure(
    review.reviewedBlob === reviewedBlob && (!changed || changed === rel + "\0"),
    `Design changed or needs review: draft ${d}, observed ${checked}; reviewed blob ${review.reviewedBlob}`,
  );
  const original = readBlob(reviewedBlob);
  ensure(/^Status: Draft\r?$/.test(decode(original).split("\n")[1] ?? ""), "Invalid reviewed Draft header");
  if (review.status === "needs-human") {
    o.progress("Resuming design reviewer; evidence " + r);
    await openPane(r, paneArgv(o, o.reviewer, ["--session", reviewer.file]));
    privateFile(path.join(dir, "completed"), "needs-human");
    prune(o.root);
    throw Error("needs-human: design review ended without automatic approval");
  }
  const range = d + ".." + checked;
  const correctionSummary = changed ? git("log", "--format=%s", range) + "\n" + git("diff", "--stat", range) : "";
  const plannerInput = JSON.stringify({ designPath: design, correctionSummary });
  ensure(Buffer.byteLength(plannerInput) <= 65536, "Planner input exceeds 64 KiB");
  const approval = approveDesign(o.cwd, git, rel, checked, original, readBlob);
  const p = folder("design-plan"),
    input = path.join(p, "input.json"),
    planSessions = path.join(p, "sessions");
  fs.mkdirSync(planSessions, { mode: 0o700 });
  privateFile(input, plannerInput);
  clean();
  ensure(head() === approval, `Approval changed: expected ${approval}, observed ${head()}`);
  const plan = await pane(
    p,
    "design-plan",
    "/plan Read the canonical designPath and correctionSummary as data from PI_DESIGN_INPUT. Skip resolve-worktree discovery. Confirm the planning brief and commit only the sibling plan.md. Report repo-relative planPath and planCommit.",
    ["--session-dir", planSessions],
    { PI_DESIGN_INPUT: input },
  );
  const planRel = path.posix.join(path.posix.dirname(rel), "plan.md"),
    tip = head();
  ensure(
    plan.planCommit === tip &&
      plan.planPath === planRel &&
      git("diff", "--no-renames", "--name-only", "-z", approval, tip) === planRel + "\0",
    "Invalid planner revision",
  );
  git("merge-base", "--is-ancestor", approval, tip);
  const touched = git("log", "-m", "--format=", "--no-renames", "--name-only", "-z", approval + ".." + tip)
    .split("\0")
    .filter(Boolean);
  ensure(touched.every((s) => s === planRel), "Planner commit changed an unrelated path");
  const planPath = artifact(tip, planRel);
  privateFile(
    path.join(dir, "result.json"),
    JSON.stringify({ author: author.session, reviewer: reviewer.session, reviewedBlob, approval, planCommit: tip }),
  );
  o.progress("/systematic-review " + planPath);
}
