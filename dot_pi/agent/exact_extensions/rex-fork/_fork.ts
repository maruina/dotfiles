import { getAgentDir, SessionManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

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
const idMatches = (kind: string, value: unknown): value is string => typeof value === "string" && new RegExp(`^${kind}:[a-f0-9-]+$`, "i").test(value);

async function rex(pi: ExtensionAPI, endpoint: string, args: string[], timeout = 7000): Promise<any> {
  const result = await pi.exec("rex", ["--autostart=false", "--timeout", "5s", "--server", endpoint, ...args], { timeout });
  if (result.code !== 0 || result.killed || ("truncated" in result && result.truncated)) throw new Error("Rex inspection/request failed or timed out.");
  return JSON.parse(result.stdout);
}

function localEndpoint(): string {
  const endpoint = process.env.REX_SERVER;
  if (!endpoint || !endpoint.startsWith("unix:///")) throw new Error("An explicit local Unix Rex endpoint is required.");
  const url = new URL(endpoint);
  if (url.hostname || url.search || url.hash) throw new Error("Remote or ambiguous Rex endpoints are unsupported.");
  const socket = lstatSync(decodeURIComponent(url.pathname));
  if (!socket.isSocket() || socket.uid !== process.getuid?.()) throw new Error("Rex socket ownership does not match this user.");
  return endpoint;
}

async function identity(pi: ExtensionAPI, endpoint: string): Promise<Identity> {
  const value = await rex(pi, endpoint, ["whoami", "--json"]);
  if (value.endpoint !== endpoint || value.principal?.kind !== "peer" || value.principal.transport !== "unix"
    || value.principal.uid !== process.getuid?.() || !idMatches("session", value.session_id)
    || !idMatches("block", value.block_id) || typeof value.instance_id !== "string" || !value.instance_id
    || typeof value.host_id !== "string" || !value.host_id || !Number.isSafeInteger(value.pid)) {
    throw new Error("Rex did not verify this user's local session and pane.");
  }
  const owner = await pi.exec("ps", ["-p", String(value.pid), "-o", "uid="], { timeout: 7000 });
  if (owner.code !== 0 || owner.killed || owner.stdout.trim() !== String(process.getuid?.())) throw new Error("Rex server process ownership changed.");
  return value;
}

async function inspectOwnPane(pi: ExtensionAPI, peer: Identity, cwd: string): Promise<void> {
  const view = await rex(pi, peer.endpoint, ["block", "inspect", "-s", peer.session_id, peer.block_id, "--json"]);
  if (view.session_id !== peer.session_id || view.block?.block_id !== peer.block_id || view.block.host_id !== peer.host_id) {
    throw new Error("Rex pane membership or host does not match.");
  }
  const processes = await rex(pi, peer.endpoint, ["block", "call", "-s", peer.session_id, "-b", peer.block_id, "process"]);
  // deliberate: only a directly foreground Pi is supported; wrappers and background Pi need explicit ancestry validation.
  if (processes.foreground?.pid !== process.pid || processes.foreground.user_id !== process.getuid?.()
    || realpathSync(processes.foreground.cwd) !== realpathSync(cwd)
    || realpathSync(processes.foreground.path) !== realpathSync(process.execPath)) {
    throw new Error(`This Pi is not the verified foreground process of the invoking pane (expected PID ${process.pid}, executable ${process.execPath}, cwd ${cwd}; observed PID ${processes.foreground?.pid}, UID ${processes.foreground?.user_id}, executable ${processes.foreground?.path}, cwd ${processes.foreground?.cwd}).`);
  }
}

function sameServer(before: Identity, after: Identity): boolean {
  return before.endpoint === after.endpoint && before.instance_id === after.instance_id && before.host_id === after.host_id
    && before.pid === after.pid && before.session_id === after.session_id && before.block_id === after.block_id;
}

function atomicJson(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  renameSync(temporary, path);
}

function attemptRoot(): string { return join(realpathSync(getAgentDir()), "rex-fork-attempts"); }

function privateDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error("Fork metadata directory is not private.");
}

function readPrivate(path: string): any {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 16384) throw new Error("Fork metadata file is not private or bounded.");
  return JSON.parse(readFileSync(path, "utf8"));
}

function launcher(): string[] {
  const script = realpathSync(process.argv[1] ?? "");
  const bundled = script.endsWith("/dist/bundle/cli.js");
  const packageFile = join(dirname(script), "..", ...(bundled ? [".."] : []), "package.json");
  const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
  if ((!bundled && !script.endsWith("/dist/cli.js")) || pkg.name !== "@earendil-works/pi-coding-agent") throw new Error("Unsupported Pi launcher; use the installed Pi CLI.");
  // deliberate: reject extra source launch flags rather than replay configuration or prompts; add explicit supported flags separately.
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === "--session")) throw new Error("Custom Pi launch arguments are unsupported.");
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
  const attempt: Attempt = readPrivate(join(directory, "attempt.json"));
  if (ctx.mode !== "tui" || attempt.nonce !== directory.slice(root.length + 1) || !isAbsolute(attempt.snapshot)
    || ctx.sessionManager.getSessionFile() !== attempt.snapshot || ctx.sessionManager.getSessionId() !== attempt.snapshotId
    || ctx.cwd !== attempt.cwd || ctx.sessionManager.getCwd() !== attempt.cwd) throw new Error("Fork destination does not match the requested snapshot and cwd.");
  const endpoint = localEndpoint();
  const peer = await identity(pi, endpoint);
  if (endpoint !== attempt.endpoint || peer.instance_id !== attempt.instance || peer.host_id !== attempt.host
    || peer.session_id !== attempt.session || peer.block_id === attempt.sourceBlock) throw new Error("Fork destination Rex identity changed.");
  if (!current()) throw new Error("Destination lifecycle changed before startup verification.");
  await inspectOwnPane(pi, peer, ctx.cwd);
  if (!current() || ctx.sessionManager.getSessionFile() !== attempt.snapshot || ctx.sessionManager.getSessionId() !== attempt.snapshotId) throw new Error("Destination lifecycle changed before receipt publication.");
  atomicJson(join(directory, "receipt.json"), { ...attempt, block: peer.block_id, pid: process.pid });
}

export async function runTabFork(api: ExtensionAPI, ctx: ExtensionContext, current: () => boolean, settled: () => boolean): Promise<void> {
  let deadline = Infinity;
  const pi: ExtensionAPI = { ...api, exec: async (command, args, options) => {
    const remaining = deadline - Date.now();
    if (!current() || remaining <= 0) throw new Error("Source lifecycle changed or startup verification expired.");
    const result = await api.exec(command, args, { ...options, timeout: Math.max(1, Math.min(options?.timeout ?? 7000, 7000, remaining)) });
    if (!current() || Date.now() >= deadline) throw new Error("Source lifecycle changed or startup verification expired.");
    return result;
  } };
  const endpoint = localEndpoint();
  const peer = await identity(pi, endpoint);
  if (peer.session_id !== process.env.REX_SESSION || peer.block_id !== process.env.REX_BLOCK) throw new Error("Inherited Rex IDs do not match the invoking pane.");
  await inspectOwnPane(pi, peer, ctx.cwd);
  const command = launcher();
  if (realpathSync(ctx.cwd) !== realpathSync(ctx.sessionManager.getCwd())) throw new Error("Source cwd does not match the session cwd.");
  const rechecked = await identity(pi, endpoint);
  await inspectOwnPane(pi, rechecked, ctx.cwd);
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
    atomicJson(join(directory, "attempt.json"), attempt);
  } catch (error) {
    ctx.ui.notify(`Rex fork snapshot preparation failed; no creation was requested. Snapshot ${snapshot.path} remains available for inspection. ${String(error)}`, "error");
    return;
  }
  let submitted = false;
  let created: any;
  try {
    if (!settled()) throw new Error("Source changed before tab creation.");
    submitted = true;
    created = await rex(pi, endpoint, ["api", "call", "-s", peer.session_id, "session.new_window", JSON.stringify({
      session_id: peer.session_id, focus: true,
      layout: { block: { flavor: "com.superlogical.terminal.shell", options: {
        shell: "none", login: false, cwd: ctx.cwd,
        command: ["/usr/bin/env", `PI_CODING_AGENT_DIR=${getAgentDir()}`, `PI_REX_FORK_ATTEMPT=${directory}`, ...command, "--session", snapshot.path],
      } } },
    })]);
    atomicJson(join(directory, "creation.json"), created);
    if (!idMatches("window", created.window_id) || !Array.isArray(created.block_ids) || created.block_ids.length !== 1
      || !idMatches("block", created.block_ids[0]) || created.block_ids[0] === peer.block_id) throw new Error("Rex returned an invalid tab identity.");
    deadline = Date.now() + 15000;
    while (current() && Date.now() < deadline) {
      const path = join(directory, "receipt.json");
      if (existsSync(path)) {
        const receipt = readPrivate(path);
        if (Object.entries(attempt).some(([key, value]) => receipt[key] !== value) || receipt.block !== created.block_ids[0]
          || !Number.isSafeInteger(receipt.pid) || receipt.pid === process.pid) throw new Error("Fork startup receipt does not match this attempt.");
        const after = await identity(pi, endpoint);
        if (!current() || Date.now() >= deadline || !sameServer(peer, after)) throw new Error("Source or Rex changed during startup verification.");
        const target = await rex(pi, endpoint, ["block", "inspect", "-s", peer.session_id, receipt.block, "--json"], Math.max(1, Math.min(7000, deadline - Date.now())));
        const processInfo = await rex(pi, endpoint, ["block", "call", "-s", peer.session_id, "-b", receipt.block, "process"], Math.max(1, Math.min(7000, deadline - Date.now())));
        if (!current() || Date.now() >= deadline || target.block?.window_id !== created.window_id || target.block.host_id !== peer.host_id
          || processInfo.foreground?.pid !== receipt.pid || processInfo.foreground.user_id !== process.getuid?.()
          || realpathSync(processInfo.foreground.cwd) !== realpathSync(ctx.cwd) || realpathSync(processInfo.foreground.path) !== realpathSync(process.execPath)) throw new Error("Destination process identity did not verify.");
        for (const name of ["attempt.json", "creation.json", "receipt.json"]) unlinkSync(join(directory, name));
        rmdirSync(directory);
        ctx.ui.notify(`Opened an independent conversation in Rex tab ${created.window_id}.`, "info");
        return;
      }
      await sleep(Math.min(250, Math.max(1, deadline - Date.now())));
    }
    throw new Error(current() ? "Startup verification timed out." : "Source lifecycle changed during startup verification.");
  } catch (error) {
    atomicJson(join(directory, "failure.json"), { state: submitted ? "created_unverified" : "snapshot_failed", created, error: String(error) });
    ctx.ui.notify(`Rex fork ${submitted ? "created/unverified (creation may have occurred)" : "stopped before creation"}: ${String(error)} Inspect ${directory} and snapshot ${snapshot.path}${created?.block_ids ? `; Rex blocks ${JSON.stringify(created.block_ids)}` : ""}. No retry or cleanup was attempted.`, "error");
  }
}
