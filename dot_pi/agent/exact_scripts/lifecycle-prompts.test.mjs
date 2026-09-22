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

test("brainstorm anchors the design to the smallest user-feedback slice", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /Smallest user-feedback slice:/,
    /what the user sees.*what the team learns.*why no smaller slice/is,
    /select the one whose smallest slice produces user feedback fastest/i,
    /non-selected design.*non-goal or a deferred item with a revisit trigger/is,
    /do not merge designs to satisfy more stakeholders/i,
    /better long-term design is not a reason to widen/i,
    /smallest user-feedback slice and the deferred alternatives/is,
    /non-selected alternatives are deferred rather than merged/i,
  ]);
});

test("brainstorm loads the learning skill for integrated coaching by default", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /learning-opportunities/,
    /coaching is the default/i,
    /not a separate exercise/i,
    /exercise limit does not cap/i,
    /skill is unavailable.*say so/is,
    /do not claim the skill was loaded/i,
  ]);
});

test("brainstorm asks before explaining and pauses for an attempt", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /ask before explaining/i,
    /end a coaching question turn after the question/i,
    /no recommended answer, leading hint, or solution menu/i,
    /attempted an answer or asked for help/i,
    /wrong predictions are useful data/i,
  ]);

  // The pre-attempt recommended-answer pattern conflicts with the pause.
  assert.doesNotMatch(text, /## Recommended answer/);
});

test("brainstorm tests understanding and corrects it with evidence", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /predict or explain/i,
    /prediction is not evidence/i,
    /correct the specific error with evidence/i,
    /do not attribute insights the user did not express/i,
    /lookup chores/i,
  ]);

  // The unconditional ban on source-answerable questions is replaced.
  assert.doesNotMatch(text, /questions that code, tests, docs[^\n]*can answer cheaply/i);
});

test("brainstorm broadens exploration with materially different directions", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /anchors on one direction/i,
    /materially different framing or approach/i,
    /stakeholder.*changed constraint.*reversed assumption/is,
    /doing nothing/i,
    /simpler alternative/i,
    /tradeoffs before closing the branch/i,
  ]);
});

test("brainstorm persists productively and preserves user control", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /persistent, not obstructive/i,
    /adapt question difficulty to demonstrated familiarity/i,
    /stop repeating settled questions/i,
    /asks for an explanation, explain/i,
    /asks to stop coaching, stop/i,
    /unresolved decisions explicit/i,
    /fit the user's problem and demonstrated familiarity/i,
    /irrelevant stack|fixed checklist/i,
  ]);
});

test("brainstorm synthesizes a design for human readers", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    /reader outside the conversation/i,
    /domain terms/i,
    /synthesis, not a transcript/i,
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

test("plan anchors scope to the smallest user-feedback slice with conditional grouping", () => {
  const text = prompt("plan.md");

  requireMarkers(text, [
    /Smallest user-feedback slice:/,
    /\*\*Smallest user-feedback slice:\*\*/,
    /### Slice N: <title>/,
    /only when the plan needs more than one shippable slice/i,
    /slice 1 is the smallest user-feedback slice/i,
    /task outside the current slice is a follow-up/i,
    /`Final verification` item naming the feature-level acceptance criteria/i,
    /slice grouping is used only when the plan needs it/i,
    /scope beyond the smallest.*explicitly deferred/is,
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

test("systematic review challenges scope against the smallest user-feedback slice", () => {
  const text = prompt("systematic-review.md");

  requireMarkers(text, [
    /smallest user-feedback slice is named and is slice 1/i,
    /every requirement and task maps to a slice, unless it is explicitly deferred as a follow-up/i,
    /re-entered from an alternative design or a prior review is deferred with a revisit trigger/i,
    /enough feature-level criteria for the final verification/i,
    /smallest user-feedback slice, not only against the design/i,
    /recommend deferral by default/i,
  ]);
});

test("execute runs one incomplete slice per run for grouped plans", () => {
  const text = prompt("execute.md");

  requireMarkers(text, [
    /no slice grouping executes all tasks as today and hands off once/i,
    /first slice with incomplete tasks, and execute only that slice/i,
    /do not auto-run the remaining slices/i,
    /resumes at the next incomplete slice/i,
    /user names a slice.*no incomplete blockers/is,
    /stack-split check applied to the slice/i,
    /one verified slice increment/i,
  ]);
});

test("verify scopes grouped plans to the slice and runs a final feature pass", () => {
  const text = prompt("verify.md");

  requireMarkers(text, [
    /no slice grouping verifies every acceptance scenario as today/i,
    /deferred to slice N/,
    /feature-level criteria against the design goals/i,
    /reconstruct the cumulative state from the feature base, merged slices, and the current candidate/i,
    /record the reconstruction method/i,
    /return `BLOCKED` instead of guessing when reconstruction is impossible/i,
    /multi-slice verdict names the slice it covers/i,
  ]);
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

test("writable stages record learning candidates; read-only stages capture nothing", () => {
  for (const file of ["plan.md", "execute.md", "simplify.md", "pr-address-feedback.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      /## Learning candidates/,
      /— evidence: /,
      /fresh model.*reliably|reliably.*fresh model/is,
    ]);
  }

  requireMarkers(prompt("pr-address-feedback.md"), [
    /recorded.*accepted reviewer guidance.*\/learn|\/learn.*recorded.*accepted reviewer guidance/is,
    /otherwise.*no.*suggest/is,
    /branch.*slug/is,
    /zero or multiple/i,
  ]);

  for (const file of ["systematic-review.md", "verify.md"]) {
    assert.doesNotMatch(prompt(file), /Learning candidates/);
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

test("reviewer guides prioritize concrete concerns rather than commits", () => {
  const skillsDir = existsSync(path.join(agentDir, "exact_skills")) ? "exact_skills" : "skills";
  const skill = readFileSync(path.join(agentDir, skillsDir, "reviewable-pr-workflow", "SKILL.md"), "utf8");

  requireMarkers(skill, [
    /organize the guide by review concern, not by commit or file order/i,
    /relevant files or symbols/i,
    /explain why it needs attention/i,
    /specific check or question for the reviewer/i,
    /only concerns supported by the diff, design context, tests, or review discussion/i,
    /distinguish known behavior from assumptions and open questions/i,
    /do not invent uncertainty or risks/i,
    /highest-impact concerns first/i,
    /if no area needs special attention, say so briefly/i,
  ]);

  for (const text of [skill, prompt("pr-create.md"), prompt("pr-update.md")]) {
    assert.doesNotMatch(text, /Read the commits in this order|commits that match the guide/i);
    assert.doesNotMatch(text, /regenerate reviewer-guide commit links|\| # \| Commit \| Files \|/i);
    assert.doesNotMatch(text, /\/changes\/<full-sha>/);
  }
});

test("PR creation derives review concerns from the change and checks final references", () => {
  requireMarkers(prompt("pr-create.md"), [
    /concrete risks, edge cases, complex logic, uncertain assumptions, and design decisions/i,
    /reviewer-guide rules in `reviewable-pr-workflow`/i,
    /review concerns and code references match the pushed branch/i,
    /final reviewer-guide concerns/i,
  ]);
});

test("PR updates reassess unresolved concerns without accumulating review history", () => {
  requireMarkers(prompt("pr-update.md"), [
    /full PR diff and relevant review discussion, not only the latest commits/i,
    /retain unresolved review questions/i,
    /remove resolved or obsolete concerns/i,
    /add concerns introduced by the update/i,
    /refresh code references.*order.*by importance/i,
    /preserve accurate handwritten context without accumulating a review-history log/i,
    /reviewer-guide concerns added, resolved, or retained/i,
  ]);
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
