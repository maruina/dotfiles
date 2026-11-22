# Plan Contract Boundaries Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plan.md`, `execute.md`, and `brainstorm.md` state which plan elements are binding contracts and which are implementation suggestions. `/execute` can then vary routine implementation details without stopping, and `/plan` final review catches self-contradictory controls before commit.
**Smallest user-feedback slice:** The approved design's single slice: the binding-vs-suggestion task contract, the final-review control reachability check, non-blocking open questions, and the matching `/execute` boundary, each covered by `lifecycle-prompts.test.mjs`.
**Out of Scope:** Long-lived per-capability specifications with merge-on-archive; prescriptive step-by-step choreography inside tasks; a standalone plan-format linter or schema validator; relaxing any authentication, authorization, safety, or testing/verification rule; migrating existing plans or modifying historical Stage Runner run evidence; changes to `systematic-review.md`, `verify.md`, or `stage-runner` code. Deferred alternatives from the design: `Rn`/`Dn` citation IDs, a mandatory walkthrough section, `Depends on / Must land before` lines, a list of unchanged components, and short `Verify …` tasks with execution logs outside `plan.md`.
**Architecture:** The change edits only lifecycle prompt text under `dot_pi/agent/exact_prompts/`. `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` asserts the new contract markers and the per-prompt byte budgets. No runtime code, extension, or Stage Runner orchestration changes.
**Tech Stack:** Markdown prompt templates, Node.js `node:test` with regex marker assertions, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Route skills for planning | Selected `codebase-research`, `chezmoi`, and `write` from the affected files (`*.md` prompts, `*.mjs` test, chezmoi source tree). No language skill matched. |
| `resolve-worktree` | `prompt-required` | Resolve the design path | `lifecycle-git.mjs resolve --path` returned one match in the `maruina/plan-contract-boundaries` worktree. |
| `learning-lookup` | `prompt-required` | Advisory guidance before planning decisions | Queried `Datadog/Learnings.md` with `binding`, `suggestion`, `open question`, `execute`, `plan.md`, `byte budget`, and `lifecycle-prompts`. One section returned (chezmoi `execute-template --init`); it does not apply to prompt contracts. |
| `codebase-research` | `skill-loader` | Map prompt contracts and their consumers | Traced the `**Files:**` template, `## Final review`, `execute.md` `## Posture` / Workflow step 8 / `## Stop Conditions`, the budget test, consumers in `verify.md`, `systematic-review.md`, and `stage-runner/README.md`, and the `030cad3` fixture plan. |
| `chezmoi` | `skill-loader` | Edits in the chezmoi source tree | Plan edits only source files and defers `chezmoi apply` to the completion workflow after `/verify`. |
| `feature-worktree` | `prompt-required` | Isolate writes | Continued in the existing feature worktree and rebased it onto `origin/main` (`3c69f96`) before committing the plan. |
| `write` | `skill-loader` | Plan prose | Named exact prompt sections and markers, stated mechanisms, and framed risks as specific failures. |

### Execution
Writer: GPT-6.2 Astra (openai/gpt-6.2-astra).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| skill-loader | prompt-required | Route execution skills | Selected prompt, source, and prose guidance. |
| resolve-worktree, feature-worktree | prompt-required | Locate and isolate edits | Confirmed the unique plan on the pinned feature branch. |
| codebase-research | skill-loader | Trace contracts | Checked the prompt sections and existing marker tests. |
| chezmoi | skill-loader | Select source files | Edited managed sources without applying targets. |
| write | skill-loader | Edit prompt prose | Named binding rules directly and trimmed repeated instructions. |

## Advisory learnings
- `Datadog/Learnings.md` returned one section, "Render piped chezmoi templates against an initialized config, not `--init`". It does not apply because this change renders no templates.

## Requirements
### Requirement: Plan tasks separate binding contracts from suggestions
`plan.md` SHALL describe `**Files:**` paths and internal implementation mechanisms as starting-point suggestions by default. It SHALL require a task to name the requirement, safety constraint, test seam, or agreed design decision that makes a path or mechanism binding. It SHALL keep acceptance scenarios, testing rules, and verification commands binding.

#### Scenario: A task lists navigation paths
- GIVEN the `### Task contract` section of `dot_pi/agent/exact_prompts/plan.md`
- WHEN `lifecycle-prompts.test.mjs` reads it
- THEN the `**Files:**` placeholder describes repo-relative starting-point suggestions, and a rule requires naming the requirement, safety constraint, test seam, or design decision that makes a path or mechanism binding

#### Scenario: Negative — the plan prompt does not demand exact file lists or relax test contracts
- GIVEN the same section
- WHEN the test reads it
- THEN the text `exact repo-relative files to create, modify, or test` is absent, the Small-plan right-sizing line no longer requires `exact files`, and acceptance scenarios, testing rules, and verification commands are stated as binding

### Requirement: Final review traces an allowed scenario through its controls
`plan.md` `## Final review` SHALL require tracing one allowed scenario through every control and prerequisite that applies to it, and SHALL require resolving a contradiction before commit when the controls block the allowed outcome. The check SHALL NOT become a mandatory implementation sequence and SHALL NOT drop distinct happy, edge, failure, or negative cases.

#### Scenario: Final review contains the reachability check
- GIVEN `dot_pi/agent/exact_prompts/plan.md` `## Final review`
- WHEN the test reads it
- THEN it requires tracing an allowed scenario through every applicable control and prerequisite and resolving a blocking contradiction before commit

#### Scenario: Historical contradiction fixture
- GIVEN Task 2 of `git show 030cad3:plans/lifecycle-stage-runner-publication/plan.md`, which requires deferred discovery of ARP tools while its guard admits only three ARP operations
- WHEN a reviewer applies the updated `## Final review` instruction to that task
- THEN the reviewer identifies that the guard blocks the allowed discovery prerequisite, without the rule prescribing one discovery mechanism and without dropping the target/SHA matching, forbidden-write, or non-dispatch cases

#### Scenario: Negative — the trace does not become choreography
- GIVEN the same section
- WHEN the test reads it
- THEN the text still rejects `pre-written implementation choreography` and still requires `happy/edge/failure/negative paths`

### Requirement: Open questions may stay open only when bounded
`brainstorm.md` and `plan.md` SHALL allow an open question in `design.md` or `plan.md` only when the question states why it does not block approval, which stage (`/plan` or `/execute`) resolves it, and which binding boundary constrains the answer.

#### Scenario: Both prompts define bounded open questions
- GIVEN `dot_pi/agent/exact_prompts/brainstorm.md` and `dot_pi/agent/exact_prompts/plan.md`
- WHEN the test reads each prompt
- THEN each prompt states the three conditions: why the question does not block approval, the resolving stage, and the binding boundary

#### Scenario: Negative — an unbounded question still blocks
- GIVEN the same prompts
- WHEN the test reads them
- THEN `brainstorm.md` still requires every material branch to converge before approval, and `plan.md` still forbids placeholders

### Requirement: `/execute` varies suggestions without stopping and stops on binding conflicts
`execute.md` SHALL permit `/execute` to vary suggested files and internal implementation mechanisms, and to resolve explicitly non-binding open questions, without asking. Every binding requirement, safety boundary, agreed design decision, and test/verification contract SHALL still hold, and `/execute` SHALL record each deviation in the plan ledger. The rule SHALL apply to existing, resumed, and pinned plans. A path listed only in `**Files:**` SHALL be a suggestion; a path that the plan or its approved design makes a requirement SHALL stay binding. When `/execute` cannot establish that a substitution preserves every binding constraint, it SHALL stop before editing and ask.

#### Scenario: Prompt states the execution boundary
- GIVEN `dot_pi/agent/exact_prompts/execute.md`
- WHEN the test reads it
- THEN `## Posture` or `## Stop Conditions` permits varying suggested files and internal mechanisms and resolving explicitly non-binding open questions with a ledger note, applies the rule to existing and pinned plans, and treats a path listed only in `**Files:**` as a suggestion

#### Scenario: Resumed-plan fixture, two variants
- GIVEN a plan committed before rollout whose task lists `src/a.ts` in `**Files:**`, and an implementation that writes `src/b.ts` instead while preserving all binding constraints
- WHEN a reviewer applies the updated `execute.md` to variant A (the path appears only in `**Files:**`) and to variant B (the plan states that `src/a.ts` is the required test seam)
- THEN the prompt permits variant A without asking and requires a ledger note, and requires `/execute` to stop before editing and ask in variant B

#### Scenario: Negative — `/execute` stops when it cannot prove the constraints hold
- GIVEN the same prompt
- WHEN the test reads it
- THEN the prompt requires stopping before editing when `/execute` cannot establish that the substitution preserves every binding constraint, and the existing markers `Do not disable a required check, weaken an agreed expectation, or change a tolerance merely to obtain a pass` and `Stop after 3 focused attempts on the same failure` remain

### Requirement: Prompt budgets stay bounded
`brainstorm.md` SHALL stay within 14,000 bytes and `execute.md` within 14,500 bytes. `plan.md` SHALL stay within 17,200 bytes after trimming redundant prose. If trimming cannot fit the additions without removing a tested marker or changing meaning, the `plan.md` budget MAY rise only by the remaining shortfall, to at most 17,600 bytes, with the reason recorded in the plan ledger.

#### Scenario: Budget test passes
- GIVEN the edited prompts
- WHEN `node --test exact_scripts/lifecycle-prompts.test.mjs` runs from `dot_pi/agent`
- THEN the `lifecycle prompts stay within prompt context budgets` test passes

#### Scenario: Negative — the budget does not grow beyond the cap
- GIVEN `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`
- WHEN the reviewer reads the budget map
- THEN `plan.md` is at most `17_600` and every other budget is unchanged

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Plan prompt | `dot_pi/agent/exact_prompts/plan.md` | Binding-vs-suggestion task contract, final-review reachability check, bounded open questions | New marker tests; budget test |
| Execute prompt | `dot_pi/agent/exact_prompts/execute.md` | Permission to vary suggestions with a ledger note; stop when binding constraints cannot be shown to hold | New marker test; existing `execute` tests |
| Brainstorm prompt | `dot_pi/agent/exact_prompts/brainstorm.md` | Bounded open questions in `design.md` | New marker test; budget test |
| Prompt contract tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Assertions for the new rules; budget map | `node --test exact_scripts/lifecycle-prompts.test.mjs` |

Consumers that need no change:
- `dot_pi/agent/exact_prompts/verify.md:27` blocks "Unexplained scope". A substitution that `/execute` records in the plan ledger is explained scope, so `/verify` still traces every acceptance scenario.
- `dot_pi/agent/exact_prompts/systematic-review.md` plan checklist requires "no placeholders". A bounded open question is not a placeholder, and the reviewer can still reject a question that changes scope, API, or safety.
- `dot_pi/agent/exact_extensions/stage-runner/` reads the pinned plan for requirements and the current plan as the ledger; it does not parse `**Files:**` or open questions.
- `dot_pi/agent/exact_extensions/stage-runner/README.md` and the repository `AGENTS.md` contain no plan-format wording that this change affects. Task 5 confirms this.

### Key Decisions
- **Label suggestions explicitly instead of citing `Rn`/`Dn` IDs.** Labels work for designless plans and fail safely: an uncited binding rule is still covered by the requirement it traces to. The rejected citation scheme gives compact mechanical traceability.
- **Keep `**Files:**` paths.** They give `/execute` navigation starting points. Removing paths would eliminate accidental prescription, but `/execute` would then need to find target files again.
- **Reachability is a final-review check, not a plan section.** A mandatory walkthrough section would make the trace visible, but it would add a second step list and use prompt budget.
- **Apply the `/execute` rule to every plan it starts or resumes.** A version marker would preserve old behavior for older plans, but approval would then depend on when the plan was written. A bare path does not record an intent that its author did not write.
- **Budget option A (confirmed by the user).** Trim redundant `plan.md` prose first and raise the budget only by the shortfall, capped at 17,600. Keeping 17,200 with no raise keeps the prompt smallest, but cutting about 600 bytes risks changing the meaning of current wording.
- **Ungrouped plan.** The design has one slice, so slice headings add no execution boundary. Task 6 holds feature-level verification.

### Implementation Constraints
- Preserve every marker that `lifecycle-prompts.test.mjs` asserts today. Do not remove or loosen an existing assertion to pass a test.
- When trimming `plan.md`, change wording only, not meaning. Do not remove a rule.
- Use US English and ASD-STE100 style in prompt text, and keep exact section and marker names.
- Exact prompt phrasing is a suggestion. The binding contract is the requirement text and scenarios above.
- Stop conditions: stop if a new rule conflicts with an existing tested marker, or if `plan.md` cannot fit within 17,600 bytes without dropping a rule.
- Safety: the change relaxes no authentication, authorization, safety, or testing/verification rule. Performance: bounded prompt bytes per the budget requirement. Developer experience: fewer unnecessary `/execute` stops.

### Security and Observability Requirements
No new external calls, credentials, permissions, hooks, or telemetry. The change keeps existing authentication boundaries and deterministic checks unchanged.

### Failure Modes to Handle
- `/execute` reads a binding test seam as a suggestion: the plan prompt requires naming why a path is binding, and the execute prompt stops when it cannot show constraints hold.
- A reviewer reads a deferred open question as permission to defer a product or safety decision: both prompts require the question to name the binding boundary, and `/systematic-review` can reject it.
- Trimming `plan.md` changes an existing rule: the existing marker tests fail, and the constraint above forbids meaning changes.

### Rollout and Rollback
- **Owner:** Matteo Ruina (`maruina/dotfiles`, `dot_pi/agent/`).
- **Rollout:** After `/verify`, follow the repository completion workflow. Run `chezmoi --source "$PWD" diff` for the four changed targets (`~/.pi/agent/prompts/{plan,execute,brainstorm}.md` and `~/.pi/agent/scripts/lifecycle-prompts.test.mjs`), run `chezmoi --source "$PWD" apply` for those targets, then merge through a PR to `main`. `/execute` applies the rule to existing and pinned plans after apply; no plan migration is needed.
- **Rollback:** Revert the commits that touch the three prompts and the test file, then run `chezmoi apply` for the same four targets.

### Test Strategy
- Highest deterministic interface: prompt text read by `lifecycle-prompts.test.mjs` through its `prompt()` and `requireMarkers()` helpers. No new seam.
- Narrow failing command: `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`.
- Full suite: `npm run test:all` after `npm ci --ignore-scripts`.
- No mocks. The two fixture scenarios are manual reviewer reads. They are not automated because they check the meaning of prompt text, which regex assertions cannot judge.

## Validation limits
- The tests establish marker presence and byte budgets. They do not establish that live models follow the rules.
- The `030cad3` fixture checks one historical contradiction. The resumed-plan fixture checks that the prompt gives a clear answer in both variants, not that a live model follows it.
- Live model adherence is an explicitly accepted pre-land gap (approved design `## Validation limits`). The user validates it through real `/brainstorm` → `/plan` → `/execute` runs after landing. This gap does not waive any automated check above.

## Open questions
- None blocking. Exact prompt wording and which redundant `plan.md` prose to trim are resolved during `/execute`, constrained by the requirements above and the existing tested markers.

## Tasks
### Task 1: Plan task contract separates binding contracts from suggestions
**Delivers:** `plan.md` labels `**Files:**` paths and internal mechanisms as suggestions, requires naming why a path or mechanism is binding, and keeps tests and verification binding.
**Blocked by:** None
**Traces to:** Requirement: Plan tasks separate binding contracts from suggestions; Requirement: Prompt budgets stay bounded
**Files:** `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add test `plan separates binding contracts from implementation suggestions`. It asserts the starting-point suggestion wording, the requirement/safety constraint/test seam/design decision rule, and binding acceptance scenarios, testing rules, and verification commands. It also uses `assert.doesNotMatch` for `exact repo-relative files to create, modify, or test` and for `exact files` in the `**Small:**` right-sizing line.
- [x] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new test to fail.
- [x] Edit `### Task contract` in `plan.md`, and qualify `exact files` in the `**Small:**` right-sizing line so that it does not contradict the suggestion rule. Trim redundant `plan.md` prose so the file stays within the budget, or raise the `plan.md` budget by the shortfall (at most `17_600`) and record the reason in the ledger.
- [x] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass, including the budget test.
- [x] Commit with `docs(pi): separate binding plan contracts from suggestions`.

The new marker failed alone. The first prompt edit exceeded the budget by 17 bytes. Removing a repeated format instruction kept the budget unchanged; all 68 tests passed.

### Task 2: Plan final review traces an allowed scenario through its controls
**Delivers:** `plan.md` `## Final review` catches controls that block an allowed outcome before commit.
**Blocked by:** Task 1
**Traces to:** Requirement: Final review traces an allowed scenario through its controls; Requirement: Prompt budgets stay bounded
**Files:** `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add test `plan final review traces an allowed scenario through its controls`. It asserts the trace through every applicable control and prerequisite and the resolve-before-commit rule. It also asserts that `pre-written implementation choreography` and `happy/edge/failure/negative paths` remain.
- [x] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new test to fail.
- [x] Edit `## Final review` in `plan.md`, keeping the budget requirement.
- [x] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
- [x] Commit with `docs(pi): check plan control reachability in final review`.

Only the new trace test failed before the edit. Trimming first broke existing negative-scenario and telemetry markers; restored the markers without changing assertions. All 69 tests passed within budget.

### Task 3: Bounded non-blocking open questions
**Delivers:** `brainstorm.md` and `plan.md` allow open questions in `design.md` and `plan.md` only when each states why it does not block approval, its resolving stage, and its binding boundary.
**Blocked by:** Task 2
Task 2 must land first because Tasks 1-3 share the `plan.md` byte budget.
**Traces to:** Requirement: Open questions may stay open only when bounded; Requirement: Prompt budgets stay bounded
**Files:** `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Add test `brainstorm and plan allow only bounded open questions`. For each prompt, it asserts the three conditions. It also asserts that the existing `every material branch.*no material assumption remains implicit` (brainstorm) and `placeholders` (plan) markers remain.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new test to fail.
- [ ] Edit `brainstorm.md` (for example, near `## Design artifact` item 3 or the brief's `Open questions:` field) and `plan.md`, keeping both budgets.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
- [ ] Commit with `docs(pi): allow bounded non-blocking open questions`.

### Task 4: Execute varies suggestions and stops on binding conflicts
**Delivers:** `execute.md` permits varying suggested files and mechanisms with a ledger note for every plan it starts or resumes, and stops before editing when it cannot show binding constraints hold.
**Blocked by:** Task 1
**Traces to:** Requirement: `/execute` varies suggestions without stopping and stops on binding conflicts; Requirement: Prompt budgets stay bounded
**Files:** `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Add test `execute varies suggestions without stopping and stops on binding conflicts`. It asserts the permission to vary suggestions and to resolve explicitly non-binding open questions, the ledger note, existing and pinned plan coverage, the rule that a path listed only in `**Files:**` is a suggestion, the rule that a path the plan or design requires stays binding, and stop-before-editing when constraints cannot be shown to hold. It also asserts that the `Do not disable a required check…`, `Stop after 3 focused attempts on the same failure`, and `<HARD-GATE>` `scope changes` markers remain.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new test to fail.
- [ ] Edit `## Posture` and/or `## Stop Conditions` in `execute.md`. Qualify Workflow step 8 and the `## Stop Conditions` "differs materially" clause so that a permitted suggestion variance is not a stop.
- [ ] Trace the resumed-plan variant A through every stop control in `execute.md`: the `<HARD-GATE>` "scope changes" clause, `## Posture` "Change only what a plan step or user instruction requires", Task Rules 5 "Perform only the current step" and 9 (exact commit message), the `## Stage runner` "Stop on a mismatch" rule, and the `## Stop Conditions` "has gaps" clause. Qualify each control that blocks variant A, or record in the ledger why it does not block it. Keep the HARD-GATE stop for real scope changes and keep variant B a stop.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
- [ ] Commit with `docs(pi): let execute vary non-binding plan suggestions`.

### Task 5: Documentation and future-agent guidance
**Delivers:** A recorded decision for each documentation surface: updated, or no change with evidence.
**Blocked by:** Tasks 1-4
**Traces to:** Medium-plan documentation requirement; Rollout and Rollback
**Files:** `AGENTS.md`, `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/systematic-review.md`, `plans/plan-contract-boundaries/plan.md`

- [ ] Inspect the repository `AGENTS.md` `## Pi Agent Development` section, `stage-runner/README.md`, `verify.md`, and `systematic-review.md` for wording that contradicts the new rules. Expect no change; the consumer map above gives the evidence.
- [ ] Record the result for each file as a ledger note under this task. If a contradiction exists, stop and ask, because editing these files is outside the approved scope.

### Task 6: Final verification
**Delivers:** Feature-level evidence that all requirements hold together.
**Blocked by:** Task 5
**Traces to:** All requirements; design `## Acceptance and validation` items 1-3
**Files:** `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts && npm test && npm run test:all`; expect every tier to pass. Then run `rm -rf node_modules` in `dot_pi/agent`.
- [ ] Run `wc -c dot_pi/agent/exact_prompts/{plan,execute,brainstorm}.md` and record the byte counts and the `plan.md` budget in the ledger.
- [ ] Fixture check 1: read Task 2 of `git show 030cad3:plans/lifecycle-stage-runner-publication/plan.md` against the updated `## Final review`. Record in the ledger that the rule finds the discovery-vs-guard contradiction and keeps the target/SHA, forbidden-write, and non-dispatch cases.
- [ ] Fixture check 2: apply the updated `execute.md` to the two resumed-plan variants in the Requirement scenario. Record in the ledger that variant A proceeds with a ledger note and variant B stops before editing.
- [ ] Confirm `git status` shows only planned files changed, and that `git diff origin/main -- dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` removes no existing assertion.

## Learning candidates
- None recorded during planning.
