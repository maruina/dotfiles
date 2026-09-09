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

const skillRecordMarkers = [
  /Skills loaded and used/,
  /Skill \| Source \| Why loaded \| How used/,
  /skill-loader.*prompt-required.*user-requested.*agent-selected/is,
  /feedback for improving `skill-loader`/i,
];

test("brainstorm records skill provenance before approval and in design specs", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    ...skillRecordMarkers,
    /alignment brief.*must include `Skills loaded and used`/is,
    /durable design spec.*must include `Skills loaded and used`/is,
    /`## Skills loaded and used`/,
  ]);
});

test("plan records skill provenance before approval and in durable plans", () => {
  const text = prompt("plan.md");

  requireMarkers(text, [
    ...skillRecordMarkers,
    /planning alignment brief.*must include `Skills loaded and used`/is,
    /durable plan.*must include `Skills loaded and used`/is,
    /## Skills loaded and used/,
  ]);
});

test("brainstorm and plan stay within prompt context budgets", () => {
  const budgets = new Map([
    ["brainstorm.md", 14_000],
    ["plan.md", 18_000],
  ]);

  for (const [file, budgetBytes] of budgets) {
    const actualBytes = Buffer.byteLength(prompt(file), "utf8");
    assert.ok(actualBytes <= budgetBytes, `${file} is ${actualBytes} bytes; budget is ${budgetBytes}`);
  }
});

test("brainstorm and plan preserve dependency-aware lifecycle contracts", () => {
  const brainstorm = prompt("brainstorm.md");
  requireMarkers(brainstorm, [
    /skeptical throughout the design/i,
    /failure conditions.*simpler alternatives/is,
    /^## Operational Soundness$/m,
    /confident carrying the pager.*4am/i,
    /dependency-aware decision tree/i,
    /prerequisites are settled/i,
    /every material branch.*no material assumption remains implicit/is,
    /Do not move to planning or execution until the user confirms the framing/i,
  ]);
  assert.doesNotMatch(brainstorm, /^## Pressure-test mode$/im);

  requireMarkers(prompt("plan.md"), [
    /highest supported interface.*deterministically/is,
    /existing test seam.*fewest new seams/is,
    /\*\*Out of Scope:\*\*/,
    /\*\*Blocked by:\*\*/,
    /blockers before dependents.*`\/execute`.*sequentially/is,
    /expand–migrate–contract/,
  ]);
});

test("downstream lifecycle stages preserve or report skill provenance", () => {
  const execute = prompt("execute.md");
  requireMarkers(execute, [
    ...skillRecordMarkers,
    /`### Execution` subsection under `## Skills loaded and used`/,
    /source, loading reason, and effect on execution/i,
  ]);

  for (const file of ["systematic-review.md", "verify.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      ...skillRecordMarkers,
      /\*\*Skills loaded and used:?\*\*/,
    ]);
  }
});

test("simplify and PR review report skill provenance", () => {
  for (const file of ["simplify.md", "pr-review.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      ...skillRecordMarkers,
      /\*\*Skills loaded and used\*\*|## Skills loaded and used/,
    ]);
  }

  assert.match(prompt("pr-review.md"), /domain rules are `prompt-required`/i);
});

// verify.md and learn.md are terminal stages: no downstream handoff by design.
const pipelineHandoffPrompts = [
  "brainstorm.md",
  "plan.md",
  "systematic-review.md",
  "execute.md",
  "simplify.md",
];

test("pipeline prompts close with a wired lifecycle handoff", () => {
  for (const file of pipelineHandoffPrompts) {
    const text = prompt(file);
    assert.match(text, /## Handoff/, `${file} must have a ## Handoff section`);
    assert.match(
      text,
      /Report the exact handoff phrase below/,
      `${file} must wire the handoff into its workflow or output contract`,
    );
  }
});

test("weekly summary has no obsolete session-note command reference", () => {
  assert.equal(existsSync(path.join(promptsDir, "session-note.md")), false);
  assert.doesNotMatch(prompt("weekly-summary.md"), /\/prompt:session-note|\/session-note/);
});

test("PR commands have distinct roles and aligned review artifacts", () => {
  const review = prompt("pr-review.md");
  const addressFeedback = prompt("pr-address-feedback.md");
  const create = prompt("pr-create.md");
  const update = prompt("pr-update.md");
  const cleanup = prompt("pr-cleanup.md");

  assert.match(review, /Use `\/pr-address-feedback` to decide whether feedback on your own PR applies/);
  assert.match(review, /run `\/to-html` after the response settles/i);
  assert.doesNotMatch(review, /~\/dd\/\.worktrees\/REPO-pr-PR_NUMBER-review\.html/);
  assert.doesNotMatch(review, /cdn\.jsdelivr\.net\/npm\/mermaid/);
  assert.match(addressFeedback, /Build a \*\*targeted model\*\*, not a full `\/pr-review` narrative/);
  assert.match(create, /post one `@codex review` comment/);
  assert.match(update, /Do not post `@codex review` unless the user explicitly asks/);
  assert.match(cleanup, /git worktree remove "\$WORKTREE"/);
  assert.doesNotMatch(cleanup, /\bHTML\b/);
  assert.doesNotMatch(cleanup, /git worktree remove[^\n]*--force/);
});
