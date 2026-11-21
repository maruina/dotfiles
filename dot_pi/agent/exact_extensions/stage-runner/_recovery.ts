import * as fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

export function sessionInfo(dir: string, cwd: string, expected?: string) {
  const matches = fs.readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
  if (matches.length !== 1) throw Error("Expected one saved Pi session in " + dir);
  const file = path.join(dir, matches[0]);
  const fd = fs.openSync(file, fs.constants.O_NOFOLLOW | fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
  const models = new Set<string>();
  let session = "";
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid?.() || st.mode & 0o077 || st.size > 32 * 1024 * 1024)
      throw Error("Unsafe or oversized saved session");
    const bytes = Buffer.alloc(st.size);
    if (fs.readSync(fd, bytes) !== bytes.length) throw Error("Session changed");
    for (const line of new TextDecoder("utf8", { fatal: true }).decode(bytes).trimEnd().split("\n")) {
      const row = JSON.parse(line);
      if (!session) {
        if (
          row.type !== "session" ||
          !/^[\w-]{1,128}$/.test(row.id ?? "") ||
          typeof row.id !== "string" ||
          row.parentSession ||
          fs.realpathSync(row.cwd) !== fs.realpathSync(cwd) ||
          (expected !== undefined && row.id !== expected)
        )
          throw Error("Saved session identity mismatch");
        session = row.id;
      } else if (row.type === "session") throw Error("Unexpected session header");
      if (row.type === "model_change" || (row.type === "message" && row.message.role === "assistant")) {
        const [provider, model] =
          row.type === "model_change" ? [row.provider, row.modelId] : [row.message.provider, row.message.model];
        if (![provider, model].every((v) => typeof v === "string" && v.trim())) throw Error("Unknown writer model");
        models.add(provider + "/" + model);
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  if (!session || !models.size) throw Error("Unknown writer provenance");
  return { file, session, models: [...models] };
}

type Ownership = { session: string; anchor: string; block?: string; pid?: number };
export async function recovery(o: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  rex?: string[];
  argv: string[];
  signal: AbortSignal;
  owner: (state: Ownership | null) => void;
  manual: (command: string, display: boolean) => void;
}) {
  const { REX_SERVER: endpoint, REX_SESSION: session, REX_BLOCK: anchor } = o.env;
  if (!endpoint?.startsWith("unix:///") || !session || !anchor) throw Error("Missing local Rex IDs");
  const socket = fs.lstatSync(decodeURIComponent(new URL(endpoint).pathname));
  if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw Error("Unverified Rex socket");
  const [exe, ...prefix] = o.rex ?? ["rex"];
  const rex = async (...args: string[]) =>
    (
      await promisify(execFile)(exe, [...prefix, "--autostart=false", "--server", endpoint, ...args], {
        cwd: o.cwd,
        env: o.env,
        timeout: 5000,
        maxBuffer: 128 * 1024,
      })
    ).stdout;
  const command = o.argv.map((s) => "'" + s.replaceAll("'", "'\\''") + "'").join(" ");
  const instructions = "Recovery command in " + o.cwd + " (Rex " + session + " / " + anchor + "):\n" + command;
  o.manual(instructions, false);
  const peer = JSON.parse(await rex("whoami", "--json"));
  if (
    peer.endpoint !== endpoint ||
    peer.principal?.transport !== "unix" ||
    peer.principal.kind !== "peer" ||
    peer.principal.uid !== process.getuid?.() ||
    peer.session_id !== session ||
    peer.block_id !== anchor
  ) {
    o.manual(instructions, true);
    throw Error("Rex peer or anchor mismatch");
  }
  const split = [
    "split",
    "--shell=none",
    "--keep-open",
    "-s",
    session,
    "-b",
    anchor,
    "-c",
    o.cwd,
    "--json",
    "--",
    ...o.argv,
  ];

  o.signal.throwIfAborted();
  const state: Ownership = { session, anchor };
  o.owner(state);
  let raw: string;
  try {
    raw = await rex(...split);
  } catch (e) {
    if (["ENOENT", "EACCES"].includes((e as NodeJS.ErrnoException).code ?? "")) {
      o.owner(null);
      o.manual(instructions, true);
    }
    throw e;
  }
  const created = JSON.parse(raw),
    block = created.block_ids?.[0];
  if (
    created.anchor_id !== anchor ||
    created.block_ids.length !== 1 ||
    typeof block !== "string" ||
    !/^block:[\w-]+$/.test(block) ||
    block === anchor
  )
    throw Error("Uncertain recovery split");
  state.block = block;
  o.owner(state);
  const inspect = async () => JSON.parse(await rex("block", "call", "-s", session, "-b", block, "process"));
  const identity = (view: any) =>
    Number.isSafeInteger(view.child?.pid) &&
    view.child.pid > 1 &&
    view.child.pid !== process.pid &&
    view.child.pid === view.foreground?.pid &&
    view.foreground.user_id === process.getuid?.() &&
    view.foreground.path &&
    fs.realpathSync(view.foreground.path) === fs.realpathSync(o.argv[0]) &&
    fs.realpathSync(view.foreground.cwd) === fs.realpathSync(o.cwd);
  let view = await inspect();
  const deadline = Date.now() + 5000;
  while (!identity(view) && !view.last_exit && Date.now() < deadline && !o.signal.aborted) {
    await delay(100);
    view = await inspect();
  }
  if (!identity(view)) throw Error("Unverified recovery PID; inspect retained lock");
  const pid = (state.pid = view.child.pid);
  o.owner(state);
  let terminated = 0,
    killed = false;
  while (true) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") break;
      throw e;
    }
    if (o.signal.aborted && (!terminated || Date.now() - terminated >= 5000)) {
      const current = await inspect();
      if (current.child?.pid !== pid || !identity(current) || killed)
        throw Error("Cannot confirm recovery exit; lock retained");
      process.kill(pid, terminated ? "SIGKILL" : "SIGTERM");
      if (terminated) killed = true;
      terminated = Date.now();
    }
    await delay(150);
  }
  const listing = JSON.parse(await rex("block", "list", "-s", session, "--json"));
  if (listing.blocks.some((entry: { block_id: string }) => entry.block_id === block))
    await rex("block", "close", "-s", session, block);
  o.owner(null);
  o.signal.throwIfAborted();
}
