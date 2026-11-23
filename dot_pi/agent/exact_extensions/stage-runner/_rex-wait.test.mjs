import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

// Opt in with PI_STAGE_RUNNER_REX_SMOKE=1. Do not use the operator's Rex server.
test("Rex wait reports exit evidence for a retained terminal block", {
  skip: process.env.PI_STAGE_RUNNER_REX_SMOKE !== "1",
  timeout: 20000,
}, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "rex-wait-"));
  const endpoint = `unix://${root}/rex.sock`;
  const config = join(root, "init.lua");
  writeFileSync(config, "");
  const env = { PATH: process.env.PATH, HOME: root, XDG_CONFIG_HOME: root, XDG_STATE_HOME: root };
  const server = spawn("rex", ["server", "run", "--listen", endpoint, "--state-dir", join(root, "state"), "--config", config], { env, stdio: "ignore" });
  const serverClosed = once(server, "close");
  t.after(async () => {
    server.kill("SIGTERM");
    const watchdog = setTimeout(() => server.kill("SIGKILL"), 1000);
    try { await serverClosed; }
    finally { clearTimeout(watchdog); rmSync(root, { recursive: true, force: true }); }
  });

  const args = ["--server", endpoint, "--autostart=false", "--timeout=1s"];
  const rex = (...command) => spawnSync("rex", [...args, ...command], { env, encoding: "utf8", timeout: 3000 });
  const ok = (result) => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  for (let attempt = 0; ; attempt++) {
    const ready = rex("whoami", "--json");
    if (ready.status === 0) break;
    if (attempt === 20) ok(ready);
    await delay(50);
  }
  const session = ok(rex("new", "wait-probe", "--json", "--shell=none", "-c", root, "--", "/bin/sleep", "30"));
  const scope = ["-s", session.session_id];
  const anchor = session.initial_windows[0].block_ids[0];
  const split = (...command) => ok(rex("split", ...scope, "-b", anchor, "-c", root, "--focus=false", "--keep-open", "--shell=none", "--json", "--", ...command)).block_ids[0];
  const inspect = (block) => ok(rex("block", "call", ...scope, "-b", block, "process"));
  const waitArgs = (block) => ["wait", ...scope, "--json", "--for=2s", block];

  await t.test("wait recovers a child exit that happened before subscription", async () => {
    const block = split("/bin/sh", "-c", "exit 1");
    let exit;
    for (let attempt = 0; attempt < 20 && !exit; attempt++) {
      exit = inspect(block).last_exit;
      if (!exit) await delay(50);
    }
    assert.equal(exit?.exit_code, 1);
    const result = rex(...waitArgs(block));
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).exit_code, 1);
  });

  await t.test("closing a pane does not give wait a child exit record", async () => {
    const block = split("/bin/sleep", "20");
    const waiter = spawn("rex", [...args, ...waitArgs(block)], { env, stdio: ["ignore", "pipe", "pipe"] });
    const closed = once(waiter, "close");
    let output = "", error = "";
    waiter.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    waiter.stderr.setEncoding("utf8").on("data", (chunk) => { error += chunk; });
    const result = rex("block", "close", ...scope, block);
    const [status] = await closed;
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    // The close can win the subscription race. Neither response is exit evidence.
    if (output.trim()) {
      assert.equal(status, 1, error);
      assert.deepEqual(JSON.parse(output), { block_id: block });
    } else {
      assert.equal(status, 3, error);
      assert.match(error, /not found/);
    }
  });

  await t.test("interrupting the waiter leaves the terminal child running", async () => {
    const block = split("/bin/sleep", "20");
    const waiter = spawn("rex", [...args, ...waitArgs(block)], { env, stdio: "ignore" });
    const closed = once(waiter, "close");
    const before = inspect(block);
    waiter.kill("SIGTERM");
    await closed;
    const after = inspect(block);
    assert.ok(before.child?.pid > 1);
    assert.equal(after.child?.pid, before.child.pid);
    assert.equal(after.last_exit ?? null, null);
  });
});
