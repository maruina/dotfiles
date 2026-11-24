import assert from "node:assert/strict";
import test from "node:test";
import { queryPrStatus } from "./github.ts";
import { createPrStatusExtension } from "./index.ts";

const cwd = "/repo";
const branch = "maruina/fix-foo";
const remote = "git@github.com:ddoghq/compute.git";
const url = "https://github.com/ddoghq/compute/pull/42";
const baseEnv = { PATH: "/usr/bin", GH_TOKEN: "ambient", GITHUB_TOKEN: "also-ambient" };
const cleanEnv = { PATH: "/usr/bin", GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" };
const link = (text) => `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
const pr = {
  number: 42, title: "Fix foo", url, state: "OPEN", isDraft: false,
  headRepository: { nameWithOwner: "ddoghq/compute" },
};

function response(nodes, login = "matteo-ruina_ddog") {
  return JSON.stringify({ data: { viewer: { login }, repository: { pullRequests: { nodes } } } });
}

function query(run, profile = "personal") {
  return queryPrStatus(remote, branch, profile, run, { cwd, baseEnv });
}

test("work query routes auth in the environment and checks the returned viewer", async () => {
  for (const login of ["matteo-ruina_ddog", "other"]) {
    const calls = [];
    const status = query(async (...args) => {
      calls.push(args);
      return args[1][0] === "auth" ? "test-token" : response([pr], login);
    }, "work");
    if (login === "other") await assert.rejects(status, /^Error: Cannot read PR status$/);
    else assert.equal(await status, `[open] ${link("#42 Fix foo")}\t`);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], ["gh", ["auth", "token", "--hostname", "github.com", "--user", "matteo-ruina_ddog"], cwd, 10000, cleanEnv]);
    const [command, args, actualCwd, timeout, env] = calls[1];
    assert.equal(command, "gh");
    assert.deepEqual(args.slice(0, 2), ["api", "graphql"]);
    assert.ok(args.includes("owner=ddoghq") && args.includes("repo=compute") && args.includes(`headRef=${branch}`));
    const graphql = args.find((arg) => arg.startsWith("query="));
    assert.match(graphql, /viewer\s*\{\s*login\s*\}/);
    assert.match(graphql, /headRefName: \$headRef, states: \[OPEN, MERGED, CLOSED\], first: 5/);
    assert.ok(args.every((arg) => !arg.includes("test-token")));
    assert.equal(actualCwd, cwd);
    assert.equal(timeout, 10000);
    assert.deepEqual(env, { ...cleanEnv, GH_TOKEN: "test-token" });
  }
});

test("work query does not fall back to ambient auth when token lookup fails", async () => {
  const calls = [];
  await assert.rejects(query(async (_command, args) => { calls.push(args[0]); return null; }, "work"), /^Error: Cannot read PR status$/);
  assert.deepEqual(calls, ["auth"]);
});

test("personal query uses one request and selects matching PRs, preferring an open PR", async () => {
  const fork = { ...pr, headRepository: { nameWithOwner: "fork/compute" } };
  const closed = { ...pr, state: "CLOSED" };
  const merged = { ...pr, state: "MERGED" };
  const draft = { ...pr, isDraft: true };
  for (const [nodes, state] of [
    [[fork, closed, draft], "draft"], [[merged, pr], "open"], [[merged, closed], "merged"],
    [[closed, merged], "closed"], [[fork], undefined], [[], undefined],
  ]) {
    let calls = 0;
    const status = await query(async (command, args, _cwd, _timeout, env) => {
      calls++;
      assert.equal(command, "gh");
      assert.deepEqual(args.slice(0, 2), ["api", "graphql"]);
      assert.deepEqual(env, cleanEnv);
      return response(nodes, "personal-login");
    });
    assert.equal(calls, 1);
    assert.equal(status, state ? `[${state}] ${link("#42 Fix foo")}\t` : undefined);
  }
});

test("query strips terminal controls and only links a valid GitHub pull request URL", async () => {
  const title = "\x1b[31mFix\x1b[0m\x1b]0;bad\x07 foo\x1b]8;;bad\x1b\\\t\n\x00\x7f\x9b31m\x9d0;bad\x9c";
  for (const unsafe of ["http://github.com/ddoghq/compute/pull/42", "https://github.com@evil.test/ddoghq/compute/pull/42", `${url}\x07bad`, `${url}/files`]) {
    assert.equal(await query(async () => response([{ ...pr, title, url: unsafe }])), "[open] #42 Fix foo\t");
  }
  assert.equal(await query(async () => response([{ ...pr, title }])), `[open] ${link("#42 Fix foo")}\t`);
});

function session({ hasUI = true, mode = "tui", checkout = branch, origin = remote } = {}) {
  const hooks = new Map();
  const statuses = [];
  const commands = [];
  const pending = new Map();
  const state = { checkout, origin, defaultRef: "origin/trunk", graphql: () => response([pr]) };
  createPrStatusExtension({
    profile: () => "work",
    async run(signal, command, args, actualCwd, timeout) {
      commands.push({ signal, command, args });
      assert.equal(actualCwd, cwd);
      assert.equal(timeout, 10000);
      if (command === "gh") return args[0] === "auth" ? "test-token" : state.graphql(signal);
      assert.equal(command, "git");
      if (args[0] === "branch") return state.checkout;
      if (args[0] === "symbolic-ref") return state.defaultRef;
      if (args[0] === "remote") return state.origin;
      assert.fail(`Unexpected git command: ${args}`);
    },
    setTimer(callback, delay) {
      const key = Symbol();
      pending.set(key, { callback, delay });
      return () => pending.delete(key);
    },
  })({ on(name, callback) { hooks.set(name, callback); } });
  const ctx = { cwd, hasUI, mode, ui: { setStatus(key, status) { statuses.push([key, status]); } } };
  const drain = () => new Promise(setImmediate);
  return {
    state, statuses, commands, drain,
    delay: () => {
      assert.ok(pending.size <= 1);
      return pending.values().next().value?.delay;
    },
    emit(name) {
      hooks.get(name)({}, ctx);
      return drain();
    },
    tick() {
      assert.equal(pending.size, 1);
      const [key, { callback }] = pending.entries().next().value;
      pending.delete(key);
      callback();
      return drain();
    },
  };
}

const openStatus = `[open] ${link("#42 Fix foo")}\t`;

test("session skips headless, non-TUI, default-branch, and non-GitHub checkouts", async () => {
  for (const options of [{ hasUI: false }, { mode: "rpc" }, { checkout: "main" }, { checkout: "master" }, { checkout: "trunk" }, { origin: "git@example.com:owner/repo.git" }]) {
    const s = session(options);
    await s.emit("session_start");
    assert.deepEqual(s.statuses, []);
    assert.equal(s.delay(), undefined);
    assert.ok(s.commands.every(({ command }) => command === "git"));
    if (options.hasUI === false || options.mode === "rpc") assert.deepEqual(s.commands, []);
  }
});

test("agent_end refreshes the PR and a switch to the default branch clears it and stops polling", async () => {
  const s = session();
  await s.emit("session_start");
  assert.deepEqual(s.statuses, [["pr-status", openStatus]]);
  assert.equal(s.delay(), 120000);
  s.state.graphql = () => response([{ ...pr, state: "MERGED" }]);
  await s.emit("agent_end");
  assert.deepEqual(s.statuses.at(-1), ["pr-status", openStatus.replace("open", "merged")]);
  assert.equal(s.delay(), 120000);
  s.state.checkout = "trunk";
  await s.tick();
  assert.deepEqual(s.statuses.at(-1), ["pr-status", undefined]);
  assert.equal(s.delay(), undefined);
  assert.equal(s.commands.filter(({ command }) => command === "gh").length, 4);
});

test("same-branch failures keep stale status and back off until the timer retries", async () => {
  const s = session();
  await s.emit("session_start");
  s.state.graphql = () => null;
  await s.tick();
  assert.match(s.statuses.at(-1)[1], /stale/);
  assert.ok(s.statuses.at(-1)[1].includes(link("#42 Fix foo")));
  const count = s.commands.length;
  await s.emit("agent_end");
  assert.equal(s.commands.length, count);
  for (const delay of [240000, 480000, 600000, 600000]) {
    assert.equal(s.delay(), delay);
    await s.tick();
  }
  s.state.graphql = () => response([pr]);
  await s.tick();
  assert.deepEqual(s.statuses.at(-1), ["pr-status", openStatus]);
  assert.equal(s.delay(), 120000);
  await s.emit("session_shutdown");
  assert.equal(s.delay(), undefined);
});

test("switching branches clears the old line before querying, even when the next request fails", async () => {
  const s = session();
  await s.emit("session_start");
  s.state.checkout = "another-feature";
  let statusAtQuery;
  s.state.graphql = () => {
    statusAtQuery = s.statuses.at(-1);
    return null;
  };
  await s.emit("agent_end");
  assert.deepEqual(statusAtQuery, ["pr-status", undefined]);
  assert.deepEqual(s.statuses, [["pr-status", openStatus], ["pr-status", undefined]]);
  assert.equal(s.delay(), 240000);
});

test("session runs at most one request and shutdown aborts it without late status or timer updates", async () => {
  const s = session();
  let complete;
  let requestSignal;
  s.state.graphql = (signal) => {
    requestSignal = signal;
    return new Promise((resolve) => { complete = resolve; });
  };
  await s.emit("session_start");
  assert.ok(requestSignal);
  const count = s.commands.length;
  await s.emit("agent_end");
  assert.equal(s.commands.length, count);
  await s.emit("session_shutdown");
  assert.equal(requestSignal.aborted, true);
  complete(response([pr]));
  await s.drain();
  await s.emit("agent_end");
  assert.equal(s.commands.length, count);
  assert.equal(s.delay(), undefined);
  assert.deepEqual(s.statuses, []);
});
