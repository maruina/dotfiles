import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

type Stage = "execute" | "simplify" | "verify";
export type Choice = { provider: string; id: string; thinking: string };
type Options = {
  cwd: string;
  plan: string;
  root: string;
  models: Record<Stage, Choice>;
  signal: AbortSignal;
  progress: (message: string) => void;
  executable?: string;
  prefix?: string[];
  env?: NodeJS.ProcessEnv;
  idleMs?: number;
  wallMs?: number;
};
const decode = (b: Buffer) => new TextDecoder("utf8", { fatal: true }).decode(b);
const nonblank = (s: unknown) => typeof s === "string" && s.trim().length > 0;
const safe = (s: string) => s.replace(/[^\x20-\x7e]/g, "?").slice(0, 500);
const unchecked = (s: string) => s.match(/^\s*- \[ \] .+$/gm) ?? [];
const id = (m: Choice) => m.provider + "/" + m.id;
const privateFile = (file: string, value: string | Buffer) =>
  fs.writeFileSync(file, value, { mode: 0o600, flag: "wx" });

export function preflight(plan: string, ids: readonly string[], nested: boolean) {
  if (nested) throw Error("Nested stage-runner is not allowed");
  if (ids.slice(0, 2).includes(ids[2])) throw Error("Choose an independent verifier");
  if (
    !unchecked(plan).length ||
    /^\*\*(?:In progress|Execution writer)\b/im.test(plan) ||
    /^\s*- \[[^ ]\] /m.test(plan)
  )
    throw Error("Start before the first plan task; finish started plans manually");
}

export async function* events(source: AsyncIterable<Buffer> | Iterable<Buffer>) {
  let chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of source) {
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf(10, start),
        b = chunk.subarray(start, end < 0 ? chunk.length : end);
      size += b.length;
      if (size > 16 * 1024 * 1024) throw Error("Oversized Pi event");
      chunks.push(b);
      if (end < 0) break;
      const event = JSON.parse(decode(Buffer.concat(chunks, size)));
      if (!event || typeof event !== "object") throw Error("Invalid Pi event");
      yield event;
      chunks = [];
      size = 0;
      start = end + 1;
    }
  }
  if (size) throw Error("Incomplete Pi event");
}

export function validate(bytes: Buffer, stage: Stage) {
  if (bytes.length > 65536) throw Error("Oversized handoff");
  const h = JSON.parse(decode(bytes));
  if (h?.schemaVersion !== 1 || h.stage !== stage || !nonblank(h.summary)) throw Error("Invalid handoff header");
  if (stage === "verify") {
    if (
      !["BLOCKED", "VERIFIED"].includes(h.status) ||
      (h.findings !== undefined &&
        (!Array.isArray(h.findings) ||
          !h.findings.every((f: unknown) => f !== null && typeof f === "object" && !Array.isArray(f))))
    )
      throw Error("Invalid verdict");
  } else if (
    h.status !== "success" &&
    !(h.status === "blocked" && ["step", "reason", "evidence", "nextAction"].every((k) => nonblank(h.blocker?.[k])))
  )
    throw Error("Invalid writer status or blocker");
  return h;
}

function handoff(file: string, stage: Stage) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const st = fs.fstatSync(fd);
    if (st.size > 65536) throw Error("Oversized handoff");
    if (!st.isFile() || st.nlink !== 1 || st.uid !== process.getuid?.() || st.mode & 0o077)
      throw Error("Handoff must be a private regular file");
    const buf = Buffer.alloc(65537);
    return validate(buf.subarray(0, fs.readSync(fd, buf)), stage);
  } finally {
    fs.closeSync(fd);
  }
}

async function attempt(o: Options, stage: Stage, dir: string, prompt: string, signal: AbortSignal) {
  const sessions = path.join(dir, "sessions");
  fs.mkdirSync(sessions, { mode: 0o700 });
  const m = o.models[stage],
    started = Date.now();
  // Inherit a private umask for session files that Pi creates without an explicit mode.
  const env: NodeJS.ProcessEnv = { ...(o.env ?? process.env), PI_STAGE_RUNNER_CHILD: "1" };
  delete env.PI_LIFECYCLE_CHILD_CONFIG;
  const mask = process.umask(0o077);
  const child = (() => {
    try {
      return spawn(
        o.executable ?? "pi",
        [
          ...(o.prefix ?? []),
          "--mode",
          "json",
          "--session-dir",
          sessions,
          "--provider",
          m.provider,
          "--model",
          m.id,
          "--thinking",
          m.thinking,
          prompt,
        ],
        {
          cwd: o.cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"] as const,
        },
      );
    } finally {
      process.umask(mask);
    }
  })();
  const closed = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  let stopping = "",
    kill: NodeJS.Timeout | undefined;
  function stop(reason: string) {
    if (stopping) return;
    stopping = reason;
    child.kill("SIGTERM");
    kill = setTimeout(() => child.kill("SIGKILL"), 5000);
  }
  const cancel = () => stop("cancelled");
  const wall = setTimeout(() => stop("wall-clock timeout"), o.wallMs ?? 3600000);
  const idle = setTimeout(() => stop("inactivity timeout"), o.idleMs ?? 600000);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  let stderr = Buffer.alloc(0),
    session = "",
    settled = false,
    turn = 0;
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = Buffer.concat([stderr, chunk]).subarray(-16384);
  });
  try {
    const stream = (async () => {
      try {
        for await (const e of events(child.stdout)) {
          idle.refresh();
          if (!session) {
            if (e.type !== "session" || typeof e.id !== "string" || !/^[a-zA-Z0-9-]{1,128}$/.test(e.id))
              throw Error("Missing session header");
            session = e.id;
            privateFile(path.join(dir, "session-id"), session);
          }
          if (e.type === "agent_start") settled = false;
          if (e.type === "agent_settled") settled = e.aborted === false;
          if (e.type === "turn_start") turn++;
          if (
            [
              "session",
              "tool_execution_start",
              "tool_execution_end",
              "turn_start",
              "turn_end",
              "agent_settled",
            ].includes(e.type)
          )
            o.progress(
              safe(
                stage +
                  " " +
                  path.basename(dir) +
                  " " +
                  e.type +
                  " " +
                  (e.toolName ?? "") +
                  " turn " +
                  turn +
                  " " +
                  Math.floor((Date.now() - started) / 1000) +
                  "s",
              ),
            );
        }
      } catch (err) {
        stop("Invalid Pi stream: " + safe(String(err)));
      }
    })();
    const [code] = await Promise.all([closed, stream]);
    if (stopping || code !== 0 || !settled || !session)
      throw Error((stopping || "Pi did not settle successfully; exit " + code) + "; session " + (session || "unknown"));
  } finally {
    clearTimeout(idle);
    clearTimeout(wall);
    clearTimeout(kill);
    signal.removeEventListener("abort", cancel);
    privateFile(path.join(dir, "stderr"), stderr);
    privateFile(
      path.join(dir, "attempt.json"),
      JSON.stringify({ stage, model: m, session, elapsedMs: Date.now() - started, turn, settled }),
    );
  }
}

export function prune(root: string) {
  const completed = fs
    .readdirSync(root)
    .filter((n) => /^run-\d+-[0-9a-f-]+$/.test(n) && fs.existsSync(path.join(root, n, "completed")))
    .sort()
    .reverse();
  for (const name of completed.slice(100)) fs.rmSync(path.join(root, name), { recursive: true, force: true });
}

export async function run(o: Options) {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: o.cwd,
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  const cwd = fs.realpathSync(git("rev-parse", "--show-toplevel")),
    plan = fs.realpathSync(path.resolve(o.cwd, o.plan)),
    rel = path.relative(cwd, plan);
  o = { ...o, cwd };
  if (rel.startsWith("../") || !/(^|\/)plans\/[^/]+\/plan\.md$/.test(rel) || /[\r\n\0]/.test(plan))
    throw Error("Expected a committed plan inside the worktree");
  const branch = git("symbolic-ref", "--short", "HEAD");
  let defaultBranch = "";
  try {
    defaultBranch = git("symbolic-ref", "--short", "refs/remotes/origin/HEAD").replace(/^origin\//, "");
  } catch {
    if (git("remote").split("\n").includes("origin")) throw Error("Cannot establish origin default branch");
  }
  if (["main", "master", defaultBranch].includes(branch)) throw Error("Choose a feature branch");
  function clean() {
    if (git("status", "--porcelain=v1", "--untracked-files=all") || git("symbolic-ref", "--short", "HEAD") !== branch)
      throw Error("Worktree is dirty or branch changed");
  }
  clean();
  const base = git("rev-parse", "HEAD"),
    blob = git("rev-parse", base + ":" + rel),
    initial = git("show", blob);
  preflight(
    initial,
    [id(o.models.execute), id(o.models.simplify), id(o.models.verify)],
    (o.env ?? process.env).PI_STAGE_RUNNER_CHILD === "1",
  );
  o.signal.throwIfAborted();
  fs.mkdirSync(o.root, { recursive: true, mode: 0o700 });
  const root = fs.realpathSync(o.root),
    stat = fs.statSync(root);
  if (root === cwd || root.startsWith(cwd + path.sep) || stat.mode & 0o077 || stat.uid !== process.getuid?.())
    throw Error("Run root must be private and outside Git");
  const lock = path.join(root, "lock-" + createHash("sha256").update(cwd).digest("hex"));
  const dir = path.join(root, "run-" + Date.now() + "-" + randomUUID());
  privateFile(lock, JSON.stringify({ pid: process.pid, dir, cwd }));
  const owned = fs.statSync(lock);
  const controller = new AbortController(),
    cancel = () => controller.abort();
  process.on("SIGTERM", cancel);
  process.on("SIGINT", cancel);
  const signal = AbortSignal.any([o.signal, controller.signal]);
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
    clean();
    if (git("rev-parse", "HEAD") !== base) throw Error("HEAD changed during preflight");
    privateFile(path.join(dir, "run.json"), JSON.stringify({ base, blob, plan, models: o.models }));
    let remaining = unchecked(initial),
      n = 0,
      stage: Stage = "execute";
    while (true) {
      signal.throwIfAborted();
      const prev = git("rev-parse", "HEAD"),
        folder = path.join(dir, stage + "-" + ++n);
      fs.mkdirSync(folder, { mode: 0o700 });
      const out = path.join(folder, "handoff.json");
      const quote = (s: string) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
      const flags =
        stage === "execute"
          ? ""
          : " --implemented-by " +
            quote(id(o.models.execute)) +
            (stage === "verify" ? " --simplified-by " + quote(id(o.models.simplify)) : "");
      const prompt =
        "/" +
        stage +
        " " +
        quote(plan) +
        flags +
        "\nDo not push, publish, apply or create a PR. Feature baseline " +
        base +
        "; requirements plan blob " +
        blob +
        "; current candidate " +
        prev +
        ". Write only this attempt's private (0600) UTF-8 JSON handoff outside Git, <=64 KiB. Include schemaVersion:1, stage:" +
        stage +
        ", nonblank summary, and " +
        (stage === "verify"
          ? "status VERIFIED or BLOCKED and structured findings."
          : "status success or blocked; blocked requires blocker {step,reason,evidence,nextAction}.") +
        "\nHandoff path: " +
        JSON.stringify(out);
      o.progress(stage + " " + n + "; evidence " + dir);
      await attempt(o, stage, folder, prompt, signal);
      signal.throwIfAborted();
      const h = handoff(out, stage);
      if (!["success", "VERIFIED"].includes(h.status)) throw Error(safe(h.summary) + "; see " + out);
      clean();
      const head = git("rev-parse", "HEAD");
      git("merge-base", "--is-ancestor", prev, head);
      if (stage === "verify" && head !== prev) throw Error("Verifier changed HEAD");
      if (stage === "execute") {
        const next = unchecked(git("show", "HEAD:" + rel));
        if (prev === head || next.length >= remaining.length) throw Error("No committed task progress");
        if (next.length && (n >= 20 || !/^### Slice \d+/m.test(initial)))
          throw Error("Execute limit; remaining: " + safe(next.join("; ")));
        remaining = next;
      }
      privateFile(
        path.join(folder, "accepted.json"),
        JSON.stringify({ head, status: h.status, evidence: "validated handoff" }),
      );
      if (stage === "verify") break;
      stage = stage === "execute" ? (remaining.length ? "execute" : "simplify") : "verify";
    }
    privateFile(path.join(dir, "completed"), "VERIFIED");
    prune(root);
    return dir;
  } catch (error) {
    if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, "completed"))) {
      privateFile(path.join(dir, "completed"), safe(String(error)));
      prune(root);
    }
    throw Error(safe(String(error)) + "; evidence " + dir);
  } finally {
    process.off("SIGTERM", cancel);
    process.off("SIGINT", cancel);
    if (fs.lstatSync(lock).ino === owned.ino) fs.unlinkSync(lock);
  }
}
