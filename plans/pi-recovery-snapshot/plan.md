# Pi Recovery Snapshot Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the Pi conversations open across the local Rex server before an update and restore only that snapshot into Fish-backed tabs after the update.
**Smallest user-feedback slice:** Save, preview, and restore across two Rex sessions and verify that exiting Pi leaves Fish open.
**Out of Scope:** Split geometry, non-Pi tabs and processes, remote Rex servers, and recovery from historical checkpoints when there is no snapshot.
**Architecture:** Keep the Pi extension's per-pane checkpoints as an identity index. The Fish commands share the Node CLI: `pi-save` joins live Rex panes to that index and writes a separate snapshot; `pi-restore` uses only the snapshot to select conversations to launch.
**Tech Stack:** Fish, Node.js, Pi extensions, Rex CLI, chezmoi.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Lifecycle planning | Routed repository, command, and prose guidance. |
| `rex` | agent-selected | Rex pane and process inspection | Verified the live inventory and checked the CLI launch options. |
| `codebase-research` | skill-loader | Recovery behavior and callers | Traced the wrapper, CLI, checkpoints, and restore candidate selection. |
| `cli-best-practices` | skill-loader | Command changes | Preserved preview/apply and planned structured results and safe retries. |
| `script-best-practices` | skill-loader | Fish command | Kept the Fish wrapper thin and checked the Fish startup mechanism. |
| `chezmoi` | skill-loader | Managed sources and rollout | Identified explicit targets for preview and apply. |
| `feature-worktree` | prompt-required | Plan commit | Created a separate worktree from `origin/main`. |
| `learning-lookup` and `obsidian-cli` | prompt-required | Advisory lookup | Searched `Datadog/Learnings.md` for `pi-restore`, `rex-recovery`, and `init-command`; no sections matched. |
| `write` | skill-loader | Plan prose | Stated the observable workflow and failure cases. |

## Implementation Contract
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Fish commands | `dot_config/private_fish/exact_functions/pi-save.fish`, `dot_config/private_fish/exact_functions/pi-restore.fish` | Follow the existing `PI_CODING_AGENT_DIR` convention and forward arguments. Leave `pi-restore.fish` unchanged if the interface permits. | Fish syntax and command help checks. |
| Recovery CLI and core | `dot_pi/agent/exact_extensions/rex-recovery/{cli,core}.mjs` | Inventory, snapshot, preview, and restore. | Unit tests with injected Rex responses; isolated Rex/Pi smoke test. |
| Pi extension | `dot_pi/agent/exact_extensions/rex-recovery/index.ts` | Retain the existing checkpoint hooks and confirm they still identify Fish-launched Pi. No hook change is planned. | Observe checkpoints from running Pi in the smoke test. |
| Operator guide | `dot_pi/agent/exact_extensions/rex-recovery/README.md` | Describe pre-update save, post-update restore, and recovery after partial failure. | Check examples against CLI help and test cases. |

### Key decisions and failure handling
- Match checkpoints to a live local Rex session ID, pane ID, and foreground PID, on the same host and endpoint. Use current Rex window and session labels for the snapshot. Report identifiable Pi panes that have no matching checkpoint, with enough information to locate them and run `/reload`. Do not infer their conversation from a nearby checkpoint or shell command line.
- Keep one versioned, private snapshot in the existing recovery state directory, separate from the per-pane `.json` record scan. Replace it atomically on successful save, including a successful save with no Pi open. An inventory or write error must not make a partial snapshot visible. Serialize save with restore apply using the existing restore lock or its direct replacement. Retain the previous snapshot on failure and make that clear in the error.
- Restore must not use historical checkpoints as launch candidates. It can use them to detect conversations already open and to verify launch completion. Preview is read-only and apply keeps the existing unknown-Pi guard and pending launch reservations. Retain at most one launch per exact conversation file on apply, including when several saved panes had the same file. Preserve grouping across retries and partial failures without changing the snapshot's membership. Do not bind a saved group to an unrelated Rex session by label alone.
- Report a missing snapshot as a stop with `pi-save` instructions. Distinguish an empty snapshot from a missing one. Reject an invalid or foreign snapshot before any Rex mutation. Report `missing-file` and `missing-cwd` separately, and leave busy panes alone. Preserve the existing bounded Rex calls and checkpoint limits.
- For a new tab or Rex session, have Rex start interactive Fish directly and let Fish run Pi as a child via `--init-command`. Do not use `exec` to launch Pi from Fish. Quote path arguments for Fish, including apostrophes and backslashes, and scope `PI_REX_RECOVERY_ID` to the Pi command. Continue to reuse a verified idle Fish pane when possible. The installed Fish accepted input after the initialization command returned; the real Rex test must prove the same behavior after Pi exits.
- Use private state files with no conversation contents or credentials. Keep preview free of terminal mutations and preserve the occupied-pane and uncertain-launch safeguards documented in the existing README.

### Test strategy and limits
Use `npm run test:rex-recovery` from `dot_pi/agent` for snapshot and safety contracts. Extend `smoke.test.mjs` to use the real Rex CLI and Pi in a private socket, separate state directory, and temporary Pi agent directory. This proves behavior when the saved Rex resources are absent, without stopping the user's server or making model requests. An actual Rex upgrade and remotely hosted Rex sessions are not covered and are not required for this local workflow.

### Rollout and rollback
The operator previews and applies only the changed managed files, then runs `pi-save` before the next Rex update. An old checkpoint directory alone is not a snapshot. To roll back, reapply the previous managed sources; do not run the legacy `pi-restore --apply` unless its preview matches the intended recovery set, because it can still offer historical tabs. Neither rollout nor rollback deletes Pi conversation files.

## Requirements
### Requirement: Save an explicit server-wide snapshot
The system SHALL save active local Pi sessions across all Rex sessions into an explicit recovery snapshot.

#### Scenario: Server-wide snapshot captures live sessions
- GIVEN live Pi panes in two local Rex sessions and checkpoints for closed panes,
- WHEN `pi-save` runs,
- THEN the snapshot SHALL include only the matched live conversations from both sessions, with their current Rex grouping and labels.

#### Scenario: Unmatched panes or inventory failures halt save without corrupting state
- GIVEN an unmatched live Pi pane or a failed Rex inventory,
- WHEN `pi-save` runs,
- THEN the CLI SHALL identify the unmatched pane or fail the save, respectively, and an inventory failure SHALL preserve the previous snapshot.

### Requirement: Restore only saved conversations
The system SHALL restore conversations solely from the explicit snapshot and ignore historical checkpoints.

#### Scenario: Restore launches only snapshot members
- GIVEN an explicit snapshot and additional historical checkpoints,
- WHEN the operator previews and applies restore,
- THEN preview SHALL not launch anything and apply SHALL not launch a historical conversation absent from the snapshot.

#### Scenario: Duplicate or missing targets do not cause duplicate launches
- GIVEN an already-open saved conversation, duplicate snapshot entries for one file, or a missing or invalid snapshot,
- WHEN apply runs,
- THEN it SHALL not launch a second instance and SHALL launch nothing on a missing or invalid snapshot, and missing working directories and missing conversation files SHALL produce distinct results.

### Requirement: Leave Fish running after Pi exits
The system SHALL launch restored Pi instances inside an interactive Fish shell without disturbing occupied panes.

#### Scenario: Restored tab retains interactive Fish after Pi exit
- GIVEN a saved conversation whose Rex tab no longer exists,
- WHEN apply opens the tab and the operator exits Pi,
- THEN Fish SHALL accept another command in that same tab.

#### Scenario: Occupied pane is not disturbed
- GIVEN an occupied Rex pane,
- WHEN apply runs,
- THEN the occupied pane SHALL not receive restore input.

## Tasks
### Slice 1: Snapshot save, preview, and restore across Rex sessions

### Task 1: Add snapshot-based save and restore
**Delivers:** A server-wide `pi-save` and a `pi-restore` that only acts on the explicit snapshot and runs Pi inside Fish.
**Blocked by:** None
**Traces to:** Save an explicit server-wide snapshot; Restore only saved conversations; Leave Fish running after Pi exits.
**Files:** `dot_config/private_fish/exact_functions/pi-save.fish`, `dot_pi/agent/exact_extensions/rex-recovery/{cli.mjs,core.mjs,recovery.test.mjs,smoke.test.mjs}`

- [ ] Add failing tests for server-wide selection, replacement, failed inventory, restore without a snapshot, stale checkpoints, missing paths, and duplicate or already-open conversations. Keep the existing pending, busy-pane, and lock checks.
- [ ] Implement the Fish wrapper and shared CLI/core changes. Check that both commands expose their behavior in `--help` and preserve structured output for `--json`.
- [ ] Extend the private-server smoke test. Open Pi in two Rex sessions, leave a checkpoint for a closed tab, save, remove the fixture's saved Rex sessions, and restore. Check grouping and tab counts. Run restore again and check it creates no tabs. Exit one Pi instance and verify the same pane accepts a Fish command. Use a fixture path containing a quote to exercise Fish argument handling.
- [ ] Run `fish -n dot_config/private_fish/exact_functions/pi-save.fish`, `npm run test:rex-recovery` from `dot_pi/agent`, and `node --test dot_pi/agent/exact_extensions/rex-recovery/smoke.test.mjs` from the worktree root. Expect all to pass without touching the live Rex server.
- [ ] Commit with `feat(pi): save and restore an explicit Rex snapshot`.

### Task 2: Document and verify the update workflow
**Delivers:** A checked operator guide and a verified candidate for targeted chezmoi rollout.
**Blocked by:** Task 1
**Traces to:** Save an explicit server-wide snapshot; Restore only saved conversations; Leave Fish running after Pi exits.
**Files:** `dot_pi/agent/exact_extensions/rex-recovery/README.md`, relevant `AGENTS.md` files for guidance review only

- [ ] Document `pi-save` before the update, post-update preview and apply, return to Fish, and handling of unmatched panes and pending launches. Check repository and Pi `AGENTS.md`; leave them unchanged unless the README cannot cover a durable agent-specific requirement.
- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` from `dot_pi/agent` as required by repository guidance, then remove `dot_pi/agent/node_modules`. Run `git diff --check`. Preview the explicit changed targets with `chezmoi --source "$PWD" diff` from the worktree root; use explicit target file paths and include creation of the `pi-save` function. Do not use the live Rex server for a restore test.
- [ ] Commit with `docs(pi): document the Rex snapshot recovery workflow`.
