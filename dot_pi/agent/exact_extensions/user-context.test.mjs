import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildRepoContextKey,
  formatCurrentModel,
  formatPR,
  pathInside,
  shouldAddSkillLoaderGuidance,
  uniqueMatches,
} from "./user-context.ts";

test("uniqueMatches returns distinct Jira keys in first-seen order", () => {
  assert.deepEqual(
    uniqueMatches("PLAT-123 and COST-456 then PLAT-123"),
    ["PLAT-123", "COST-456"],
  );
});

test("pathInside accepts descendants and rejects sibling prefix lookalikes", () => {
  const parent = path.join(path.sep, "tmp", "repo");
  assert.equal(pathInside(path.join(parent, "sub", "file.ts"), parent), true);
  assert.equal(pathInside(parent, parent), true);
  assert.equal(pathInside(path.join(path.sep, "tmp", "repo-other", "file.ts"), parent), false);
});

test("shouldAddSkillLoaderGuidance only triggers for code work", () => {
  assert.equal(shouldAddSkillLoaderGuidance("fix the TypeScript extension tests"), true);
  assert.equal(shouldAddSkillLoaderGuidance("what is the weather?"), false);
  assert.equal(shouldAddSkillLoaderGuidance("summarize this incident"), false);
});

test("buildRepoContextKey changes when branch or email changes", () => {
  const base = buildRepoContextKey("/repo", "main", "me@example.com");
  assert.notEqual(buildRepoContextKey("/repo", "feature", "me@example.com"), base);
  assert.notEqual(buildRepoContextKey("/repo", "main", "other@example.com"), base);
  assert.equal(buildRepoContextKey("/repo", null, null), "/repo\0\0");
});

test("formatCurrentModel emits a named model and omits missing IDs", () => {
  assert.deepEqual(
    formatCurrentModel({ id: "gpt-5", name: "GPT-5" }),
    ["## Current Model", "- GPT-5 (gpt-5)"],
  );
  assert.deepEqual(formatCurrentModel(), []);
  assert.deepEqual(formatCurrentModel({ name: "GPT-5" }), []);
});

test("formatPR includes state, number, base, title, head, and link", () => {
  assert.equal(
    formatPR({
      number: 42,
      title: "Improve pi extensions",
      state: "OPEN",
      url: "https://example.test/pr/42",
      baseRefName: "main",
      headRefName: "feature/pi",
    }),
    "- [OPEN] #42 → main: Improve pi extensions [head: feature/pi] (https://example.test/pr/42)",
  );
});
