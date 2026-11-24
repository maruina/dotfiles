import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";

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

type GitRunner = (...args: string[]) => string;

function ensure(ok: boolean, reason: string): asserts ok {
  if (!ok) throw Error(reason);
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
