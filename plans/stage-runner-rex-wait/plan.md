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

## Scope
- Use `rex wait --json` on the exact verified block with the same pinned local server and session as the split. Prefer this built-in command to copying the adapter's reconnecting session-wide event stream. The helper waits for one block at a time and does not restore jobs across parent reloads.
- Preserve the local peer, split response, and foreground Pi identity checks. An exit payload does not establish startup identity. Do not move or weaken the checks before sending `SIGTERM` or `SIGKILL` on cancellation.
- Parse bounded wait output independently of the numeric CLI status. A valid terminal `exit_code` proves exit, even when nonzero. It does not prove a successful handoff. Pane-close output, a missing block, malformed output, and transport errors do not prove exit. On a failed or interrupted observation, make one bounded `block call … process` check for `last_exit` on the original block; if there is no valid exit record, report the reason and retain the lock. Do not repeat the split or close an unverified pane.
- Keep the waiter cancellable and reap it. Stopping it does not stop Pi. Preserve the existing identity-checked child cancellation path and do not advance on cancellation even if exit is confirmed. Keep the existing unbounded operator interaction time; bound individual Rex calls, captured output, and cancellation cleanup instead.
- Confirm the minimum supported Rex CLI/server pair before rollout. The live probe establishes the contract only for `0.1.0-preview.21` (API revision 18). Do not silently drop support for an older required pair: if a required pair fails the probe, stop and agree on the support boundary before replacing the PID loop. Update the stage-runner README with the tested prerequisite and retained-lock behavior. Roll back the source change only after active runs stop; leave uncertain locks and evidence intact.

## Validation
The runner SHALL advance to existing handoff checks only after confirming that its verified interactive child exited. It SHALL retain the lock when the outcome is uncertain.

- **GIVEN** a verified child with a valid handoff, **WHEN** its exit reaches `rex wait` or the exact block's `last_exit` confirms it, **THEN** the runner closes the verified pane if it is still present and performs its existing handoff and Git checks. A nonzero exit record is exit evidence, not a successful stage.
- **GIVEN** a verified child and no retained terminal exit, **WHEN** the operator closes the pane or the waiter fails, **THEN** the runner stops, retains the lock, and does not start the next stage. A closed pane does not prove exit.
- **GIVEN** a verified child still running, **WHEN** the operator cancels, **THEN** the waiter stops, the runner rechecks identity before signaling Pi, and no stage advances. If the ownership check fails, the runner does not signal the process and retains the lock.

The opt-in live smoke test in `dot_pi/agent/exact_extensions/stage-runner/_rex-wait.test.mjs` passed three times before implementation. It verifies the Rex contract for a retained nonzero exit, a pane disappearing without an exit record, and interruption of the waiter while the child stays alive. It uses disposable shell processes, not Pi or GitHub. The stage-runner integration fixture must test orchestration and lock behavior; the smoke test alone does not establish either.

### Task 1: Require Rex exit evidence for an interactive child
**Delivers:** The runner uses Rex exit evidence to gate interactive pane cleanup and preserves the lock on uncertain exit.
**Blocked by:** None
**Traces to:** The exit, pane-closure, and cancellation contracts in Validation.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_recovery.ts`, `_integration.test.ts`, `_fixtures/rex.mjs`, and `README.md` in the same directory.

- [ ] Run `PI_STAGE_RUNNER_REX_SMOKE=1 node --test dot_pi/agent/exact_extensions/stage-runner/_rex-wait.test.mjs` from the repository root on the Rex pair targeted for rollout. Confirm the support boundary before implementation if any required pair fails.
- [ ] Use the existing Rex subprocess fixture to add a focused failing regression: after child identity is verified, the pane disappears without an exit record. Assert that the lock remains and the next stage is not launched. Cover normal exit, recovery of `last_exit` after a waiter failure, and cancellation with a failed identity recheck without duplicating every scenario across both caller paths.
- [ ] Replace the normal PID liveness loop with a bounded-output Rex wait and one exit-record reconciliation check. Preserve the existing child cancellation checks, evidence, and stage acceptance. Document the Rex prerequisite and failure behavior.
- [ ] From `dot_pi/agent`, run `npm ci --ignore-scripts` and `npm run test:all`. Repeat the opt-in live smoke test. Verify that successful recovery advances only after the existing handoff checks and that uncertain exit retains the lock. Remove the disposable dependencies after independent verification.
- [ ] Commit with `fix(pi): require Rex exit evidence for stage runner panes`.
