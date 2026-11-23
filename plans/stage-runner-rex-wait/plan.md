# Stage Runner Rex Exit Evidence Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use Rex exit evidence to confirm that a verified interactive Pi child has exited before `stage-runner` releases its worktree lock or checks the next handoff.
**Smallest user-feedback slice:** An interactive child that exits with a valid handoff continues as before, but removing its pane without an exit record stops the run and retains the lock.
**Out of Scope:** Headless Pi subprocesses, stage handoff and Git validation, publication, pane layout, and an adapter-style event subscription.
**Architecture:** After `_recovery.ts` verifies the Rex peer, block, and foreground Pi process, it waits for exit evidence on that block. The workflow runner still owns the lock and decides whether a handoff permits advancement.
**Tech Stack:** TypeScript, Node.js subprocesses, local Rex CLI.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Select guidance for tests and planning. | Identified the worktree, source, research, and writing skills. |
| `feature-worktree` | prompt-required | Keep planning artifacts off `main`. | Created a branch from updated `origin/main`. |
| `chezmoi` | skill-loader | The test and future implementation are in chezmoi source. | Kept changes in the feature worktree. |
| `codebase-research` | skill-loader | Determine which callers rely on the recovery helper. | Traced the helper through design and implementation recovery and compared the adapter's exit observer. |
| `rex` | agent-selected | Confirm the available Rex interface. | Checked CLI support and observed exit and pane-close responses on a private server. |
| `learning-lookup` | prompt-required | Check relevant prior decisions. | Found no matching sections for `rex wait`, `last_exit`, retained locks, or Rex server behavior. |
| `write` | skill-loader | Make the plan actionable. | Separated exit evidence, cleanup, and stage acceptance. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Select execution guidance. | Routed worktree, Rex, code research, and documentation work. |
| `resolve-worktree` | prompt-required | Resolve the supplied plan. | Confirmed the unique path and owning branch. |
| `feature-worktree` | prompt-required | Keep code changes off `main`. | Used the clean feature worktree at the pinned candidate. |
| `chezmoi` | skill-loader | Modify managed source files. | Edited source only and did not apply it. |
| `codebase-research` | skill-loader | Trace the interactive pane lifecycle. | Checked both `recovery` callers, existing fixtures, and the runner's stage acceptance checks. |
| `rex` | agent-selected | Check the installed CLI contract. | Confirmed the Rex version, reviewed `rex wait --help`, and ran the isolated smoke test. |
| `diataxis` | skill-loader | Update operator guidance. | Put the minimum version and retained-lock behavior in the existing guide. |
| `write` | skill-loader | Edit the guide and ledger. | Named the exit checks and their effect on the lock. |

Implementation attempt: `openai/gpt-6.2-sol`. The pane-close regression failed before the fix because `runDesign` resolved instead of rejecting. It passed after the fix. The focused suite passed all seven cases, including nonzero exit followed by handoff rejection, `last_exit` reconciliation, and cancellation with a changed foreground identity. The fixture uses a detached supervisor to record real exit status; it supplies simulated Rex identity and pane responses. The two existing Pi fixtures changed only to exercise a real nonzero exit and a running child for the identity-recheck case. No `AGENTS.md` update is needed.

The first full run reported a `draft-cancel` failure before the 240-second command timeout. An isolated run also missed the existing `.draft-ready` deadline, before cancellation. In Rex recovery, the isolated case and the full `npm run test:all` passed without changes to the case or its readiness window. The full run passed 94 stage-runner and five Worktrunk integration cases, TypeScript checks, and Pi smoke. The opt-in Rex smoke test and `git diff --check` also passed after the full run.

## Scope
- Use `rex wait --json` on the exact verified block with the same pinned local server and session as the split. Prefer this built-in command to copying the adapter's reconnecting session-wide event stream. The helper waits for one block at a time and does not restore jobs across parent reloads.
- Preserve the local peer, split response, and foreground Pi identity checks. An exit payload does not establish startup identity. Do not move or weaken the checks before sending `SIGTERM` or `SIGKILL` on cancellation.
- Parse bounded wait output independently of the numeric CLI status. Any safe integer `exit_code` (including `-1` for signal-terminated processes) proves exit, even when nonzero. It does not prove a successful handoff. Pane-close output (`{"block_id": ...}` without an integer `exit_code`), a missing block, malformed or oversized output, and transport errors do not prove exit. On a failed or interrupted observation, make one bounded `block call … process` check for `last_exit` on the original block; if there is no valid exit record, report the reason and retain the lock. Do not repeat the split or close an unverified pane.
- Keep the waiter cancellable and reap it. Stopping it does not stop Pi. On cancellation, stop and reap the waiter, then call `block call … process` once: if a valid `last_exit` is already present, skip signaling and proceed to pane close and lock release before throwing abort. Otherwise preserve the existing identity check (`current.child?.pid === pid` and foreground identity) before sending `SIGTERM`, wait up to 5 seconds using bounded `rex wait --for=5s` (with one `last_exit` reconciliation), recheck identity before sending `SIGKILL` if the child is still running, confirm exit within a bounded window, and retain the lock if identity fails or exit remains unconfirmed. Do not advance on cancellation even if exit is confirmed. Keep the existing unbounded operator interaction time; bound individual Rex calls, captured output, and cancellation cleanup instead.
- Require Rex `0.1.0-preview.21` (API revision 18) or newer (confirmed up to date on all target machines). Update `dot_pi/agent/exact_extensions/stage-runner/README.md` with this prerequisite and the retained-lock behavior on pane close without exit; no `AGENTS.md` update is needed. Roll back the source change only after active runs stop; leave uncertain locks and evidence intact.

## Validation
The runner SHALL advance to existing handoff checks only after confirming that its verified interactive child exited. It SHALL retain the lock when the outcome is uncertain.

- **GIVEN** a verified child with a valid handoff, **WHEN** its exit reaches `rex wait` or the exact block's `last_exit` confirms it (including nonzero or signal-terminated `-1` exit records), **THEN** the runner closes the verified pane if it is still present, releases the lock, and performs its existing handoff and Git checks. A nonzero exit record is exit evidence, not a successful stage.
- **GIVEN** a verified child and no retained terminal exit, **WHEN** the operator closes the pane or the waiter fails, **THEN** the runner stops, retains the lock, and does not start the next stage. A closed pane does not prove exit.
- **GIVEN** a verified child still running, **WHEN** the operator cancels, **THEN** the waiter stops and is reaped, the runner checks `last_exit` and rechecks identity before signaling Pi (`SIGTERM`, bounded wait, `SIGKILL` if needed, bounded exit confirmation), and no stage advances. If the child already has a valid `last_exit`, the runner skips signaling and closes the pane and releases the lock before aborting. If the ownership check fails or exit cannot be confirmed, the runner does not signal an unverified process and retains the lock.

The opt-in live smoke test in `dot_pi/agent/exact_extensions/stage-runner/_rex-wait.test.mjs` passed three times before implementation. It verifies the Rex contract for a retained nonzero exit, a pane disappearing without an exit record, and interruption of the waiter while the child stays alive. It uses disposable shell processes, not Pi or GitHub. The stage-runner integration fixture must test orchestration and lock behavior; the smoke test alone does not establish either.

### Task 1: Require Rex exit evidence for an interactive child
**Delivers:** The runner uses Rex exit evidence to gate interactive pane cleanup and preserves the lock on uncertain exit.
**Blocked by:** None
**Traces to:** The exit, pane-closure, and cancellation contracts in Validation.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_recovery.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/rex.mjs`, and `dot_pi/agent/exact_extensions/stage-runner/README.md`.

- [x] Run `PI_STAGE_RUNNER_REX_SMOKE=1 node --test dot_pi/agent/exact_extensions/stage-runner/_rex-wait.test.mjs` from the repository root to reconfirm the local Rex `0.1.0-preview.21` contract before editing.
- [x] Update `dot_pi/agent/exact_extensions/stage-runner/_fixtures/rex.mjs` to track spawned child exit status independently of the fixture Pi scripts (supporting `wait`, `last_exit`, and `SIGKILL` for both `run` and `runDesign`), and add a focused failing regression: after child identity is verified, the pane disappears without an exit record; assert that the lock remains and the next stage is not launched. Cover normal exit, nonzero exit (lock released and pane closed while handoff/progress validation still gates advancement), recovery of `last_exit` after a waiter failure, and cancellation with a failed identity recheck without duplicating every scenario across both caller paths.
- [x] Replace the normal PID liveness loop with a bounded-output Rex wait, one `last_exit` reconciliation check, and the bounded cancellation cleanup path. Preserve the existing child identity checks, evidence, and stage acceptance. Document the Rex `0.1.0-preview.21` (API revision 18) prerequisite and retained-lock failure behavior in `dot_pi/agent/exact_extensions/stage-runner/README.md`.
- [x] From `dot_pi/agent`, run `npm ci --ignore-scripts` and `npm run test:all`. Repeat the opt-in live smoke test. Verify that successful recovery advances only after the existing handoff checks and that uncertain exit retains the lock. Leave the gitignored `dot_pi/agent/node_modules` directory ready for `/verify` (or remove it after `/verify` completes per `AGENTS.md`).
- [x] Commit with `fix(pi): require Rex exit evidence for stage runner panes`.
