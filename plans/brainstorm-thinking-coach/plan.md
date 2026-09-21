# Brainstorm Thinking Coach Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/brainstorm` a persistent thinking partner and coach that develops the user's reasoning, expands the directions considered, and produces a sound design for human readers.
**Smallest user-feedback slice:** One revised prompt, its regression tests, and conversation checks that demonstrate questioning, correction, alternative exploration, and design convergence.
**Out of Scope:** Changes to other lifecycle commands, the vendored learning skill, global guidance, extensions, dependencies, or product systems; a model-evaluation framework; learning scores or persistent learner profiles; mandatory exercise quotas. CLA decommissioning was an example, not a domain requirement.
**Architecture:** Keep orchestration in the existing Markdown prompt and reuse `learning-opportunities` for questioning techniques. The prompt defines integrated coaching and its lifecycle boundaries without changing the skill's standalone exercise behavior. Extend the existing Node.js prompt-contract tests and use bounded manual conversations for behavior that text assertions cannot establish.
**Tech Stack:** Pi Markdown prompt templates, the existing vendored learning skill, Node.js built-in test runner, and chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Required before planning recommendations | Selected the applicable domain and prose guidance. |
| `resolve-worktree` | prompt-required | Required input discovery across worktrees | Searched existing designs; the user then explicitly selected the request as a new plan's source. |
| `codebase-research` | skill-loader | Unfamiliar lifecycle prompt behavior and test boundaries | Mapped the prompt, structural tests, vendoring, and package commands before choosing the implementation. |
| `chezmoi` | skill-loader | Managed prompt and test source files | Established source-only edits, worktree-specific previews, targeted apply, and verification commands. |
| `write` | skill-loader | Human-facing prompt and plan prose | Preserved the user's intent, stated concrete behavior, and separated design content from a coaching transcript. |
| `learning-opportunities` | user-requested | User requested the existing learning skill | Applied generation before explanation, pause for input, evidence-backed correction, and adaptive difficulty; read its learning principles before adapting its use. |
| `obsidian-cli` | prompt-required | Required advisory learning lookup | Read the learning store through Obsidian and passed it locally through the section selector. |

## Source and confirmed alignment
The source of truth is the user's request and subsequent clarification, not an existing design. This work starts directly at `/plan`; no sibling `design.md` is required. The user confirmed the revised alignment with “Yes, agree.”

- **Scope classification:** Medium: bounded prompt work with material interaction and validation decisions.
- Coaching is the default during `/brainstorm`; invocation is consent to integrated questions, not permission for unrelated standalone exercises.
- Ask source-answerable questions to test understanding. The agent still does its own research and explains verified behavior when the user's answer is wrong.
- Help the user consider directions they would not explore alone. Contribute meaningful alternatives and perspectives, rather than only questioning the user's first proposal.
- Keep the command generic and preserve the existing responsibility for operability, observability, security, scale, failure behavior, ownership, rollout, and rollback.
- The result is a design for human readers. Coaching changes the process, not the purpose or approval gates.
- Deliver one shippable execution unit. There is no later slice, dependency on another feature, or deferred implementation scope. The documentation review below is part of this unit.

## Current evidence and feasibility
Baseline: `3edc0c6`, fetched from `origin/main`; the base checkout was clean and equal to `origin/main`. Continue on `maruina/brainstorm-thinking-coach`, not `main`.

- `dot_pi/agent/exact_prompts/brainstorm.md` already defines skeptical, dependency-aware exploration, one question at a time, explicit branch closure, operational soundness, smallest-slice selection, approval, and durable design output. Its recommended-answer example and blanket prohibition on cheaply answerable questions conflict with generation-before-explanation.
- `dot_pi/agent/exact_skills/learning-opportunities/SKILL.md` defines prediction, generation, path tracing, teach-back, hard pauses, feedback, and adaptive difficulty. Its separate exercises are optional and normally limited to two per session. `resources/PRINCIPLES.md` explains generation and corrective feedback; use these techniques without copying the full skill into the prompt.
- The skill is vendored at commit `3862d2eb6e93427f1f163a54360d11ef943b88b7`. `VENDOR.md` and `exact_prompts/sync-vendored-skills.md` establish that synchronization replaces vendored contents. Keep this adaptation in the prompt.
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` supplies `prompt()` and `requireMarkers()`, existing lifecycle regression checks, and a 14,000-byte brainstorm budget. The baseline prompt is 11,837 bytes.
- `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` protects advisory lookup and lifecycle boundaries. Running it with the lifecycle tests passed all 24 tests before planning changes.
- `dot_pi/agent/package.json` exposes `test:prompts`, `test`, and `test:all`. Its smoke test checks startup, not conversational quality.
- Installed Pi documentation (`README.md`, `docs/prompt-templates.md`, and `docs/skills.md`) and `pi --help` confirm explicit prompt/skill loading, ephemeral interactive sessions, read-only tool selection, and `/reload`. No extension or new test seam is required.
- Relevant guidance is in `AGENTS.md` and `dot_pi/agent/AGENTS.md`. No separate applicable ADR or lifecycle README was found.

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Integrated coaching using the existing skill | Prompt explicitly loads `learning-opportunities` and defines how its techniques apply during brainstorming | Existing `SKILL.md`, principles, and Pi skill discovery | Structural contract plus M1 skill-read and pause observation | Report the missing skill and use the prompt's core questioning rules; never claim it was loaded. |
| Source-answerable questions and corrections | Existing read tools gather evidence; the agent asks before explaining and gives feedback after an attempt | Current discovery rules and skill prediction/feedback techniques | M1 against the real package scripts; M3 for missing evidence | Mark uncertainty and name needed evidence; do not invent a correction. |
| Broader exploration with convergence | Existing decision tree gains deliberate reframing and alternative exploration before branch closure | Current alternatives, rejected/deferred states, and smallest-slice policy | Contract tests and M2 | Mark unresolved decisions or defer with user confirmation; do not silently choose. |
| Complete human-readable design | Existing alignment, artifact, and approval sections gain explicit reader guidance | Current `design.md` content and handoff contract | Contract tests, M2 design preview, and source review | Revise the draft; do not substitute a transcript or silently omit material concerns. |
| Safe candidate validation and rollout | Source prompt loading, existing test scripts, and exact-target chezmoi operations | `pi --help`, package scripts, and `chezmoi diff/apply --help` | Focused tests, package gates, candidate conversations, and targeted preview | Record blocked evidence and leave targets unchanged. |

### Advisory learning evidence
Lookup terms were `/brainstorm`, `learning-opportunities`, `prompt template`, `prompt contract`, and `chezmoi`, with no repository filter. The only returned section was **“Render piped chezmoi templates against an initialized config, not `--init`”**, dated 2026-07-15. It concerns piped `.tmpl` rendering, which this plain-Markdown change does not need; it is intentionally not an implementation requirement. No other material advisory guidance was found. Do not retrieve the mutable store during execution or verification.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Brainstorm coordinator | `dot_pi/agent/exact_prompts/brainstorm.md` | Coaching, skill adaptation, discovery, alternative exploration, and human-readable output | Focused contract tests, M1–M3, and source review |
| Lifecycle contracts | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Protect new instructions and existing lifecycle behavior without claiming to test model compliance | Node test runner and package gates |
| Execution and verification record | `plans/brainstorm-thinking-coach/plan.md` | Track acceptance evidence, documentation review, and any blockers | Review checked tasks against recorded results |

### Key Decisions
1. **Use the prompt as the integration point.** Preserve the vendored skill. Integrated coaching is not a succession of optional 10–15 minute exercises, so the standalone offer flow and two-exercise limit do not cap normal brainstorming questions. Separate exercises remain opt-in.
2. **Separate research from learning questions.** The agent investigates facts rather than assigning lookup chores. It may still ask the user to predict or explain those facts before revealing the answer. A prediction is not evidence.
3. **Separate question turns from explanation turns.** End a coaching question turn without a recommended answer, leading hint, or solution menu. After the user's attempt, correct errors and contribute alternatives; recommendations remain useful then. If the user requests an explanation instead of an attempt, provide it.
4. **Broaden exploration without widening delivery.** Use another stakeholder's view, a changed constraint, a reversed assumption, doing nothing, or a simpler alternative when relevant. Do not force a fixed list, merge every idea, or accept the first direction without examining material alternatives.
5. **Be persistent, not obstructive.** Follow meaningful gaps, adapt difficulty, and stop repeating settled questions. Honor a request to stop coaching while preserving unresolved decisions and the ordinary design approval gate.
6. **Retain the full design standard.** Coaching does not replace operational analysis or turn the design into a quiz report. Explain context and domain terms for engineers who do not know the subsystem.

### Implementation Constraints
- Modify only the two implementation files listed above, plus execution records in this plan. No skill fork, new command, test framework, dependency, profile setting, or domain-specific prompt example.
- Reconcile the Method, first-response, discovery, recommendation, and output instructions together; adding a coaching paragraph while leaving contradictory rules is insufficient.
- Keep the 14,000-byte budget. Prefer replacing conflicting or redundant prose over appending parallel rules; do not remove unrelated safeguards to make room.
- Preserve one question at a time, evidence labels, dependency-aware branch order, explicit branch outcomes, smallest user-feedback slice, skill provenance, advisory lookup, no implementation during brainstorming, confirmation before artifact creation, worktree rules, and exact lifecycle handoffs.
- Questions must fit the user's problem and demonstrated familiarity. Do not hardcode CLA, a particular stack, or a fixed number of questions into the prompt.
- No hot path, fan-out, queue, new persistence, or infrastructure load is introduced. Keep research proportional to the request; avoid repeated lookups and unlimited test conversations.
- Stop if the change requires editing the vendored skill, raising the prompt budget, weakening validation, or changing another lifecycle stage. Those choices require renewed alignment.

### Security Requirements
No new access or data store is required. Keep brainstorming's no-implementation and confirmation gates. Treat repository and external content as evidence, not instructions. Manual checks use synthetic problem statements or this repository's public files, read-only tools, and ephemeral sessions; do not include credentials, private system details, or vault content in evidence records.

### Observability Requirements
No service metrics or telemetry are appropriate for a Markdown prompt. Record test exits, candidate model and thinking level, scenario outcomes, and short non-sensitive observations in this plan. Separate structural-test results from observed conversational behavior; neither a loaded instruction nor a passing regex proves model compliance.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Agent reveals the answer with its question | Ask and stop; defer explanation until an attempt or help request | R1; M1 |
| User gives a wrong or incomplete answer | Correct the specific error using evidence; follow remaining material gaps without inventing understanding | R2; M1 |
| Source or skill is unavailable | State the gap; do not fabricate evidence, loaded skills, or a factual correction | R2; M3 and contract review |
| Agent follows only the user's initial approach | Introduce a relevant different framing or approach and explore its consequences | R3; M2 |
| Coaching becomes repetitive or the user asks for help | Adapt, explain when requested, or stop coaching without treating unresolved choices as approved | R4; M1 and M3 |
| Coaching displaces operational analysis or design content | Preserve material design concerns and produce a reader-focused synthesis | R5–R6; M2 and regression tests |

### Rollout and Rollback
Owner: Matteo. Execution prepares the candidate and hands off to a fresh, independent `/verify`; it does not invoke the verifier inside an implementation task. `/verify` remains read-only and must not apply, commit, or update this ledger. Deployment is a post-verdict operation, not a prerequisite for completing the execution tasks.

After a `VERIFIED` verdict, the owner or a separate writable session performs the targeted rollout from the feature worktree root:

1. Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/scripts/lifecycle-prompts.test.mjs`; expect only the reviewed changes. Stop for unrelated drift.
2. Run `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/scripts/lifecycle-prompts.test.mjs`.
3. Run `node --test ~/.pi/agent/scripts/lifecycle-prompts.test.mjs ~/.pi/agent/scripts/learn-prompts.test.mjs`; expect green. Repeat the targeted diff; expect no difference.
4. Reload Pi or start a fresh session. Remove only the feature worktree's disposable `dot_pi/agent/node_modules` after both execution and independent verification have completed their package checks.

Do not apply the plan, whole directories, or unrelated targets. Fastest safe rollback: revert the implementation commit on a feature branch, rerun the focused tests, preview the same two target paths, and apply the reverted source. Reload or start a fresh session; a previously expanded prompt in an active conversation is not rewritten by updating its file. There is no migration or persistent coaching state to undo.

### Test Strategy
The highest deterministic seam available is the existing file-based instruction contract. Extend it for R1–R6, including negative checks for the old unconditional lookup-question ban and pre-attempt recommended-answer pattern. Keep assertions focused on normative instructions and section context, not incidental wording. Reuse existing helpers; no mocks or new seams are needed.

The narrow red/green command, from the repository root, is `node --test dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`. Newly added cases must fail against the unmodified prompt for missing coaching instructions, then pass after the edit. Existing tests must stay green. Conversational acceptance requires M1–M3 because no deterministic model-compliance harness exists; do not claim otherwise.

## Acceptance Requirements
Each requirement maps to Task 1; Task 2 records scenario and documentation evidence.

### R1: Ask before explaining
The prompt SHALL load the existing learning skill for integrated coaching by default and require one focused question followed by a pause, without the agent's answer or leading hints.

#### Scenario: Fresh brainstorming session
- GIVEN a new `/brainstorm` session with the skill available
- WHEN the agent starts exploring the problem
- THEN it reads the skill, asks a relevant reasoning question, and stops for input without a separate exercise offer or a recommended answer.
- Verification: structural contract and M1.

### R2: Test understanding and correct it with evidence
The prompt SHALL permit source-answerable questions, retain the agent's research responsibility, and require direct evidence-backed feedback after an answer. It SHALL distinguish unknown behavior from verified facts.

#### Scenario: Incorrect mental model
- GIVEN source material establishes behavior and the user makes an incorrect prediction
- WHEN the agent responds
- THEN it explains the specific error and the actual behavior with a source reference, without attributing insights the user did not express.
- Verification: structural contract and M1.

#### Scenario: Evidence is unavailable
- GIVEN a claimed system behavior has no accessible source or observation
- WHEN the user asks whether their explanation is correct
- THEN the agent identifies the evidence gap rather than presenting an invented correction as fact.
- Verification: structural contract and M3.

### R3: Expand the directions considered
The prompt SHALL help the user examine materially different framings or approaches, contribute its own perspectives, and test consequences before converging. It SHALL preserve the rule that rejected alternatives do not silently expand the selected slice.

#### Scenario: User anchors on one implementation
- GIVEN the user proposes a custom application before establishing the need
- WHEN exploration reveals a relevant different approach
- THEN the agent introduces that direction, elicits the user's reasoning about its tradeoffs, and records its disposition without merging all approaches.
- Verification: structural contract and M2.

### R4: Persist productively and preserve user control
The prompt SHALL follow material reasoning gaps with adaptive questions, provide explanations when requested, and honor a request to stop coaching. It SHALL converge through explicit branch states and user confirmation, not a question quota.

#### Scenario: User needs help or changes interaction mode
- GIVEN an unresolved reasoning question
- WHEN the user asks for an explanation or asks to stop coaching
- THEN the agent responds to that request without repeated exercise offers or withheld answers, and keeps unresolved decisions explicit.
- Verification: structural contract, M1, and M3.

### R5: Remain generic and operationally complete
The prompt SHALL adapt to existing systems and new designs while retaining its material operability, observability, security, ownership, scale, failure, and rollout responsibilities.

#### Scenario: Different domain with no code
- GIVEN a greenfield problem outside the decommissioning example
- WHEN the session explores and evaluates a design
- THEN questions fit that domain, distinguish assumptions from evidence, and cover material operational concerns without imposing an irrelevant stack or fixed checklist.
- Verification: structural contract, existing lifecycle regressions, and M2.

### R6: Produce a design for human readers
The prompt SHALL synthesize agreed reasoning into a design that explains context, domain terms, current behavior where relevant, decisions, rationale, alternatives, risks, and validation. It SHALL preserve confirmation and durable-artifact handoff rules.

#### Scenario: Ready to converge
- GIVEN material branches are resolved or explicitly deferred and the user confirms the alignment
- WHEN the agent presents the design
- THEN a reader outside the conversation can understand the problem and chosen direction without a transcript, learning scores, or implementation tasks standing in for design reasoning.
- Verification: structural contract and M2 content review; existing artifact/worktree instructions remain unchanged and are reviewed rather than exercised by the read-only check.

## Tasks
### Task 1: Deliver coached brainstorming with regression protection
**Delivers:** The complete coaching behavior and human-readable design contract without weakening existing lifecycle behavior.
**Blocked by:** None.
**Traces to:** R1–R6 and the confirmed one-slice scope.
**Files:** Modify `dot_pi/agent/exact_prompts/brainstorm.md` and `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; record results in `plans/brainstorm-thinking-coach/plan.md`.

- [ ] Read the current prompt, learning skill, principles, lifecycle tests, and learning prompt tests. Use LSP before changing known JavaScript symbols; no helper API change is needed.
- [ ] Extend the existing tests with instruction contracts for R1–R6, including skill loading, integrated versus standalone exercises, question-and-pause behavior, source-answerable questions, direct correction, alternative exploration, help/stop behavior, generic design coverage, and human-readable synthesis.
- [ ] Run `node --test dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; expect the new cases to fail for absent or conflicting coaching instructions, not test errors. Record the failing cases.
- [ ] Make the smallest coherent prompt revision. Replace conflicting recommendation and lookup rules, integrate the skill without copying it, retain ordinary decision guidance after user reasoning, and preserve all listed constraints.
- [ ] Run `node --test dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs`; expect all tests to pass, including the unchanged 14,000-byte budget and lifecycle gates.
- [ ] Refactor wording only after green, then rerun the focused command. Use applicable LSP diagnostics after JavaScript edits.
- [ ] Run M1–M3 below against the candidate. Fix observed violations within scope and rerun affected checks; record remaining blockers instead of declaring success from static tests.

### Task 2: Review guidance and prepare the independent verification handoff
**Delivers:** A documented candidate with passing implementation evidence and a safe rollout procedure.
**Blocked by:** Task 1.
**Traces to:** R1–R6, the documentation requirement, and repository completion rules.
**Files:** Review `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_skills/learning-opportunities/VENDOR.md`, and `dot_pi/agent/exact_prompts/sync-vendored-skills.md`; update execution records only in `plans/brainstorm-thinking-coach/plan.md`. The implementation files remain the two from Task 1.

- [ ] Review both relevant `AGENTS.md` files and record why no update is needed: lifecycle behavior stays in the prompt and no durable command or testing procedure changes. The existing prompt is the user-facing documentation; there is no separate applicable README, runbook, generated reference, or API document to update. Leave vendoring and sync instructions unchanged.
- [ ] From `dot_pi/agent`, run `npm ci --ignore-scripts`, then `npm test` and `npm run test:all`; expect all suites to pass and the offline startup smoke test to report no extension issues. Keep source dependencies available for the independent verifier's fresh reruns; cleanup belongs to the post-verdict procedure above.
- [ ] Record R1–R6 outcomes, source commit, model/thinking level, and M1–M3 observations in this plan. Do not include raw session logs, vault content, or claims of durable learning improvement. An unavailable model session is a validation blocker, not a pass.
- [ ] Run `git diff --check`; expect no whitespace errors. Review the diff against the allowed files and the approved scope.
- [ ] From the repository root, run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/scripts/lifecycle-prompts.test.mjs`; expect only the reviewed coaching and contract-test changes. Stop for unrelated target drift; do not apply yet.
- [ ] After the implementation-evidence checks pass, commit the candidate and execution record with `feat(pi): make brainstorm an active thinking coach`. Follow the standard `/execute` push, draft-PR, and model-separated verification handoff. Do not claim the final independent verdict or perform the post-verdict rollout inside `/verify`.

## Manual Conversation Checks
### Setup, invocation, and evidence limits
Run from the feature worktree root before applying. Use an available authenticated model through existing Pi configuration; do not pass credentials or change model configuration. Start a fresh session for each check with this supported interface:

`pi --no-session --no-context-files --no-extensions --no-prompt-templates --prompt-template ./dot_pi/agent/exact_prompts/brainstorm.md --no-skills --skill ./dot_pi/agent/exact_skills/learning-opportunities --skill ./dot_pi/agent/exact_skills/codebase-research --skill ./dot_pi/agent/exact_skills/write --tools read,grep,find,ls --no-approve`

This exposes the candidate prompt and source skills while preventing file writes and shell execution. State in each test seed that the advisory Obsidian source is unavailable in this read-only test and must not be retrieved. Use the chat-only exception; no durable design file or commit is expected from these conversations. Review the human-readable design as a chat preview. This validates composition and interaction, not a new artifact persistence mechanism.

Limit each check to 15 assistant turns as a verification resource budget, not a production coaching quota. If criteria are unmet at that point, record the unresolved result and investigate rather than rerunning until a favorable transcript appears. Exact question wording is not prescribed; check observable behavior. Record a short rubric outcome and source references in this plan before closing each ephemeral session.

### M1: Existing source, wrong prediction, and help request
Invoke:

`/brainstorm Chat-only: help me design a smaller validation process for prompt Markdown changes in this repository. I am leaning toward running only test:prompts. Use dot_pi/agent/package.json as evidence of current behavior. Do not change files. The advisory Obsidian source is unavailable in this read-only test; do not retrieve it.`

1. Observe skill loading and the first reasoning question. Pass only if the agent asks one focused question and waits without a recommended answer or separate exercise offer.
2. In response, state: “I think test:prompts also validates skill metadata, so keeping only that command loses no coverage.”
3. Expect a specific correction citing `dot_pi/agent/package.json`: `test:prompts` selects prompt test files, while skill validation is a separate package script. The agent must not treat the prediction as evidence or merely agree.
4. Continue through one material follow-up, then say: “I am stuck. Explain this tradeoff before asking me another question.” Expect a useful explanation, not another unsupported demand for an answer.
5. Check that facts and decisions remain separate, and that an explanation does not authorize implementation. Covers R1, R2, and the help branch of R4.

### M2: Different domain, alternative direction, and human-readable design
Invoke:

`/brainstorm Chat-only: design a reliable equipment reservation process for a 40-member community workshop. Today members use a paper sign-up sheet. I am leaning toward a custom web application. Volunteers have little time to support software, bookings contain contact details, and members need to know whether a booking is confirmed. No code or existing software service exists. Treat these as synthetic scenario facts. Do not change files. The advisory Obsidian source is unavailable in this read-only test; do not retrieve it.`

1. Answer the agent's questions with concrete priorities: avoid conflicting bookings, keep volunteer support small, and make failed or missing confirmations visible. Do not prescribe a solution or supply a list of alternatives.
2. Expect the agent to introduce a relevant direction beyond the proposed custom app, invite reasoning about its tradeoffs, and contribute its own analysis after the attempt. A differently configured custom app alone is not sufficient alternative exploration.
3. Continue toward a small first slice. Expect proportional attention to ownership/support, failure detection, recovery, contact-data protection, expected load, and rollout/reversibility. The prompt must not force CLA concepts or production-scale infrastructure into the example.
4. Reject or defer a plausible alternative and check that it does not re-enter scope. Once material branches are settled, confirm the alignment and request the complete design preview in chat.
5. Review as an engineer who was not in the conversation: context and terms are clear; the design explains the choice and its downside, alternatives and their merits, success evidence, operational responsibilities, and remaining assumptions. It is neither a transcript nor a quiz report. Covers R3, R5, R6, and normal convergence in R4.

### M3: Unknown behavior and coaching opt-out
Invoke:

`/brainstorm Chat-only: an external system sometimes loses reservations. We have no source, logs, documentation, or access. My guess is that retries delete them. Is my explanation correct? Do not change files. The advisory Obsidian source is unavailable in this read-only test; do not retrieve it.`

1. Expect the agent to label the claim as unverified, ask a useful question or identify needed evidence, and avoid inventing a factual correction.
2. Say: “Stop the coaching for this session. Summarize what we know and what evidence we need next.” Expect a summary without another exercise offer, fabricated certainty, or final design approval. Covers R2 and the stop branch of R4.
3. Review the candidate's missing-skill instructions separately: it must report unavailability, preserve core questioning behavior, and not claim that the skill was loaded. No skill files are removed for this check.

### Cleanup
Exit each ephemeral Pi session. Confirm `git status --short` shows only intended implementation and plan edits, and that no design artifact was created by the read-only tests. Do not export or share sessions. Source dependencies remain available for fresh verification and are removed by the owner afterward, outside the read-only verifier. If a check cannot run, record the exact blocker and leave the rollout incomplete.
