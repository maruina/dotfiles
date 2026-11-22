# Separate binding contracts from implementation suggestions in lifecycle plans
**Status:** Approved

## Summary
A fresh `/execute` agent must know which plan elements are binding contracts and which elements are implementation suggestions it can vary without stopping. Keep every observable requirement, safety boundary, agreed design decision, and testing/verification rule binding. Allow `/execute` to adapt routine implementation details ("the how"), guided by the model and loaded skills, and catch self-contradictory controls during `/plan` final review before commit.

## Context and evidence reviewed
- **`dot_pi/agent/exact_prompts/plan.md` (16,987 / 17,200 bytes at `ba51ff7`):** The task template requires `**Files:** [exact repo-relative files to create, modify, or test]`. `## Final review` rejects "pre-written implementation choreography," but neither section states whether `/execute` may vary listed paths or internal mechanisms.
- **`dot_pi/agent/exact_prompts/execute.md` (13,636 / 14,500 bytes at `ba51ff7`):** `## Posture` states "Change only what a plan step or user instruction requires," `## Workflow` step 8 tells the agent to stop on ambiguities before modifying files, and `## Stop Conditions` tells the agent to stop when the plan differs materially from the codebase. Even if `plan.md` labels suggestions, `execute.md` does not explicitly permit varying them without stopping.
- **`dot_pi/agent/exact_prompts/brainstorm.md` (13,429 / 14,000 bytes at `ba51ff7`):** Requires every material branch to converge before approval and defines no rule for open questions that are safe to defer to `/plan` or `/execute`.
- **`dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` and `dot_pi/agent/exact_extensions/stage-runner/`:** Automated tests enforce prompt contract markers and per-prompt byte budgets (`brainstorm.md`: 14,000; `plan.md`: 17,200; `execute.md`: 14,500). Both `execute.md` and `stage-runner` treat `plan.md` as the progress ledger (`- [x]` checkboxes, writer IDs, `### Execution` skills, and deviation notes).
- **Stage Runner publication run at `030cad3` (Slice 1 — motivating context only):** Slice 1 initially stopped over a perceived conflict between interactive `gh` account selection and subprocess authentication, even though the rules applied to different callers (`execute-1/accepted.json` records operator acceptance). Slice 1 is context only; this design does not change or relax caller-specific authentication boundaries.
- **Stage Runner publication run at `030cad3` (Slice 2 — contradiction evidence):** Slice 2 required deferred discovery of Agentic Review Platform (ARP) operations, while its tool guard denied every tool except three operations that were not yet discoverable. `execute-2/handoff.json` records a stop before edits or tests. That stop came from a self-contradictory plan, not an observed unauthorized call.
- **External references:**
  - Datadog AI Native SDLC Playbook (Confluence page `7376601403`, Phase 2 and Phase 3A): Design leaves intentional implementation details to Build and Test; a plan names files *expected* to change and maps acceptance criteria to checks; during execution, the agent handles ordinary implementation details without per-edit approval, updates the plan when departing materially, and returns to the engineer when a material assumption or decision changes.
  - Cedric's OpenSpec changes in `~/dd/computecla-controllers/openspec/changes` (`rework-workflow-start`, `add-release-actions-engine`) and [OpenSpec's spec-driven schema](https://github.com/Fission-AI/OpenSpec/blob/0c737dc1b543249b38b0f4716816fcf493d894dd/schemas/spec-driven/schema.yaml): separate testable requirements from numbered design decisions (`D1`…`Dn`) cited in tasks, with non-blocking open questions, change-ordering notes, and short `Verify …` tasks.
  - [Matt Pocock's ticket guidance](https://github.com/mattpocock/skills/blob/abeeaf95660ba9e8b7c753eb38f441ca707a8823/skills/engineering/to-tickets/SKILL.md): favors observable slices and avoids brittle file prescriptions.
- **Advisory learnings (`Datadog/Learnings.md`):** Queried with `plan`, `brainstorm`, `execute`, `openspec`, and `prompt`; 7 sections returned, none applicable to lifecycle prompt contracts.

## Goals and non-goals
**Goals:**
- Make it unambiguous in `plan.md` and `execute.md` that observable requirements, safety boundaries, agreed design decisions, and testing/verification rules are binding, while listed files and internal implementation mechanisms are suggestions by default.
- Catch self-contradictory controls during `/plan` final review before a plan is committed.
- Allow explicitly non-blocking open questions in `design.md` and `plan.md` to be resolved during `/plan` or `/execute` without blocking approval.

**Non-goals (out of scope):**
- Long-lived per-capability specifications with merge-on-archive (OpenSpec archive workflow).
- Prescriptive step-by-step implementation choreography inside tasks.
- A standalone plan-format linter or schema validator.
- Relaxing any authentication, authorization, safety, or testing/verification rule.
- Migrating existing plans or modifying historical Stage Runner run evidence.

## Assumptions
- The recurring `/execute` stops stem primarily from imprecise or self-contradictory plans and the absence of an explicit permission in `execute.md` to vary non-binding suggestions, not from a defect in Stage Runner's orchestration mechanics.
- Prompt additions can stay within `lifecycle-prompts.test.mjs` byte budgets by tightening existing prose in `plan.md` (213 bytes of headroom), `brainstorm.md` (571 bytes), and `execute.md` (864 bytes), or by justifying any deliberate budget adjustment during `/plan`.
- Live LLM compliance with prompt wording is verified through real `/brainstorm` → `/plan` → `/execute` runs after landing rather than through a pre-land LLM evaluation harness.

## Smallest user-feedback slice
This single slice is the **complete scope of this design**. No later slices are implied; every other candidate pattern is explicitly deferred or rejected below with a revisit trigger.

**Do first:**
1. **`dot_pi/agent/exact_prompts/plan.md` — binding-vs-suggestion task contract:** Keep repo-relative `**Files:**` paths for navigation, but state that listed files and internal implementation mechanisms are starting-point suggestions by default. Require the task to name the specific requirement, safety constraint, test seam, or agreed design decision whenever a path or mechanism is binding. Keep observable acceptance scenarios, testing rules, and verification commands binding.
2. **`dot_pi/agent/exact_prompts/plan.md` — final-review control reachability check:** In `## Final review`, require tracing one allowed scenario through every control and prerequisite that applies to it. If the controls block the allowed outcome, resolve the contradiction before committing the plan. Keep the trace as a review check on an observable scenario, not a mandatory implementation sequence, and preserve all distinct happy, edge, failure, and negative cases.
3. **`dot_pi/agent/exact_prompts/plan.md` and `dot_pi/agent/exact_prompts/brainstorm.md` — non-blocking open questions:** Allow open questions in `design.md` and `plan.md` when each states why it does not block approval, which stage (`/plan` or `/execute`) resolves it, and what binding boundary constrains the choice.
4. **`dot_pi/agent/exact_prompts/execute.md` — matching execution boundary:** Add an explicit rule in `## Posture` / `## Stop Conditions` permitting `/execute` to vary suggested files and internal implementation mechanisms—and to resolve explicitly non-binding open questions—without stopping to ask, provided every binding requirement, safety boundary, agreed design decision, and test/verification contract still holds and the deviation is recorded in the plan ledger. Apply the same rule when resuming an existing or pinned plan. A path listed only in `**Files:**` is a suggestion, even if the plan predates rollout. A path remains binding when the plan or its approved design makes the location a requirement. If `/execute` cannot establish that the substitution preserves all binding constraints, it must stop before editing and ask.
5. **`dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` — prompt contract coverage:** Add assertions covering the new rules in `plan.md`, `execute.md`, and `brainstorm.md`, and verify all prompt byte budgets pass.

**What the user sees:**
- Plans keep clear navigation hints and strict testing contracts, while `/execute` stops pushing back on routine implementation choices ("the how") and `/plan` catches control contradictions before commit.

**What the team learns:**
- Whether separating binding contracts from suggestions across `plan.md`, `execute.md`, and `brainstorm.md` eliminates unnecessary `/execute` stops in real work without causing silent drift from requirements or tests.

**Why no smaller slice produces this feedback:**
- Updating only `plan.md` leaves `execute.md` instructing the agent to stop on any plan divergence or ambiguity. Dropping the final-review reachability check leaves self-contradictory controls (like Slice 2) uncaught until execution. Dropping non-blocking open questions forces `/brainstorm` and `/plan` to invent premature answers for implementation-time details.

## Alternatives compared and deferred items
| Option | Genuine merit | Evidence / tradeoffs | Decision | Revisit trigger |
|---|---|---|---|---|
| **Doing nothing** | Zero edit and test cost. | Leaves `plan.md` ambiguous on `**Files:**` and `execute.md` strict on divergence; unnecessary `/execute` stops continue. | Rejected | None. |
| **Stable `Rn`/`Dn` citations as the binding rule (OpenSpec style)** | Compact mechanical traceability (`(design D9)`): cited elements are binding, uncited elements are suggestions. | Requires adding two ID schemes (`D1`…`Dn` in `brainstorm.md` and `R1`…`Rn` in `plan.md`), does not fit designless plans, and fails unsafely when `/plan` forgets a citation (making a binding rule look optional) or over-cites `Rn` on every file (restoring rigidity). | Deferred | Revisit if multi-slice designs still produce binding-boundary ambiguity after explicit suggestion labeling ships. |
| **Banning file paths in `plan.md`** | Eliminates accidental path prescription. | Removes useful navigation starting points and forces `/execute` to rediscover target files. | Rejected | Revisit only if `/execute` still treats labeled starting-point paths as mandatory. |
| **Mandatory walkthrough section in `plan.md`** | Makes the final-review reachability trace visible in the artifact. | Risks turning one allowed path into a second prescriptive step list and consumes `plan.md` prompt budget. | Deferred | Revisit if `/plan` final review still misses control contradictions after this change. |
| **`Depends on / Must land before` lines** | Tracks ordering across concurrent in-flight changes touching the same contract. | Adds template fields that do not address `/execute` rigidity. | Deferred | Revisit if concurrent in-flight plans repeatedly collide on shared contracts. |
| **Design list of unchanged components with evidence** | Makes untouched boundaries explicit during design review. | Duplicates `plan.md`'s existing requirement to map every shared-component consumer to a task or to evidence that it needs no change. | Rejected / deferred | Revisit if designs repeatedly cause unintended edits to unchanged modules. |
| **Short tasks with one `Verify …` clause and execution logs kept out of `plan.md`** | Keeps `plan.md` concise and reduces ledger diff noise. | Conflicts with `execute.md`, `stage-runner`, and `lifecycle-prompts.test.mjs`, which rely on `plan.md` as the progress ledger (checkboxes, writer IDs, `### Execution` skills, deviation notes). | Deferred | Revisit if `plan.md` ledger edits cause merge noise or bloat across multi-slice runs. |

## Risks and mitigations
- **`/execute` treats a binding test seam or safety constraint as a suggestion and bypasses it:** `plan.md` requires naming the binding requirement, safety constraint, test seam, or design decision whenever a path or mechanism is fixed, and `execute.md` keeps all requirements, safety boundaries, and verification contracts non-negotiable. Independent `/verify` still checks every acceptance scenario.
- **Prompt additions exceed `lifecycle-prompts.test.mjs` byte budgets (especially `plan.md` with 213 bytes remaining):** Tighten redundant phrasing in `plan.md` rather than growing prompt context unboundedly; run `lifecycle-prompts.test.mjs` during implementation to confirm budget compliance.
- **Non-blocking open questions hide unresolved product or safety decisions:** Both `brainstorm.md` and `plan.md` require stating why each open question does not block approval, which stage resolves it, and what binding boundary constrains the answer; `/systematic-review` can reject any question that actually changes scope, API, or safety.

## Operability, rollout, and rollback
- **Rollout:** The authoring rules apply to future designs and plans once the chezmoi source changes are verified, applied (`chezmoi apply`), and merged to `main`. After rollout, `/execute` applies item 4 to every plan it starts or resumes, including existing and pinned plans. No plan rewrite or version marker is required. A bare path does not preserve an intent the author did not record; in contrast, keeping the old interpretation for older plans would make the approval rule depend on when the plan was written.
- **Rollback:** Revert the commit touching `brainstorm.md`, `plan.md`, `execute.md`, and `lifecycle-prompts.test.mjs`, then run `chezmoi apply`. Previous prompt contracts are restored immediately.
- **Ownership:** Maintained in `maruina/dotfiles` under `dot_pi/agent/`.

## Security and data handling
No new external calls, credentials, permissions, or runtime hooks are introduced. Existing authentication boundaries, negative-scenario requirements, and deterministic CI/hook checks remain unchanged.

## Acceptance and validation
1. **Pre-land automated contract check:**
   - **Subject:** Updated `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_prompts/brainstorm.md`, and `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
   - **Actor:** Implementer during `/execute` and independent verifier during `/verify`.
   - **Pass condition:** `npm run test:all` under `dot_pi/agent/` passes (`npm test`, `test:integration` including Stage Runner, `typecheck`, and `test:smoke`), with new assertions confirming the binding-vs-suggestion rules, final-review reachability check, non-blocking open-question rule, and prompt byte budgets.
2. **Pre-land read-only fixture check:**
   - **Subject:** The historical Stage Runner publication Slice 2 ARP contradiction (`030cad3`), used strictly as a read-only prompt-review fixture case (not as ARP system requirements for this change).
   - **Actor:** Reviewer during `/plan` or `/verify`.
   - **Pass condition:** Applying the updated `plan.md` final-review instruction to that fixture identifies the contradiction—an allowed discovery prerequisite was blocked by the tool guard denying all tools except three undiscoverable operations—without requiring the plan to prescribe a single discovery mechanism and without dropping any of the fixture's binding safety or negative cases (target/SHA matching, forbidden writes, non-dispatch evidence on denied calls).
3. **Pre-land resumed-plan fixture check:**
   - **Subject:** Two variants of a pre-rollout plan resumed under the updated `/execute` prompt. Both propose a file substitution. In the first, the original path appears only in `**Files:**` and the substitute preserves all binding constraints. In the second, the approved plan fixes the original path for a required test seam.
   - **Actor:** Reviewer during `/plan` or `/verify`.
   - **Pass condition:** The updated prompt permits the first substitution without asking and requires a note in the plan ledger. It requires `/execute` to stop before editing and ask for approval in the second case.
4. **Post-land live validation:**
   - **Subject:** Real `/brainstorm` → `/plan` → `/execute` runs executed after landing.
   - **Actor:** The user (Matteo), over the following few days.
   - **Pass condition:** `/execute` adapts non-binding files or internal implementation details without stopping for approval (recording deviations in the plan ledger), still stops on binding requirement, safety, or test-contract conflicts, and `/plan` final review catches self-contradictory controls before commit.

## Validation limits
- Automated tests (`lifecycle-prompts.test.mjs` and Stage Runner integration tests) verify prompt text presence, byte-budget compliance, and runner mechanics; they do not prove that live LLMs consistently follow the instructions across arbitrary repositories.
- The Slice 2 fixture check verifies intended prompt reading on one historical failure, not live ARP enforcement or every possible plan contradiction. The resumed-plan fixture checks whether the prompt gives a clear result in both cases, not whether a live model follows it.
- Live model adherence is an **explicitly accepted pre-land validation gap**, to be validated through real usage and iterative prompt tuning after landing rather than through a pre-land LLM evaluation harness.

## Open questions
- None blocking approval. Exact prompt phrasing and byte-budget trimming in `plan.md`, `execute.md`, and `brainstorm.md` are deferred to `/plan` and `/execute`, constrained by `lifecycle-prompts.test.mjs` budgets and existing contract markers.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Route discovery | Selected `codebase-research`, `chezmoi`, and `write` for this revision. |
| `learning-lookup` | `prompt-required` | Check prior guidance | Queried `Datadog/Learnings.md`; no returned section applied to lifecycle prompt contracts. A follow-up lookup for approval boundaries, plan deviations, and file substitutions returned no matches. |
| `obsidian-cli` | `agent-selected` | Read the advisory store | Queried the `main` vault without modifying it. |
| `codebase-research` | `skill-loader` | Verify current prompt contracts and tests | Inspected `plan.md`, `execute.md`, `brainstorm.md`, `lifecycle-prompts.test.mjs`, `stage-runner`, and Cedric's OpenSpec changes. |
| `chezmoi` | `skill-loader` | Respect source/target boundaries | Edited only inside the chezmoi feature worktree without touching `$HOME` targets. |
| `feature-worktree` | `prompt-required` | Isolate writes | Verified `maruina/plan-contract-boundaries` is clean and off `main` before writing. |
| `write` | `skill-loader` | Revise design prose | Structured sections for an external reader, stated concrete mechanisms, framed risks as specific failures, and kept alternatives grounded. |
