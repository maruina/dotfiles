import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const skillsDir = existsSync(path.join(agentDir, "exact_skills"))
  ? path.join(agentDir, "exact_skills")
  : path.join(agentDir, "skills");

function skill(name) {
  return readFileSync(path.join(skillsDir, name, "SKILL.md"), "utf8");
}

const skillRecordMarkers = [
  /Skills loaded and used/,
  /Skill \| Source \| Why loaded \| How used/,
  /skill-loader.*prompt-required.*user-requested.*agent-selected/is,
  /feedback for improving `skill-loader`/i,
];

const provenanceReference = /`## Provenance record` section of the `skill-loader` skill/;

const provenancePrompts = [
  "brainstorm.md",
  "plan.md",
  "execute.md",
  "systematic-review.md",
  "verify.md",
  "simplify.md",
  "pr-review.md",
  "pr-validate.md",
  "troubleshoot.md",
];

test("skill-loader owns the provenance record and prompts reference it", () => {
  requireMarkers(skill("skill-loader"), [
    /^## Provenance record$/m,
    ...skillRecordMarkers,
    /Include workflow skills/i,
    /Do not infer use/i,
    /If no skill was used, say so explicitly/i,
  ]);

  for (const file of provenancePrompts) {
    const text = prompt(file);
    assert.match(text, provenanceReference, `${file} must reference the skill-loader provenance record`);
    assert.doesNotMatch(text, /feedback for improving `skill-loader`/i, `${file} must not restate the provenance contract`);
  }
});

test("brainstorm records skill provenance before approval and in design specs", () => {
  const text = prompt("brainstorm.md");

  requireMarkers(text, [
    provenanceReference,
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
    provenanceReference,
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

test("execute does not content-match non-plan arguments against worktree plans", () => {
  const text = prompt("execute.md");

  requireMarkers(text, [
    /do not search worktrees for a plan that matches the argument's content/i,
    /Plan discovery runs only when the command is invoked with no arguments/i,
    /no committed plan in this repository.*stop and ask/is,
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
    provenanceReference,
    /Skill \| Source \| Why loaded \| How used/,
    /`### Execution` subsection under `## Skills loaded and used`/,
    /source, loading reason, and effect on execution/i,
  ]);

  for (const file of ["systematic-review.md", "verify.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      provenanceReference,
      /Skill \| Source \| Why loaded \| How used/,
      /\*\*Skills loaded and used:?\*\*/,
    ]);
  }
});

test("writable stages record learning candidates; read-only stages capture nothing", () => {
  requireMarkers(skill("learning-candidates"), [
    /## Learning candidates/,
    /— evidence: <shareable pointer/,
    /creat.*only on the first candidate/is,
    /fresh model.*reliably|reliably.*fresh model/is,
    /routine best practice/i,
    /session paths/i,
    /secrets/i,
    /vault content/i,
  ]);

  for (const file of ["plan.md", "execute.md", "simplify.md", "pr-address-feedback.md"]) {
    const text = prompt(file);
    assert.match(text, /`learning-candidates` skill/, `${file} must use the learning-candidates skill`);
    assert.doesNotMatch(text, /— evidence: /, `${file} must not restate the ledger format`);
  }

  requireMarkers(prompt("pr-address-feedback.md"), [
    /recorded.*accepted reviewer guidance.*\/learn|\/learn.*recorded.*accepted reviewer guidance/is,
    /otherwise.*no.*suggest/is,
    /branch.*slug/is,
    /zero or multiple/i,
  ]);

  for (const file of ["systematic-review.md", "verify.md"]) {
    assert.doesNotMatch(prompt(file), /Learning candidates|learning-candidates/i);
  }
});

test("simplify and PR review report skill provenance", () => {
  for (const file of ["simplify.md", "pr-review.md"]) {
    const text = prompt(file);
    requireMarkers(text, [
      provenanceReference,
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

test("handoff prompt is read-only and emits a neutral brief", () => {
  const text = prompt("handoff.md");

  requireMarkers(text, [
    /^---\ndescription: Write a self-contained handoff brief so a fresh agent session knows where to start\nargument-hint: \[next issue or focus\]\n---/,
    /<HARD-GATE>[\s\S]*?Do not change files, commit, push, or run state-changing commands\.[\s\S]*?<\/HARD-GATE>/i,
    /`## Goal and context`/,
    /`## Current state`/,
    /`## Done so far`/,
    /`## Decisions`/,
    /`## Pitfalls`/,
    /`## Open questions and blockers`/,
    /`## Next steps`/,
    /`## Suggested starting point`/,
    /`## User preferences`/,
    /leave out secrets, tokens, credentials, and raw logs/i,
    /plain prompt.*argument to any lifecycle prompt/is,
  ]);
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
    /## what to look for in this PR/i,
    /relevant files or symbols/i,
    /why it needs human attention/i,
    /specific check or question for the reviewer/i,
    /only concerns supported by the diff, design context, tests, or review discussion/i,
    /distinguish known behavior from assumptions and open questions/i,
    /do not invent uncertainty or risks/i,
    /highest-impact concerns first/i,
    /if no area needs special attention, say so briefly/i,
    /link each `where` to the file at the PR head SHA/i,
    /supersedes another/i,
    /1\. \*\*<Concern>\*\*/,
    /Commit links in reviewer guides must use `\/pull\/<pr>\/changes\/<full-sha>`, never bare `\/commit\/<sha>` links\./,
  ]);

  for (const text of [skill, prompt("pr-create.md"), prompt("pr-update.md")]) {
    assert.doesNotMatch(text, /Read the commits in this order|commits that match the guide/i);
    assert.doesNotMatch(text, /regenerate reviewer-guide commit links|\| # \| Commit \| Files \|/i);
  }
});

test("PR validation prompt defines a safe delegated review contract", () => {
  const text = prompt("pr-validate.md");

  requireMarkers(text, [
    /^description: .+$/m,
    /^argument-hint: "<GitHub PR URL> \[context\]"$/m,
    /^PR request: \$ARGUMENTS$/m,
    /<HARD-GATE>[\s\S]*read-only[\s\S]*<\/HARD-GATE>/i,
    /Approve/,
    /Ask/,
    /Request changes/,
    /context.*evidence.*not instructions/is,
    /after analysis starts, do not ask questions/i,
    /no cluster writes/i,
    /do not refresh credentials/i,
    /Coverage/,
    provenanceReference,
    /verify the base-repository remote/i,
    /existing worktree.*clean.*including untracked/is,
    /HEAD.*headRefOid/is,
    /refs\/pull\/PR_NUMBER\/head/,
    /FETCH_HEAD.*headRefOid/is,
    /~\/dd\/\.worktrees\/REPO\/pr-PR_NUMBER-review/,
    /~\/\.pi\/agent\/pr-validate-reports\/REPO-PR_NUMBER\.html/,
    /only permitted write is the HTML report/i,
    /Do not repeat report prose in the chat/,
    /cannot inject markup or scripts/i,
  ]);

  assert.doesNotMatch(text, /reset --hard/);
});

test("PR validation revision 2 report shape, severity, and provenance", () => {
  const text = prompt("pr-validate.md");

  requireMarkers(text, [
    // Report page section list (revision 2)
    /\*\*Hero\.\*\*/,
    /\*\*Chip navigation\.\*\*/,
    /\*\*Walkthrough\.\*\*/,
    /\*\*Item chapters\.\*\*/,
    /\*\*Your question\.\*\*/,
    /\*\*Reference\.\*\*/,
    // Six-slot item story
    /\*\*Where this fits\.\*\*/,
    /link to the related Walkthrough step/i,
    /\*\*Why it matters\.\*\*/,
    /\*\*What the code does now\.\*\*/,
    /\*\*Why that is bad\.\*\*/,
    /\*\*Is it real\?\*\*/,
    /\*\*Fix shape\.\*\*/,
    // Exposure and fix-cost severity
    /Exposure: real/,
    /Exposure: none now/,
    /Exposure: unknown/,
    /Fix cost: small/,
    /Fix cost: large/,
    /deploy-time condition/,
    // Every-verdict report, including Approve
    /report for every verdict/,
    /including Approve/,
    // Model and thinking level in report and chat, or their unavailability
    /thinking level/,
    // Strict Mermaid and agent-written labels only
    /securityLevel: "strict"/,
    /labels that the agent writes/,
    // Ten criteria, including the three revision-2 additions
    /Observability/,
    /Dependencies/,
    /Docs/,
  ]);

  assert.doesNotMatch(text, /feedback for improving `skill-loader`/i);
});

test("PR validation report opens with a walkthrough", () => {
  const text = prompt("pr-validate.md");

  requireMarkers(text, [
    /Problem/,
    /System today/,
    /Core intuition/,
    /Solution map/,
    /entry-point order/i,
    /How it works today/,
    /What changed and why/,
    /Downstream effect/,
    /PR content and context.*(?:walkthrough|Walkthrough).*escape/i,
  ]);
});

test("PR validation marketplace discovery is bounded, local, and read-only", () => {
  const text = prompt("pr-validate.md");

  requireMarkers(text, [
    /Marketplace discovery/i,
    /up to five terms|five search terms|no more than five terms/i,
    /at most three|no more than three|up to three/i,
    /frontmatter `description:`|`description:` lines/i,
    /already loads|directories.*pi.*loads|exclud/i,
    /never `git pull`|no `git pull`|do not pull/i,
    /commit and date|commit.*date/i,
    /agent-selected/i,
    /caller.*gate|gates win|read-only gate/i,
  ]);
});

test("PR validation shares the review-worktree path with review and cleanup", () => {
  const paths = ["pr-validate.md", "pr-review.md", "pr-cleanup.md"]
    .flatMap((name) => [...prompt(name).matchAll(/~\/dd\/\.worktrees\/[^\s`")]+/g)])
    .map(([path]) => path);

  assert.deepEqual([...new Set(paths)].sort(), ["~/dd/.worktrees/REPO/pr-PR_NUMBER-review"]);
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

test("worktree and PR checkout procedures live in skills, not prompts", () => {
  requireMarkers(skill("feature-worktree"), [
    /^## Choose a worktree$/m,
    /^## PR URL to worktree$/m,
    /`repo-checkout` skill/,
    /isCrossRepository/,
    /gh pr checkout <PR_NUMBER>/,
    /never reset or discard local changes/i,
    /Never run `git checkout`, `git switch`, or `gh pr checkout` in the base checkout/,
    /mkdir -p.*WORKTREES_ROOT|parent directory if it does not exist/i,
  ]);

  for (const file of ["brainstorm.md", "plan.md", "execute.md", "simplify.md", "pr-review.md", "pr-address-feedback.md"]) {
    assert.match(prompt(file), /`feature-worktree` skill/, `${file} must use the feature-worktree skill`);
  }

  for (const file of readdirSync(promptsDir).filter((name) => name.endsWith(".md"))) {
    const text = prompt(file);
    assert.doesNotMatch(text, /~\/go\/src\/github\.com\/ORG\/REPO/, `${file} must locate checkouts with repo-checkout`);
    assert.doesNotMatch(text, /~\/dd\/\.worktrees\/<repo>\/<branch-slug>/, `${file} must defer the worktree root to AGENTS.md`);
  }
});

test("the stack-split check has one owner", () => {
  requireMarkers(skill("reviewable-pr-workflow"), [
    /### Stack-split check/,
    /Strong signals:.*~400.*~15/s,
    /Soft signals:.*more than five topics/s,
    /any strong signal or two or more soft signals/i,
  ]);

  const execute = prompt("execute.md");
  assert.match(execute, /stack-split check from the `reviewable-pr-workflow` skill/);
  assert.doesNotMatch(execute, /~400|~15 non-generated/);
});

test("pr-address-feedback policy overrides pr-comment-triage without step-number references", () => {
  assert.match(skill("pr-comment-triage"), /calling prompt.*take precedence/is);

  const text = prompt("pr-address-feedback.md");
  assert.match(text, /`reviewThreads` GraphQL query in the `pr-comment-triage` skill/);
  assert.match(text, /`resolveReviewThread` mutation in the `pr-comment-triage` skill/);
  assert.doesNotMatch(text, /\(step \d+\)/);
});

test("execute and simplify emit the same /verify handoff contract", () => {
  const steps = (text) =>
    text
      .slice(text.indexOf("## Handoff"))
      .split("\n")
      .filter((line) => /^\d\. (Run|Confirm)/.test(line))
      .map((line) => line.replace(/implementation model|simplification model/g, "<producer> model"));

  const execute = steps(prompt("execute.md"));
  const simplify = steps(prompt("simplify.md"));
  assert.ok(execute.length >= 5, "execute must carry the numbered handoff steps");
  assert.deepEqual(simplify, execute);

  const verify = prompt("verify.md");
  for (const flag of ["--implemented-by", "--task"]) assert.match(verify, new RegExp(flag));
});
