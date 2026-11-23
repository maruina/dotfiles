# Stage Runner Startup and Slice Titles Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the active slice title and make `/stage-runner` rebase, check the plan, and update an existing remote branch when necessary before it starts slice 1.
**Smallest user-feedback slice:** Show the title of the first incomplete slice in the Pi widget without changing how `/execute` selects work.
**Out of Scope:** Standalone `/execute` startup changes, automatic conflict resolution, creating or opening a PR before feature-wide verification, changing existing PR metadata or readiness, and rewriting other branches or stack descendants.
**Architecture:** The stage runner reads the current committed plan for display. Its parent process owns the startup rebase and remote update, and a separate read-only Pi child checks whether the reviewed plan still applies to the rebased snapshot. The existing feature-wide verification, publication, and ARP flow remains separate.
**Tech Stack:** TypeScript, Pi 1.6.0 extensions, Git, GitHub CLI, Node.js tests.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | agent-selected | Runner behavior and prompts change | Selected workflow and file-specific guidance. |
| `codebase-research` | skill-loader | Change crosses the runner, publisher, and widget | Traced the confirmation, baseline, slice display, and publication boundaries. |
| `cli-best-practices` | skill-loader | The widget and startup command change | Kept failures actionable and the title out of control flow. |
| `reviewable-pr-workflow` | skill-loader | Startup can rewrite a published feature branch | Required an explicit lease and disclosed the impact on existing reviews. |
| `chezmoi` | skill-loader | The runner is a managed extension | Scoped work to the source and rollout to explicit targets. |
| `feature-worktree` | agent-selected | Planning writes a committed artifact | Created a feature worktree from fetched `origin/main`. |
| `learning-lookup` | prompt-required | Planning requires advisory lookup | No sections matched `stage-runner` or `force-with-lease`. |
| `write` | skill-loader | The plan and operator guidance are prose | Used separate acceptance checks for startup and feature verification. |

## Implementation Contract
### Components affected
| Component | Suggested files | Responsibility | Verification |
|---|---|---|---|
| Phase display and supervisor | `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `_runner.ts` in that directory | Display the title, rebase after consent, pin evidence, and gate slice 1. | Widget and subprocess tests. |
| Publisher | `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` | Verify the approved target and apply a single-ref update with an explicit lease when the startup rebase requires it. Preserve final publication behavior. | Subprocess tests with a disposable remote and existing GitHub fixtures. |
| Lifecycle guidance | `dot_pi/agent/exact_extensions/stage-runner/README.md`, lifecycle prompts and their contract tests if affected | Describe authorization, startup verification, and recovery. | Contract tests and independent review. |

### Decisions and constraints
- Interpret startup verification as an independent, read-only check that the reviewed plan still applies to the rebased code, not a verdict that the unimplemented feature is complete. Use the selected verifier and the existing private structured handoff and snapshot-check patterns with a dedicated startup-check prompt (not `/verify`, which rejects incomplete plans, and without entering Rex recovery on `BLOCKED`). Supply the pinned upstream SHA, original and rebased feature heads, and reviewed plan blob. Ask the verifier to inspect relevant upstream changes and check binding assumptions, referenced code, and validation commands. If a binding constraint no longer holds or cannot be established, block and report why. Do not modify the plan or authorize an agent to push. Keep feature-wide `/verify` after implementation.
- The startup confirmation must disclose that the runner can rewrite an existing feature ref before slice 1 and that this changes commit SHAs and can disrupt existing PR review context. Name the target and the expected remote feature head in the confirmation. Do not infer permission to rewrite or restack other branches.
- After confirmation and under the existing worktree lock, fetch the approved `origin` default branch and pin its tip. Require a clean worktree, unchanged preflight head and plan, a verified target, and no Git operation already in progress. Rebase only the checked feature branch with ref updates and autostash disabled. Do not rebase on `/stage-runner-design`, retries, or later slices. Stop on conflicts or Git failure. Abort only the rebase that this run started when ownership is established; otherwise report its state and recovery steps without resetting.
- Verify the rebased `HEAD` descends from the pinned upstream tip and still contains the exact reviewed plan blob. Rebind `base` in `run.json` and subsequent child prompts to the verified rebased `HEAD` while also recording the original pre-rebase head and pinned upstream tip. A successful rebase alone is not evidence the plan still applies. Require the verifier to accept the exact clean candidate before any startup push. On a blocked check, keep the local rebase for inspection and leave the remote unchanged.
- A lease protects against concurrent pushes, not against dropping commits that were already remote. Before rewriting, require the captured remote head to be an ancestor of the original local feature head. Stop on remote-only history, an unconfirmed target, or an existing protection restriction. Recheck the approved target and candidate before pushing. Send only the verified rebased SHA to the approved feature ref with `--force-with-lease=<full-ref>:<captured-sha>` when the update would be non-fast-forward due to the rebase. Do not use plain `--force`, an implicit lease, or automatic lease refresh. Keep the captured remote head separate from `target` (or update `approved` after a confirmed startup push) so final `publish()`'s `confirmed()` check does not reject the new remote head. Verify the observed remote SHA and, when a PR exists, its head before launching slice 1. Do not retry a failed lease with a new SHA.
- When there is no remote feature ref, no startup push is necessary. Do not create one. If an existing feature ref does not need a rebase rewrite, retain normal final publication rather than pushing early. Subsequent publication of implemented changes and ARP fixes must still use the existing independent verification and non-force path.
- Keep the title display-only. Use the first incomplete titled `### Slice N: <title>` section in the committed plan at the start of each execute attempt. Match task checkboxes within that section. Ignore lookalike text in fenced examples. Missing or unusable titles retain the current label. Treat the title as untrusted terminal text and bound its displayed width or length.

### Observability, failure, and rollout
- Report startup rebase and plan-check progress separately from slice execution and feature-wide `verify` phase totals (for example, via `RunnerEvent` message notifications rather than reusing `phase("verify")`). Keep before/after SHAs, the pinned base, and the verdict in the private run evidence. Do not record credentials. When startup ends after a confirmed push but before slice 1, report that the remote already changed; cancellation does not undo it.
- Run local fixture tests, lifecycle prompt checks, and independent feature-wide `/verify` for this change. Before applying the extension, obtain separate approval for a disposable Rex/GitHub trial per the runner guide. Check both a successful startup rewrite and a rejection without a remote write, plus the live widget title. Fixtures do not establish GitHub permissions, PR head refresh behavior, or terminal rendering. Do not bypass the existing rollout gates. Roll back by restoring the previous reviewed extension and prompt versions and restarting Pi after active runs end; reverting software does not undo a branch rewrite.

## Acceptance criteria
### Requirement: Display the active slice title
The widget SHALL show the title of the first incomplete titled slice without using the title to control execution.

#### Scenario: Grouped and ungrouped plans
- GIVEN a grouped plan where slice 1 is complete after the first execute attempt and slice 2 has open tasks
- WHEN the next attempt starts
- THEN the widget displays the slice 2 title and retains elapsed time and skills
- AND an ungrouped plan still displays the number without a title.

### Requirement: Prepare the branch before slice 1
The runner SHALL launch the first execute child only after the startup rebase, plan-fit check, and any required confirmed remote rewrite.

#### Scenario: Approved rewrite
- GIVEN an unstarted reviewed plan, an updated remote default branch, and a published feature head contained in the original local branch
- WHEN the operator confirms, the rebase succeeds, and the independent checker accepts that exact snapshot
- THEN the runner updates only the approved existing feature ref with an explicit lease on the original remote SHA, confirms the new head, and starts slice 1 from the rebased baseline
- AND it does not create a PR or request ARP review at startup.

#### Scenario: Stop before implementation
- GIVEN a declined confirmation, rebase conflict, changed plan, blocked or invalid check, remote-only commits, or concurrent push before the leased update
- WHEN the runner attempts startup
- THEN it does not launch slice 1 or overwrite the remote head, and reports the blocker.

#### Scenario: No rewrite needed
- GIVEN an unstarted plan with no remote feature ref or with a remote ref that does not require a rebase rewrite
- WHEN startup checks pass
- THEN slice 1 starts without a startup push, and normal publication remains gated by independent feature-wide verification.

## Implementation tasks
### Slice 1: Show which slice is executing
### Task 1: Display the title from the committed plan
**Delivers:** A readable execute widget that follows the active slice.
**Blocked by:** None
**Traces to:** Display the active slice title.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/{_runner.ts,index.ts,_runner.test.ts,_integration.test.ts}`.

- [ ] Add a failing widget and runner test for title propagation, slice progression, and the ungrouped fallback. Cover terminal controls and fenced examples in focused tests.
- [ ] Propagate the title through the existing phase event and render it only for execute. Preserve phase totals, skills, launch counting, and recovery behavior.
- [ ] Run `npm test` and `npm run test:integration` from `dot_pi/agent`; expect all tests to pass. Commit with `feat(pi): show stage runner slice titles`.

### Slice 2: Verify and update the rebased branch before implementation
### Task 2: Gate execution on startup rebase, plan verification, and leased update
**Delivers:** A first execute child that starts from a checked rebased baseline, after confirmation of any required startup rewrite.
**Blocked by:** None
**Traces to:** Prepare the branch before slice 1.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/{_runner.ts,_publish.ts,index.ts,_integration.test.ts,_fixtures/}`.

- [ ] Extend the subprocess fixtures with a real diverged base and an existing remote feature ref. Add failing assertions for ordering, the rebased baseline and plan blob, the explicit lease, no early PR/ARP writes, and an unchanged final publication path.
- [ ] Cover the acceptance cases for rejection and no rewrite, including when a remote feature ref is already an ancestor of the rebased `HEAD` so no startup push occurs and final non-force `publish()` succeeds. Include a verifier that changes the snapshot and a remote head change between check and push. Assert no execute child starts in blocked cases.
- [ ] Implement the startup gate with bounded, cancellable Git and child operations and the existing target, lock, and handoff checks. Confirm no raw agent prose controls publication.
- [ ] Run `npm test`, `npm run test:integration`, and `npm run typecheck` from `dot_pi/agent`; expect all to pass. Commit with `feat(pi): rebase and verify before stage runner execution`.

### Task 3: Document the startup contract and update prompt checks
**Delivers:** Operator guidance and updated lifecycle prompt contract tests.
**Blocked by:** Task 1 and Task 2
**Traces to:** Both requirements and the rollout contract.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, and affected prompt files if needed.

- [ ] Document startup consent, conflict and plan-drift recovery, lease behavior, and the distinction between startup and feature-wide verification. Inspect the repository and Pi subtree `AGENTS.md` guidance and update it only if it contains a conflicting durable rule; otherwise record why no edit is needed.
- [ ] Update the lifecycle contract checks to protect the read-only startup check and keep final verification and publication separate. Commit with `docs(pi): document stage runner startup verification`.

### Task 4: Final verification
**Delivers:** Feature-wide test evidence for both slices.
**Blocked by:** Task 1, Task 2, and Task 3
**Traces to:** Both requirements and the rollout contract.
**Files:** `dot_pi/agent/package.json`.

- [ ] Run `git diff --check`. From `dot_pi/agent`, run `npm ci --ignore-scripts` and `npm run test:all`. Record the results. The normal lifecycle then requires `/simplify` and independent feature-wide `/verify` before rollout.
