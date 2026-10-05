import assert from "node:assert/strict";
import { test } from "node:test";
import { blockingPaths, clearPending, confirmDelivered, createState, queue } from "./_delivery.ts";

const P1 = "/repo/sub/AGENTS.md";
const P2 = "/repo/.claude/rules/go.md";

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
