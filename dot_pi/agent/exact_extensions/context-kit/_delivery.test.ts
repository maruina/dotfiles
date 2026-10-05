import assert from "node:assert/strict";
import { test } from "node:test";
import { blockingPaths, clearPending, confirmDelivered, confirmDirectDelivery, createState, discover, queue, recordDirectPending, rebuildFromBranch, snapshotState, compactionReset } from "./_delivery.ts";

const P1 = "/repo/sub/AGENTS.md";
const P2 = "/repo/.claude/rules/go.md";

test("discovered paths can remain unqueued", () => {
  const state = createState();

  discover(state, [P1]);

  assert.deepEqual([...state.discovered], [P1]);
  assert.deepEqual([...state.pending], []);
});

test("queue discovers and queues each path once", () => {
  const state = createState();

  assert.deepEqual(queue(state, [P1, P2]), [P1, P2]);
  assert.deepEqual(queue(state, [P1]), []);
  assert.deepEqual([...state.discovered], [P1, P2]);
  assert.deepEqual([...state.pending], [P1, P2]);
});

test("confirmed paths stop blocking applicable mutations", () => {
  const state = createState();
  queue(state, [P1, P2]);
  assert.deepEqual(blockingPaths(state, [P1, P2], new Set()), [P1, P2]);

  confirmDelivered(state, [P1]);

  assert.deepEqual(blockingPaths(state, [P1, P2], new Set()), [P2]);
  assert.deepEqual(blockingPaths(state, [P2], new Set([P2])), []);
});

test("clearPending allows an undelivered path to be queued again", () => {
  const state = createState();
  queue(state, [P1]);
  clearPending(state);

  assert.deepEqual(queue(state, [P1]), [P1]);
});

test("direct results suppress injection and load only after matching confirmation", () => {
  const state = createState();
  recordDirectPending(state, "read-1", P1);

  assert.deepEqual(queue(state, [P1]), []);
  assert.deepEqual(blockingPaths(state, [P1], new Set()), [P1]);
  assert.deepEqual(confirmDirectDelivery(state, ["other-id"]), []);
  assert.deepEqual(confirmDirectDelivery(state, ["read-1"]), [P1]);
  assert.deepEqual(blockingPaths(state, [P1], new Set()), []);
});

test("direct confirmations ignore failed or unknown tool calls", () => {
  const state = createState();
  recordDirectPending(state, "read-1", P1);

  assert.deepEqual(confirmDirectDelivery(state, []), []);
  assert.deepEqual(confirmDirectDelivery(state, ["read-2"]), []);
  assert.deepEqual(blockingPaths(state, [P1], new Set()), [P1]);
});

test("clearPending drops unconfirmed direct results", () => {
  const state = createState();
  recordDirectPending(state, "read-1", P1);
  clearPending(state);

  assert.deepEqual(queue(state, [P1]), [P1]);
});

test("snapshots restore the last branch state and ignore malformed data", () => {
  const restored = rebuildFromBranch([
    { type: "custom", customType: "context-kit-state", data: { version: 1, discovered: [P1], loaded: [P1] } },
    { type: "custom", customType: "unrelated", data: {} },
    { type: "custom", customType: "context-kit-state", data: { version: 1, discovered: [P2], loaded: [P2] } },
  ]);

  assert.deepEqual(snapshotState(restored), { version: 1, discovered: [P2], loaded: [P2] });
  assert.deepEqual(snapshotState(rebuildFromBranch([
    { type: "custom", customType: "context-kit-state", data: { version: 1, discovered: [P1], loaded: [P1] } },
    { type: "custom", customType: "context-kit-state", data: { version: 99 } },
  ])), { version: 1, discovered: [], loaded: [] });
});

test("compaction clears loaded and pending paths but keeps discovered paths", () => {
  const state = createState();
  discover(state, [P1, P2]);
  queue(state, [P1]);
  confirmDelivered(state, [P2]);
  recordDirectPending(state, "read-1", P2);

  assert.deepEqual(compactionReset(state), [P1, P2]);
  assert.deepEqual(snapshotState(state), { version: 1, discovered: [P1, P2], loaded: [] });
  assert.deepEqual(queue(state, [P1, P2]), [P1, P2]);
});
