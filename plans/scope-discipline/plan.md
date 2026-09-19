# Scope Discipline and Repeatable Slice Execution Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the smallest user-feedback slice the binding scope boundary in `/brainstorm`, `/plan`, and `/systematic-review`, and make a committed multi-slice plan executable and verifiable one slice at a time.
**Out of Scope:** Concurrent `/execute` runs or locking; new lifecycle stages, tools, or a slice registry; changes to the `/execute` branch-safety gate or `/verify` model-separation and read-only contracts; auto-merge or `reviewable-pr-workflow` policy; a standalone deferred-work artifact; mandatory multi-slice plans or changes to `simplify.md`, `pr-*.md`, `learn.md`, `resolve-worktree`, or `learn-evidence.mjs`.
**Smallest user-feedback slice:** One shipped PR whose prompt and marker changes make the next `/brainstorm` → `/plan` → `/systematic-review` → `/execute` → `/verify` cycle enforce the smallest user-feedback slice and execute a multi-slice plan slice by slice; verified with marker tests and the dry-run checks in Task 7.
**Architecture:** Not applicable — text changes to five chezmoi-managed Pi prompt files plus marker assertions in one existing test script. Single-slice plan: no `### Slice N` grouping; one PR carries the whole change per user decision.
**Tech Stack:** Markdown prompts, Node.js `node:test` markers (`lifecycle-prompts.test.mjs`), npm scripts under `dot_pi/agent`, chezmoi source management.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The planning input is a design path in another worktree | Resolved `plans/scope-discipline/design.md` to the `maruina/scope-discipline` worktree; all work stays there |
| `skill-loader` | `prompt-required` | Repository guidance requires it before planning | Identified `chezmoi` and `write`; confirmed no language/domain skills match the affected files |
| `chezmoi` | `skill-loader` | Edits target chezmoi source under `dot_pi/agent/exact_prompts/` | Kept edits in the source tree, pinned targeted `chezmoi diff` inspection and the AGENTS.md dependency/verify sequence |
| `write` | `skill-loader` | The changes are prose contracts read by humans and models | Applied short literal sentences, one path for the common case, benefit-first rejected alternatives; used for this plan |
| `obsidian-cli` | `prompt-required` | `/plan` advisory learning lookup | Ran the lookup for `scope creep`, `smallest slice`, `vertical slice`, `prompt design`, `context budget`; zero matching sections; recorded as empty, consistent with the design's own lookup |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/execute` requires selecting skills before editing | Identified `chezmoi` and `write`; confirmed no language or domain skill matches the Markdown prompt edits |
| `chezmoi` | `skill-loader` | Edits target chezmoi source under `dot_pi/agent/` | Kept edits in the source tree and inspected a targeted read-only `chezmoi diff`; deferred apply to after `/verify` |
| `write` | `skill-loader` | The edits are model-facing prose contracts | Applied short literal sentences, one path for the common case, and consistent terminology across the five prompts |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Design boundary | `dot_pi/agent/exact_prompts/brainstorm.md` | Rename the alignment-brief `First slice:` field to `Smallest user-feedback slice:` with the user-sees/learns/why-not-smaller content rule; add the alternate-design selection and deferral rule; extend the design-artifact contract and self-review | Markers in `lifecycle-prompts.test.mjs` |
| Plan boundary and slicing | `dot_pi/agent/exact_prompts/plan.md` | `Smallest user-feedback slice:` field in the alignment brief and durable plan header; conditional `### Slice N` grouping rules; task-outside-slice is a follow-up; `Final verification` item; final-review checks | Markers plus byte-budget test |
| Review challenge | `dot_pi/agent/exact_prompts/systematic-review.md` | Four plan-review checklist items: slice named and is slice 1; every requirement maps to a slice or is deferred; re-entered scope is deferred with a revisit trigger; feature-level criteria present for final verification | Markers |
| Repeatable execution | `dot_pi/agent/exact_prompts/execute.md` | Multi-slice unit: run the first slice with incomplete tasks, update the ledger, stop and hand off; resume on a later run; named-slice option; unchanged single-slice path | Markers |
| Slice-aware verification | `dot_pi/agent/exact_prompts/verify.md` | Slice-scoped scenario selection; later-slice scenarios recorded as `deferred to slice N`; final-slice whole-feature pass with cumulative-state reconstruction and `BLOCKED` fallback | Markers |
| Structural enforcement | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Marker assertions for every new rule; byte-budget handling for `plan.md` | `npm run test:prompts` |

### Key Decisions
- **Budget raise-if-needed (user confirmed):** Draft `plan.md` additions tightly and measure after editing. If the result exceeds the 18,000-byte budget, raise it to 19,000 in the budgets map and record the justification in the plan ledger. Do not weaken existing `plan.md` contract text to make room.
- **One slice, one PR (user confirmed):** All five prompt files and the test script ship together. This plan has no `### Slice N` grouping.
- **Markers as enforcement:** Each new rule gets a regex marker asserting a distinctive phrase, written before the prompt edit so the narrow test fails first (red-green).
- **Plan-anchored slicing:** Slice grouping, the `Final verification` item, and feature base/order recording live in `plan.md`, which is already the progress ledger; no new artifact.

### Implementation Constraints
- Edit only chezmoi source files; never target files under `$HOME` (root `AGENTS.md`, `chezmoi` skill).
- Preserve existing prompt contracts: `## Skills loaded and used`, `## Learning candidates`, `## Handoff` wiring, dependency-aware framing, and the existing checklists stay intact; the new text extends them.
- Prose style per the `write` skill: short literal sentences, active voice, one path for the common case, benefit-first statement for each rejected alternative, ASD-STE100, no blank line after headings/frontmatter.
- Do not restructure or rewrite unrelated prose in the edited files; every changed line maps to a design requirement.
- Run `npm ci --ignore-scripts` in `dot_pi/agent` before `/verify`; keep dependencies until `npm test` and `npm run test:all` complete, then remove them (root `AGENTS.md`).
- Stop conditions: if the tight `plan.md` draft exceeds 19,000 bytes, stop and ask instead of trimming existing contract text; if a marker test exposes a pre-existing failure unrelated to this change, report it rather than reverting it.

### Security Requirements
None apply. The changes add prompt text and test markers; no secrets, credentials, or personal data. The `/verify` read-only contract and `/execute` branch-safety gate are unchanged.

### Observability Requirements
None apply beyond the design's operability statement: a local agent workflow with no runtime to monitor. Observable artifacts are the committed prompt files, marker-test output, and per-slice `/verify` reports in future cycles.

### Failure Modes to Handle
- **Marker regex too loose** (passes without the rule present): assert distinctive rule phrases, not headings alone; verify by running the test against the pre-edit file.
- **`plan.md` over budget after a tight draft:** raise the budget to 19,000 with recorded justification; if still over, stop and ask.
- **Existing test breaks on unrelated markers:** the new text must not break `## Handoff`, budget, skill-provenance, or learning-candidate assertions; run the full prompt suite after each task.
- **Unreconstructable cumulative state in a future verify:** the `verify.md` text itself requires returning `BLOCKED` instead of guessing; no code to fail here.

### Rollout and Rollback
- **Rollout:** One PR to `maruina/dotfiles` from `maruina/scope-discipline`, following `/execute` → `/verify`. Before `/verify`, validate with `pi --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"` and inspect targeted `chezmoi --source "$PWD" diff` output without applying. After `VERIFIED`, apply the changed prompt and test-script targets.
- **Rollback:** `git revert` the PR merge, inspect the same targeted diff, apply the reverted targets. Owner: Matteo.
- Prompts are read at invocation; no migration concern.

### Test Strategy
| Requirement | Interface | Seam | Pre-implementation failing check |
|---|---|---|---|
| Design boundary markers | `node --test exact_scripts/lifecycle-prompts.test.mjs` | Existing `requireMarkers` style; no new seam | New `brainstorm.md` assertions fail on the current file |
| Plan boundary and slicing markers | same | same | New `plan.md` assertions fail |
| Review-challenge markers | same | same | New `systematic-review.md` assertions fail |
| Execution markers | same | same | New `execute.md` assertions fail |
| Verification markers | same | same | New `verify.md` assertions fail |
| Context budgets | same (budgets test) | same | Budget assertion fails only if `plan.md` exceeds the limit |
| Handoff and provenance integrity | `npm run test:prompts` (full) | existing | Green before work starts (confirmed) |
| Prompt loading integrity | `pi --no-prompt-templates --prompt-template` | CLI, exit 0 | Not applicable (loading already works) |
| chezmoi targeting | targeted `chezmoi --source "$PWD" diff` | CLI, read-only | Diff shows only the five prompts plus test script |

Mock boundaries: none needed — the test seam reads prompt files directly; no external services.

## Acceptance criteria

### Requirement: Design-stage boundary
`brainstorm.md` SHALL require the smallest user-feedback slice field with its content rule, the alternate-design selection and deferral rule, the design-artifact contract items, and the self-review check.

#### Scenario: Brainstorm markers pass
- GIVEN the edited `brainstorm.md` in the worktree
- WHEN `node --test exact_scripts/lifecycle-prompts.test.mjs` runs from `dot_pi/agent`
- THEN the `brainstorm.md` assertions match and the suite exits 0

### Requirement: Plan-stage boundary and conditional slicing
`plan.md` SHALL carry `Smallest user-feedback slice:` in the planning alignment brief and the durable plan header, SHALL state that `### Slice N` grouping applies only when a plan needs more than one shippable slice with slice 1 as the smallest slice and Small/direct work exempt, SHALL state that a task outside the current slice is a follow-up, SHALL require a `Final verification` item naming feature-level criteria, and SHALL add the final-review checks for slicing and deferral.

#### Scenario: Plan markers pass
- GIVEN the edited `plan.md`
- WHEN the narrow test runs from `dot_pi/agent`
- THEN the `plan.md` assertions match and the suite exits 0

### Requirement: Review challenge against the smallest slice
`systematic-review.md` SHALL add the four plan-review checklist items from the design and SHALL challenge scope against the smallest user-feedback slice, recommending deferral by default when scope exceeds it.

#### Scenario: Review markers pass
- GIVEN the edited `systematic-review.md`
- WHEN the narrow test runs from `dot_pi/agent`
- THEN the `systematic-review.md` assertions match and the suite exits 0

### Requirement: Repeatable slice execution
`execute.md` SHALL state that a plan without slice grouping executes as today, and that a plan with `### Slice N` headings runs only the first slice with incomplete tasks, updates the ledger, stops after handoff, resumes at the next incomplete slice on a later run, executes a user-named slice when its blockers are complete, and applies the stack-split check per slice.

#### Scenario: Execution markers pass
- GIVEN the edited `execute.md`
- WHEN the narrow test runs from `dot_pi/agent`
- THEN the `execute.md` assertions match and the suite exits 0

### Requirement: Slice-aware and final verification
`verify.md` SHALL state that a plan without slice grouping verifies every acceptance scenario as today, that a grouped plan verifies only the current slice's scenarios while recording later-slice scenarios as `deferred to slice N`, and that on the final slice it also verifies the plan's feature-level criteria against the design goals by reconstructing the cumulative state from the feature base, merged slices, and current candidate, returning `BLOCKED` when reconstruction is impossible.

#### Scenario: Verification markers pass
- GIVEN the edited `verify.md`
- WHEN the narrow test runs from `dot_pi/agent`
- THEN the `verify.md` assertions match and the suite exits 0

### Requirement: Context budgets hold
`brainstorm.md` SHALL stay within 14,000 bytes; `plan.md` SHALL stay within its budget (18,000, or 19,000 if raised with recorded justification).

#### Scenario: Budget assertions pass
- GIVEN the edited prompts
- WHEN the budgets test runs
- THEN both files are within budget and the recorded decision (raise or no raise) matches the measured bytes

### Requirement: Lifecycle contract integrity
The existing handoff, skill-provenance, learning-candidate, and structural assertions SHALL continue to pass, and the source prompt directory SHALL load under `pi --no-prompt-templates --prompt-template`.

#### Scenario: Full prompt suite and load check pass
- GIVEN all edits complete
- WHEN `npm run test:prompts` runs and `pi --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"` executes from the worktree root
- THEN both exit 0

## Tasks

### Task 1: Design-stage boundary in `brainstorm.md`
**Delivers:** `brainstorm.md` enforces the smallest user-feedback slice at design, with the alternate-design selection and deferral rule; its markers exist and pass.
**Blocked by:** None
**Traces to:** Design overview section 1 (Boundary at design); requirement "Design-stage boundary"
**Files:** `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add the new `brainstorm.md` marker assertions to `lifecycle-prompts.test.mjs`; run `node --test exact_scripts/lifecycle-prompts.test.mjs` and expect the new test to fail.
- [x] In `brainstorm.md`, rename the alignment-brief field `First slice:` to `Smallest user-feedback slice:` and require it to state what the user sees, what the team learns, and why no smaller slice produces that feedback. Keep the earlier `## First slice` guidance section consistent with the renamed field.
- [x] Add the selection rule: when more than one design or approach is viable, select the one whose smallest slice produces user feedback fastest; every non-selected design becomes a non-goal or a deferred item with a revisit trigger; do not merge designs to satisfy more stakeholders; a better long-term design is not a reason to widen the first slice.
- [x] Add the smallest user-feedback slice and the deferred alternatives to the design-artifact contract (step 3) and the self-review check that the slice produces user feedback and that non-selected alternatives are deferred rather than merged (step 4).
- [x] Run `wc -c dot_pi/agent/exact_prompts/brainstorm.md`; expect at most 14,000 bytes.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect 0 failures.
- [x] Commit with `feat(pi): anchor brainstorm designs to the smallest user-feedback slice`.

### Task 2: Plan-stage boundary and conditional slicing in `plan.md`
**Delivers:** `plan.md` requires the smallest-user-feedback-slice field for every plan and defines conditional `### Slice N` grouping, deferral, and the final-verification item; its markers exist and pass; the budget decision is recorded.
**Blocked by:** None
**Traces to:** Design overview section 2 (Boundary at plan); requirement "Plan-stage boundary and conditional slicing"; requirement "Context budgets hold"
**Files:** `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add the new `plan.md` marker assertions; run `node --test exact_scripts/lifecycle-prompts.test.mjs` and expect the new test to fail.
- [x] Add `Smallest user-feedback slice:` to the planning-alignment-brief template and to the durable plan header block, required for every plan.
- [x] Add the conditional grouping rules, drafted tightly: `### Slice N: <title>` headings only when a plan needs more than one shippable slice (Medium or Large/Risky work, or deliberately deferred scope); each heading names the user feedback it delivers; slice 1 is the smallest user-feedback slice; Small/direct plans keep the concise `## Scope`/`## Validation` shape with one execution unit; a task outside the current slice is a follow-up; deferred work appears under `Out of Scope` or as a later slice with a blocking edge; acceptance scenarios map to a slice through their tasks; a multi-slice plan records a `Final verification` item naming the feature-level acceptance criteria.
- [x] Add the final-review checks: slicing used only when needed, and scope beyond the smallest slice explicitly deferred.
- [x] Run `wc -c dot_pi/agent/exact_prompts/plan.md`. If over 18,000 bytes after a tight draft, raise the budget to 19,000 in the budgets map and record the justification in this plan's ledger; if over 19,000, stop and ask.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect 0 failures.
- [x] Commit with `feat(pi): add smallest-slice boundary and conditional slicing to plan`.

### Task 3: Review challenge in `systematic-review.md`
**Delivers:** The plan-review checklist challenges scope against the smallest user-feedback slice and requires deferral with revisit triggers; its markers exist and pass.
**Blocked by:** None
**Traces to:** Design overview section 3 (Review challenge); requirement "Review challenge against the smallest slice"
**Files:** `dot_pi/agent/exact_prompts/systematic-review.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add the new `systematic-review.md` marker assertions; run the narrow test and expect the new test to fail.
- [x] Add the four checklist items: the smallest user-feedback slice is named and is slice 1; no requirement or task entered without a slice mapping unless explicitly deferred; scope that re-entered from an alternative design or a prior review is deferred with a revisit trigger; the plan carries enough feature-level criteria for the final verification.
- [x] State that the review challenges against the smallest user-feedback slice, not only against the design, and recommends deferral by default when scope exceeds it.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect 0 failures.
- [x] Commit with `feat(pi): challenge plan scope against the smallest slice in review`.

### Task 4: Repeatable slice execution in `execute.md`
**Delivers:** `execute.md` runs one incomplete slice per invocation for grouped plans and stops for feedback, while keeping the single-slice path unchanged; its markers exist and pass.
**Blocked by:** Task 2 (execute reads the `### Slice N` grouping Task 2 defines)
**Traces to:** Design overview section 4 (Repeatable slice execution); requirement "Repeatable slice execution"
**Files:** `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add the new `execute.md` marker assertions; run the narrow test and expect the new test to fail.
- [x] Add the multi-slice unit: read the plan, find the first slice with incomplete tasks, execute only that slice; after the slice's verification passes and the ledger is updated, stop and hand off without auto-running remaining slices; a later run resumes at the next incomplete slice; a user-named slice runs when it has no incomplete blockers; a slice ships as one or more pull requests with the existing stack-split check applied to the slice; the terminal state for a multi-slice plan is one verified slice increment with the plan updated as the ledger.
- [x] State explicitly that a plan with no slice grouping executes all tasks as today and hands off once.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect 0 failures.
- [x] Commit with `feat(pi): execute one incomplete slice per run for multi-slice plans`.

### Task 5: Slice-aware and final verification in `verify.md`
**Delivers:** `verify.md` verifies slice-scoped scenarios for grouped plans, records later-slice scenarios as deferred, and runs the final whole-feature pass with a `BLOCKED` fallback; its markers exist and pass.
**Blocked by:** Task 2
**Traces to:** Design overview section 5 (Slice-aware and final verification); requirement "Slice-aware and final verification"
**Files:** `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Add the new `verify.md` marker assertions; run the narrow test and expect the new test to fail.
- [x] Add slice awareness: for a grouped plan, read the slice grouping and current slice; verify only the acceptance scenarios whose tasks belong to the current slice; record scenarios belonging to later slices as `deferred to slice N` without blocking; state that a plan with no slice grouping verifies every scenario as today with no separate final pass.
- [x] Add the final pass: when the current slice is the final slice, also verify the plan's feature-level criteria against the design goals, reconstructing the cumulative state from the feature base, merged slices, and current candidate, recording the reconstruction method; return `BLOCKED` instead of guessing when reconstruction is impossible.
- [x] State that the verdict stays `VERIFIED` or `BLOCKED` and a multi-slice verdict names the slice it covers.
- [x] Run `node --test exact_scripts/lifecycle-prompts.test.mjs`; expect 0 failures.
- [x] Commit with `feat(pi): verify multi-slice plans slice by slice with a final feature pass`.

### Task 6: Docs, AGENTS.md, and full validation
**Delivers:** Documentation impact recorded, `AGENTS.md` inspected with a recorded decision, full test suite green with deps removed, prompt-loading check and targeted chezmoi diff inspected.
**Blocked by:** Tasks 1-5
**Traces to:** Design testing strategy items 1-3 and rollout; Medium documentation contract
**Files:** `plans/scope-discipline/plan.md` (ledger updates only)

- [x] Inspect root `AGENTS.md` and `dot_pi/agent/AGENTS.md`: the lifecycle line already points to the prompts as stage source of truth, so no `AGENTS.md` change is required; record this decision in the ledger. No user/developer docs, READMEs, runbooks, or generated references cover the lifecycle prompts, so no other doc updates apply.
- [x] Run `cd dot_pi/agent && npm ci --ignore-scripts && npm test && npm run test:all`; expect all green. Remove the installed dependencies afterward.
- [x] From the worktree root, run `pi --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"`; expect exit 0.
- [x] Run `chezmoi --source "$PWD" diff dot_pi/agent/exact_prompts/brainstorm.md dot_pi/agent/exact_prompts/plan.md dot_pi/agent/exact_prompts/systematic-review.md dot_pi/agent/exact_prompts/execute.md dot_pi/agent/exact_prompts/verify.md dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; expect the diff to contain only this change's edits. Do not apply; application happens after `/verify`.
- [x] Update the plan ledger: deviations, the budget decision (raise or no raise with measured bytes), and skill provenance.

## Validation summary

- Narrow per-task check: `node --test exact_scripts/lifecycle-prompts.test.mjs` from `dot_pi/agent`, red before each prompt edit and green after.
- Full regression: `npm run test:prompts`, then `npm test` and `npm run test:all` with deps installed per root `AGENTS.md`.
- Budget check: `wc -c` on `brainstorm.md` and `plan.md` after each edit, against the budgets test.
- Loading and targeting: the `pi --no-prompt-templates --prompt-template` check and the read-only targeted `chezmoi diff` inspection from Task 6.
- Behavior dry runs (design testing strategy items 4-6) are observation-based and validated over the next real cycles; they are recorded as the effectiveness validation path, not as tasks here.

## Execution notes
- No deviations from the committed tasks. Each prompt edit was preceded by failing marker assertions and followed by a green narrow test.
- Budget decision: no raise. After the tight draft, `plan.md` measured 17,721 bytes and `brainstorm.md` 11,837 bytes, both within the 18,000 and 14,000 budgets. The budgets map stays unchanged.
- Equivalent command: the prompt-loading check ran in read-only RPC mode because the plan's interactive command needs a TTY. `printf '%s\n' '{"type":"get_commands"}' | PI_OFFLINE=1 pi --mode rpc --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"` exited 0 and listed all five prompt commands. No `[Extension issues]`.
- Task 6 recorded the `AGENTS.md` decision: the lifecycle line in `AGENTS.md` and `dot_pi/agent/AGENTS.md` already points to the prompts as the stage source of truth, so no `AGENTS.md` change is required; no other docs cover the lifecycle prompts.

## Learning candidates
- 2026-09-19: `chezmoi diff` accepts target paths, not source-relative paths, so the plan's source-relative diff command failed with `not managed`; rerun with resolved `~/.pi/agent/...` targets — evidence: `chezmoi --source "$PWD" diff dot_pi/agent/exact_prompts/brainstorm.md` returns `chezmoi: dot_pi/agent/exact_prompts/brainstorm.md: not managed`, while `chezmoi --source "$PWD" target-path dot_pi/agent/exact_prompts/brainstorm.md` returns `~/.pi/agent/prompts/brainstorm.md`.
