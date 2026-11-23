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

test("buildCreateBody emits required fields and wraps optional priority/parent", () => {
  assert.deepEqual(
    buildCreateBody({ project: "PLAT", summary: "Fix the thing", issueType: "Task" }),
    { fields: { project: { key: "PLAT" }, summary: "Fix the thing", issuetype: { name: "Task" } } },
  );
  assert.deepEqual(
    buildCreateBody({
      project: "COST",
      summary: "Spend too high",
      issueType: "Story",
      description: "h2. Context",
      labels: ["infrastructure"],
      priority: "P1",
      parent: "COST-1",
    }),
    {
      fields: {
        project: { key: "COST" },
        summary: "Spend too high",
        issuetype: { name: "Story" },
        description: "h2. Context",
        labels: ["infrastructure"],
        priority: { name: "P1" },
        parent: { key: "COST-1" },
      },
    },
  );
});

test("buildUpdateFields and hasUpdateChanges handle field mapping, assignee, and empty updates", () => {
  assert.equal(buildUpdateFields({}), null);
  assert.equal(buildUpdateFields({ assigneeAccountId: undefined }), null);
  assert.deepEqual(
    buildUpdateFields({ summary: "New title", description: "New body", labels: ["a", "b"], priority: "P2" }),
    { summary: "New title", description: "New body", labels: ["a", "b"], priority: { name: "P2" } },
  );
  assert.deepEqual(buildUpdateFields({ assigneeAccountId: "acc-123" }), { assignee: { accountId: "acc-123" } });
  assert.deepEqual(buildUpdateFields({ assigneeAccountId: null }), { assignee: null });
  assert.equal(hasUpdateChanges({}), false);
  assert.equal(hasUpdateChanges({ summary: "x", status: "Done" }), true);
  assert.equal(hasUpdateChanges({ comment: "note" }), true);
});

test("isUnassign and pickAssignee match exact emails or display names case-insensitively", () => {
  assert.equal(isUnassign("Unassigned"), true);
  assert.equal(isUnassign(" none "), true);
  assert.equal(isUnassign(""), true);
  assert.equal(isUnassign("matteo.ruina@datadoghq.com"), false);

  const users: RawUser[] = [
    { accountId: "a1", emailAddress: "jane.doe@datadoghq.com", displayName: "Jane Doe" },
    { accountId: "a2", emailAddress: "john@datadoghq.com", displayName: "John Smith" },
  ];
  assert.equal(pickAssignee(users, "Jane.Doe@datadoghq.com")?.accountId, "a1");
  assert.equal(pickAssignee(users, "  john@datadoghq.com ")?.accountId, "a2");
  assert.equal(pickAssignee(users, "John Smith")?.accountId, "a2");
  assert.equal(pickAssignee(users, "john"), undefined);
  assert.equal(pickAssignee(users, "nobody@datadoghq.com"), undefined);
  assert.equal(pickAssignee([], "jane.doe@datadoghq.com"), undefined);
});

test("findTransition and availableTransitions prefer target status and fall back to transition name", () => {
  const transitions: RawTransitionsResponse = {
    transitions: [
      { id: "11", name: "Start Progress", to: { name: "In Progress" } },
      { id: "21", name: "Done", to: { name: "Done" } },
      { id: "31", name: "Blocked", to: { name: "Blocked" } },
    ],
  };
  assert.equal(findTransition(transitions, "in progress")?.id, "11");
  assert.equal(findTransition(transitions, "Done")?.id, "21");
  assert.equal(findTransition(transitions, "start progress")?.id, "11");
  assert.equal(findTransition(transitions, "Cancelled"), undefined);
  assert.equal(findTransition({ transitions: [] }, "Done"), undefined);

  assert.deepEqual(availableTransitions(transitions), ["In Progress", "Done", "Blocked"]);
  assert.deepEqual(availableTransitions({}), []);
  const raw: { transitions: RawTransition[] } = { transitions: [{ id: "5", name: "Escalate" }] };
  assert.deepEqual(availableTransitions(raw), ["Escalate"]);
});

test("issueUrl and trimCreateResult build browse URLs and trim create responses", () => {
  assert.equal(issueUrl("PLAT-123", "datadoghq.atlassian.net"), "https://datadoghq.atlassian.net/browse/PLAT-123");
  assert.deepEqual(trimCreateResult({ id: "10001", key: "PLAT-42" }, "datadoghq.atlassian.net"), {
    key: "PLAT-42",
    id: "10001",
    url: "https://datadoghq.atlassian.net/browse/PLAT-42",
  });
  assert.deepEqual(trimCreateResult({}, "datadoghq.atlassian.net"), { key: "", id: "", url: "" });
});
