import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const agentDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const promptsDir = existsSync(path.join(agentDir, "exact_prompts"))
  ? path.join(agentDir, "exact_prompts")
  : path.join(agentDir, "prompts");

function prompt(name) {
  return readFileSync(path.join(promptsDir, name), "utf8");
}

function requireMarkers(text, markers) {
  for (const marker of markers) assert.match(text, marker);
}

test("learn replaces compound and supports plain and contextual evidence discovery", () => {
  assert.equal(existsSync(path.join(promptsDir, "learn.md")), true, "learn.md must exist");
  assert.equal(existsSync(path.join(promptsDir, "compound.md")), false, "compound.md must be removed");
  const text = prompt("learn.md");

  requireMarkers(text, [
    /argument-hint: "\[<PR URL \| plan\/design path \| context>\]"/,
    /contextual mode/,
    /sessions-search/,
    /session-context/,
    /maruina/,
    /matteo-ruina_ddog/,
    /ddoghq/,
    /ddoghq-sandbox/,
    /gh auth switch/,
    /restore.*original.*login/is,
  ]);

  // The retrospective daily scan was removed; pin that no daily-mode markers remain.
  assert.doesNotMatch(text, /previous local calendar day/);
  assert.doesNotMatch(text, /sessions-window/);
  assert.doesNotMatch(text, /\/learn daily/);
  assert.doesNotMatch(text, /--merged/);
});

test("learn requires adjudicated, safe evidence before a single exact approval", () => {
  const text = prompt("learn.md");

  requireMarkers(text, [
    /materially equivalent.*more than once/is,
    /costly wrong turn/is,
    /reviewer.*generalizable.*accepted/is,
    /raw.*match.*not.*occurrence/is,
    /quotations|quoted/i,
    /repeated tool output/i,
    /injected/i,
    /Why save this:/,
    /Proposed entry:/,
    /one approval/i,
    /ambiguous.*approval.*changes nothing/is,
    /no learning qualifies.*do not ask for approval/is,
    /legacy.*deletion/is,
    /Datadog\/Compound\/dotfiles-chezmoi-execute-template-profile\.md/,
    /one code span per distinct source repository/i,
  ]);
});

test("learn uses a transactional, privacy-preserving vault write", () => {
  const text = prompt("learn.md");

  requireMarkers(text, [
    /mode 0600/i,
    /snapshot/i,
    /obsidian read/i,
    /obsidian create/i,
    /obsidian delete/i,
    /read-back/i,
    /compensat|restore/i,
    /credentials|secrets/i,
    /assistant thinking/i,
    /tool-call arguments/i,
    /Datadog\/Learnings\.md/,
    /Current source code, tests, and tool behavior/i,
  ]);
});

test("learn resolves plain mode through branch-correlated plan discovery", () => {
  const text = prompt("learn.md");

  requireMarkers(text, [
    /plain mode/i,
    /current branch/i,
    /branch.*slug/is,
    /current worktree/i,
    /resolve-worktree/,
    /\*\*\/plans\/\*\/plan\.md/,
    /preflight/i,
    /stop.*suggest/is,
    /suggest.*explicit context/is,
    /zero.*multiple|multiple.*zero/is,
    /--state all/,
    /--limit/,
    /## Learning candidates/,
  ]);
});

test("learn rejects derivable candidates and routes agent-behavior guidance to proposals", () => {
  const text = prompt("learn.md");

  requireMarkers(text, [
    /non-derivab/i,
    /fresh model/i,
    /improvement proposal/i,
  ]);
});

test("learn re-adjudicates aged sections and previews removals in one approval", () => {
  const text = prompt("learn.md");

  requireMarkers(text, [
    /six calendar months/i,
    /strictly earlier/i,
    /missing.*malformed|malformed.*missing/is,
    /### Removal:/,
  ]);
});

test("brainstorm and plan selectively consume advisory learning sections", () => {
  for (const file of ["brainstorm.md", "plan.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      /narrow.*terms/i,
      /technology.*error.*API.*tool.*pattern/is,
      /Datadog\/Learnings\.md/,
      /learning-sections/,
      /complete H2 section/i,
      /Report matched section titles.*do not report unrelated sections/i,
      /no repository filter/i,
      /advisory/i,
      /Current source code, tests, and tool behavior/i,
      /material.*guidance.*design\.md|material.*guidance.*plan\.md/is,
      /absent.*empty/i,
      /Obsidian.*unavailable.*record/is,
    ]);
  }
});

test("execute and verify do not read the mutable learning store", () => {
  for (const file of ["execute.md", "verify.md"]) {
    const text = prompt(file);
    assert.doesNotMatch(text, /Datadog\/Learnings\.md/);
    assert.doesNotMatch(text, /learning-sections/);
    assert.doesNotMatch(text, /obsidian\s+(?:read|create|delete)/i);
  }
});

test("lifecycle guidance names learn and has no compound reference", () => {
  for (const file of [path.join(promptsDir, "simplify.md"), path.join(agentDir, "AGENTS.md")]) {
    const text = readFileSync(file, "utf8");
    assert.match(text, /\/learn/);
    assert.doesNotMatch(text, /\/compound/);
  }
});
