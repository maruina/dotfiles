import { getAgentDir, SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmdirSync, statSync, unlinkSync, watch } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { writeAtomicJson } from "../_shared/fs.ts";
import { buildRexArgs, isRexId, matchesForegroundProcess, verifyLocalRexEndpoint, verifyLocalRexPeer } from "../_shared/rex.ts";

export function snapshotBranch(source: ExtensionContext["sessionManager"], cwd: string): { path: string; id: string } {
  const file = source.getSessionFile();
  const leaf = source.getLeafId();
  if (!file || !isAbsolute(file) || !leaf || !existsSync(file) || statSync(file).size === 0) {
    throw new Error("A persisted conversation is required before forking.");
  }
  const copy = SessionManager.open(file, source.getSessionDir(), cwd);
  if (copy.getSessionId() !== source.getSessionId() || !copy.getEntry(leaf)
    || JSON.stringify(copy.getBranch(leaf)) !== JSON.stringify(source.getBranch(leaf))) {
    throw new Error("The active branch is not fully persisted.");
  }
  const path = copy.createBranchedSession(leaf);
  if (!path || path === file || copy.getSessionId() === source.getSessionId() || !existsSync(path)) {
    throw new Error("Could not persist an independent conversation snapshot.");
  }
  chmodSync(path, 0o600);
  return { path, id: copy.getSessionId() };
}

type Identity = { endpoint: string; instance_id: string; host_id: string; session_id: string; block_id: string; pid: number };
type Attempt = { nonce: string; snapshot: string; snapshotId: string; cwd: string; endpoint: string; instance: string; host: string; session: string; sourceBlock: string };

type RexBlockInspect = { session_id?: string; block?: { block_id?: string; host_id?: string; window_id?: string } };
type RexProcessView = { foreground?: { pid?: unknown; user_id?: unknown; cwd?: unknown; path?: unknown } };
type RexCreateResult = { window_id?: unknown; anchor_id?: unknown; block_ids?: unknown };

async function rex<T = unknown>(pi: ExtensionAPI, endpoint: string, args: string[], timeout = 7000): Promise<T> {
  const result = await pi.exec("rex", buildRexArgs(args, { timeoutSec: 5, endpoint, validateEndpoint: false }), { timeout });
  if (result.code !== 0 || result.killed || ("truncated" in result && result.truncated)) throw new Error("Rex inspection/request failed or timed out.");
  return JSON.parse(result.stdout) as T;
}

async function identity(pi: ExtensionAPI, endpoint: string): Promise<Identity> {
  const value = verifyLocalRexPeer(await rex(pi, endpoint, ["whoami", "--json"]), endpoint, { requireMetadata: true }) as Identity;
  const owner = await pi.exec("ps", ["-p", String(value.pid), "-o", "uid="], { timeout: 7000 });
  if (owner.code !== 0 || owner.killed || owner.stdout.trim() !== String(process.getuid?.())) throw new Error("Rex server process ownership changed.");
  return value;
}

async function inspectOwnPane(pi: ExtensionAPI, peer: Identity, cwd: string): Promise<string> {
  const view = await rex<RexBlockInspect>(pi, peer.endpoint, ["block", "inspect", "-s", peer.session_id, peer.block_id, "--json"]);
  if (view.session_id !== peer.session_id || view.block?.block_id !== peer.block_id || view.block.host_id !== peer.host_id || !isRexId("window", view.block.window_id)) {
    throw new Error("Rex pane membership or host does not match.");
  }
  const processes = await rex<RexProcessView>(pi, peer.endpoint, ["block", "call", "-s", peer.session_id, "-b", peer.block_id, "process"]);
  // deliberate: only a directly foreground Pi is supported; wrappers and background Pi need explicit ancestry validation.
  if (!matchesForegroundProcess(processes.foreground, { pid: process.pid, cwd, execPath: process.execPath })) {
    throw new Error(`This Pi is not the verified foreground process of the invoking pane (expected PID ${process.pid}, executable ${process.execPath}, cwd ${cwd}; observed PID ${processes.foreground?.pid}, UID ${processes.foreground?.user_id}, executable ${processes.foreground?.path}, cwd ${processes.foreground?.cwd}).`);
  }
  return view.block.window_id;
}

function sameServer(before: Identity, after: Identity): boolean {
  return before.endpoint === after.endpoint && before.instance_id === after.instance_id && before.host_id === after.host_id
    && before.pid === after.pid && before.session_id === after.session_id && before.block_id === after.block_id;
}



async function waitForFile(dir: string, filePath: string, deadline: number, current: () => boolean): Promise<boolean> {
  if (existsSync(filePath)) return true;
  let watcher: ReturnType<typeof watch> | undefined;
  let wake: (() => void) | undefined;
  try {
    watcher = watch(dir, () => { wake?.(); });
    watcher.on("error", () => { wake?.(); });
  } catch {
    // Fall back to bounded polling when fs.watch is unavailable.
  }
  try {
    while (current() && Date.now() < deadline) {
      if (existsSync(filePath)) return true;
      const waitMs = Math.min(250, Math.max(1, deadline - Date.now()));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, waitMs);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    }
    return existsSync(filePath);
  } finally {
    watcher?.close();
  }
}

function attemptRoot(): string { return join(realpathSync(getAgentDir()), "rex-fork-attempts"); }

function privateDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error("Fork metadata directory is not private.");
}

function readPrivate<T = Record<string, unknown>>(path: string): T {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 16384) throw new Error("Fork metadata file is not private or bounded.");
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function launcher(): string[] {
  const script = realpathSync(process.argv[1] ?? "");
  const bundled = script.endsWith("/dist/bundle/cli.js");
  const packageFile = join(dirname(script), "..", ...(bundled ? [".."] : []), "package.json");
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  if ((!bundled && !script.endsWith("/dist/cli.js")) || pkg.name !== "@earendil-works/pi-coding-agent") throw new Error("Unsupported Pi launcher; use the installed Pi CLI.");
  // deliberate: accept only known source selectors; support other launch configurations only after validating their effects.
  const valued = new Set(["--provider", "--model", "--models", "--thinking", "--session", "--session-id", "--session-dir", "--fork", "--name", "-n"]);
  const flags = new Set(["--continue", "-c", "--resume", "-r"]);
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (valued.has(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith("-")) throw new Error(`Missing value for ${arg}.`);
      i++;
    } else if (arg.startsWith("-") && !flags.has(arg)) {
      throw new Error("Unsupported Pi launch option.");
    }
  }
  return [process.execPath, script];
}

export async function publishStartupReceipt(pi: ExtensionAPI, ctx: ExtensionContext, current: () => boolean): Promise<void> {
  const directory = process.env.PI_REX_FORK_ATTEMPT;
  if (!directory) return;
  delete process.env.PI_REX_FORK_ATTEMPT;
  const root = attemptRoot();
  if (dirname(directory) !== root || !/^[a-f0-9-]{36}$/.test(directory.slice(root.length + 1))) throw new Error("Invalid fork attempt path.");
  privateDirectory(root);
  privateDirectory(directory);
  const attempt = readPrivate<Attempt>(join(directory, "attempt.json"));
  if (ctx.mode !== "tui" || attempt.nonce !== directory.slice(root.length + 1) || !isAbsolute(attempt.snapshot)
    || ctx.sessionManager.getSessionFile() !== attempt.snapshot || ctx.sessionManager.getSessionId() !== attempt.snapshotId
    || ctx.cwd !== attempt.cwd || ctx.sessionManager.getCwd() !== attempt.cwd) throw new Error("Fork destination does not match the requested snapshot and cwd.");
  const endpoint = verifyLocalRexEndpoint();
  const peer = await identity(pi, endpoint);
  if (endpoint !== attempt.endpoint || peer.instance_id !== attempt.instance || peer.host_id !== attempt.host
    || peer.session_id !== attempt.session || peer.block_id === attempt.sourceBlock) throw new Error("Fork destination Rex identity changed.");
  if (!current()) throw new Error("Destination lifecycle changed before startup verification.");
  await inspectOwnPane(pi, peer, ctx.cwd);
  if (!current() || ctx.sessionManager.getSessionFile() !== attempt.snapshot || ctx.sessionManager.getSessionId() !== attempt.snapshotId) throw new Error("Destination lifecycle changed before receipt publication.");
  writeAtomicJson(join(directory, "receipt.json"), { ...attempt, block: peer.block_id, pid: process.pid });
}

export async function runTabFork(api: ExtensionAPI, ctx: ExtensionContext, current: () => boolean, settled: () => boolean, destination: "tab" | "right" | "below"): Promise<void> {
  let deadline = Infinity;
  const pi: ExtensionAPI = { ...api, exec: async (command, args, options) => {
    const remaining = deadline - Date.now();
    if (!current() || remaining <= 0) throw new Error("Source lifecycle changed or startup verification expired.");
    const result = await api.exec(command, args, { ...options, timeout: Math.max(1, Math.min(options?.timeout ?? 7000, 7000, remaining)) });
    if (!current() || Date.now() >= deadline) throw new Error("Source lifecycle changed or startup verification expired.");
    return result;
  } };
  const endpoint = verifyLocalRexEndpoint();
  const peer = await identity(pi, endpoint);
  if (peer.session_id !== process.env.REX_SESSION || peer.block_id !== process.env.REX_BLOCK) throw new Error("Inherited Rex IDs do not match the invoking pane.");
  await inspectOwnPane(pi, peer, ctx.cwd);
  const command = launcher();
  const fish = await pi.exec("/usr/bin/which", ["fish"], { timeout: 7000 });
  const shell = fish.stdout.trim();
  if (fish.code !== 0 || fish.killed || !isAbsolute(shell) || shell.includes("\n")) throw new Error("Fish must be installed and on the source Pi's PATH.");
  if (realpathSync(ctx.cwd) !== realpathSync(ctx.sessionManager.getCwd())) throw new Error("Source cwd does not match the session cwd.");
  const rechecked = await identity(pi, endpoint);
  const sourceWindow = await inspectOwnPane(pi, rechecked, ctx.cwd);
  if (!sameServer(peer, rechecked) || !settled()) throw new Error("Source session, idle state, or Rex identity changed before the snapshot.");
  const snapshot = snapshotBranch(ctx.sessionManager, ctx.cwd);
  let directory: string;
  let attempt: Attempt;
  try {
    const root = attemptRoot();
    mkdirSync(root, { mode: 0o700, recursive: true });
    privateDirectory(root);
    const nonce = randomUUID();
    directory = join(root, nonce);
    mkdirSync(directory, { mode: 0o700 });
    attempt = { nonce, snapshot: snapshot.path, snapshotId: snapshot.id, cwd: ctx.cwd, endpoint,
      instance: peer.instance_id, host: peer.host_id, session: peer.session_id, sourceBlock: peer.block_id };
    writeAtomicJson(join(directory, "attempt.json"), attempt);
  } catch (error) {
    ctx.ui.notify(`Rex fork snapshot preparation failed; no creation was requested. Snapshot ${snapshot.path} remains available for inspection. ${String(error)}`, "error");
    return;
  }
  let submitted = false;
  let created: RexCreateResult | undefined;
  try {
    if (!settled()) throw new Error("Source changed before creation.");
    const spawnCmd = ["/usr/bin/env", `PI_CODING_AGENT_DIR=${getAgentDir()}`, `PI_REX_FORK_ATTEMPT=${directory}`, ...command, "--session", snapshot.path];
    const createArgs = destination === "tab"
      ? ["window", "new", "-s", peer.session_id, "--shell", shell, "-c", ctx.cwd, "--focus", "--json", "--", ...spawnCmd]
      : ["split", "-s", peer.session_id, "-b", peer.block_id, "--split", destination, "--shell", shell, "-c", ctx.cwd, "--focus", "--json", "--", ...spawnCmd];
    submitted = true;
    created = await rex<RexCreateResult>(pi, endpoint, createArgs);
    writeAtomicJson(join(directory, "creation.json"), created);
    const createdBlocks = Array.isArray(created.block_ids) ? created.block_ids : [];
    const createdBlock = createdBlocks[0];
    if ((destination === "tab" ? !isRexId("window", created.window_id) : created.anchor_id !== peer.block_id)
      || createdBlocks.length !== 1
      || !isRexId("block", createdBlock) || createdBlock === peer.block_id) throw new Error("Rex returned an invalid destination identity.");
    deadline = Date.now() + 15000;
    const receiptPath = join(directory, "receipt.json");
    if (await waitForFile(directory, receiptPath, deadline, current) && current() && Date.now() < deadline) {
      const receipt = readPrivate<Record<string, unknown>>(receiptPath);
      if (Object.entries(attempt).some(([key, value]) => receipt[key] !== value) || receipt.block !== createdBlock
        || typeof receipt.pid !== "number" || !Number.isSafeInteger(receipt.pid) || receipt.pid === process.pid) throw new Error("Fork startup receipt does not match this attempt.");
      const after = await identity(pi, endpoint);
      if (!current() || Date.now() >= deadline || !sameServer(peer, after)) throw new Error("Source or Rex changed during startup verification.");
      const target = await rex<RexBlockInspect>(pi, endpoint, ["block", "inspect", "-s", peer.session_id, createdBlock, "--json"], Math.max(1, Math.min(7000, deadline - Date.now())));
      const processInfo = await rex<RexProcessView>(pi, endpoint, ["block", "call", "-s", peer.session_id, "-b", createdBlock, "process"], Math.max(1, Math.min(7000, deadline - Date.now())));
      if (!current() || Date.now() >= deadline || target.block?.window_id !== (destination === "tab" ? created.window_id : sourceWindow) || target.block?.host_id !== peer.host_id
        || !matchesForegroundProcess(processInfo.foreground, { pid: receipt.pid, cwd: ctx.cwd, execPath: process.execPath })) throw new Error("Destination process identity did not verify.");
      for (const name of ["attempt.json", "creation.json", "receipt.json"]) unlinkSync(join(directory, name));
      rmdirSync(directory);
      ctx.ui.notify(destination === "tab" ? `Opened an independent conversation in Rex tab ${String(created.window_id)}.` : `Opened an independent conversation in Rex split ${createdBlock}.`, "info");
      return;
    }
    throw new Error(current() ? "Startup verification timed out." : "Source lifecycle changed during startup verification.");
  } catch (error) {
    writeAtomicJson(join(directory, "failure.json"), { state: submitted ? "created_unverified" : "snapshot_failed", created, error: String(error) });
    ctx.ui.notify(`Rex fork ${submitted ? "created/unverified (creation may have occurred)" : "stopped before creation"}: ${String(error)} Inspect ${directory} and snapshot ${snapshot.path}${created?.block_ids ? `; Rex blocks ${JSON.stringify(created.block_ids)}` : ""}. No retry or cleanup was attempted.`, "error");
  }
}
