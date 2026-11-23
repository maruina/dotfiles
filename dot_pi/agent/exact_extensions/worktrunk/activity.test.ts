import { strict as assert } from "node:assert";
import { execFile, execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter, once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import worktrunkActivity from "./index.ts";

const exec = promisify(execFile);
type Handler = (event: unknown, context: { cwd: string }) => Promise<void>;

function session() {
  const handlers = new Map<string, Handler>();
  const calls: Array<{ command: string; args: string[]; cwd: string; timeout?: number }> = [];
  worktrunkActivity({
    on(event: string, handler: Handler) { handlers.set(event, handler); },
    async exec(command: string, args: string[], options: { cwd: string; timeout?: number }) {
      calls.push({ command, args, ...options });
      return exec(command, args, { cwd: options.cwd, timeout: options.timeout });
    },
  } as unknown as ExtensionAPI);
  return { calls, async emit(event: string, cwd: string) {
    const handler = handlers.get(event);
    assert.ok(handler, `missing ${event} handler`);
    await handler({}, { cwd });
  } };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
}

function marker(cwd: string): string | undefined {
  try {
    return JSON.parse(git(cwd, "config", "--local", "--get", "worktrunk.state.fixture.marker")).marker;
  } catch {
    return undefined;
  }
}

test("events set and clear the branch marker; sessions share it", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "worktrunk-activity-"));
  try {
    git(cwd, "init", "--quiet", "--initial-branch=fixture");
    const first = session();
    const second = session();
    await first.emit("agent_start", cwd);
    assert.equal(marker(cwd), "🤖");
    await first.emit("agent_settled", cwd);
    assert.equal(marker(cwd), "💬");
    await second.emit("agent_start", cwd);
    assert.equal(marker(cwd), "🤖");
    await first.emit("session_shutdown", cwd);
    assert.equal(marker(cwd), undefined);
    assert.deepEqual(first.calls.map(({ args }) => args), [
      ["config", "state", "marker", "set", "🤖"],
      ["config", "state", "marker", "set", "💬"],
      ["config", "state", "marker", "clear"],
    ]);
    assert.ok(first.calls.every(({ timeout }) => timeout === 5000));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("stage-runner children do not overwrite the parent branch marker", async () => {
  const prior = process.env.PI_STAGE_RUNNER_CHILD;
  process.env.PI_STAGE_RUNNER_CHILD = "1";
  try {
    const current = session();
    for (const event of ["agent_start", "agent_settled", "session_shutdown"]) await current.emit(event, tmpdir());
    assert.equal(current.calls.length, 0);
  } finally {
    if (prior === undefined) delete process.env.PI_STAGE_RUNNER_CHILD;
    else process.env.PI_STAGE_RUNNER_CHILD = prior;
  }
});

test("missing Worktrunk binary does not reject event handlers", async () => {
  const prior = process.env.WORKTRUNK_BIN;
  process.env.WORKTRUNK_BIN = join(tmpdir(), "nonexistent-worktrunk-activity-binary");
  try {
    const current = session();
    for (const event of ["agent_start", "agent_settled", "session_shutdown"]) await current.emit(event, tmpdir());
    assert.equal(current.calls.length, 3);
  } finally {
    if (prior === undefined) delete process.env.WORKTRUNK_BIN;
    else process.env.WORKTRUNK_BIN = prior;
  }
});

for (const missingBinary of [false, true]) test(`Pi RPC remains usable ${missingBinary ? "without Worktrunk" : "with real markers"}`, { timeout: 30_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "worktrunk-rpc-"));
  const cwd = join(root, "repo");
  const agent = join(root, "agent");
  const release = join(root, "release");
  mkdirSync(cwd);
  mkdirSync(agent);
  git(cwd, "init", "--quiet", "--initial-branch=fixture");
  const here = dirname(fileURLToPath(import.meta.url));
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: root, PI_CODING_AGENT_DIR: agent, WORKTRUNK_FIXTURE_RELEASE: release, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
  if (missingBinary) env.WORKTRUNK_BIN = join(root, "missing-wt");
  else delete env.WORKTRUNK_BIN;
  const child = spawn("pi", ["--mode", "rpc", "--no-session", "--no-context-files", "--no-extensions", "-e", join(here, "index.ts"), "-e", join(here, "rpc-provider.ts"), "--provider", "worktrunk-fixture", "--model", "fixture"], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const events = new EventEmitter();
  const records: Array<Record<string, unknown>> = [];
  let buffer = "";
  let stderr = "";
  let exited = false;
  child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-16_384); });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      try { records.push(JSON.parse(line)); } catch { /* reported by the event deadline */ }
      events.emit("change");
    }
  });
  child.on("close", () => { exited = true; events.emit("change"); });
  child.on("error", (error) => { stderr += error.message; events.emit("change"); });
  async function waitFor(type: string) {
    const deadline = Date.now() + 15_000;
    while (!records.some((record) => record.type === type)) {
      if (exited || Date.now() >= deadline) throw new Error(`Pi did not emit ${type}: ${stderr}`);
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); events.off("change", done); resolve(); };
        const timer = setTimeout(done, 100);
        events.once("change", done);
      });
    }
  }
  try {
    child.stdin.write(`${JSON.stringify({ id: "prompt", type: "prompt", message: "fixture" })}\n`);
    await waitFor("agent_start");
    assert.equal(marker(cwd), missingBinary ? undefined : "🤖");
    writeFileSync(release, "continue");
    await waitFor("agent_settled");
    assert.ok(JSON.stringify(records).includes("fixture complete"), `mock model did not complete: ${stderr}`);
    assert.equal(marker(cwd), missingBinary ? undefined : "💬");
    const closed = once(child, "close");
    child.stdin.end();
    const [code] = await closed;
    assert.equal(code, 0, stderr);
    assert.equal(marker(cwd), undefined);
  } finally {
    if (!exited) {
      const closed = once(child, "close");
      child.kill("SIGKILL");
      await closed;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("a hung marker command is bounded", { timeout: 10_000 }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "worktrunk-hung-"));
  const prior = process.env.WORKTRUNK_BIN;
  const binary = join(cwd, "wt");
  writeFileSync(binary, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`);
  chmodSync(binary, 0o755);
  process.env.WORKTRUNK_BIN = binary;
  try {
    const current = session();
    await current.emit("agent_start", cwd);
    assert.equal(current.calls[0].timeout, 5000);
  } finally {
    if (prior === undefined) delete process.env.WORKTRUNK_BIN;
    else process.env.WORKTRUNK_BIN = prior;
    rmSync(cwd, { recursive: true, force: true });
  }
});
