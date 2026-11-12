# ship-conductor: `/implement`
`/implement <plan-path>` runs each remaining slice of a committed plan through `/execute`, `/simplify`, and `/verify`. Each stage runs in a fresh Pi RPC child with the model you select. The coordinator is extension code, not a model: it selects the slice, starts the children, routes approval dialogs to you, checks typed outcomes and Git state between stages, and offers recovery when a stage stops. The lifecycle templates in `dot_pi/agent/exact_prompts/` own all lifecycle policy.

The directory keeps its historical name; the command is `/implement`. There is no `/ship` command.

## How to run a plan with `/implement`
Use `/implement` after `/plan` and `/systematic-review`. The order is `/brainstorm` → `/plan` → `/systematic-review <plan>` → `/implement <plan>`.

1. Commit the plan (and `design.md`, if it exists) in its feature worktree. The worktree must be clean and on a feature branch.
2. In a Pi session, run `/implement /absolute/path/to/plans/<feature>/plan.md`.
3. Select a model and then a thinking level for execute, simplify, and verify. The pickers list the session's scoped models (`/scoped-models`, `enabledModels`), or every authenticated model when no scope is set. The thinking picker lists only the levels the model supports; the default is a level pinned by the scope, otherwise the session level. The verify picker hides models that match either writer.
4. Answer approval dialogs when a stage asks. Escape on an approval dialog cancels the run.
5. Watch the panel above the editor. It shows the run ID, `Round N of M`, the slice, each stage's status, model, and thinking level, and the latest child activity.
6. Read the summary that appears once in the transcript when the run ends. The summary is not sent to the model.

The run stops after the last slice is verified, or earlier when a stage stops and you choose Stop, or when you cancel. A verified run does not open, merge, or deploy anything; the summary names the optional `/simplify <plan> --base <run-start-commit>` and fresh `/verify` for cross-slice cleanup.

## How to recover a stopped stage
When a stage blocks, fails, or verify returns `BLOCKED`, the coordinator keeps the worktree lock and asks what to do.

1. Choose **Recover with `<session model>`** to let the model of the session where you ran `/implement` fix the blocker. The session model receives one message with the run, slice, stage, reason, stage report, `git status`, and rules: fix only this blocker inside the selected unit, leave a clean worktree, start nothing else, and do not push, open a PR, or bypass checks or commit signing. You can talk to the session model during this turn.
2. When the session model finishes, choose **Retry `<stage>` in a fresh session**, **Recover again**, or **Stop**. Retry is not offered while the worktree is dirty or the plan changed outside the selected unit.
3. Retry starts the same stage in a new child. Execute accepts work that recovery committed, because execute success means HEAD moved past the round's unit base.

Recovery is offered at most twice per run. It is not offered after a cancellation, when a child's termination was not confirmed, or when the session model matches the selected verifier. Use a session model that differs from your verify model if you want recovery available.

## How to cancel a run
- Press **Ctrl+Shift+X** at any time. The coordinator aborts the active child (RPC abort, then SIGTERM after 5 seconds, then SIGKILL after 5 more) and releases the lock only after the child exits.
- Press **Escape** on an approval dialog to cancel at that point.
- Quitting Pi also cancels; Pi waits for the child to stop before it exits.

Ctrl-C does not cancel: in Pi it clears the editor (`app.clear`). Escape outside a dialog does not reach a running extension command.

## How to recover from a retained lock
If the coordinator cannot confirm that a child exited, it keeps the worktree lock and says so in the summary. Confirm that no `pi --mode rpc` child for that worktree is running, inspect the run record, then remove the lock directory under `lifecycle-coordinator/locks/` by hand. The coordinator never takes over a stale lock.

## Reference
### Stage contract
Each child receives `PI_LIFECYCLE_CHILD_CONFIG`, an absolute path to a private immutable stage config (`runs/<run-id>/configs/<round>-<stage>[-<attempt>].json`). `_bridge.ts`, loaded with `-e`, validates it and injects the contract: run ID, stage, pinned branch, pinned baseline commit (run start), unit base commit (round start), pinned plan and design blobs with their paths and the exact `git show`/`git rev-parse` commands, the selected unit and task numbers, the three models, and the effective thinking level. The working-tree plan is the progress ledger; requirements come from the pinned blobs.

The bridge registers two tools only in valid child sessions:
- `lifecycle_request_decision` shows an Approve/Reject dialog in the coordinator. Its result states the user's choice and repeats the question and proposal.
- `lifecycle_submit_outcome` accepts one typed outcome (`success`/`blocked` for writers, `VERIFIED`/`BLOCKED` for verify). It rejects a writer `success` while the worktree has uncommitted changes, and an execute `changed` success while HEAD equals the unit base. A rejected call is not a submission; the stage can correct its state and submit again.

The coordinator advances only after `agent_settled`, exactly one valid outcome, and its own Git, plan-progress, and model checks.

### Limits
| Limit | Value |
|---|---|
| Rounds per run | 20 |
| Recoveries per run | 2 |
| RPC record | 1 MiB |
| Run record | 256 KiB |
| Stage report | 64 KiB |
| Decision context | 16 KiB |
| Retained stderr per stage | 16 KiB |
| Progress entries per stage | 100 (dropped for completed rounds) |
| Completed run bundles kept | 100 |
| Control and startup calls | 30 seconds |

### State
Run state lives under `getAgentDir()/lifecycle-coordinator/` (normally `~/.pi/agent/lifecycle-coordinator/`), with directories mode 0700 and files mode 0600:
- `runs/<run-id>/record.json`: models, thinking levels, rounds, stage outcomes, decisions, recoveries, and counters.
- `runs/<run-id>/configs/`: immutable stage configs.
- `runs/<run-id>/reports/`: stage reports written by the bridge.
- `locks/<hash-of-worktree>/owner.json`: the cooperative worktree lock.

Records can contain private repository details and decision text. They stay local and are not sent anywhere. Pi sessions for children are not kept (`--no-session`).

### Files
| File | Responsibility |
|---|---|
| `index.ts` | `/implement` command, background run, pickers, progress panel, cancel shortcut, summary entry |
| `_conductor.ts` | Slice loop, stage transitions, recovery and retry, run record, summary |
| `_spawn.ts` | RPC child startup, framing, bounds, approvals, outcomes, shutdown |
| `_bridge.ts` | Child-only tools, stage contract, outcome checks |
| `_protocol.ts` | Versioned schemas for configs, decisions, and outcomes |
| `_models.ts` | Model and thinking-level selection and identity rules |
| `_recovery.ts` | Session-model recovery turn |
| `_unit.ts` | Slice selection and plan-progress checks |
| `_worktree.ts` | Plan resolution, Git preflight, candidate snapshots |
| `_state.ts` | Run records, stage configs, locks, retention |
| `_prompts.ts` | Native argument parsing and stage prompts |

### Tests
From `dot_pi/agent`:
- `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'` runs the extension suite. `_rpc.test.ts` drives the real Pi 1.5.0 agent loop with the in-memory fixture provider in `_fixtures/rpc-driver.ts`; it makes no network calls.
- `node --test exact_scripts/lifecycle-prompts.test.mjs` checks the template contracts.
- `npm test` and `npm run test:all` run the full gates.

Automated tests do not prove live behavior. A change to transport, dialogs, recovery, or the templates also needs a live run in a disposable worktree; see the repository `AGENTS.md`.

## Why the coordinator runs no model
The coordinator makes no model calls, so its decisions are deterministic checks you can test. Judgment stays in the lifecycle templates, the stage models, and you. Recovery uses your session model only after you choose it, and verification always runs in a fresh session with a model that differs from every writer, including a recovery writer.

## Rollout and rollback
Apply the explicit targets with `chezmoi --source "$PWD" apply <target>` from the worktree, then reload Pi. To roll back, stop any active run, revert the change, apply the same explicit targets, and reload. Run records stay in place for diagnosis. The direct `/execute`, `/simplify`, and `/verify` commands remain the fallback.
