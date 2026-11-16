import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  buildRepoContextKey,
  formatCurrentModel,
  formatPR,
  loadRexLines,
  pathInside,
  shouldAddSkillLoaderGuidance,
  uniqueMatches,
} from "./user-context.ts";

const neverRun = () => {
  throw new Error("rex must not run when REX_SESSION is unset");
};

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

test("loadRexLines returns nothing without REX_SESSION and never runs rex", async () => {
  assert.equal(await loadRexLines({}, neverRun), null);
  assert.equal(await loadRexLines({ REX_SERVER: "unix:///tmp/rex.sock" }, neverRun), null);
});

test("loadRexLines returns nothing when rex is missing or unusable", async () => {
  const run = async () => null;
  assert.equal(await loadRexLines({ REX_SESSION: "session:x" }, run), null);
});

test("loadRexLines disables Rex's built-in naming and adds repository session and task tab guidance", async () => {
  const calls = [];
  const run = async (...args) => {
    calls.push(args);
    return "You're running in a Rex terminal.\n\nREX_SESSION=session:x";
  };
  const lines = await loadRexLines({ REX_SESSION: "session:x" }, run);
  assert.deepEqual(calls, [["rex", ["__internal", "session-start", "--agent", "pi", "--feature-session-naming=false"], undefined, 3000]]);
  assert.deepEqual(lines.slice(0, 5), [
    "## Rex",
    "",
    "You're running in a Rex terminal.",
    "",
    "REX_SESSION=session:x",
  ]);
  const guidance = lines.slice(5).join("\n");
  assert.doesNotMatch(guidance, /the shared Rex session/);
  assert.match(guidance, /Before task work.*first request that identifies the task/);
  assert.match(guidance, /rex session inspect/);
  assert.match(guidance, /exactly one tab and one pane.*repository name/);
  assert.match(guidance, /Git remote.*dotfiles.*not.*chezmoi/);
  assert.match(guidance, /not.*owner\/repo.*branch.*task name/);
  assert.match(guidance, /no Git remote.*Git root directory name/);
  assert.match(guidance, /outside a Git repository.*current directory basename.*\/path\/to\/foo.*foo/);
  assert.match(guidance, /rex session rename/);
  assert.match(guidance, /Preserve.*user-supplied session name/);
  assert.match(guidance, /multiple tabs or panes.*preserve the session name/);
  assert.match(guidance, /π-.*two to four lowercase task words/);
  assert.match(guidance, /rex block inspect/);
  assert.match(guidance, /rex window rename/);
  assert.match(guidance, /not the focused tab/);
  assert.match(guidance, /multiple Pi agents share a tab.*pane labels/);
  assert.match(guidance, /Verify.*session and tab names.*before continuing/);
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
