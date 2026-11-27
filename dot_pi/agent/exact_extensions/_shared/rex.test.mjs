import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeAtomicJson } from "./fs.ts";
import { buildRexArgs, isRexId, matchesForegroundProcess, verifyLocalRexEndpoint, verifyLocalRexPeer } from "./rex.ts";

test("buildRexArgs formats autostart, timeout, and server flags", () => {
  assert.deepEqual(buildRexArgs(["whoami", "--json"]), ["--autostart=false", "whoami", "--json"]);
  assert.deepEqual(
    buildRexArgs(["whoami", "--json"], { timeoutSec: 5, endpoint: "unix:///tmp/rex.sock", validateEndpoint: false }),
    ["--autostart=false", "--timeout", "5s", "--server", "unix:///tmp/rex.sock", "whoami", "--json"],
  );
  assert.throws(() => buildRexArgs(["whoami"], { endpoint: "tcp://127.0.0.1:9999" }));
});

test("isRexId validates Rex identifier format", () => {
  assert.equal(isRexId("session", "session:01a1e56f-9baa"), true);
  assert.equal(isRexId("block", "block:deadbeef"), true);
  assert.equal(isRexId("window", "session:deadbeef"), false);
  assert.equal(isRexId("session", "session:not-hex!"), false);
});

test("verifyLocalRexEndpoint rejects non-unix or remote endpoints", () => {
  assert.throws(() => verifyLocalRexEndpoint(""));
  assert.throws(() => verifyLocalRexEndpoint("tcp://127.0.0.1:9999"));
  assert.throws(() => verifyLocalRexEndpoint("unix://remote/tmp/rex.sock"));
});

test("verifyLocalRexPeer validates peer principal, metadata, and expected IDs", () => {
  const uid = process.getuid?.();
  const base = {
    endpoint: "unix:///tmp/rex.sock",
    principal: { kind: "peer", transport: "unix", uid },
    session_id: "session:01a1",
    block_id: "block:02b2",
    instance_id: "inst-1",
    host_id: "host-1",
    pid: 1234,
    api_revision: 18,
  };
  assert.equal(verifyLocalRexPeer(base, base.endpoint, { session: "session:01a1", block: "block:02b2", requireMetadata: true, minApiRevision: 18 }).pid, 1234);
  assert.throws(() => verifyLocalRexPeer({ ...base, api_revision: 17 }, base.endpoint, { minApiRevision: 18 }), /API revision 17/);
  assert.throws(() => verifyLocalRexPeer({ ...base, api_revision: undefined }, base.endpoint, { minApiRevision: 18 }), /API revision unknown/);
  assert.throws(() => verifyLocalRexPeer({ ...base, session_id: "session:other" }, base.endpoint, { session: "session:01a1" }));
  assert.throws(() => verifyLocalRexPeer({ ...base, principal: { kind: "tcp", transport: "unix", uid } }, base.endpoint));
});

test("matchesForegroundProcess checks pid, uid, cwd, and execPath", () => {
  const cwd = process.cwd();
  assert.equal(matchesForegroundProcess({ pid: process.pid, user_id: process.getuid?.(), cwd, path: process.execPath }, { pid: process.pid, cwd, execPath: process.execPath }), true);
  assert.equal(matchesForegroundProcess({ pid: process.pid + 1, user_id: process.getuid?.(), cwd, path: process.execPath }, { pid: process.pid, cwd, execPath: process.execPath }), false);
});

test("writeAtomicJson writes private 0600 JSON atomically", () => {
  const dir = mkdtempSync(join(tmpdir(), "shared-fs-"));
  try {
    const file = join(dir, "state.json");
    writeAtomicJson(file, { ok: true }, { trailingNewline: true });
    assert.equal(readFileSync(file, "utf8"), '{"ok":true}\n');
    assert.equal(statSync(file).mode & 0o777, 0o600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
