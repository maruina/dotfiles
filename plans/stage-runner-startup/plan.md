# Stage Runner Startup and Slice Titles Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the active plan slice number and title in the stage-runner widget, and make `/stage-runner` rebase onto the pinned default branch, check that the plan still fits, and force-push an existing feature ref with a lease before it starts slice 1.
**Smallest user-feedback slice:** The widget shows `execute slice <N>: <title>` from the first incomplete `### Slice N:` section of the committed plan.
**Out of Scope:** Startup changes to standalone `/execute` and `/stage-runner-design`; automatic conflict resolution; a rebase on retries or later slices; PR creation, PR metadata or readiness changes, or ARP calls before feature-wide verification; rewriting other branches or stack descendants; polling for a lagging PR head after the startup push.
**Architecture:** `_runner.ts` reads the committed plan to emit display-only slice metadata. Before confirmation, the runner pins the `origin` default-branch tip. After confirmation, the parent process rebases, runs a private read-only `startup-check` child with the selected verifier, and calls a new leased-push method in `_publish.ts` when the rebase rewrote an existing remote ref. Final non-force publication after independent `/verify` and the ARP flow do not change.
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
| `learning-candidates` | prompt-required | A review finding changed the plan | Recorded the `confirmed()` target-equality trap. |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Slice metadata and startup gate | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` | Parse the active slice, pin the base, rebase, run `startup-check`, rebind `base`, and gate the first execute launch. | `_runner.test.ts` unit tests and `_integration.test.ts` subprocess tests. |
| Widget | `dot_pi/agent/exact_extensions/stage-runner/index.ts` | Render the slice number and sanitized title for execute only. | `_runner.test.ts` `phaseDisplay` tests. |
| Publisher | `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` | Add a leased startup push that re-inspects the target and confirms the remote and PR head. Keep `publish()` unchanged. | Integration tests with the bare remote. |
| Fixtures | `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs` (and `gh.mjs` if needed) | Simulate `startup-check` verdicts, a snapshot mutation, and a concurrent remote push. | Integration tests. |
| Guidance | `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md` | Describe startup consent, rebase, plan check, lease, recovery, and the widget label. | Independent review; `lifecycle-prompts.test.mjs` if a prompt contract changes. |

### Key Decisions
- **Keep both features in one plan.** The user asked for both together, and slice 1 ships on its own. The confirmed planning brief records the approval for the material decisions in place of a `design.md`. Rejected alternative: a separate design and plan for the force push would give a separate approval record, but they add a review cycle for behavior that the user specified.
- **Force-push before slice 1 (user-confirmed).** The push happens only after the `startup-check` verdict accepts the exact rebased snapshot. Rejected alternative: deferring the push until after feature verification would keep the "push only verified code" rule, but reviewers would see the old base for the whole run.
- **Use a dedicated `startup-check` stage, not `/verify`.** `/verify` returns `BLOCKED` for incomplete plans, and `supervise()` enters Rex recovery after a `verify` failure. Rejected alternative: reusing `/verify` needs no new prompt, but it cannot check an unimplemented plan.
- **Skip the rebase, check, and push when HEAD already descends from the pinned tip (D2).** No upstream code changed, so there is nothing new to check. Rejected alternative: always running the check gives one code path, but it adds a verifier launch with no new evidence.
- **Display the plan slice number, not the launch counter (D3).** `slices` counts execute launches, and `committedProgress` needs only one completed task per launch. A partial attempt would otherwise show "slice 2" with the slice 1 title. Rejected alternative: keeping the counter avoids a README change, but the label would contradict the plan.
- **Keep the remote SHA out of `target`.** `publish()`'s `confirmed()` compares `JSON.stringify(target)`. A remote SHA in `target` would make final publication fail after a startup push with `Publication target changed since confirmation`.

### Implementation Constraints
- **Pin before confirmation.** Use the existing `publish()` pattern: `ls-remote --heads origin refs/heads/<default>`, validate the SHA, then `fetch` by SHA with `--no-tags --no-recurse-submodules --no-write-fetch-head --no-auto-maintenance`. Rebase onto that SHA even if upstream moves later.
- **Disclose in the confirmation.** The confirmation text must state the pinned SHA. When a remote feature ref exists and a rebase is required, it must also state that the runner force-pushes `<branch>` with a lease on `<captured sha>` before slice 1, that this changes commit SHAs and can make existing PR review comments outdated, and that cancellation does not undo the push.
- **Rebase safely.** Rebase only under the existing lock, after confirmation, with a clean worktree, with HEAD and the plan blob unchanged since preflight, and with no rebase, merge, cherry-pick, or bisect already in progress. Run `git -c core.hooksPath=/dev/null rebase --no-autostash --no-update-refs <pinned>` through a cancellable async exec with a 120 s timeout. Do not use the synchronous 10 s `git()` helper, because commit re-signing can wait for 1Password.
- **Handle a failed rebase.** On a conflict, timeout, or other failure, run `git rebase --abort`, then require HEAD to equal the original head and the worktree to be clean. If the abort or this check fails, report the Git state and recovery steps, mark the run uncertain so that the lock stays, and do not reset.
- **Check the rebased state.** Require the rebased HEAD to descend from the pinned tip and to contain the exact reviewed plan blob.
- **Run `startup-check`.** It is a private `attempt()` stage run by the selected verify model, with a dedicated inline prompt. The prompt supplies the pinned tip, the original and rebased heads, and the plan blob. It asks the checker to inspect upstream changes in `original-merge-base..pinned` that touch plan-referenced paths, and to check binding assumptions, referenced files and symbols, and validation commands. It forbids edits, commits, and pushes. The handoff uses `schemaVersion:1`, `stage:"startup-check"`, a nonblank `summary`, `status` `fits` or `blocked` (with a nonblank `reason` when blocked), `head` equal to the rebased HEAD, and `planBlob` equal to the reviewed blob. Then the existing snapshot checks run (HEAD, porcelain status, and branch unchanged). A blocked or invalid verdict, or a changed snapshot, stops the run with no Rex recovery. Keep the local rebase for inspection.
- **Rebind the baseline.** After an accepted check, rebind `base` to the rebased HEAD for the child prompts. Write `run.json` with `base`, `originalHead`, `pinnedBase`, and the startup verdict.
- **Leased push.**
  - Add a method on the `publisher()` result that re-runs `inspect()` and requires an unchanged `target`. It reads the captured remote head and requires that head to be an ancestor of the original local head; it stops on remote-only commits.
  - It pushes with the same `-c` hardening as `publish()`: `push --no-follow-tags --recurse-submodules=no --force-with-lease=refs/heads/<branch>:<captured> origin <rebased>:refs/heads/<branch>`.
  - It confirms `remote()` equals the rebased SHA. When a PR exists, it confirms `lookup().headRefOid`.
  - Do not use plain `--force`, an implicit lease, or a retry.
- **Push only when needed.** With no remote feature ref, or with a remote ref that is already an ancestor of the rebased HEAD, do not push at startup. Final `publish()` stays the non-force path.
- **Slice title.** Take the title from the first `### Slice N: <title>` section of the committed plan at HEAD, for each execute launch, whose task checkboxes include `- [ ]`. A section ends at the next `### Slice` heading or the next `## ` heading. Ignore headings and checkboxes inside fenced code blocks. In the widget, replace control characters and truncate the title to 60 characters with `…`. When the plan has no usable slice, keep the current `execute slice <launch>` label. The title never controls execution.
- **Stop conditions for `/execute`.** Stop and return to `/plan` if `inspect()` cannot keep the remote SHA out of `target`, if `attempt()` cannot run `startup-check` without Rex recovery, or if the fixtures cannot simulate a concurrent push.

### Security and Observability Requirements
- No agent prose controls the rebase or the push. Only the validated handoff fields and Git checks do.
- Do not record credentials. Keep the existing GitHub token isolation (`GH_TOKEN` only in the `gh` env, removed from child env).
- Report startup progress as `message` events, for example `Rebased <old>→<new> onto <pinned>`, `Startup check: fits`, and `Pushed <new> to <branch> with lease on <captured>`. Do not use `phase("verify")`, so that `verify` totals stay accurate.
- Every stop reason names the step (pin, rebase, check, or push), the SHAs involved, and whether the remote changed.

### Failure Modes to Handle
| Failure | Required behavior |
|---|---|
| Decline at confirmation | No rebase, no child, no remote write. |
| Rebase conflict or timeout | Abort, confirm the original HEAD and a clean tree, then stop. If that is uncertain, keep the lock. |
| Plan blob changed by the rebase | Stop before the check. |
| `startup-check` blocked, invalid, or mutating the snapshot | Stop with no recovery pane and no push. |
| Remote-only commits on the feature ref | Stop before the push. |
| Concurrent push between capture and push | The lease rejects the push. Stop and report the observed head. No retry. |
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
- Use `run()` in `_integration.test.ts` with the real bare remote through `_fixtures/ssh.mjs`, a diverged `main` in the bare repository, and `_fixtures/pi.mjs` extended to write `startup-check` handoffs.
- Mock only Pi children and the GitHub API through the existing fixtures. Git and the remote are real.
- Assert remote writes through `BARE.pushes` and the execute launch through the argv log.
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
- THEN the first execute prompt names the rebased HEAD as the feature baseline, `run.json` records the original head and the pinned tip, and no startup push occurs.

#### Scenario: Already up to date
- GIVEN HEAD that already descends from the pinned tip
- WHEN the operator confirms
- THEN the runner starts slice 1 without a rebase, a `startup-check` launch, or a push.

#### Scenario: Stop before implementation (negative)
- GIVEN a declined confirmation, a rebase conflict, a changed plan blob, or a `startup-check` verdict that is blocked, invalid, or changed the snapshot
- WHEN the runner attempts startup
- THEN no execute child starts, no Rex recovery pane opens, the remote is unchanged, and the stop reason names the step. After a conflict, HEAD equals the original head.

### Requirement: Leased startup push
When a remote feature ref exists and the rebase rewrote it, the runner SHALL update only that ref with `--force-with-lease` on the captured remote SHA, after an accepted check, and SHALL confirm the new remote head (and the PR head when a PR exists) before slice 1.

#### Scenario: Accepted rewrite
- GIVEN a remote feature ref that is an ancestor of the original local head, and a `fits` verdict
- WHEN startup completes
- THEN the remote ref equals the rebased HEAD, the confirmation text disclosed the rewrite, slice 1 starts, no PR or ARP write occurs at startup, and the final non-force `publish()` succeeds.

#### Scenario: Unsafe remote state (negative)
- GIVEN remote-only commits on the feature ref, or a concurrent push between capture and push
- WHEN the runner reaches the push
- THEN the runner does not overwrite the remote, does not retry, does not start slice 1, and reports the observed head.

## Implementation tasks
### Slice 1: Show which slice is executing
### Task 1: Display the plan slice number and title
**Delivers:** The execute widget follows the active plan slice by number and title.
**Blocked by:** None
**Traces to:** Requirement: Display the active slice.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts`.

- [ ] Add failing tests: a pure parser case for each scenario (grouped, partial, ungrouped, fenced lookalike), and `phaseDisplay` cases for the label, control characters, the 60-character cap, and the fallback.
- [ ] Add optional `slice: { number, title }` to the `phase` RunnerEvent for execute. Compute it from the plan at HEAD before each execute launch, and render it in `phaseDisplay`. Preserve the phase totals, skills, `verify N of 3`, `rexActivity`, and recovery behavior.
- [ ] Run `cd dot_pi/agent && npm test && npm run typecheck`; expect all tests to pass.
- [ ] Commit with `feat(pi): show stage runner slice titles`.

### Slice 2: Rebase, check, and update the branch before implementation
### Task 2: Gate slice 1 on the startup rebase and plan check
**Delivers:** With no remote feature ref, the runner pins the base, rebases, runs `startup-check`, and starts slice 1 from the rebased baseline, or stops before implementation.
**Blocked by:** None
**Traces to:** Requirement: Rebase and check before slice 1.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs`.

- [ ] Extend the integration setup with a diverged `main` in the bare remote. Extend `_fixtures/pi.mjs` to answer `startup-check` with `fits`, `blocked`, an invalid handoff, or a snapshot mutation. Add failing cases for each scenario of this requirement, including the conflict abort and the already-up-to-date skip.
- [ ] Implement the pin, the confirmation text, the async bounded rebase with abort, the `startup-check` stage and handoff validation, the snapshot check, the `base` rebinding, the `run.json` fields, and the `message` progress events.
- [ ] Run `cd dot_pi/agent && npm test && npm run test:integration && npm run typecheck`; expect all to pass, including the existing publication and ARP cases.
- [ ] Commit with `feat(pi): rebase and check the plan before stage runner execution`.

### Task 3: Force-push the rebased branch with a lease
**Delivers:** When an existing remote ref was rewritten, the runner updates it with an explicit lease after the accepted check and confirms the remote and PR head before slice 1.
**Blocked by:** Task 2
**Traces to:** Requirement: Leased startup push.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_publish.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/`.

- [ ] Add failing integration cases:
  - an accepted rewrite with no PR, and one with an existing PR (`reuse`), where the final `publish()` succeeds without force;
  - remote-only commits;
  - a concurrent push injected after the check and before the push, where the lease rejects the push, `BARE.pushes` has no startup entry, and no execute starts;
  - a remote ref that is already an ancestor of the rebased HEAD, where no startup push occurs.
- [ ] Implement the leased startup push method in `publisher()` and call it from the startup gate. Keep the remote SHA out of `target`, and leave `publish()` unchanged.
- [ ] Run `cd dot_pi/agent && npm test && npm run test:integration && npm run typecheck`; expect all to pass.
- [ ] Commit with `feat(pi): force-push the rebased stage runner branch with a lease`.

### Task 4: Document the startup contract
**Delivers:** Operator and future-agent guidance that matches the new behavior.
**Blocked by:** Task 1, Task 2, and Task 3
**Traces to:** All requirements and the rollout contract.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [ ] In `README.md`, document:
  - the pinned base and the confirmation disclosure;
  - the startup rebase, the `startup-check` stage, and how it differs from feature-wide `/verify`;
  - recovery after a conflict or a blocked check;
  - the leased startup push and the fact that cancellation does not undo it;
  - the slice label.

  Replace "pushes the verified SHA … without force" and "Do not force-push … to recover" with statements that separate the startup push from final publication and from recovery. The recovery section must keep the prohibition on force-push.
- [ ] Inspect `dot_pi/agent/AGENTS.md` and the repository `AGENTS.md`. Update them only if a durable rule conflicts; otherwise record in the commit body why no edit was needed. Update `lifecycle-prompts.test.mjs` only if a prompt template changed; otherwise record that no prompt contract changed.
- [ ] Run `cd dot_pi/agent && npm test`; expect all tests to pass.
- [ ] Commit with `docs(pi): document stage runner startup rebase and lease`.

### Task 5: Final verification
**Delivers:** Feature-wide evidence for both slices.
**Blocked by:** Task 1, Task 2, Task 3, and Task 4
**Traces to:** All requirements and the rollout contract.
**Files:** `dot_pi/agent/package.json`.

- [ ] Run `git diff --check origin/main...HEAD`. From `dot_pi/agent`, run `npm ci --ignore-scripts` and then `npm run test:all`; expect all to pass. Record the results, then remove `node_modules`.
- [ ] Confirm that every acceptance scenario maps to a passing test named in Tasks 1–3. The lifecycle then requires `/simplify`, independent feature-wide `/verify`, and the approved live trial before `chezmoi apply`.

## Learning candidates
- 2026-11-23: In stage-runner `publish()`, `confirmed()` compares the whole `inspect().target` JSON, so any new field there that legitimately changes during a run (such as a remote SHA after a startup push) makes final publication fail — evidence: `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` `confirmed()`.
