import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, readdirSync, writeFileSync, mkdirSync, symlinkSync, existsSync, realpathSync, chmodSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { SessionManager } = await jiti.import("@earendil-works/pi-coding-agent");
const { CombinedAutocompleteProvider, Editor } = await jiti.import("@earendil-works/pi-tui");
const { snapshotBranch } = await jiti.import("./_fork.ts");
const { default: register } = await jiti.import("./index.ts");

test("tab snapshot preserves the source and excludes its abandoned branch", () => {
  const root = mkdtempSync(join(tmpdir(), "rex-fork-test-"));
  try {
    const source = SessionManager.create(root, root);
    source.appendMessage({ role: "user", content: "root", timestamp: Date.now() });
    const rootLeaf = source.getLeafId();
    source.appendMessage({ role: "user", content: "abandoned", timestamp: Date.now() });
    source.branch(rootLeaf);
    source.appendModelChange("test", "test-model");
    source.appendMessage({ role: "user", content: "active", timestamp: Date.now() });
    source.appendCompaction("summary", rootLeaf, 100);
    const file = source.getSessionFile();
    const bytes = readFileSync(file);
    const id = source.getSessionId();
    const leaf = source.getLeafId();
    const snapshot = snapshotBranch(source, root);
    const copy = SessionManager.open(snapshot.path);
    assert.notEqual(copy.getSessionId(), id);
    assert.notEqual(snapshot.path, file);
    assert.equal(copy.getHeader().parentSession, file);
    assert.equal(copy.getCwd(), root);
    assert.equal(JSON.stringify(copy.getBranch()), JSON.stringify(source.getBranch()));
    assert.equal(copy.getEntries().some(e => e.type === "message" && e.message.content === "abandoned"), false);
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(source.getSessionId(), id);
    assert.equal(source.getLeafId(), leaf);
    const forkBytes = readFileSync(snapshot.path);
    source.appendMessage({ role: "user", content: "later", timestamp: Date.now() });
    assert.deepEqual(readFileSync(snapshot.path), forkBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function extension(exec = async () => { throw new Error("Unexpected external call"); }) {
  const commands = new Map();
  const events = new Map();
  const notifications = [];
  register({ registerCommand: (name, command) => commands.set(name, command), on: (name, handler) => events.set(name, handler), exec });
  const ctx = { mode: "tui", isIdle: () => true, hasPendingMessages: () => false,
    sessionManager: { getSessionFile: () => undefined, getSessionId: () => "source", getLeafId: () => null },
    ui: { notify: (message, level) => notifications.push({ message, level }) } };
  return { command: commands.get("rex-fork"), events, notifications, ctx };
}

test("command refuses invalid arguments, busy work, queued messages, prompts, and non-TUI mode", async () => {
  const app = extension();
  for (const args of ["", "unknown", "tab extra"]) await app.command.handler(args, app.ctx);
  for (const change of [{ mode: "rpc" }, { isIdle: () => false }, { hasPendingMessages: () => true }]) {
    await app.command.handler("tab", { ...app.ctx, ...change });
  }
  app.events.get("ui_prompt_start")();
  await app.command.handler("tab", app.ctx);
  assert.equal(app.notifications.length, 7);
  assert.equal(app.notifications.every(n => n.level === "warning"), true);
  assert.deepEqual(app.command.getArgumentCompletions("t"), [{ value: "tab", label: "tab" }]);
});

test("session startup wraps forced rex-fork completion and delegates other input", async () => {
  const app = extension();
  let wrapper;
  app.ctx.ui.addAutocompleteProvider = factory => { wrapper = factory; };
  await app.events.get("session_start")({}, { ...app.ctx, mode: "rpc" });
  assert.equal(wrapper, undefined);
  await app.events.get("session_start")({}, app.ctx);
  assert.equal(typeof wrapper, "function");
  const base = new CombinedAutocompleteProvider([{ name: "rex-fork", getArgumentCompletions: app.command.getArgumentCompletions }], process.cwd());
  const delegated = [];
  const current = {
    getSuggestions: (lines, line, col, options) => { delegated.push({ lines, line, col, options }); return base.getSuggestions(lines, line, col, options); },
    applyCompletion: base.applyCompletion.bind(base),
    shouldTriggerFileCompletion: base.shouldTriggerFileCompletion.bind(base),
  };
  const provider = wrapper(current);
  const options = { force: true, signal: new AbortController().signal };
  const complete = text => provider.getSuggestions([text], 0, text.length, options);
  const all = await complete("/rex-fork ");
  assert.deepEqual(all.items.map(item => item.value), ["tab", "right", "below"]);
  assert.deepEqual(provider.applyCompletion(["/rex-fork "], 0, 10, all.items[0], all.prefix).lines, ["/rex-fork tab"]);
  assert.deepEqual((await complete("/rex-fork b")).items.map(item => item.value), ["below"]);
  assert.deepEqual((await provider.getSuggestions(["/rex-fork r"], 0, 11, { ...options, force: false })).items.map(item => item.value), ["right"]);
  for (const text of ["/other ", "./some-path", "/rex-forked "]) {
    await complete(text);
    assert.equal(delegated.at(-1).options, options);
  }
});

test("editor Tab after rex-fork space displays destinations and inserts a selection", async () => {
  const app = extension();
  let wrap;
  app.ctx.ui.addAutocompleteProvider = factory => { wrap = factory; };
  await app.events.get("session_start")({}, app.ctx);
  const base = new CombinedAutocompleteProvider([{ name: "rex-fork", getArgumentCompletions: app.command.getArgumentCompletions }], process.cwd());
  const provider = wrap(base);
  for (const text of ["/other", "./some-path", "/rex-forked "]) {
    assert.equal(provider.shouldTriggerFileCompletion([text], 0, text.length), base.shouldTriggerFileCompletion([text], 0, text.length));
  }
  const plain = text => text;
  const editor = new Editor({ terminal: { rows: 30 }, requestRender() {} }, {
    borderColor: plain,
    selectList: { selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain },
  });
  editor.setAutocompleteProvider(provider);
  editor.setText("/rex-fork ");
  editor.handleInput("\t");
  let rendered = "";
  for (let i = 0; i < 50; i++) {
    rendered = editor.render(80).join("\n");
    if (["tab", "right", "below"].every(option => rendered.includes(option))) break;
    await sleep(10);
  }
  for (const option of ["tab", "right", "below"]) assert.ok(rendered.includes(option), `Tab did not display ${option}: ${rendered}`);
  editor.handleInput("\t");
  assert.equal(editor.getText(), "/rex-fork tab");
});

test("tab snapshot refuses absent and partially persisted conversations", () => {
  const root = mkdtempSync(join(tmpdir(), "rex-fork-test-"));
  try {
    const source = SessionManager.create(root, root);
    assert.throws(() => snapshotBranch(source, root), /persisted conversation/);
    source.appendMessage({ role: "user", content: "persisted", timestamp: Date.now() });
    const facade = { getSessionFile: () => source.getSessionFile(), getLeafId: () => "missing-leaf", getSessionDir: () => root, getSessionId: () => source.getSessionId() };
    assert.throws(() => snapshotBranch(facade, root), /fully persisted/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

async function tabFixture(run, mode = "success") {
  const root = mkdtempSync(join(tmpdir(), "rex-fork-test-"));
  const socket = join(root, "rex.sock");
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socket, resolve); });
  const savedEnv = { ...process.env };
  const savedArgv = process.argv;
  try {
    Object.assign(process.env, { REX_SERVER: `unix://${socket}`, REX_SESSION: "session:aaaa", REX_BLOCK: "block:aaaa", PI_CODING_AGENT_DIR: root });
    process.argv = [process.execPath, fileURLToPath(new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")))];
    const source = SessionManager.create(root, root);
    source.appendMessage({ role: "user", content: "persisted", timestamp: Date.now() });
    const sourceBytes = readFileSync(source.getSessionFile());
    const calls = [];
    let payload;
    const peer = { endpoint: process.env.REX_SERVER, instance_id: "instance", host_id: "host", session_id: process.env.REX_SESSION,
      block_id: process.env.REX_BLOCK, pid: process.pid, principal: { kind: "peer", transport: "unix", uid: process.getuid() } };
    const app = extension(async (program, args) => {
      calls.push([program, args]);
      if (program === "ps") return { code: 0, stdout: String(process.getuid()) };
      let value;
      if (args.includes("whoami")) {
        const inspections = calls.filter(([, args]) => args.includes("whoami")).length;
        if (mode === "overlap" && inspections === 1) await app.command.handler("tab", app.ctx);
        if (mode === "cancel-before" && inspections === 2) app.events.get("session_shutdown")();
        value = { ...peer, ...(mode === "stale" ? { block_id: "block:cccc" } : {}),
          ...(mode === "restart" && inspections === 2 ? { instance_id: "replacement" } : {}),
          ...(mode === "wrong-user" ? { principal: { ...peer.principal, uid: peer.principal.uid + 1 } } : {}),
          ...(mode === "remote" ? { principal: { ...peer.principal, transport: "tcp" } } : {}) };
        if (mode === "malformed") return { code: 0, stdout: "not JSON" };
        if (mode === "truncated") return { code: 0, stdout: JSON.stringify(value), truncated: true };
      }
      else if (args.includes("inspect")) value = { session_id: peer.session_id, block: { block_id: args.at(-2), host_id: peer.host_id, window_id: "window:bbbb" } };
      else if (args.at(-1) === "process") value = { foreground: { pid: args.includes("block:bbbb") || mode === "unrelated-process" ? process.pid + 1 : process.pid, user_id: process.getuid(), cwd: realpathSync(root), path: process.execPath } };
      else if (args.includes("session.new_window") || args.includes("session.new_split")) {
        payload = JSON.parse(args.at(-1));
        if (mode === "lost") throw new Error("lost creation reply");
        if (mode === "cancel-after") app.events.get("session_shutdown")();
        const command = payload.layout.block.options.command;
        const directory = command.find(v => v.startsWith("PI_REX_FORK_ATTEMPT=")).slice("PI_REX_FORK_ATTEMPT=".length);
        const attempt = JSON.parse(readFileSync(join(directory, "attempt.json"), "utf8"));
        if (mode !== "missing-receipt") writeFileSync(join(directory, "receipt.json"), JSON.stringify({ ...attempt, nonce: mode === "mismatch" ? "wrong" : attempt.nonce, block: "block:bbbb", pid: process.pid + 1 }), { mode: 0o600 });
        value = args.includes("session.new_split")
          ? { anchor_id: mode === "invalid-anchor" ? "block:cccc" : peer.block_id, block_ids: ["block:bbbb"], split_ids: ["split:bbbb"], revision: 1 }
          : { window_id: "window:bbbb", block_ids: mode === "malformed-creation" ? [] : ["block:bbbb"], revision: 1 };
      } else throw new Error(`Unexpected external call: ${program} ${args.join(" ")}`);
      return { code: 0, stdout: JSON.stringify(value) };
    });
    Object.assign(app.ctx, { cwd: root, sessionManager: source });
    await run({ root, source, sourceBytes, calls, app, payload: () => payload });
  } finally {
    process.argv = savedArgv;
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    await new Promise(resolve => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

test("tab registration launches one independent snapshot without a prompt and verifies its receipt", async () => {
  await tabFixture(async ({ source, sourceBytes, calls, app, payload }) => {
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.filter(([, args]) => args.includes("session.new_window")).length, 1);
    assert.deepEqual(readFileSync(source.getSessionFile()), sourceBytes);
    const request = payload();
    assert.equal(request.session_id, "session:aaaa");
    assert.equal(request.focus, true);
    assert.equal(request.layout.block.options.shell, "none");
    assert.equal(request.layout.block.options.login, false);
    const command = request.layout.block.options.command;
    assert.equal(command.at(-2), "--session");
    assert.notEqual(command.at(-1), source.getSessionFile());
    assert.equal(app.notifications.at(-1).level, "info", JSON.stringify(app.notifications));
    assert.equal(calls.some(([, args]) => args.includes("send") || args.includes("send-key")), false);
  });
});

test("source launch selectors and messages are not copied to the destination", async () => {
  const args = ["--provider", "example-provider", "--model", "example-model", "--models", "example-pattern", "--thinking", "low", "--session", "/private/session", "--session-id", "source-id", "--session-dir", "/private/sessions", "--fork", "/private/fork", "--name", "private-name", "-n", "private-short-name", "--continue", "-c", "--resume", "-r", "/source-command", "--", "-private-message"];
  await tabFixture(async ({ app, payload }) => {
    process.argv.push(...args);
    await app.command.handler("tab", app.ctx);
    assert.equal(app.notifications.at(-1).level, "info", JSON.stringify(app.notifications));
    const command = payload().layout.block.options.command;
    assert.equal(command.length, 7);
    assert.equal(command.at(-2), "--session");
    for (const value of args.filter(value => value !== "--session")) assert.equal(command.includes(value), false, value);
  });
});

for (const args of [["--extension", "private-value"], ["--tools", "private-value"], ["--config", "private-value"], ["--model=private-value"], ["--model"], ["--model", "--provider"]]) test(`source launch rejects ${args[0]} safely`, async () => {
  await tabFixture(async ({ root, app, calls }) => {
    process.argv.push(...args);
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.some(([, values]) => values.includes("session.new_window")), false);
    assert.equal(readdirSync(root).filter(file => file.endsWith(".jsonl")).length, 1);
    assert.equal(app.notifications.at(-1).level, "error");
    assert.equal(app.notifications.at(-1).message.includes("private-value"), false);
  });
});

for (const [destination, direction] of [["right", "horizontal"], ["below", "vertical"]]) test(`${destination} split anchors to the invoking pane and verifies startup`, async () => {
  await tabFixture(async ({ source, sourceBytes, calls, app, payload }) => {
    await app.command.handler(destination, app.ctx);
    assert.equal(calls.filter(([, args]) => args.includes("session.new_split")).length, 1);
    assert.equal(calls.some(([, args]) => args.includes("session.new_window")), false);
    const request = payload();
    assert.equal(request.anchor_id, "block:aaaa");
    assert.equal(request.direction, direction);
    assert.equal(request.side, "after");
    assert.equal(request.focus, true);
    assert.equal(request.layout.block.options.command.at(-2), "--session");
    assert.deepEqual(readFileSync(source.getSessionFile()), sourceBytes);
    assert.equal(app.notifications.at(-1).level, "info", JSON.stringify(app.notifications));
  });
});

for (const mode of ["lost", "invalid-anchor"]) test(`right split ${mode} remains uncertain without retry or cleanup`, async () => {
  await tabFixture(async ({ app, calls }) => {
    await app.command.handler("right", app.ctx);
    assert.equal(calls.filter(([, args]) => args.includes("session.new_split")).length, 1);
    assert.equal(calls.some(([, args]) => args.includes("session.new_window") || args.includes("close") || args.includes("kill")), false);
    assert.match(app.notifications.at(-1).message, /created\/unverified/);
  }, mode);
});

for (const mode of ["lost", "mismatch", "cancel-after", "malformed-creation"]) test(`tab ${mode} creation remains uncertain without retry or resource cleanup`, async () => {
  await tabFixture(async ({ root, app, calls }) => {
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.filter(([, args]) => args.includes("session.new_window")).length, 1);
    assert.match(app.notifications.at(-1).message, /created\/unverified/);
    assert.equal(app.notifications.at(-1).level, "error");
    const attempt = join(root, "rex-fork-attempts", readdirSync(join(root, "rex-fork-attempts"))[0]);
    assert.equal(JSON.parse(readFileSync(join(attempt, "failure.json"))).state, "created_unverified");
    assert.equal(calls.some(([, args]) => args.includes("close") || args.includes("kill")), false);
  }, mode);
});

for (const mode of ["wrong-user", "stale", "remote", "unrelated-process", "restart", "cancel-before", "malformed", "truncated"]) test(`tab refuses ${mode} before snapshot and creation`, async () => {
  await tabFixture(async ({ root, app, calls, source, sourceBytes }) => {
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.some(([, args]) => args.includes("session.new_window")), false);
    assert.equal(readdirSync(root).filter(file => file.endsWith(".jsonl")).length, 1);
    assert.deepEqual(readFileSync(source.getSessionFile()), sourceBytes);
    assert.equal(app.notifications.at(-1).level, "error");
    if (mode === "cancel-before") assert.equal(calls.at(-1)[1].includes("whoami"), true);
  }, mode);
});

test("tab missing receipt expires without retry or verified success", async () => {
  await tabFixture(async ({ app, calls }) => {
    const now = Date.now;
    let clock = now();
    Date.now = () => { clock += 5000; return clock; };
    try { await app.command.handler("tab", app.ctx); } finally { Date.now = now; }
    assert.equal(calls.filter(([, args]) => args.includes("session.new_window")).length, 1);
    assert.match(app.notifications.at(-1).message, /created\/unverified/);
    assert.match(app.notifications.at(-1).message, /timed out|expired/);
  }, "missing-receipt");
});

test("tab attempt metadata IO failure reports the retained snapshot without creation", async () => {
  await tabFixture(async ({ root, app, calls }) => {
    writeFileSync(join(root, "rex-fork-attempts"), "not a directory");
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.some(([, args]) => args.includes("session.new_window")), false);
    assert.equal(readdirSync(root).filter(file => file.endsWith(".jsonl")).length, 2);
    assert.match(app.notifications.at(-1).message, /snapshot preparation failed/i);
    assert.match(app.notifications.at(-1).message, /Snapshot .*\.jsonl/);
  });
});

test("tab snapshot IO failure does not submit creation", { skip: process.getuid?.() === 0 }, async () => {
  await tabFixture(async ({ root, app, calls }) => {
    chmodSync(root, 0o500);
    try { await app.command.handler("tab", app.ctx); } finally { chmodSync(root, 0o700); }
    assert.equal(calls.some(([, args]) => args.includes("session.new_window")), false);
    assert.equal(readdirSync(root).filter(file => file.endsWith(".jsonl")).length, 1);
    assert.match(app.notifications.at(-1).message, /EACCES/);
  });
});

for (const mode of ["missing-endpoint", "tcp-endpoint", "launcher-flags"]) test(`tab refuses ${mode} without creation`, async () => {
  await tabFixture(async ({ app, calls }) => {
    if (mode === "missing-endpoint") delete process.env.REX_SERVER;
    if (mode === "tcp-endpoint") process.env.REX_SERVER = "http://127.0.0.1:1";
    if (mode === "launcher-flags") process.argv.push("--extension", "unsupported.ts");
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.some(([, args]) => args.includes("session.new_window")), false);
    assert.equal(app.notifications.at(-1).level, "error");
  });
});

test("tab serializes overlapping commands without queueing a second fork", async () => {
  await tabFixture(async ({ app, calls }) => {
    await app.command.handler("tab", app.ctx);
    assert.equal(calls.filter(([, args]) => args.includes("session.new_window")).length, 1);
    assert.equal(app.notifications[0].level, "warning");
    assert.equal(app.notifications.at(-1).level, "info");
  }, "overlap");
});

for (const destination of ["tab", "right", "below"]) test(`${destination} isolated Rex/Pi startup has no launch-generated turns`, { skip: process.env.PI_REX_FORK_SMOKE !== "1", timeout: 60000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "rxf-"));
  const endpoint = `unix://${join(root, "rex.sock")}`;
  assert.notEqual(endpoint, process.env.REX_SERVER);
  const env = { HOME: root, PATH: process.env.PATH, TERM: "xterm-256color", TMPDIR: root, REX_SERVER: endpoint, PI_CODING_AGENT_DIR: join(root, "agent"), PI_OFFLINE: "1" };
  const run = promisify(execFile);
  const rex = async (...args) => (await run("rex", ["--autostart=false", "--timeout", "5s", "--server", endpoint, ...args], { env, timeout: 7000, maxBuffer: 1024 * 1024, signal: t.signal })).stdout;
  const json = async (...args) => JSON.parse(await rex(...args));
  const waitFor = async (check, limit) => {
    const deadline = Date.now() + limit;
    let last;
    while (Date.now() < deadline) {
      if (t.signal.aborted) throw new Error("Isolated smoke test cancelled.");
      try { const value = await check(); if (value) return value; } catch (error) { last = error; }
      await sleep(250);
    }
    throw new Error(`Isolated startup deadline expired: ${String(last ?? "condition not met")}`);
  };
  let server;
  let serverLog = "";
  let lastScreen = "";
  let testSession;
  let sourceBlock;
  try {
    mkdirSync(env.PI_CODING_AGENT_DIR, { mode: 0o700 });
    mkdirSync(join(env.PI_CODING_AGENT_DIR, "extensions"));
    symlinkSync(fileURLToPath(new URL(".", import.meta.url)), join(env.PI_CODING_AGENT_DIR, "extensions", "rex-fork"));
    writeFileSync(join(env.PI_CODING_AGENT_DIR, "extensions", "startup-proof.ts"), `import { appendFileSync } from "node:fs";
export default function(pi) {
  pi.registerCommand("startup-proof", { description: "Record startup command", handler: async () => {
    appendFileSync(${JSON.stringify(join(root, "initial-command.jsonl"))}, JSON.stringify({pid:process.pid}) + "\\n", {mode: 0o600});
  }});
  for (const event of ["agent_start", "before_provider_request"]) pi.on(event, () => {
    appendFileSync(${JSON.stringify(join(root, "model-events.jsonl"))}, JSON.stringify({event, pid:process.pid}) + "\\n", {mode: 0o600});
  });
  pi.on("session_start", (_event, ctx) => {
    appendFileSync(${JSON.stringify(join(root, "startup.jsonl"))}, JSON.stringify({mode:ctx.mode, pid:process.pid, commands:pi.getCommands().map(command => command.name)}) + "\\n", {mode: 0o600});
  });
}`);
    writeFileSync(join(env.PI_CODING_AGENT_DIR, "settings.json"), JSON.stringify({ packages: [], quietStartup: true }), { mode: 0o600 });
    const config = join(root, "init.lua");
    writeFileSync(config, "");
    const cwd = join(root, "work");
    mkdirSync(cwd);
    const source = SessionManager.create(cwd, join(root, "sessions"));
    source.appendMessage({ role: "user", content: "rex-fork-smoke-source", timestamp: Date.now() });
    source.appendThinkingLevelChange("off");
    const original = readFileSync(source.getSessionFile());
    server = spawn("rex", ["server", "run", "--listen", endpoint, "--state-dir", join(root, "state"), "--config", config], { env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout.on("data", chunk => { if (serverLog.length < 65536) serverLog += chunk; });
    server.stderr.on("data", chunk => { if (serverLog.length < 65536) serverLog += chunk; });
    await waitFor(() => json("api", "call", "server.status"), 7000);
    const pi = (await run("which", ["pi"], { timeout: 7000 })).stdout.trim();
    const created = await json("new", "rex-fork-test", "--shell=none", "-c", cwd, "--json", "--", pi, "--provider", "anthropic", "--model", "claude-sonnet-4-5", "--thinking", "off", "--session", source.getSessionFile(), "/startup-proof");
    const session = created.session_id;
    testSession = session;
    const block = created.initial_windows[0].block_ids[0];
    sourceBlock = block;
    await waitFor(async () => (await rex("capture", "-s", session, "-b", block, "--trim")).includes("rex-fork-smoke-source"), 12000);
    await sleep(2000);
    const registration = JSON.parse(readFileSync(join(root, "startup.jsonl"), "utf8").trim());
    await waitFor(() => existsSync(join(root, "initial-command.jsonl")), 7000);
    assert.equal(JSON.parse(readFileSync(join(root, "initial-command.jsonl"), "utf8").trim()).pid, registration.pid);
    assert.equal(registration.mode, "tui");
    assert.equal(registration.commands.includes("rex-fork"), true);
    const baseline = await json("session", "inspect", session, "--json");
    assert.equal(baseline.windows.length, 1);
    assert.deepEqual(readFileSync(source.getSessionFile()), original);
    if (destination !== "tab") {
      await json("window", "new", "-s", session, "other", "--shell=none", "--json", "--", "/bin/sleep", "60");
      const otherFocused = await json("session", "inspect", session, "--json");
      assert.notEqual(otherFocused.active_window_id, baseline.active_window_id);
    }
    await rex("send", "-s", session, "-b", block, `/rex-fork ${destination}`);
    await sleep(250);
    // Enter accepts argument completion without submission, so dismiss completion first.
    await rex("send-key", "-s", session, "-b", block, "--action", "press", "escape");
    await rex("send-key", "-s", session, "-b", block, "--action", "press", "enter");
    const view = await waitFor(async () => {
      const current = await json("session", "inspect", session, "--json");
      if (destination === "tab" && current.windows.length === 2) return current;
      if (destination !== "tab") {
        const sourceWindow = current.windows.find(window => window.window_id === baseline.active_window_id);
        if (sourceWindow?.layers[0].blocks.length === 2) return current;
      }
      const screen = await rex("capture", "-s", session, "-b", block, "--trim");
      lastScreen = screen;
      if (/Rex fork refused|Extension issues/.test(screen)) throw new Error(screen);
      return false;
    }, 18000);
    assert.equal(view.windows.length, 2);
    if (destination === "tab") {
      assert.notEqual(view.active_window_id, baseline.active_window_id);
    } else {
      assert.equal(view.active_window_id, baseline.active_window_id);
      const sourceWindow = view.windows.find(window => window.window_id === baseline.active_window_id);
      const split = sourceWindow.layers[0].layout.split;
      assert.equal(split.direction, destination === "right" ? "horizontal" : "vertical");
      assert.equal(split.before.block_id, block);
      assert.notEqual(split.after.block_id, block);
      assert.equal(sourceWindow.focused_block_id, split.after.block_id);
    }
    const attempts = join(env.PI_CODING_AGENT_DIR, "rex-fork-attempts");
    await waitFor(async () => {
      const screen = await rex("capture", "-s", session, "-b", block, "--trim");
      if (screen.includes("created/unverified") || screen.includes("Rex fork refused")) throw new Error(screen);
      return screen.includes("Opened an independent conversation") && existsSync(attempts) && readdirSync(attempts).length === 0;
    }, 18000);
    await sleep(2000);
    assert.deepEqual(readFileSync(source.getSessionFile()), original);
    const files = readdirSync(join(root, "sessions")).filter(file => file.endsWith(".jsonl"));
    assert.equal(files.length, 2);
    const forkFile = files.map(file => join(root, "sessions", file)).find(file => file !== source.getSessionFile());
    const copy = SessionManager.open(forkFile);
    assert.notEqual(copy.getSessionId(), source.getSessionId());
    assert.equal(copy.getCwd(), cwd);
    assert.equal(copy.getEntries().filter(entry => entry.type === "message").length, 1);
    const registrations = readFileSync(join(root, "startup.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(registrations.length, 2);
    assert.notEqual(registrations[0].pid, registrations[1].pid);
    assert.equal(readFileSync(join(root, "initial-command.jsonl"), "utf8").trim().split("\n").length, 1);
    assert.equal(existsSync(join(root, "model-events.jsonl")), false);
  } catch (error) {
    if (testSession) {
      try {
        const blocks = await json("block", "ls", "-s", testSession, "--json");
        lastScreen += `\nBlocks: ${JSON.stringify(blocks)}`;
        for (const block of Array.isArray(blocks) ? blocks : blocks.blocks ?? []) {
          if (block.block_id && block.block_id !== sourceBlock) lastScreen += `\nDestination: ${await rex("capture", "-s", testSession, "-b", block.block_id, "--trim")}`;
        }
      } catch (inspectionError) { lastScreen += `\nInspection failed: ${String(inspectionError)}`; }
    }
    const probe = join(root, "startup.jsonl");
    throw new Error(`${String(error)}\nStartup registrations:\n${existsSync(probe) ? readFileSync(probe, "utf8") : "not started"}\nLast source screen:\n${lastScreen}\nIsolated server log:\n${serverLog}`, { cause: error });
  } finally {
    if (server) {
      try { await rex("server", "stop"); } catch { server.kill("SIGTERM"); }
      if (server.exitCode === null) await Promise.race([new Promise(resolve => server.once("exit", resolve)), sleep(2000)]);
      if (server.exitCode === null) { server.kill("SIGKILL"); await new Promise(resolve => server.once("exit", resolve)); }
    }
    rmSync(root, { recursive: true, force: true });
  }
});
