# Stage Runner: design to planning implementation plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator design interactively, obtain an independent review with automatic non-blocking corrections, and plan the reviewed revision without copying paths between sessions.
**Smallest user-feedback slice:** Start `/stage-runner-design <brief>` in a clean feature worktree and reach interactive `/plan` from a draft that needs no edits.
**Out of Scope:** Automatic plan approval or review, implementation, publication, ARP, new orchestration dependencies, changes to standalone command behavior, and automatic worktree creation.
**Architecture:** Add a command to the existing Stage Runner extension, not a second extension or process supervisor. Keep the design transitions separate from the execution and publication policy; use the same process, session, lock, and Rex mechanisms for both. Prompt templates own the review and planning policies; TypeScript checks evidence and advances the run.
**Tech Stack:** TypeScript, Node.js, Pi 1.6.0, Rex, Git, chezmoi, Node test runner.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Lifecycle planning | Selected guidance by affected component. |
| `resolve-worktree` | `prompt-required` | No design path supplied | Located and confirmed the roadmap design. |
| `feature-worktree` | `prompt-required` | New branch requested | Created a worktree from `origin/main` and checked the base checkout. |
| `learning-lookup` | `prompt-required` | Advisory lookup | Searched for `stage-runner` and `systematic-review`; no matching sections or skipped sources. |
| `obsidian-cli` | `agent-selected` | Read advisory store | Retrieved the store through Obsidian. |
| `codebase-research` | `skill-loader` | Shared orchestration | Traced command dispatch, subprocess and prompt contracts, and tests. |
| `cli-best-practices` | `skill-loader` | Operator entry point | Separated design authorization from publication consent. |
| `chezmoi` | `skill-loader` | Managed extension and prompts | Limited rollout to explicit target files. |
| `write` | `skill-loader` | Plan and alignment brief | Described observable transitions and failure boundaries. |

## Implementation Contract
Source: `plans/lifecycle-stage-runner/design.md`, approved roadmap Slice 3. The operator confirmed two vertical slices in one PR, an explicit runner, reuse of existing Stage Runner code, automatic non-blocking fixes, and interactive planning from the **updated** design. Neither slice rolls out alone.

### Components affected and feasibility
In file lists below, `R` means `dot_pi/agent/exact_extensions/stage-runner/`, `P` means `dot_pi/agent/exact_prompts/`, and `S` means `dot_pi/agent/exact_scripts/`. Test commands run from `dot_pi/agent/` unless noted.

| Component | Files | Responsibility and existing mechanism | Verification; if unavailable |
|---|---|---|---|
| Interactive commands | `R/index.ts`, `R/_model.ts` | Reuse scoped model choices, `qualifiedId`, active run, cancellation, progress, version and Rex checks. Use the author's model for planning; exclude every recorded author model from review. | No eligible independent reviewer or unverified Rex means stop. Existing execution startup and consent remain unchanged. |
| Managed interactive draft | `P/brainstorm.md`, `R/index.ts`, `R/_recovery.ts` | Existing Rex launcher takes argv and observes process identity/exit. In the managed author child only, use Pi's documented `agent_settled` and `ctx.shutdown()` after a valid private draft handoff. A settled conversation turn alone does not mean a draft is ready. | Multi-turn fixture plus live interactive trial; no valid handoff or exit evidence means no review. |
| Run supervision and review | `R/_runner.ts`, `R/_recovery.ts`, `P/systematic-review.md` | Reuse `attempt`, `events`, bounded private file reads, `sessionInfo`, cooperative lock, ownership and cleanup. Existing `run` inspects publication targets, so do not route a design run through its post-plan startup. Share the minimum internal code needed, keeping existing handoff schemas valid. | Exercise both modes with real Git and fixture subprocesses; stop on bad session, handoff, or Git evidence. |
| Planning handoff | `P/plan.md` (existing consumer), `R/_recovery.ts`, `R/index.ts` | Launch a fresh interactive session with `/plan` and the explicit approved design; expose the committed correction summary at startup without making it a path argument. Preserve the plan prompt's clean, committed, Approved input check and alignment gate. | Capture argv and input in fixtures; verify actual prompt resolution and interaction live. Do not launch if approval fails. |
| Existing consumers | `R/index.ts`, `R/_runner.ts`, `R/_runner.test.ts`, `R/_integration.test.ts`, `R/_recovery.ts` | `index.ts` and integration tests call `run`; unit tests use `validate`, `preflight`, `events`, `prune`, `sessionInfo`. Both runner and recovery use model identity. Preserve current call behavior. No publisher, ARP, or profile contract change. | Existing fast and integration suites must stay green. |

### Key decisions and constraints
- Use a separate command in the existing extension. Making standalone `/brainstorm` auto-advance would save a command choice but remove the escape hatch. Do not copy the Rex launcher, JSONL reader, session inspector, cancellation loop, or worktree lock into a front-half implementation. This is not a framework rewrite.
- Authorize review fixes and the approval commit only in the explicit design run. The reviewer may correct a reference, wording, or inconsistent terminology when the agreed intent determines the answer. A choice about scope, behavior, cost, dependencies, authorization, or validation goes to the operator. An independent comprehension review is not proof of technical correctness.
- Pin canonical worktree, branch, starting commit, draft path, draft commit, and reviewed commit/blob. Require a regular tracked design at the expected `plans/<feature>/design.md` location (nested package roots allowed); reject escapes, unrelated writes, ambiguous artifacts, and stale or rewritten history. Never approve from transcript text, pane closure, a status word without revision evidence, or an unverified session.
- The approval commit must have the reviewed revision as parent and alter only the status header in that design. Recheck the clean worktree and approved commit/blob before launching planning. The cooperative lock does not exclude external Git clients; detect drift and stop, do not discard other people's changes.

### Security, observability, and failure handling
Use the existing private run root, file permissions, pruning, bounded file sizes, headless idle/wall deadlines, and argv-based child launching. Treat brief, filenames, model output, and correction summaries as data, not shell commands or authority. Scope managed context to the intended child and attempt. Keep private evidence outside Git. Record stage, session identity, disposition, reviewed revision, approval commit, and reason for stopping; do not log the entire design. Do not acquire publication credentials or contact GitHub or ARP for this workflow.

Use one review attempt on the automatic path. When it reports unresolved questions or blockers, resume its saved session in Rex for the manual review workflow, not another automatic approval loop. If the handoff or session is missing or invalid, report the reason and evidence location; never approve. On cancel or timeout, start no next stage, preserve edits, and apply existing child-exit and retained-lock rules. Never retry an uncertain Rex split. Do not close the interactive planning pane just because its first turn settled. Only the managed author handoff triggers automatic child shutdown.

### Test strategy and validation limits
Use the command/prompt contract for standalone behavior and the runner boundary with the existing fixture Pi and Rex for transitions. Use independent disposable Git worktrees, session roots, locks, and fake external commands per scenario. Check actual Git blobs, parent commits, child invocations, and pane ownership rather than absence of errors. No throughput, cost, or reliability-rate claim. Fixtures cannot establish real model compliance, Pi shutdown timing, authentication, or whether a correction preserved intent. Both live paths in Task 4 are delivery gates, not follow-ups.

### Rollout and rollback
Matteo owns the authenticated trial and rollout. Use a disposable local feature worktree and isolated candidate extension/prompts for the trial; do not load two copies of Stage Runner. Keep publication disabled by selecting the design command. After independent verification and passing live gates, review `chezmoi --source "$PWD" diff` for each changed managed target and apply only those explicit paths. To roll back, stop active runs, confirm child exit, restore prior extension and prompt versions, apply the same targets, and restart Pi. Preserve design commits; standalone `/brainstorm`, `/systematic-review`, and `/plan` remain available.

## Execution
### Slice 1: Plan a clean design
**Blocked by:** None. This slice validates the complete no-edit path. Stop on any review requiring changes until Slice 2.

### Task 1: Deliver the opt-in draft, review, and planning path
**Delivers:** A clean design reaches an independent reviewer and then interactive planning with no manual handoff.
**Blocked by:** None
**Traces to:** Roadmap Slice 3, explicit runner, safe reuse, and standalone escape hatch.
**Files:** `R/index.ts`, `R/_runner.ts`, `R/_recovery.ts`, `R/_runner.test.ts`, `R/_integration.test.ts`, `R/_fixtures/pi.mjs`, `R/_fixtures/rex.mjs`, `P/brainstorm.md`, `P/systematic-review.md`, `S/lifecycle-prompts.test.mjs`.

### Requirement: Advance only from completed managed stages
The runner SHALL start review only after the managed author commits a Draft, writes the draft handoff, and exits; it SHALL launch planning only for an independently reviewed and approved revision.

#### Scenario: Valid unchanged draft
- GIVEN a clean feature worktree and two eligible scoped models
- WHEN the managed brainstorm completes and the independent headless reviewer returns a valid `clean` handoff for the unchanged draft
- THEN the runner commits only the approval header and opens interactive `/plan` for that design, without entering post-plan execution.

#### Scenario: No authority to advance
- GIVEN a standalone brainstorm, an unfinished managed conversation, or an invalid managed stage result
- WHEN a turn settles or a pane closes
- THEN no automatic approval or plan launch occurs; standalone design review still requires explicit user approval.

- [ ] Add the failing end-to-end fixture for `clean design` first. Run `node --experimental-strip-types --test --test-name-pattern='clean design' exact_extensions/stage-runner/_integration.test.ts`; expect failure before implementation and an executed, passing case afterward.
- [ ] Register the design command in the existing extension. Share the actual run resources and launch mechanisms listed above; separate only the front-half sequencing and handoff rules. Pass explicit managed context to direct prompts without changing their default policy.
- [ ] Bind review eligibility to the actual saved author session, not only the initial model selection. Exercise model switching, duplicate run/lock, early exit, malformed result, dirty or stale revision, and standalone behavior at the cheapest existing seam that observes each rejection.
- [ ] Run `npm test && npm run test:integration && npm run typecheck`; expect the new transitions and existing post-plan consent, recovery, and publication tests to pass. Refactor only while green and rerun. Commit `feat(pi): plan independently reviewed designs with stage runner`.

### Slice 2: Plan a corrected design or resume its reviewer
**Blocked by:** Slice 1. Complete both outcomes and validate the feature before rollout.

### Task 2: Review and approve the corrected revision
**Delivers:** The planner receives the final corrected design and a summary of committed edits.
**Blocked by:** Task 1
**Traces to:** Automatic non-blocking review fixes and exact-revision approval.
**Files:** `P/systematic-review.md`, `R/_runner.ts`, `R/index.ts`, `R/_runner.test.ts`, `R/_integration.test.ts`, `R/_fixtures/pi.mjs`, `S/lifecycle-prompts.test.mjs`.

### Requirement: Bind approval to the final review
The reviewer SHALL check the revised text after committing mechanical corrections; the runner SHALL approve only that revision when there are no unresolved questions or blockers.

#### Scenario: Correct a reference
- GIVEN a draft with a wrong reference and one unambiguous intended target
- WHEN the reviewer commits the correction and reports a clean result bound to the revised blob
- THEN the approved document matches the corrected document except for its status, and planning starts with the correction summary.

#### Scenario: Stale or excessive changes
- GIVEN the review result names the old blob, another path changed, or the review changed the status itself
- WHEN the runner validates the result
- THEN it preserves the work, reports the mismatch, and neither approves nor launches planning.

- [ ] Add a failing `corrected design` fixture that checks the exact parent, changed paths, final content, and planning input. Implement only the managed correction policy and its Git checks.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern='corrected design' exact_extensions/stage-runner/_integration.test.ts` and `npm test`; expect positive and stale-result tests to pass. Rerun after any refactoring. Commit `feat(pi): approve the corrected design revision`.

### Task 3: Return a blocking decision to the same reviewer
**Delivers:** The operator can continue the review with its original context; no automated approval follows the escalation.
**Blocked by:** Task 1
**Traces to:** Roadmap `needs-human` path and preservation of operator decisions.
**Files:** `P/systematic-review.md`, `R/_runner.ts`, `R/_recovery.ts`, `R/_integration.test.ts`, `R/_fixtures/pi.mjs`, `R/_fixtures/rex.mjs`, `S/lifecycle-prompts.test.mjs`.

### Requirement: Resume without approving
The runner SHALL open the saved reviewer session for a valid `needs-human` result, without approving or opening planning.

#### Scenario: Unresolved design choice
- GIVEN the reviewer identifies a choice that would change behavior
- WHEN it reports that question and `needs-human`
- THEN the runner opens the exact saved reviewer session in Rex and leaves the design unapproved for the operator.

#### Scenario: No safe resume
- GIVEN a missing or mismatched session, cancellation, or uncertain Rex ownership
- WHEN escalation cannot complete safely
- THEN the runner stops without retry, approval, or planning and reports the available recovery evidence.

- [ ] Add a failing `design blocker` subprocess test, implement resume with `sessionInfo` and `recovery`, and assert the resumed session identity and the absence of an approval commit. Exercise failure and cancellation without creating duplicate panes.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern='design blocker' exact_extensions/stage-runner/_integration.test.ts`; expect the operator path to pass. Rerun the integration tier after any shared-launcher change. Commit `feat(pi): resume blocked design reviews in Rex`.

### Task 4: Final verification
**Delivers:** Operator guidance and release evidence for the two outcomes in the approved brief.
**Blocked by:** Task 1, Task 2, Task 3
**Traces to:** Required live trial, standalone fallback, rollout, and future-agent guidance.
**Files:** `R/README.md`, `dot_pi/agent/AGENTS.md`, `AGENTS.md` (review existing source and test procedures; no edit if unchanged), `plans/lifecycle-stage-runner-front-half/plan.md` (record trial outcomes, not private session contents).

- [ ] Document startup, worktree requirement, exact automatic fix boundary, cancellation, evidence, manual blocker resolution, and rollback. Distinguish design authorization from publication consent. Review direct prompt examples and `P/plan.md`; record why unchanged if they still describe standalone behavior. Commit `docs(pi): explain managed design review and recovery`.
- [ ] Run `npm ci --ignore-scripts && npm test && npm run test:all`; require all tiers green, then remove the worktree's installed dependencies per repository guidance. Verify only intended files changed.
- [ ] In real local Rex with authenticated scoped models, run the candidate from two separate disposable feature worktrees. In one, agree a design with an unambiguous reference correction. Confirm author exit, independent model identity, correction and status-only approval commits, and interactive `/plan` reading the corrected text and showing the summary. In the other, leave a material approval question in the draft: confirm the reviewer session ID in the opened pane, unapproved status, and no planning pane. Check local run evidence and Git history; if a trial does not exercise the intended outcome, do not count it as passing. Exit the test sessions, verify child exit and lock cleanup, and remove only trial-owned worktrees. Record actual outcomes before release; no push, PR, ARP, or deployment is part of these runs.
- [ ] Confirm standalone commands and the existing `/stage-runner <plan-path>` contract still pass their regression tests. Record test and trial results and request independent feature-wide verification. Missing required live evidence blocks rollout.
