import assert from "node:assert/strict";
import test from "node:test";

import {
  availableTransitions,
  buildCreateBody,
  buildUpdateFields,
  findTransition,
  hasUpdateChanges,
  isUnassign,
  issueUrl,
  pickAssignee,
  trimCreateResult,
} from "./_write.ts";
import type { RawTransition, RawTransitionsResponse, RawUser } from "./_write.ts";

// ── buildCreateBody ───────────────────────────────────────────────────────

test("buildCreateBody emits only required fields when no optionals are given", () => {
  assert.deepEqual(
    buildCreateBody({ project: "PLAT", summary: "Fix the thing", issueType: "Task" }),
    {
      fields: {
        project: { key: "PLAT" },
        summary: "Fix the thing",
        issuetype: { name: "Task" },
      },
    },
  );
});

test("buildCreateBody includes optionals and wraps priority as a name object", () => {
  assert.deepEqual(
    buildCreateBody({
      project: "COST",
      summary: "Spend too high",
      issueType: "Story",
      description: "h2. Context",
      labels: ["infrastructure"],
      priority: "P1",
    }),
    {
      fields: {
        project: { key: "COST" },
        summary: "Spend too high",
        issuetype: { name: "Story" },
        description: "h2. Context",
        labels: ["infrastructure"],
        priority: { name: "P1" },
      },
    },
  );
});

// ── buildUpdateFields ─────────────────────────────────────────────────────

test("buildUpdateFields returns null when no field parameters are provided", () => {
  assert.equal(buildUpdateFields({}), null);
});

test("buildUpdateFields maps each field and omits the rest", () => {
  assert.deepEqual(
    buildUpdateFields({
      summary: "New title",
      description: "New body",
      labels: ["a", "b"],
      priority: "P2",
    }),
    {
      summary: "New title",
      description: "New body",
      labels: ["a", "b"],
      priority: { name: "P2" },
    },
  );
});

test("buildUpdateFields maps assignee accountId and null-unassign", () => {
  assert.deepEqual(
    buildUpdateFields({ assigneeAccountId: "acc-123" }),
    { assignee: { accountId: "acc-123" } },
  );
  assert.deepEqual(buildUpdateFields({ assigneeAccountId: null }), { assignee: null });
  // undefined assigneeAccountId means "leave unchanged" — no assignee key.
  assert.equal(buildUpdateFields({ assigneeAccountId: undefined }), null);
});

// ── hasUpdateChanges ──────────────────────────────────────────────────────

test("hasUpdateChanges is false only when every parameter is absent", () => {
  assert.equal(hasUpdateChanges({}), false);
  assert.equal(hasUpdateChanges({ summary: "x", status: "Done" }), true);
  assert.equal(hasUpdateChanges({ comment: "note" }), true);
});

// ── isUnassign ────────────────────────────────────────────────────────────

test("isUnassign accepts literal unassign values case-insensitively", () => {
  assert.equal(isUnassign("Unassigned"), true);
  assert.equal(isUnassign(" none "), true);
  assert.equal(isUnassign(""), true);
  assert.equal(isUnassign("matteo.ruina@datadoghq.com"), false);
});

// ── pickAssignee ───────────────────────────────────────────────────────────

const users: RawUser[] = [
  { accountId: "a1", emailAddress: "jane.doe@datadoghq.com", displayName: "Jane Doe" },
  { accountId: "a2", emailAddress: "john@datadoghq.com", displayName: "John Smith" },
];

test("pickAssignee matches email exactly, case-insensitively", () => {
  assert.equal(pickAssignee(users, "Jane.Doe@datadoghq.com")?.accountId, "a1");
  assert.equal(pickAssignee(users, "  john@datadoghq.com ")?.accountId, "a2");
});

test("pickAssignee falls back to exact display name match", () => {
  assert.equal(pickAssignee(users, "John Smith")?.accountId, "a2");
});

test("pickAssignee returns undefined when no exact match exists", () => {
  assert.equal(pickAssignee(users, "john"), undefined);
  assert.equal(pickAssignee(users, "nobody@datadoghq.com"), undefined);
  assert.equal(pickAssignee([], "jane.doe@datadoghq.com"), undefined);
});

// ── findTransition / availableTransitions ─────────────────────────────────

const transitions: RawTransitionsResponse = {
  transitions: [
    { id: "11", name: "Start Progress", to: { name: "In Progress" } },
    { id: "21", name: "Done", to: { name: "Done" } },
    { id: "31", name: "Blocked", to: { name: "Blocked" } },
  ],
};

test("findTransition matches target status name case-insensitively", () => {
  assert.equal(findTransition(transitions, "in progress")?.id, "11");
  assert.equal(findTransition(transitions, "Done")?.id, "21");
});

test("findTransition falls back to transition name when no status matches", () => {
  assert.equal(findTransition(transitions, "start progress")?.id, "11");
});

test("findTransition returns undefined for unknown status", () => {
  assert.equal(findTransition(transitions, "Cancelled"), undefined);
  assert.equal(findTransition({ transitions: [] }, "Done"), undefined);
});

test("availableTransitions lists distinct target status names", () => {
  assert.deepEqual(availableTransitions(transitions), ["In Progress", "Done", "Blocked"]);
  assert.deepEqual(availableTransitions({}), []);
});

test("availableTransitions falls back to transition name when target is missing", () => {
  const raw: { transitions: RawTransition[] } = {
    transitions: [{ id: "5", name: "Escalate" }],
  };
  assert.deepEqual(availableTransitions(raw), ["Escalate"]);
});

// ── result trimming ───────────────────────────────────────────────────────

test("issueUrl builds the browse URL", () => {
  assert.equal(issueUrl("PLAT-123", "datadoghq.atlassian.net"), "https://datadoghq.atlassian.net/browse/PLAT-123");
});

test("trimCreateResult returns key, id, and url", () => {
  assert.deepEqual(trimCreateResult({ id: "10001", key: "PLAT-42" }, "datadoghq.atlassian.net"), {
    key: "PLAT-42",
    id: "10001",
    url: "https://datadoghq.atlassian.net/browse/PLAT-42",
  });
  assert.deepEqual(trimCreateResult({}, "datadoghq.atlassian.net"), {
    key: "",
    id: "",
    url: "",
  });
});
