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
| `codebase-research` | `prompt-required` | `/systematic-review` of this plan | Confirmed prompt budgets, `validate()` stages, `recovery()` lock and pane behavior, and `prune()` deletion of run sessions. |
| `write` | `skill-loader` | Review fixes to this plan | Stated the handoff contracts, terminal state, and session storage as concrete mechanisms. |
| `learning-candidates` | `prompt-required` | Review disproved the quoted-argument approach | Recorded the Pi prompt expansion behavior for `/learn`. |
| `codebase-research` | `prompt-required` | Second `/systematic-review` of this plan | Confirmed that `brainstorm.md` defines no status header, that both direct prompts use `feature-worktree`, and that the fixture Pi does not load extensions. |
| `write` | `skill-loader` | Second review fixes | Replaced history checks with the content-based approval rule and defined the `needs-human` terminal state. |

### Execution
Slice 1 writer: `openai/gpt-6.2-astra` (GPT-6.2 Astra).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Execute a lifecycle slice | Selected worktree, extension, CLI, and writing guidance. |
| `resolve-worktree`, `feature-worktree` | `prompt-required` | Pinned plan | Confirmed the owning feature branch and the committed requirements before edits. |
| `codebase-research` | `skill-loader` | Shared runner | Traced model choice, child launch, Git checks, cancellation, and lock ownership before reusing them. |
| `cli-best-practices` | `skill-loader` | Interactive command | Kept design authorization separate from publication and used structured stage evidence. |
| `chezmoi` | `skill-loader` | Managed files | Edited source only. No changes were applied. |
| `write` | `skill-loader` | Prompt exceptions and ledger | Named the managed stage in each exception and kept the standalone policy intact. |
| `learning-candidates` | `prompt-required` | Review execution surprises | No new candidate. The planner history check is an operator decision. |

## Implementation Contract
Source: `plans/lifecycle-stage-runner/design.md`, approved roadmap Slice 3. The operator confirmed two vertical slices in one PR, an explicit runner, reuse of existing Stage Runner code, automatic non-blocking fixes, and interactive planning from the **updated** design. During `/systematic-review` of this plan, the operator also confirmed one command for the full front half, automatic shutdown of the author and planner panes after a valid handoff, and a run that succeeds only when a plan is committed. Neither slice rolls out alone.

### Components affected and feasibility
In file lists below, `R` means `dot_pi/agent/exact_extensions/stage-runner/`, `P` means `dot_pi/agent/exact_prompts/`, and `S` means `dot_pi/agent/exact_scripts/`. Test commands run from `dot_pi/agent/` unless noted.

| Component | Files | Responsibility and existing mechanism | Verification; if unavailable |
|---|---|---|---|
| Interactive commands | `R/index.ts` | Reuse scoped model choices, `qualifiedId` from `R/_model.ts` (no change), active run, cancellation, progress, version and Rex checks. Launch the planner with the author `Choice` (provider, model, thinking) selected at startup, even if the author switched models in its session; exclude every recorded author model from review. | No eligible independent reviewer or unverified Rex means stop. Existing execution startup and consent remain unchanged. |
| Managed interactive children | `P/brainstorm.md`, `P/plan.md`, `R/index.ts`, `R/_recovery.ts` | Existing Rex launcher takes argv and observes process identity/exit. In the managed author and planner children only, use Pi's documented `agent_settled` and `ctx.shutdown()` after that child's handoff file validates. A settled conversation turn alone does not mean a draft or plan is ready. | Unit test of the shutdown hook with a fake `ExtensionAPI`, multi-turn fixture, and live interactive trial; no valid handoff or exit evidence means no next stage. |
| Run supervision and review | `R/_runner.ts`, `R/_recovery.ts`, `P/systematic-review.md` | Reuse `attempt`, `events`, bounded private file reads, `sessionInfo`, cooperative lock, ownership and cleanup. Existing `run` inspects publication targets, so do not route a design run through its post-plan startup. Share the minimum internal code needed, keeping existing handoff schemas valid. | Exercise both modes with real Git and fixture subprocesses; stop on bad session, handoff, or Git evidence. |
| Planning stage | `P/plan.md`, `R/_recovery.ts`, `R/index.ts` | Launch a fresh interactive session with `/plan` and the explicit approved design. Read the canonical design path and Git-derived correction summary from a bounded private JSON input file for the planner. Preserve the plan prompt's clean, committed, Approved input check and alignment gate; the operator still confirms the planning brief in the pane. The run ends after the planner commits the plan and writes a valid plan handoff. | Capture argv and input in fixtures; verify actual prompt resolution and interaction live. Do not launch if approval fails. |
| Existing consumers | `R/index.ts`, `R/_runner.ts`, `R/_runner.test.ts`, `R/_integration.test.ts`, `R/_recovery.ts` | `index.ts` and integration tests call `run`; unit tests use `validate`, `preflight`, `events`, `prune`, `sessionInfo`. Both runner and recovery use model identity. Preserve current call behavior. No publisher, ARP, or profile contract change. | Existing fast and integration suites must stay green. |

### Key decisions and constraints
- Use a separate command in the existing extension. Making standalone `/brainstorm` auto-advance would save a command choice but remove the escape hatch. Do not copy the Rex launcher, JSONL reader, session inspector, cancellation loop, or worktree lock into a front-half implementation. This is not a framework rewrite.
- Authorize review fixes and the approval commit only in the explicit design run. The reviewer may correct a reference, wording, or inconsistent terminology when the agreed intent determines the answer. A choice about scope, behavior, cost, dependencies, authorization, or validation goes to the operator. An independent comprehension review is not proof of technical correctness.
- Pin canonical worktree, branch, starting commit, draft path, draft commit, and reviewed blob. Require a regular tracked design at the expected `plans/<feature>/design.md` location (nested package roots allowed) whose repo-relative path matches `^[A-Za-z0-9._/-]+$`. Because Pi removes quotes from slash-command arguments, this rule keeps the path intact when the headless reviewer receives it in `$ARGUMENTS`. Reject other paths, escapes, unrelated writes, and ambiguous artifacts. Never approve from transcript text, pane closure, a status word without revision evidence, or an unverified session.
- Approval depends on the design content, not on commit history. Immediately before approval, the runner records `checkedHead` from `HEAD` on the pinned branch and requires a clean worktree. At `checkedHead`, the design blob must equal `reviewedBlob`, line 2 must be exactly `Status: Draft`, and the diff from `draftCommit` must contain no path other than `designPath`. If any check fails, stop before writing the header. It then changes only line 2 to `Status: Approved` and runs `git commit --only <designPath>` with message `docs: approve <feature> design`, so Git updates the index and working tree. Before launching planning, the runner verifies that the approval commit has exactly one parent, `checkedHead`, and changes only `designPath`. Its design blob must match `reviewedBlob` byte for byte except for the substitution of `Status: Approved` for `Status: Draft` on line 2. The worktree must still be clean and on the pinned branch with that commit at its tip. On mismatch, report the expected and observed commit IDs and stop without resetting, undoing commits, or starting `/plan`. *Deliberate limit:* the cooperative lock does not exclude external Git clients. A concurrent writer can leave an approval commit on the branch even when the runner refuses to launch planning. If the header itself must authorize another consumer, prepare the commit in isolation and update the branch only if its tip still equals `checkedHead`. Signing and commit hooks run as for any `git commit`; if a signing prompt exceeds the runner's 10-second Git timeout, the run stops before planning.
- The run holds the lock until the planner exits. It succeeds only when the worktree is clean, the plan handoff names `plans/<feature>/plan.md` beside the approved design, that file is tracked at `HEAD`, and `git diff --name-only <approvalCommit> HEAD` lists only that path. Then the runner releases the lock and prints `/systematic-review <absolute-plan-path>`. `/stage-runner-cancel` stops the planner like any other managed child.
- A valid `needs-human` review ends the run without success. The runner resumes the reviewer session in Rex and waits for that pane to exit. It then closes the pane, records `needs-human` as the completion reason, releases the lock, and launches no other stage. When the operator approves the design in that resumed standalone review, the review prints its own `/plan` handoff.
- As in `run()` for `/execute`, the runner supplies the handoff schemas and managed instructions. The runner appends its instructions after the slash command, as `run()` does for `/execute`; only runner-owned text goes there. Keep that runner-owned text separate from the planner's input data: managed `/plan` reads the private file named by a child-only environment variable, not a path or correction summary interpolated into `$ARGUMENTS`. The author instructions require line 2 of the design to be exactly `Status: Draft`, require the comprehension review for every design size, and tell the author to stay in the current worktree and branch instead of using `feature-worktree` to create or switch worktrees. The planner instructions tell the planner to take the design path from the private input file, skip `resolve-worktree` discovery, and stay in the same worktree and branch. Each direct prompt gets at most one line that states its managed exception. Raise the `systematic-review.md` budget in `S/lifecycle-prompts.test.mjs` from 12,500 to 13,000 bytes because it has 9 bytes of headroom. Keep `brainstorm.md` and `plan.md` within their existing budgets; any other increase needs operator approval.
- A managed child receives its handoff path and expected stage through environment variables set only in that child's argv. The child extension shuts down only when that file validates for that stage; standalone sessions never shut down automatically.

### Handoff and header contracts
Each handoff is a private (0600) UTF-8 JSON file of at most 64 KiB inside the attempt folder, validated by `validate()` with a closed `stage` value. Missing or invalid JSON is a stage failure and is never parsed from prose.

| Stage | Writer | Required fields | Runner check |
|---|---|---|---|
| `design-draft` | Managed `/brainstorm` author | `schemaVersion: 1`, `stage`, nonblank `summary`, `designPath`, `draftCommit` | `draftCommit` is `HEAD`; `git diff --name-only <startCommit> HEAD` lists only `designPath`; line 2 of the design is exactly `Status: Draft`. |
| `design-review` | Headless `/systematic-review` | `schemaVersion: 1`, `stage`, `status` (`clean` or `needs-human`), nonblank `summary`, `reviewedBlob`; `needs-human` also requires nonempty `questions: string[]` | `reviewedBlob` equals `git rev-parse HEAD:<designPath>`, `git diff --name-only <draftCommit> HEAD` lists only `designPath`, and line 2 is still `Status: Draft`. |
| `design-plan` | Managed `/plan` | `schemaVersion: 1`, `stage`, nonblank `summary`, `planPath`, `planCommit` | `planCommit` is `HEAD`; `planPath` is the `plan.md` beside the approved design and is tracked at `HEAD`; `git diff --name-only <approvalCommit> HEAD` lists only `planPath`. |

Before accepting a review result, the runner matches the saved reviewer session to the ID captured from the headless process. It requires recorded model provenance and rejects any overlap with the author session's models, even if the selected reviewer model was independent.

On `clean`, the runner runs the approval checks in Key decisions and commits `docs: approve <feature> design`. Before that commit, the runner builds the correction summary from `git log --format=%s` and `git diff --stat` for `draftCommit..HEAD`. It writes the canonical design path and bounded summary to an attempt-local `0600` JSON file. Managed `/plan` uses the path to locate the design and displays the summary as data. The runner does not interpolate either field or the reviewer's prose into the prompt template.

### Session storage
Author and reviewer sessions stay in the attempt folder because `sessionInfo` requires exactly one saved session there to prove identity and models. *Deliberate limit:* `prune()` deletes them after 100 completed runs; the committed design is the durable record. The planner uses Pi's default session directory, so pruning never deletes the planning conversation.

### Security, observability, and failure handling
Use the existing private run root, file permissions, pruning, bounded file sizes, headless idle/wall deadlines, and argv-based child launching. Treat brief, filenames, model output, and correction summaries as data, not shell commands or authority. The managed review instructions state that the automatic-fix authority ends when the handoff is written; any later turn, including a Rex resume, follows the standalone review gate and needs explicit user confirmation for fixes and approval. Scope managed context to the intended child and attempt. Keep private evidence outside Git. Record stage, session identity, disposition, reviewed revision, approval commit, and reason for stopping; do not log the entire design. Do not acquire publication credentials or contact GitHub or ARP for this workflow.

Use one review attempt on the automatic path. When it reports unresolved questions or blockers, resume its saved session in Rex for the manual review workflow, not another automatic approval loop. If the review session is missing or invalid, report the reason and evidence location; never approve. If the review handoff is missing or invalid but its session is valid, print the `pi --session <file>` command and stop without opening a split. If the author or planner exits without a valid handoff, stop, preserve the work, and report the reason. On cancel or timeout, start no next stage, preserve edits, and apply existing child-exit and retained-lock rules. Never retry an uncertain Rex split. A settled turn never closes a pane; only a valid managed author or planner handoff triggers automatic child shutdown.

### Test strategy and validation limits
Use the command/prompt contract for standalone behavior and the runner boundary with the existing fixture Pi and Rex for transitions. Use independent disposable Git worktrees, session roots, locks, and fake external commands per scenario. Check actual Git blobs, parent commits, child invocations, and pane ownership rather than absence of errors. No throughput, cost, or reliability-rate claim. Fixtures cannot establish real model compliance, Pi shutdown timing, authentication, or whether a correction preserved intent. Both live paths in Task 4 are delivery gates, not follow-ups.

### Rollout and rollback
Matteo owns the authenticated trial and rollout. Use a disposable local feature worktree and a temporary `PI_CODING_AGENT_DIR` that holds the candidate extension and prompts plus copies of the operator's model and authentication configuration; the recovery argv already forwards `PI_CODING_AGENT_DIR` to children. Do not load two copies of Stage Runner. Keep publication disabled by selecting the design command. After independent verification and passing live gates, review `chezmoi --source "$PWD" diff` for each changed managed target and apply only those explicit paths. To roll back, stop active runs, confirm child exit, restore prior extension and prompt versions, apply the same targets, and restart Pi. Preserve design commits; standalone `/brainstorm`, `/systematic-review`, and `/plan` remain available.

## Execution
### Slice 1: Plan a clean design
**Blocked by:** None
**Task 1 verified.** The operator confirmed that planner validation must require `approvalCommit` ancestry and reject unrelated paths in intermediate commits, even when reverted. Design approval remains content-based.

This slice validates the complete no-edit path. Stop on any review requiring changes until Slice 2.

### Task 1: Deliver the opt-in draft, review, and planning path
**Delivers:** A clean design reaches an independent reviewer and then interactive planning with no manual handoff.
**Blocked by:** None
**Traces to:** Roadmap Slice 3, explicit runner, safe reuse, and standalone escape hatch.
**Files:** `R/index.ts`, `R/_index.test.ts` (new), `R/_runner.ts`, `R/_recovery.ts`, `R/_runner.test.ts`, `R/_integration.test.ts`, `R/_fixtures/pi.mjs`, `R/_fixtures/rex.mjs`, `P/brainstorm.md`, `P/systematic-review.md`, `P/plan.md`, `S/lifecycle-prompts.test.mjs`.

### Requirement: Advance only from completed managed stages
The runner SHALL start review only after the managed author commits a Draft, writes the draft handoff, and exits; it SHALL launch planning only for an independently reviewed and approved revision.

#### Scenario: Valid unchanged draft
- GIVEN a clean feature worktree and two eligible scoped models
- WHEN the managed brainstorm completes and the independent headless reviewer returns a valid `clean` handoff for the unchanged draft
- THEN the runner commits only the approval header and opens interactive `/plan` for that design, without entering post-plan execution
- AND after the planner commits `plan.md` and writes a valid plan handoff, the planner pane shuts down, the lock is released, and the run reports `/systematic-review <absolute-plan-path>`.

#### Scenario: No authority to advance
- GIVEN a standalone brainstorm, an unfinished managed conversation, an invalid managed result, or a reviewer session that overlaps with the author's models
- WHEN a turn settles, a pane closes, or the runner checks the reviewer session
- THEN no automatic approval or plan launch occurs; standalone design review still requires explicit user approval.

#### Scenario: Design changes after review
- GIVEN the runner validated a clean review bound to `reviewedBlob`
- WHEN a commit changes the design before the runner's final pre-commit check
- THEN the blob check fails, the other commit remains intact, and the runner neither commits the approval nor launches planning.

#### Scenario: The branch advances during approval
- GIVEN the runner passed the pre-commit check at `checkedHead`
- WHEN another client commits a design edit before the approval command runs
- THEN the runner preserves the competing commit and reports the expected and observed commit IDs. An approval commit may remain, but no planner starts.

#### Scenario: Planner exits without a plan
- GIVEN an approved design and a managed planner
- WHEN the planner exits with no valid plan handoff, or with commits that change another path
- THEN the run stops with the reason, preserves the work, and does not report success.

- [x] Add the failing end-to-end fixture for `clean design` first. Run `node --experimental-strip-types --test --test-name-pattern='clean design' exact_extensions/stage-runner/_integration.test.ts`; expect failure before implementation and an executed, passing case afterward.
- [x] Register the design command in the existing extension. Share the actual run resources and launch mechanisms listed above; separate only the front-half sequencing and handoff rules. Pass explicit managed context to direct prompts without changing their default policy. Establish the private planner input with the canonical path and an empty correction summary for an unchanged draft.
- [x] Bind review eligibility to the saved author session and review acceptance to the saved reviewer session. Test `validate()` for the three handoff schemas, author model switching, and duplicate run/lock in `R/_runner.test.ts`. In `R/_integration.test.ts`, test an independently selected reviewer whose saved session records an author model, and commit a design change after the review handoff but before the final pre-commit check. In a separate test, pause the approval command at the fixture Git boundary before it invokes real Git. Commit a competing design edit, then release the command without timing sleeps. Assert that the competing commit remains in history, the runner reports the mismatch, and no planner starts. On success, check the approval commit's parent, changed paths, and exact design bytes against the reviewed blob with only the line 2 substitution. Assert a clean worktree on the pinned branch at the approval commit. Test early author exit, a draft whose line 2 is not `Status: Draft`, a design path outside `^[A-Za-z0-9._/-]+$`, malformed review result, dirty or stale revision, and planner exit without a plan. Assert that the author and planner argv carry the instruction to stay in the current worktree. In `R/_index.test.ts`, call the `R/index.ts` default export with a fake `ExtensionAPI` and a `ctx.shutdown` spy; expect no shutdown without managed environment variables, with a missing or invalid handoff, or with a valid handoff for another stage, and one shutdown for a valid handoff for the expected stage. Assert the managed-exception line of each direct prompt and the `systematic-review.md` budget in `S/lifecycle-prompts.test.mjs`.
- [x] Run `npm test && npm run test:integration && npm run typecheck`; expect the new transitions and existing post-plan consent, recovery, and publication tests to pass. Refactor only while green and rerun. Commit `feat(pi): plan independently reviewed designs with stage runner`.

**Slice 1 evidence:** The focused test first failed because `runDesign` did not exist. All 13 `clean design` subprocess cases passed after implementation, including a reverted unrelated planner edit and the two approval races. The fast suite passed 510 tests and skipped 3. The integration suites passed 69 Stage Runner tests and 5 Worktrunk tests. TypeScript passed. The tests simulate a parent runner with `PI_STAGE_RUNNER_CHILD` unset. An initial fast-suite failure required preserving the existing literal command registration; the check itself did not change.

**Implementation notes:** The two new design fixture programs keep Git race injection and the managed Pi protocol separate from publication fixtures. The child receives the brief through a private JSON file, so user text does not become runner instructions. The author-model-switch case exercises the real session reader through the integration test instead of mocking its caller. The fixtures do not establish live model compliance or Rex shutdown timing; Task 4 retains those gates.

### Slice 2: Plan a corrected design or resume its reviewer
**Blocked by:** Task 1
Complete both outcomes and validate the feature before rollout.

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
- THEN the approved document matches the corrected document except for its status, and planning reads the canonical design path and Git-derived correction summary from the private input file.

#### Scenario: Stale or excessive changes
- GIVEN the review result names the old blob, another path changed, or the review changed the status itself
- WHEN the runner validates the result
- THEN it preserves the work, reports the mismatch, and neither approves nor launches planning.

- [ ] Add a failing `corrected design` fixture that checks the exact parent, changed paths, final content, and private planning input. Test Pi 1.6.0 prompt expansion with a multiline correction summary that contains quotes: the file preserves the summary and the design path, but the expanded prompt contains neither value. Populate the existing planner input with the bounded summary for a corrected draft. Implement only the managed correction policy and its Git and input checks.
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

- [ ] Add a failing `design blocker` subprocess test, implement resume with `sessionInfo` and `recovery`, and assert the resumed session identity and the absence of an approval commit. After the resumed pane exits, assert that the lock is released, the completion reason is `needs-human`, and no planning pane opened. Exercise failure and cancellation without creating duplicate panes. Assert that an invalid review handoff with a valid session prints the `pi --session` command and opens no split.
- [ ] Add a `S/lifecycle-prompts.test.mjs` marker that the managed review authority ends when the handoff is written and later turns follow the standalone confirmation gate.
- [ ] Run `node --experimental-strip-types --test --test-name-pattern='design blocker' exact_extensions/stage-runner/_integration.test.ts`; expect the operator path to pass. Rerun the integration tier after any shared-launcher change. Commit `feat(pi): resume blocked design reviews in Rex`.

### Task 4: Final verification
**Delivers:** Operator guidance and release evidence for the two outcomes in the approved brief.
**Blocked by:** Task 1, Task 2, Task 3
**Traces to:** Required live trial, standalone fallback, rollout, and future-agent guidance.
**Files:** `R/README.md`, `dot_pi/agent/AGENTS.md`, `AGENTS.md` (review existing source and test procedures; no edit if unchanged), `plans/lifecycle-stage-runner-front-half/plan.md` (record trial outcomes, not private session contents).

- [ ] Document startup, worktree requirement, exact automatic fix boundary, cancellation, evidence, manual blocker resolution, and rollback. Distinguish design authorization from publication consent. Review direct prompt examples and `P/plan.md`; record why unchanged if they still describe standalone behavior. Commit `docs(pi): explain managed design review and recovery`.
- [ ] Run `npm ci --ignore-scripts && npm test && npm run test:all`; require all tiers green, then remove the worktree's installed dependencies per repository guidance. Verify only intended files changed.
- [ ] In real local Rex with authenticated scoped models, run the candidate from two separate disposable feature worktrees. In one, agree a design with an unambiguous reference correction. Confirm author exit, independent model identity, correction and status-only approval commits (including signing within the Git timeout), and interactive `/plan` reading the corrected text and showing the summary. Confirm the planning brief and let the planner commit only `plan.md` and write a valid handoff. Verify that its pane exits without operator action, the lock is released, and the runner reports `/systematic-review <absolute-plan-path>`. In the other, leave a material approval question in the draft: confirm the reviewer session ID in the opened pane, unapproved status, and no planning pane. Check local run evidence and Git history; if a trial does not exercise the intended outcome, do not count it as passing. Exit the test sessions, verify child exit and lock cleanup, and remove only trial-owned worktrees. Record actual outcomes before release; no push, PR, ARP, or deployment is part of these runs.
- [ ] Confirm standalone commands and the existing `/stage-runner <plan-path>` contract still pass their regression tests. Record test and trial results and request independent feature-wide verification. Missing required live evidence blocks rollout.

## Learning candidates
- 2026-11-22: Pi 1.6.0 removes slash-argument quotes and joins tokens before substituting `$ARGUMENTS`; quoting preserves argv grouping but not the prompt's data boundary. — evidence: `parseCommandArgs()` and `substituteArgs()` reproduced an unquoted path containing spaces and a newline outside the template's Markdown block quote.
