# Stage Runner Startup and Slice Titles Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the active plan slice number and title in the stage-runner widget, and make `/stage-runner` rebase onto the pinned default branch, check that the plan still fits, and force-push an existing feature ref with a lease before it starts slice 1.
**Smallest user-feedback slice:** The widget shows `execute slice <N>: <title>` from the first incomplete `### Slice N:` section of the committed plan.
**Out of Scope:** Startup changes to standalone `/execute` and `/stage-runner-design`; automatic conflict resolution; a rebase on retries or later slices; PR creation, PR metadata or readiness changes, or ARP calls before feature-wide verification; rewriting other branches or stack descendants; polling for a lagging PR head after the startup push.
**Architecture:** `_runner.ts` reads the committed plan to emit display-only slice metadata. Before confirmation, the runner pins the `origin` default-branch tip through a new `pinBase()` method in `_publish.ts` and captures the remote feature head. After confirmation, the parent process rebases, runs a private read-only `startup-check` child with the selected verifier, and calls a new leased-push method in `_publish.ts` when the rebase rewrote an existing remote ref. Final non-force publication after independent `/verify` and the ARP flow do not change.
**Tech Stack:** TypeScript, Pi 1.6.0 extensions, Git, GitHub CLI, Node.js test runner.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Required before planning | Selected the workflow and file-specific skills below. |
| `resolve-worktree` | prompt-required | A plan path was supplied | Resolved the worktree `maruina-stage-runner-startup` and branch `maruina/stage-runner-startup`. |
| `codebase-research` | skill-loader | Change crosses the runner, publisher, widget, and fixtures | Traced `supervise`, `inspect`/`publish`/`confirmed`, `phaseDisplay`, `attempt`, and `_fixtures/ssh.mjs`. |
| `chezmoi` | skill-loader | The runner is managed `dot_pi/agent` source | Scoped rollout to explicit target paths. |
| `cli-best-practices` | skill-loader | Confirmation text, widget, and stop reasons change | Required actionable stop reasons and kept the title out of control flow. |
| `reviewable-pr-workflow` | skill-loader | Startup can rewrite a published feature branch | Required an explicit lease, no plain `--force`, and disclosure of the review impact. |
| `learning-lookup` | prompt-required | Planning requires an advisory lookup | No sections matched `stage-runner`, `force-with-lease`, `rebase`, `widget`, or `publication`. |
| `write` | skill-loader | Plan and README prose | Applied STE wording and specific failure descriptions. |
| `feature-worktree` | prompt-required | Durable plan commit | Continued in the existing feature worktree. |
| `learning-candidates` | prompt-required | Review findings changed the plan | Recorded the `confirmed()` target-equality trap and the rerun bypass that a kept local rebase causes. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Select execution guidance | Matched skills to the TypeScript extension and plan ledger. |
| `resolve-worktree` | prompt-required | Resolve the supplied plan path | Confirmed the feature worktree and checked the pinned plan and candidate. |
| `feature-worktree` | prompt-required | Keep changes off the default branch | Used the existing feature branch. |
| `codebase-research` | skill-loader | Trace the execute phase event | Checked the committed-plan read, phase consumers, and fixture coverage. |
| `chezmoi` | skill-loader | Change managed extension source | Edited the source worktree only. No apply. |
| `cli-best-practices` | skill-loader | Change a command's widget | Kept the new label display-only and preserved the launch-counter fallback. |
| `write` | skill-loader | Update the progress ledger | Recorded checks and limits without changing the requirements. |
| `codebase-research` | skill-loader | Trace startup and recovery | Checked `supervise()`, `attempt()`, the publisher's Git environment, and the bare-remote fixture. |
| `cli-best-practices` | skill-loader | Report uncertain recovery | Kept the lock and reported expected and observed Git state when a reset was unsafe. |
| `reviewable-pr-workflow` | skill-loader | Implement a startup branch rewrite | Required an explicit lease and disclosed the effect of rewritten commit SHAs on review comments. |
| `diataxis` | skill-loader | Update the operator guide | Kept startup behavior separate from the procedure for remote recovery. |

**Execution writer (slice 1):** `openai/gpt-6.2-sol`.

Slice 1 evidence: The focused unit command failed because `activeSlice` did not exist. The complete fixture failed because the widget showed no slice title. After implementation, all 19 runner unit tests and the complete fixture passed. `npm test` passed (521 passed, 3 skipped), and `npm run typecheck` passed. The first integration run exceeded the 180-second tool timeout. A rerun with a 420-second tool timeout passed all 97 integration tests. The checks used local fixtures, not a live Rex/GitHub rollout trial. The README and `AGENTS.md` changes remain in Task 4.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Slice metadata and startup gate | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` | Parse the active slice, call `pinBase()`, capture the remote feature head, rebase, run `startup-check`, restore the original head after a stop, rebind `base`, emit the `startup` phase, and gate the first execute launch. | `_runner.test.ts` unit tests and `_integration.test.ts` subprocess tests. |
| Widget and Rex activity | `dot_pi/agent/exact_extensions/stage-runner/index.ts` | Render the slice number and sanitized title for execute only. Render the `startup` phase, and report it to Rex as `working`. | `_runner.test.ts` `phaseDisplay` and `rexActivity` tests. |
| Publisher | `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` | Add `pinBase()` with the existing `gitEnv` SSH hardening, and reuse it in `publish()` for the draft comparison. Add a leased startup push that re-inspects the target, uses the captured remote head as the lease, and confirms the remote and PR head. Keep the `publish()` push and `confirmed()` unchanged. | Integration tests with the bare remote. |
| Fixtures | `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/ssh.mjs` (and `_fixtures/gh.mjs` if needed) | `pi.mjs` simulates `startup-check` verdicts, a snapshot mutation, and the deletion of the remote base during execute. `ssh.mjs` injects a concurrent remote push on the first `git-receive-pack`. | Integration tests. |
| Guidance | `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Describe startup consent, rebase, plan check, lease, restore, recovery, the `startup` phase, and the widget label. Amend the `AGENTS.md` lifecycle sentence about verified publication. | README marker test in `lifecycle-prompts.test.mjs`; independent review. |

### Key Decisions
- **Keep both features in one plan.** The user asked for both together, and slice 1 ships on its own. The confirmed planning brief records the approval for the material decisions in place of a `design.md`. Rejected alternative: a separate design and plan for the force push would give a separate approval record, but they add a review cycle for behavior that the user specified.
- **Force-push before slice 1 (user-confirmed).** The push happens only after the `startup-check` verdict accepts the exact rebased snapshot. Rejected alternative: deferring the push until after feature verification would keep the "push only verified code" rule, but reviewers would see the old base for the whole run.
- **Use a dedicated `startup-check` stage, not `/verify`.** `/verify` returns `BLOCKED` for incomplete plans, and `supervise()` enters Rex recovery after a `verify` failure. Rejected alternative: reusing `/verify` needs no new prompt, but it cannot check an unimplemented plan.
- **Skip the rebase, check, and push when HEAD already descends from the pinned tip (D2).** No upstream code changed, so there is nothing new to check. Rejected alternative: always running the check gives one code path, but it adds a verifier launch with no new evidence. D2 is safe only because every stop after the rebase and before a confirmed startup push restores the original head. Otherwise a rerun would see the rebased HEAD, skip the check, and fail at the final non-force push.
- **Restore the original head after a stop.** A stop after the rebase and before a confirmed startup push runs `git reset --keep <originalHead>`. Rejected alternative: keeping the local rebase makes inspection easier, but the next run would take the D2 skip and execute a snapshot that the checker never accepted. The rebased SHA stays in the run evidence and the reflog for inspection.
- **Show startup as its own `startup` phase.** The rebase can wait up to 120 s for signing, and the check can run for up to the wall-clock limit. Rejected alternative: `message` events alone add no `Phase` value, but Rex would keep the `permission` state from the confirmation dialog, and the widget would show no phase or elapsed time.
- **Display the plan slice number, not the launch counter (D3).** `slices` counts execute launches, and `committedProgress` needs only one completed task per launch. A partial attempt would otherwise show "slice 2" with the slice 1 title. Rejected alternative: keeping the counter avoids a README change, but the label would contradict the plan.
- **Keep the remote SHA out of `target`.** `publish()`'s `confirmed()` compares `JSON.stringify(target)`. A remote SHA in `target` would make final publication fail after a startup push with `Publication target changed since confirmation`.

### Implementation Constraints
- **Pin before confirmation.** Move the existing `publish()` pin into a `pinBase()` method on the `publisher()` result, and reuse it in `publish()`. It runs `ls-remote --heads origin refs/heads/<default>`, validates the SHA, then runs `fetch` by SHA with `--no-tags --no-recurse-submodules --no-write-fetch-head --no-auto-maintenance` through the publisher's `gitEnv` (BatchMode SSH, StrictHostKeyChecking, 30 s timeout). Do not use the runner's `git()` helper for these network calls. Rebase onto that SHA even if upstream moves later. A pin failure stops before confirmation with no remote write.
- **Capture the remote feature head before confirmation.** Call `remote()` from `inspect()` once and keep the result outside `target`. When a rebase is required and a remote ref exists, require that ref to be an ancestor of HEAD. A missing object or a failed ancestry check means remote-only commits: stop before confirmation. When no rebase is required, keep the existing behavior, in which the final non-force push rejects a diverged remote (the existing `non-fast-forward` case).
- **Disclose in the confirmation.** The confirmation text must state the pinned SHA. When a remote feature ref exists and a rebase is required, it must also state that the runner force-pushes `<branch>` with a lease on `<captured sha>` before slice 1, that this changes commit SHAs and can make existing PR review comments outdated, and that cancellation does not undo the push.
- **Rebase safely.** Rebase only under the existing lock, after confirmation, with a clean worktree, with HEAD and the plan blob unchanged since preflight, and with no rebase, merge, cherry-pick, or bisect already in progress. Run `git -c core.hooksPath=/dev/null rebase --no-autostash --no-autosquash --no-update-refs <pinned>` through a cancellable async exec with a 120 s timeout. Do not use the synchronous 10 s `git()` helper, because commit re-signing can wait for 1Password. The rebase linearizes merge commits; this is expected.
- **Handle a failed rebase.** On a conflict, timeout, or other failure, run `git rebase --abort`, then require HEAD to equal the original head and the worktree to be clean. If the abort or this check fails, report the Git state and recovery steps, mark the run uncertain so that the lock stays, and do not reset.
- **Check the rebased state.** Require the rebased HEAD to descend from the pinned tip and to contain the exact reviewed plan blob.
- **Run `startup-check`.** It is a private `attempt()` stage run by the selected verify model, with a dedicated inline prompt. The prompt supplies the pinned tip, the original and rebased heads, and the plan blob. It asks the checker to inspect upstream changes in `original-merge-base..pinned` that touch plan-referenced paths, and to check binding assumptions, referenced files and symbols, and validation commands. It forbids edits, commits, and pushes. The handoff uses `schemaVersion:1`, `stage:"startup-check"`, a nonblank `summary`, `status` `fits` or `blocked` (with a nonblank `reason` when blocked), `head` equal to the rebased HEAD, and `planBlob` equal to the reviewed blob. Then the existing snapshot checks run (HEAD, porcelain status, and branch unchanged). Write its evidence in the `startup-check/` run folder. A blocked or invalid verdict, or a changed snapshot, stops the run with no Rex recovery.
- **Restore after a stop.** After any stop that follows a successful rebase and precedes a confirmed startup push (a changed plan blob, a blocked, invalid, or mutating check, a remote head that changed since capture, a lease rejection, or cancellation), run `git reset --keep <originalHead>`. Then require HEAD to equal the original head and the worktree to be clean. Record the rebased SHA in the stop reason and run evidence. If the reset or the check fails, report the Git state, mark the run uncertain so that the lock stays, and do not retry. After a confirmed startup push, do not reset.
- **Rebind the baseline.** Write `run.json` once at confirmation with the existing fields plus `originalHead`, `pinnedBase`, and the captured remote head. After an accepted check, rebind `base` to the rebased HEAD for the child prompts, and write `startup.json` with the rebased `base` and the startup verdict. `privateFile()` uses flag `wx`, so do not rewrite `run.json`.
- **Leased push.**
  - Add a method on the `publisher()` result that takes the remote head captured before confirmation and the rebased SHA. It re-runs `inspect()` and requires an unchanged `target`. It reads `remote()` again and stops if the value differs from the captured head, so the lease always matches the SHA disclosed in the confirmation.
  - It pushes with the same `-c` hardening as `publish()`: `push --no-follow-tags --recurse-submodules=no --force-with-lease=refs/heads/<branch>:<captured> origin <rebased>:refs/heads/<branch>`. Like `publish()`, it reconciles with `remote()` after a push error before any further write.
  - It confirms `remote()` equals the rebased SHA. When a PR exists, it confirms `lookup().headRefOid`.
  - Do not use plain `--force`, an implicit lease, or a retry.
- **Push only when needed.** With no remote feature ref, or with a remote ref that is already an ancestor of the rebased HEAD, do not push at startup. Final `publish()` stays the non-force path.
- **Slice title.** Take the title from the first `### Slice N: <title>` section of the committed plan at HEAD, for each execute launch, that contains an open task checkbox as matched by the existing `unchecked()` helper. A section ends at the next `### Slice` heading or the next `## ` heading. Ignore headings and checkboxes inside fenced code blocks. In the widget, replace control characters and truncate the title to 60 characters with `…`. When the plan has no usable slice, keep the current `execute slice <launch>` label. The title never controls execution.
- **Stop conditions for `/execute`.** Stop and return to `/plan` if `inspect()` cannot keep the remote SHA out of `target`, if `attempt()` cannot run `startup-check` without Rex recovery, or if the fixtures cannot simulate a concurrent push.

### Security and Observability Requirements
- No agent prose controls the rebase or the push. Only the validated handoff fields and Git checks do.
- Do not record credentials. Keep the existing GitHub token isolation (`GH_TOKEN` only in the `gh` env, removed from child env).
- When a rebase is required, emit `phase("startup")` after confirmation. Add `startup` to the `Phase` union. `rexActivity` reports it as `working`, and the widget and totals show it like other phases. Do not use `phase("verify")`, so that `verify` totals stay accurate.
- Report startup results as `message` events, for example `Rebased <old>→<new> onto <pinned>`, `Startup check: fits`, `Restored <original> after <step>`, and `Pushed <new> to <branch> with lease on <captured>`.
- Every stop reason names the step (pin, rebase, check, or push), the SHAs involved, and whether the remote changed.

### Failure Modes to Handle
| Failure | Required behavior |
|---|---|
| Pin failure | Stop before confirmation. No rebase, no child, no remote write. |
| Remote-only commits on the feature ref when a rebase is required | Stop before confirmation. No rebase, no child, no remote write. |
| Decline at confirmation | No rebase, no child, no remote write. |
| Rebase conflict or timeout | Abort, confirm the original HEAD and a clean tree, then stop. If that is uncertain, keep the lock. |
| Plan blob changed by the rebase | Restore the original head and stop before the check. |
| `startup-check` blocked, invalid, or mutating the snapshot | Restore the original head, then stop with no recovery pane and no push. |
| Remote head differs from the captured head at push time | Restore the original head, stop before the push, and report the observed head. |
| Concurrent push between the last remote read and the push | The lease rejects the push. Restore the original head, stop, and report the observed head. No retry. |
| Restore fails or leaves HEAD or the tree unexpected | Report the Git state, keep the lock as uncertain, and do not retry. |
| Push succeeds but the PR head is not confirmed | Stop and report that the remote changed. |
| Cancellation after the push | Report that the remote already changed. Do not undo it. |

### Rollout and Rollback
Owner: Matteo Ruina.
- Run the local fixture tests, the lifecycle checks, `/simplify`, and independent feature-wide `/verify`.
- Before `chezmoi apply`, obtain separate approval for a disposable Rex/GitHub trial according to the README. The trial must show an accepted startup rewrite, a rejected check with no remote write, and the live widget title.
- Apply only the reviewed target paths, then restart Pi.
- To roll back, stop active runs, restore the previous extension and README, preview and apply only those targets, and restart Pi. Rolling back the software does not undo a branch rewrite.

### Test Strategy
- Use `phaseDisplay` and an exported pure slice parser in `_runner.test.ts` for the title behavior.
- Use `run()` in `_integration.test.ts` with the real bare remote through `_fixtures/ssh.mjs`, a diverged `main` in the bare repository, and `_fixtures/pi.mjs` extended to write `startup-check` handoffs. Inject the concurrent push in `_fixtures/ssh.mjs` on the first `git-receive-pack`, after every remote read, so the lease itself rejects it.
- Mock only Pi children and the GitHub API through the existing fixtures. Git and the remote are real.
- Assert remote writes through the bare `.pushes` file and the execute launch through the argv log.
- Narrow failing command: `cd dot_pi/agent && node --test exact_extensions/stage-runner/_runner.test.ts` for slice 1, and `node --test exact_extensions/stage-runner/_integration.test.ts` for slice 2.

### Validation Limits
- The fixtures establish ordering, the Git outcomes, lease rejection, and the absence of remote writes on every stop path.
- They do not establish real GitHub permissions or rulesets, PR head refresh latency after a force push, 1Password signing during the rebase, or terminal rendering.
- The live disposable trial covers those gaps. It blocks `chezmoi apply`, not merge.

## Acceptance criteria
### Requirement: Display the active slice
The widget SHALL show the plan slice number and title of the first incomplete titled slice during execute, without using the title to control execution.

#### Scenario: Grouped plan progresses
- GIVEN a grouped plan where slice 1 is complete and slice 2 has open tasks
- WHEN the next execute launch starts
- THEN the widget shows `execute slice 2: <slice 2 title>` with elapsed time, history, and skills.

#### Scenario: Partial slice attempt
- GIVEN an execute launch that completed only some tasks of slice 1
- WHEN the next launch starts
- THEN the widget still shows `execute slice 1: <slice 1 title>`.

#### Scenario: No usable title (negative)
- GIVEN an ungrouped plan, or a slice heading that appears only inside a fenced code block
- WHEN execute starts
- THEN the widget shows the current `execute slice <launch>` label, and execution is unchanged.

#### Scenario: Unsafe title
- GIVEN a title with control characters or more than 60 characters
- WHEN it is displayed
- THEN the control characters are replaced and the title is truncated.

### Requirement: Rebase and check before slice 1
The runner SHALL start the first execute child only after it rebases onto the pinned default-branch tip and a `startup-check` verdict of `fits` accepts the exact rebased snapshot, unless HEAD already descends from the pinned tip.

#### Scenario: Diverged branch with no remote ref
- GIVEN an unstarted reviewed plan, a `main` that advanced, and no remote feature ref
- WHEN the operator confirms and the check returns `fits`
- THEN the widget shows the `startup` phase and Rex reports `working` during the rebase and check, the first execute prompt names the rebased HEAD as the feature baseline, `run.json` records the original head and the pinned tip, `startup.json` records the rebased base and the verdict, and no startup push occurs.

#### Scenario: Already up to date
- GIVEN HEAD that already descends from the pinned tip
- WHEN the operator confirms
- THEN the runner starts slice 1 without a rebase, a `startup-check` launch, or a push.

#### Scenario: Stop before implementation (negative)
- GIVEN a declined confirmation, a rebase conflict, a changed plan blob, or a `startup-check` verdict that is blocked, invalid, or changed the snapshot
- WHEN the runner attempts startup
- THEN no execute child starts, no Rex recovery pane opens, the remote is unchanged, the stop reason names the step, and HEAD equals the original head.

#### Scenario: Rerun after a blocked check (negative)
- GIVEN a previous run that stopped because `startup-check` returned `blocked`
- WHEN the operator runs `/stage-runner` again on the same plan
- THEN the runner rebases and runs `startup-check` again, and it does not start slice 1 without an accepted check.

#### Scenario: Base pin fails (negative)
- GIVEN a remote without the default branch
- WHEN the runner pins the base
- THEN it stops before confirmation, starts no child, and makes no remote write.

### Requirement: Leased startup push
When a remote feature ref exists and the rebase rewrote it, the runner SHALL update only that ref with `--force-with-lease` on the captured remote SHA, after an accepted check, and SHALL confirm the new remote head (and the PR head when a PR exists) before slice 1.

#### Scenario: Accepted rewrite
- GIVEN a remote feature ref that is an ancestor of the original local head, and a `fits` verdict
- WHEN startup completes
- THEN the remote ref equals the rebased HEAD, the confirmation text disclosed the rewrite, slice 1 starts, no PR or ARP write occurs at startup, and the final non-force `publish()` succeeds.

#### Scenario: Unsafe remote state (negative)
- GIVEN remote-only commits on the feature ref before confirmation
- WHEN the runner prepares the confirmation
- THEN it stops before confirmation, with no rebase, no child, and no remote write.

#### Scenario: Concurrent push (negative)
- GIVEN a concurrent push that reaches the remote after the last remote read and before the startup push
- WHEN the runner pushes with the lease
- THEN the lease rejects the push, the runner does not retry, restores the original head, does not start slice 1, and reports the observed head.

## Implementation tasks
### Slice 1: Show which slice is executing
### Task 1: Display the plan slice number and title
**Delivers:** The execute widget follows the active plan slice by number and title.
**Blocked by:** None
**Traces to:** Requirement: Display the active slice.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`.

- [x] Add failing tests: a pure parser case for each scenario (grouped, partial, ungrouped, fenced lookalike), and `phaseDisplay` cases for the label, control characters, the 60-character cap, and the fallback. In `_integration.test.ts`, give the fixture plan's slice headings titles, for example `### Slice 1: First`, and assert in the complete case that the recorded widget lines include `execute slice 1: First` and `execute slice 2: Second`. Use titled headings only in the complete case, so the other cases keep the untitled headings and the fallback label.
- [x] Add optional `slice: { number, title }` to the `phase` RunnerEvent for execute. Compute it from the plan at HEAD before each execute launch, and render it in `phaseDisplay`. Preserve the phase totals, skills, `verify N of 3`, `rexActivity`, and recovery behavior.
- [x] Run `cd dot_pi/agent && npm test && npm run typecheck`; expect all tests to pass.
- [x] Commit with `feat(pi): show stage runner slice titles`.

### Slice 2: Rebase, check, and update the branch before implementation
### Task 2: Gate slice 1 on the startup rebase and plan check
**Progress:** Task 2 verified. The user approved continuing with a branch guard. If the checkout is on another branch or HEAD is detached, the runner does not attempt `git reset --keep`. It records the Git state and retains the lock for manual recovery. `startup-branch` and `startup-detached` verify that the runner moves no ref and does not launch execute. Until Task 3 adds the lease, the runner stops before confirmation if a rebase is necessary and a remote feature ref exists.

**Execution writer (slice 2, Task 2):** `openai/gpt-6.2-sol`.

Task 2 evidence: The two branch-guard fixtures failed before implementation because the confirmation did not pin a base. The first post-implementation run found that `git clone --bare` copied `feature` into the remote fixture. The setup now deletes that ref to test the no-remote case. All nine startup cases passed. The existing complete fixture verifies the up-to-date skip. `npm test` passed (521 passed, 3 skipped), `npm run typecheck` passed, and `npm run test:integration` passed (101 stage-runner cases and 5 Worktrunk cases). This did not test a live GitHub or Rex rollout.

**Delivers:** With no remote feature ref, the runner pins the base, rebases, runs `startup-check`, and starts slice 1 from the rebased baseline, or stops before implementation.
**Blocked by:** None
**Traces to:** Requirement: Rebase and check before slice 1.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/_publish.ts`, `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs`.

- [x] Extend the integration setup with a diverged `main` in the bare remote. Extend `_fixtures/pi.mjs` to answer `startup-check` with `fits`, `blocked`, an invalid handoff, or a snapshot mutation. Add failing cases for each scenario of this requirement, including the conflict abort, the already-up-to-date skip, the rerun after a blocked check, and the base pin failure. Add `rexActivity` and `phaseDisplay` cases for the `startup` phase in `_runner.test.ts`.
- [x] Keep the `draft-base-unavailable` contract: the startup pin runs before confirmation, so delete the bare `refs/heads/main` from `_fixtures/pi.mjs` during the first execute launch instead of in the test setup. The case must still stop with `Drafting stopped: could not supply the full pinned comparison`.
- [x] Implement `pinBase()` in `_publish.ts` and reuse it in `publish()`. Implement the confirmation text with the pinned SHA, the `startup` phase, the async bounded rebase with abort, the `startup-check` stage and handoff validation, the snapshot check, the restore to the original head after a stop, the `base` rebinding, `run.json` and `startup.json`, and the `message` progress events.
- [x] Run `cd dot_pi/agent && npm test && npm run test:integration && npm run typecheck`; expect all to pass, including the existing publication and ARP cases.
- [x] Commit with `feat(pi): rebase and check the plan before stage runner execution`.

### Task 3: Force-push the rebased branch with a lease
**Execution writer (slice 2, Task 3):** `openai/gpt-6.2-sol`.

Task 3 evidence: The six new startup fixtures failed against the pre-lease runner. All 15 startup fixtures then passed. `npm test` passed (521 passed, 3 skipped), `npm run test:integration` passed (107 stage-runner and 5 Worktrunk tests), and `npm run typecheck` passed.

Approved recovery clarification: After an attempted push, the publisher makes one bounded remote read even if the operator canceled. If it cannot establish the result, the runner stops before execute, keeps the rebased HEAD and lock, and records the original, captured, and rebased SHAs. It does not retry. The `startup-push-unknown` fixture changes the bare ref and fails the confirmation read. A porcelain `stale info` rejection with a different observed head permits the original HEAD to be restored, as `startup-lease-race` verifies. These checks use a local bare remote, not GitHub.

**Delivers:** When an existing remote ref was rewritten, the runner updates it with an explicit lease after the accepted check and confirms the remote and PR head before slice 1.
**Blocked by:** Task 2
**Traces to:** Requirement: Leased startup push.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_publish.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/ssh.mjs`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs`.

- [x] Add failing integration cases:
  - an accepted rewrite with no PR, and one with an existing PR (`reuse`), where the final `publish()` succeeds without force;
  - remote-only commits, where the runner stops before confirmation and the argv log is absent;
  - a concurrent push that `_fixtures/ssh.mjs` injects into the bare `refs/heads/feature` on the first `git-receive-pack`, before it forwards the push. The lease rejects the push, the bare `.pushes` file has no startup entry, HEAD equals the original head, and no execute starts;
  - a remote ref that is already an ancestor of the rebased HEAD, where no startup push occurs.
- [x] Implement the remote head capture and ancestry check before confirmation, and the rewrite disclosure in the confirmation text. Implement the leased startup push method in `publisher()` with the captured remote head as its lease, and call it from the startup gate. Restore the original head after a changed remote head or a lease rejection. Keep the remote SHA out of `target`, and leave the `publish()` push unchanged.
- [x] Run `cd dot_pi/agent && npm test && npm run test:integration && npm run typecheck`; expect all to pass.
- [x] Commit with `feat(pi): force-push the rebased stage runner branch with a lease`.

### Task 4: Document the startup contract
**Delivers:** Operator and future-agent guidance that matches the new behavior.
**Blocked by:** Tasks 1-3
**Traces to:** All requirements and the rollout contract.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

Task 4 evidence: The recovery marker initially used the wrong section heading. After matching the existing heading, `npm test` passed (521 passed, 3 skipped). The repository-root `AGENTS.md` pointer still describes the guide, so it did not change.

- [x] In `README.md`, document:
  - the pinned base and the confirmation disclosure;
  - the startup rebase, the `startup-check` stage, and how it differs from feature-wide `/verify`;
  - recovery after a conflict or a blocked check;
  - the leased startup push and the fact that cancellation does not undo it;
  - the slice label and the `startup` phase in the widget and Rex activity;
  - the restore to the original head after a stop that follows the rebase.

  Replace "pushes the verified SHA … without force" and "Do not force-push … to recover" with statements that separate the startup push from final publication and from recovery. The recovery section must keep the prohibition on force-push.
- [x] In `dot_pi/agent/AGENTS.md`, amend the lifecycle sentence "The runner publishes the independently verified head in both profiles." State that final publication pushes only the independently verified head, and that a startup rebase can force-push the feature branch with a lease after the operator confirms the disclosed rewrite. Check the repository `AGENTS.md` pointer to the README; update it only if its summary no longer matches.
- [x] In `lifecycle-prompts.test.mjs`, extend the README marker test with markers for the leased startup push before slice 1, the final non-force publication, and the force-push prohibition in recovery. Update prompt-template assertions only if a prompt template changed.
- [x] Run `cd dot_pi/agent && npm test`; expect all tests to pass.
- [x] Commit with `docs(pi): document stage runner startup rebase and lease`.

### Task 5: Final verification
**Delivers:** Feature-wide evidence for both slices.
**Blocked by:** Tasks 1-4
**Traces to:** All requirements and the rollout contract.
**Files:** None; this task runs checks only.

- [x] Run `git diff --check origin/main...HEAD`. From `dot_pi/agent`, run `npm ci --ignore-scripts` and then `npm run test:all`; expect all to pass. Record the results, then remove `node_modules`.
- [x] Confirm that every acceptance scenario maps to a passing test named in Tasks 1–3. The lifecycle then requires `/simplify`, independent feature-wide `/verify`, and the approved live trial before `chezmoi apply`.

**Execution writer (slice 2, Tasks 3–5):** `openai/gpt-6.2-sol`.

Task 5 evidence: `git diff --check origin/main...HEAD`, `npm ci --ignore-scripts`, and `npm run test:all` passed (521 fast tests passed, 3 skipped; 107 stage-runner and 5 Worktrunk integration tests passed; typecheck and Pi smoke check passed). Removed the source worktree's `dot_pi/agent/node_modules` after the checks.

Acceptance mapping: The `active slice` unit tests and the complete integration fixture cover grouped progress, partial progress, and ungrouped or fenced input. The `execute widget` unit test covers sanitization and truncation. The complete integration fixture covers skipping startup for an up-to-date branch. The `startup-fits`, `startup-decline`, `startup-conflict`, `startup-blob`, `startup-blocked` (including its rerun), `startup-invalid`, `startup-branch`, `startup-detached`, and `startup-pin` cases cover the rebase and check outcomes. The `startup-commit` case covers the same-branch snapshot change in “Stop before implementation”: `startup-check` creates a commit, so the runner stops, restores the original HEAD and a clean worktree, releases the lock, and does not push or launch another child. The `startup-rewrite`, `startup-reuse`, `startup-remote-only`, and `startup-lease-race` cases cover the lease acceptance scenarios. `startup-ancestor` covers the no-rewrite path, and `startup-push-unknown` covers the approved uncertain-push recovery rule. No live trial ran.

Verification repair: The `startup-commit` case failed with `Missing expected rejection` before the fixture made the commit, then passed with the commit in place. `npm run test:all` passed: 521 fast tests passed, 3 skipped, 108 stage-runner and 5 Worktrunk integration tests passed, and typecheck and the Pi smoke check passed.

## Learning candidates
- 2026-11-23: In stage-runner startup, keeping a local rebase after a stop makes the next run's "HEAD already descends from the pinned tip" skip bypass `startup-check`, and the final non-force push then fails because the old remote ref is not an ancestor; restore the original head after any stop before a confirmed startup push — evidence: `plans/stage-runner-startup/plan.md` Key Decisions (D2) and `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` `preflight()`.
- 2026-11-23: In stage-runner `publish()`, `confirmed()` compares the whole `inspect().target` JSON, so any new field there that legitimately changes during a run (such as a remote SHA after a startup push) makes final publication fail — evidence: `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` `confirmed()`.
