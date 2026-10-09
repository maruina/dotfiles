# Brainstorm Evidence Comparison Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/brainstorm` evaluate material alternatives with concrete evidence and show a comparison with the smallest existing-code change before the user confirms the design.
**Smallest user-feedback slice:** One revision of `dot_pi/agent/exact_prompts/brainstorm.md` that the user exercises in later brainstorm sessions.
**Out of Scope:** New or changed contract tests, the bounded behavioral evaluation (E1–E3), independent reviewer, shared-skill extraction, changes to other lifecycle prompts, a general evaluation harness, a higher byte budget, and Jira or Confluence writes.
**Architecture:** Not applicable. The change edits one Markdown prompt. Existing contract tests remain the regression guard.
**Tech Stack:** Pi prompt templates (Markdown), Node `node:test` contract tests, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Planning start and provenance | Selected `chezmoi` and `write`; no language skill applies because only Markdown changes |
| `learning-lookup` | `prompt-required` | Advisory lookup before planning decisions | Searched `Datadog/Learnings.md` for brainstorm, prompt, alternative, byte budget, comparison, lifecycle, contract test, skeptical, and evaluation; only an unrelated chezmoi `execute-template` section matched; no guidance used |
| `chezmoi` | `skill-loader` | Source file under `dot_pi/agent/` | Limited rollout to a targeted `--source "$PWD"` diff and apply of the explicit prompt target |
| `write` | `skill-loader` | Prompt and plan prose | Required precise requirement verbs and benefit-before-rejection wording for the prompt revision |
| `feature-worktree` | `prompt-required` | Durable plan location | Continued in the existing feature worktree; nothing written on `main` |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | Resolve the supplied plan path | Confirmed the plan and switched context to its owning worktree |
| `skill-loader` | `prompt-required` | Select execution skills before editing | Selected chezmoi and prose guidance for the prompt and plan Markdown |
| `feature-worktree` | `prompt-required` | Keep writes in the plan's feature branch | Confirmed this is the correct feature worktree |
| `chezmoi` | `skill-loader` | Source prompt is a managed dotfile | Kept edits in source; will preview the explicit target before any apply |
| `write` | `skill-loader` | Revise lifecycle prompt and record execution notes | Applied concise requirements and evidence-based decision wording |
| `reviewable-pr-workflow` | `prompt-required` | PR handoff and stack-split check | Confirmed this is one reviewable prompt change; no stack split is needed |

## Scope decision
The design scoped the slice to the prompt, focused contract tests, and a bounded behavioral evaluation. At the planning alignment gate, the user narrowed the slice: change only `brainstorm.md` and test the behavior during later sessions. Therefore:
- `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs` do not change. They run as regression checks for the byte budget and tested phrases.
- No execution step claims behavioral acceptance. Structural regression passing does not show that the agent applies the comparison correctly.
- Revisit trigger for the deferred tests: a later edit removes or weakens the new rules, or a session shows the rules are not followed.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Brainstorm prompt | `dot_pi/agent/exact_prompts/brainstorm.md` | Evidence rule, review before confirmation, visible comparison, pre-write recheck | Diff review against R1–R4; regression tests |
| Existing contract tests (unchanged) | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` | Guard the 14,000-byte budget, tested phrases, coaching, provenance, and handoff | `node --test lifecycle-prompts.test.mjs learn-prompts.test.mjs` passes 53/53 |

### Key Decisions
- **Extend, do not add.** Put the evidence rule in the existing `## Method` branch-closure paragraph ("Finish each material branch…"). A separate checklist would repeat the skepticism rules that the prompt already has.
- **Move the review.** Move the skeptical staff-engineer review from `## Design artifact` step 4 to `## Alignment and durable output`, before the brief is presented. The current position applies it only when the output is `design.md`.
- **Single owner.** Design artifact step 4 refers to the review and does not repeat its rules. Moving the text also frees about 370 bytes for the new rules.
- **Visible field.** Add `Alternatives compared:` to the alignment brief template. A comparison that the brief does not show cannot be checked before approval.
- **No numeric threshold.** Material weakening of the reason for the selected direction reopens the comparison. A line count does not, because size does not measure constraint satisfaction.

### Implementation Constraints
- Modify only `dot_pi/agent/exact_prompts/brainstorm.md`, plus execution notes in this plan.
- Keep `brainstorm.md` at or below 14,000 bytes. The baseline is 12,744 bytes. If readable wording does not fit, stop and ask; do not remove safeguards or raise the budget.
- Keep these tested phrases exactly: `non-selected alternatives are deferred rather than merged`, `select the one whose smallest slice produces user feedback fastest`, `Every non-selected design becomes a non-goal or a deferred item with a revisit trigger`, `skeptical throughout the design`, `every material branch … no material assumption remains implicit`, the `## Coaching` rules, `Skills loaded and used` text, learning-lookup references, and the `## Handoff` phrases.
- Do not restate the coaching rules. Recommendations still follow the user's reasoning attempt.
- Do not require a code reference for a preference, a stakeholder decision, or a non-code constraint.
- Do not authorize Jira or Confluence writes. The pre-write recheck applies only when the user already asked for such output.
- Stop for approval when the change needs another lifecycle prompt, a skill, a test change, or a budget increase.
- No hot path, fan-out, persistence, or runtime dependency changes.

### Security Requirements
No access, credential, or data-handling change. The prompt must not tell the agent to copy transcripts, payloads, or secrets into artifacts.

### Observability Requirements
None apply to a Markdown prompt. The user observes later sessions for whether the brief shows the comparison and evidence before approval.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| The agent rejects an alternative with a generic risk | The prompt says to investigate it or mark it unresolved or deferred, not to state it as a demonstrated reason | Diff review (R1); later sessions |
| The agent treats a priority answer as a choice between options | The prompt says a priority is a criterion; only an explicit selection or exclusion is a decision | Diff review (R1) |
| The selected approach grows after selection | The prompt says to reopen the affected comparison | Diff review (R2) |
| The output is Jira or another format, not `design.md` | The review and recheck run before any durable output | Diff review (R3) |
| The rewording breaks a tested phrase or the budget | Regression tests fail; restore the phrase or tighten the new wording | Regression command |

### Rollout and Rollback
Owner: Matteo. After the `/verify` verdict, from the feature worktree root:
1. Run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/brainstorm.md`; expect only the reviewed prompt change.
2. Run `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/brainstorm.md`.
3. Start a fresh Pi session. Active sessions keep the earlier prompt text.

Rollback: revert the implementation commit, then repeat the targeted diff and apply.

### Test Strategy
The highest deterministic seam is the existing file-based contract suite. It checks the budget and preserved phrases only. By user decision, no new contract tests are added, so no command is expected to fail before implementation. The new behaviors (R1–R4) are verified by diff review in this plan and by the user in later sessions.

## Acceptance Requirements
### R1: Evaluate alternatives with evidence
The prompt SHALL require that each material alternative decision evaluates the concrete mechanism against the user's constraints. For code-dependent claims, the agent SHALL inspect the relevant code or tests; naming a file is not evidence. The prompt SHALL separate established risks from hypotheses. It SHALL treat a user priority as an evaluation criterion, not a decision about an option. It SHALL accept stakeholder decisions, preferences, documentation, measurements, and tests as evidence where they apply.

#### Scenario: Unsupported rejection
- GIVEN an alternative is rejected because of a risk that nobody has investigated
- WHEN the agent closes that branch
- THEN the prompt directs it to investigate the risk or mark the branch unresolved or deferred, not to present the risk as demonstrated.

#### Negative scenario: Non-code constraint
- GIVEN the user states a preference that does not depend on code
- WHEN the agent records it
- THEN the prompt does not require a code reference for that preference.

### R2: Reopen a weakened comparison
The prompt SHALL require the agent to reopen the comparison when new requirements or added complexity materially weaken the reason for the selected direction. It SHALL NOT use a fixed line-count threshold or require rechecking every settled alternative after every answer.

#### Scenario: Growth
- GIVEN a selected direction gains a material component after selection
- WHEN the agent continues
- THEN the prompt directs it to compare that direction again with the affected alternative.

#### Negative scenario: Settled branch
- GIVEN no material change affects a settled alternative
- WHEN the user answers another question
- THEN the prompt does not require reopening that alternative.

### R3: Review and show the comparison before confirmation
The prompt SHALL apply the skeptical staff-engineer review before presenting the alignment brief. The review SHALL include:
- a downside of the selected direction
- a genuine merit of each considered alternative
- user feedback from the smallest slice
- deferral, not merging, of non-selected alternatives
- a comparison with the smallest existing-code change across coverage, safety, delivery, cost, validation, and accepted limits, scaled to the decision

The brief template SHALL include an `Alternatives compared:` field with the rejection reasons and revisit triggers. The `## Design artifact` section SHALL refer to the review and SHALL NOT repeat its rules.

#### Scenario: Brief presented
- GIVEN a Medium design with two viable approaches
- WHEN the agent presents the alignment brief
- THEN the brief shows both approaches, the evidence for each, the accepted limits, and a revisit trigger for the deferred one.

#### Negative scenario: Trivial work
- GIVEN Small work with no material alternative
- WHEN the agent presents the brief
- THEN the prompt does not require an exhaustive table or an artificial alternative.

### R4: Recheck before any durable output
Before writing `design.md` or a user-requested substitute such as Jira tickets, the prompt SHALL require the agent to confirm that the confirmed comparison still holds. If it does not, the agent SHALL return to alignment. If nothing material changed, the agent SHALL NOT repeat the full review or ask for approval again.

#### Scenario: Output substitution
- GIVEN the user asks for Jira tickets instead of a design file
- WHEN the agent prepares the output
- THEN the review and recheck apply in the same way as for `design.md`.

#### Negative scenario: No change since confirmation
- GIVEN nothing material changed after the user confirmed the brief
- WHEN the agent writes the design
- THEN it does not ask for approval again.

## Tasks
### Task 1: Revise the brainstorm prompt
**Delivers:** A `brainstorm.md` that implements R1–R4 within the byte budget, with all existing contract tests green.
**Blocked by:** None.
**Traces to:** R1–R4 and the user-narrowed slice.
**Files:** Modify `dot_pi/agent/exact_prompts/brainstorm.md`; record execution notes in `plans/brainstorm-evidence-comparison/plan.md`.

- [x] From `dot_pi/agent/exact_scripts`, run `node --test lifecycle-prompts.test.mjs learn-prompts.test.mjs`; expect 53/53 passing. Run `wc -c ../exact_prompts/brainstorm.md`; expect 12,744 bytes.
- [x] Extend the `## Method` branch-closure paragraph with the R1 evidence rule and the R2 reopen rule.
- [x] In `## Alignment and durable output`, add the R3 review before the brief, add `Alternatives compared:` to the brief template, and add the R4 recheck before durable output.
- [x] Replace `## Design artifact` step 4 with a reference to the review. Keep only the instruction to fix blocking issues inline and record material rejected findings.
- [x] Rerun the regression command; expect 53/53 passing and `brainstorm.md` at or below 14,000 bytes. Record the final byte count: 13,992.
- [x] Review the diff against R1–R4, the scenarios, and the implementation constraints. Check that `genuine merit` appears once and that the prompt contains no numeric line-count threshold. Requirement locations: R1 and R2 in `## Method`; R3 review and visible field in `## Alignment and durable output`; R4 recheck in that section before durable output. The small-work exception remains explicit.
- [x] Run `git diff --check`; expect no output.
- [x] Commit with `feat(pi): require evidence-based alternative comparison in brainstorm`.

**Execution notes:** Intermediate regression runs found a missing preserved phrase and prompt byte-budget overruns (up to 14,251 bytes). The final wording restored the phrase and passed all 53 tests at 13,992 bytes.

### Task 2: Review documentation and prepare verification
**Delivers:** A documented candidate with full package checks and a previewed rollout.
**Blocked by:** Task 1.
**Traces to:** The documentation requirement and repository completion rules.
**Files:** Review `AGENTS.md` and `dot_pi/agent/AGENTS.md`; record results in `plans/brainstorm-evidence-comparison/plan.md`.

- [x] Review both `AGENTS.md` files. Expect no update: each lifecycle prompt is the source of truth for its stage, and no command, script, or test procedure changes. Record the result. No README, runbook, or generated reference covers this prompt.

**Documentation review:** Read repository `AGENTS.md` and `dot_pi/agent/AGENTS.md`. No guidance change is needed: this is a lifecycle prompt-only revision; no command, script, or test procedure changed. No README, runbook, or generated reference covers this prompt.
- [x] From `dot_pi/agent`, run `npm ci --ignore-scripts`, then `npm test` and `npm run test:all`; all suites passed and the smoke test reported no extension issues. Keep `node_modules` for `/verify`, then remove it after the verdict.
- [x] From the worktree root, run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/brainstorm.md`; it shows only the reviewed prompt change. Do not apply before the verdict.
- [x] Commit the execution notes with `docs: record brainstorm-evidence-comparison execution`.

**Execution notes:** `npm ci --ignore-scripts` installed 358 packages and reported 7 audit advisories (3 low, 2 moderate, 2 high). `npm test` and `npm run test:all` passed; the smoke test emitted model-pattern warnings but no extension issues. The targeted chezmoi diff contains only the reviewed `brainstorm.md` change. `node_modules` remains for `/verify`; no apply was run. The stack-split check found no trigger: three changed files, fewer than 400 net added lines, one purpose, and no two soft signals.
