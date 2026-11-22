# Stage Runner live status implementation plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which background phase is active, how long each phase took, which skills the active child loaded, and Rex working state for the invoking pane, without opening a pane.
**Smallest user-feedback slice:** Slice 1. The invoking Pi displays a live phase timer, retains completed durations across transitions, and writes one summary entry at exit.
**Out of Scope:** A watch pane, SQLite, changes to verdict validation, changes to publication or recovery authority, reporting model reasoning or tool payloads, writes to Pi's root OSC 7501 record, and OSC 9;4 terminal progress. Rex tab spinners come from OSC 7501 records, so the runner does not need OSC 9;4. Pi's own `showTerminalProgress` behavior stays unchanged.
**Architecture:** The parent owns the display and derives status, Rex activity, and the exit summary from one typed event stream emitted by `run()` and `_arp.ts` (`reviewPublished`). The existing evidence files remain authoritative for acceptance and recovery. Display updates must not control phase transitions.
**Tech Stack:** TypeScript, Pi JSON mode, Pi TUI widgets, the Rex Program Status Protocol (OSC 7501), Node test runner.
**Approval source:** The operator approved the parent-only display during `/plan` on 2026-11-22. No `design.md` exists. On 2026-11-22, during `/systematic-review`, the operator directed that Requirement 3 use an OSC 7501 child record and that `run()` and `_arp.ts` emit a single unified typed event stream instead of separate `progress` and `status` callbacks.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Required first step of `/plan` | Selected skills from the affected TypeScript and Markdown files. |
| `codebase-research` | prompt-required | Trace the stage boundary | Inspected the command, child stream, and saved run. |
| `rex` | agent-selected | Check native activity; `skill-loader` has no Rex trigger | Identified the `program_status` inspection API. |
| `learning-lookup` | prompt-required | Check prior guidance | Found no matches for Rex working or `stage-runner-progress`. |
| `feature-worktree` | prompt-required | Isolate managed changes | Created the feature branch from `origin/main`. |
| `chezmoi` | skill-loader | Files under the chezmoi source | Kept all edits in the source tree. |
| `write` | skill-loader | Plan prose | Distinguished retries from forward progress. |
| `learning-candidates` | prompt-required | `/systematic-review` disproved the planned Rex mechanism | Recorded the OSC 7501 child-record finding. |

### Execution
Slice 1 writer: `openai/gpt-6.2-astra` (GPT-6.2 Astra).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Select execution guidance | Matched the extension, CLI, and README changes to skills. |
| `resolve-worktree`, `feature-worktree` | prompt-required | Verify the plan owner | Resolved the absolute plan path and kept edits on its feature branch. |
| `codebase-research` | skill-loader | Trace existing progress reports | Checked the command, runner, ARP callback, and fixtures before changing the seam. |
| `chezmoi` | skill-loader | Edit managed files | Changed only source files. |
| `cli-best-practices` | skill-loader | Change command output | Kept phase identity and launch counts separate from messages. |
| `diataxis`, `write` | skill-loader | Update operator instructions | Described how to read the widget and how to distinguish duration from success. |

## Implementation contract
Suggested starting points are `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `_runner.ts`, `_arp.ts`, and the existing test fixtures in that directory. These paths are binding:
- **Seam:** Export `Options` from `_runner.ts`. Unify `progress` and live phase reporting into one typed event callback on `Options` (and in `_arp.ts` `reviewPublished`), with an injected monotonic clock `now?: () => number` that defaults to `performance.now`. `index.ts` is the sole formatter for the widget, OSC 7501 state, and the single `stage-runner-progress` exit summary; it must not append `stage-runner-progress` entries on intermediate events. The consumers of `_runner.ts` and `_arp.ts` are `index.ts`, `_integration.test.ts`, and `_runner.test.ts`.
- **Labels:** Keep the per-run numeric folder IDs on disk (`execute-N`, `verify-N`). Emit stage-local labels instead of `Starting ${stage} (attempt ${n})` and `Opening Rex recovery for ${stage} (attempt ${n})`. `_integration.test.ts:328-332` and `_integration.test.ts:409-416` assert the old text; update those assertions (and `_runner.test.ts` `reviewPublished` callers) to the unified event stream.
- **Bounds:** Preserve bounded event parsing, timeouts, and recovery. Routine timer ticks must not call `pi.appendEntry`. Clear every interval, widget, and runner-owned OSC 7501 record on every exit path.

### Requirement 1: Phase duration and retry labels
The line shows these phases: `execute`, `simplify`, `verify`, `recovery`, `publish`, `review` (ARP status polling and `arp-review` children), and `fix` (`arp-fix` children). Pre-confirmation work (preflight and publication inspection) shows no line.
- GIVEN a confirmed run, WHEN execute advances to simplify and verify, THEN the invoking Pi shows one widget line with the active phase, its elapsed time, and the frozen durations of earlier phases, summed per phase name. Example: `verify 2 of 3 · 03:12 | execute 18:40 · simplify 04:05 · recovery 06:30`.
- WHEN execute starts another slice, THEN label it `execute slice K`, where K counts execute launches in this run. It is not a retry.
- WHEN verify launches again after a failed verify, THEN label it `verify K of 3`, where K is the runner's verifier launch count (`verifies`). Never show the global folder sequence `n` as a retry count.
- WHEN the runner waits on a Rex recovery pane, THEN attribute that time to `recovery`, not to the failed phase. A resumed execute or simplify writer that the operator accepts adds no new retry label.
- WHEN the run completes, stops, or is canceled, THEN append exactly one `stage-runner-progress` summary entry with the outcome and every phase duration, then clear the widget.
- Negative: a failed phase is never shown as successful, and a timer tick never creates a transcript entry.

### Requirement 2: Observed skill loads
- GIVEN a `tool_execution_start` event with `toolName: "read"` and an `args.path` that is a skill entrypoint, WHEN the `tool_execution_end` event with the same `toolCallId` arrives with `isError: false`, THEN show the skill name once for that child. Nested calls from codemode emit the same event pair with `parentToolCallId`, so one rule covers direct reads and nested reads.
- A skill entrypoint is a path whose basename is `SKILL.md` and whose parent directory name matches `^[a-z0-9][a-z0-9-]{0,63}$`. The label is that parent directory name. Any other path is ignored.
- Negative: WHEN a read fails, the start event is missing, the path is not an entrypoint, or a new child starts, THEN show no inferred name and do not carry the previous child's list forward. Never display raw tool arguments, results, or full paths. Keep at most 256 pending start events and 16 labels per child. Drop extra entries silently.
- Known limit: a child that reads a source `SKILL.md` during an edit is counted as a load. The README must state this limit.

### Requirement 3: Native Rex activity
- GIVEN a confirmed run in Rex, WHEN the parent supervises a phase, THEN the runner writes an OSC 7501 child record `id=stage-runner` with `app=pi-stage-runner`, state `working`, and a `msg` that names the phase. The runner writes the record on phase changes only. The protocol has no heartbeat, so ticks do not write.
- Mechanism: mount `ctx.ui.setWidget` before `confirm` opens, returning an empty render (`() => []`) during pre-confirmation work so no widget line is shown while `tui.terminal` is captured for `confirm`. Write through that `Terminal` object (`tui.terminal.write()`), so the sequence goes through the same writer as TUI output, and keep `tui.terminal` reachable after `setWidget(key, undefined)` so `session_shutdown` can emit `clear`. pi-tui `formatProgramStatus` supports only the root record, so add a minimal formatter for the fixed `id`. The formatter base64-encodes `msg` after it replaces control characters, and caps it at 2048 decoded bytes. Never write the root record.
- WHEN the runner waits on a Rex recovery pane, THEN report `blocked` with `kind=question`. WHEN a runner dialog (`confirm` or `approve`) is open, THEN report `blocked` with `kind=permission`.
- WHEN the run completes, report `done`. WHEN it stops on an error, report `error`. WHEN it is canceled, report `idle`. WHEN Pi shuts down, report `clear` for `id=stage-runner`.
- Negative: no `working` or `blocked` runner record remains after any exit path, and no Pi root record changes because of the runner. When `PI_PROGRAM_STATUS=0`, the runner writes nothing. No normal phase creates a pane.
- Evidence: on 2026-11-22, a manual `working` report with `id=stage-runner` appeared next to Pi's root record in `rex block call -b "$REX_BLOCK" program_status`, and `state=clear:id=stage-runner` removed only that record. This evidence did not show whether the tab spinner appears when only the child record is `working`.

## Validation limits
- Unit and integration tests prove phase events, labels, skill parsing, OSC 7501 byte sequences, and cleanup. They cannot prove the Rex tab animation.
- The live Rex check in `## Live check follow-up` must be performed by the operator, because a `--mode json` child and the verifier cannot see a tab. The check runs after publication and before merge or `chezmoi apply`, and it blocks rollout. The verifier records the check as an open gap and does not mark it done.
- Stop condition: if the live check shows no tab spinner when only the child record is `working`, stop and report. Do not fall back to writing Pi's root record.

## Rollout and rollback
- Rollout: after merge, run `chezmoi --source "$PWD" diff` and `chezmoi --source "$PWD" apply` with the explicit changed target paths under `~/.pi/agent/extensions/stage-runner/`, then restart Pi.
- Rollback: stop any active run, revert the feature commits, preview and reapply the same target paths, and restart Pi. Run evidence and locks are unaffected.

## Tasks
### Slice 1: Live phase timer
### Task 1: Show phase timing in the parent
**Execution evidence:** The focused complete-run test failed against the old `progress` callback. It passed with the typed event stream. A first type check caught a shadowed test variable. After correcting it and isolating UI errors from phase transitions, `npm test`, `npm run test:integration` (57 stage-runner and 5 Worktrunk tests), and `npm run typecheck` passed. No evidence file, folder name, or recovery contract changed. For ARP fix candidates, the widget shows `verify` without a retry count because each candidate requires a fresh verdict.
**Delivers:** Active elapsed time, completed durations, correct labels, and one summary entry at exit.
**Blocked by:** None
**Traces to:** Requirement 1

- [x] Add a failing test that drives `run()` through the integration fixture with an injected clock. Cover execute slices, simplify, verify success, verify failure with recovery and a second verify, an accepted resumed writer, publication, ARP `review` and `fix` cycles, cancellation, and an error stop. Assert the unified event sequence, the stage-local labels, recovery attribution, and one `stage-runner-progress` summary entry at exit. Assert that ticks and intermediate events do not call `appendEntry`.
- [x] Export `Options` and replace `progress` with the unified event stream in `_runner.ts` and `_arp.ts` (`reviewPublished`). Render the widget from `index.ts` with a 1 s interval, update `_integration.test.ts:328-332`, `_integration.test.ts:409-416`, and `_runner.test.ts`, and update `README.md` to document the live widget line, its phases, recovery time, and the single exit summary entry.
- [x] From `dot_pi/agent`, run `npm ci --ignore-scripts` if `node_modules` is absent, then `npm test`, `npm run test:integration`, and `npm run typecheck`. Confirm that no evidence file, folder name, or recovery contract changed. Commit with `feat(pi): show live stage durations`.

### Slice 2: Observed skills
### Task 2: Report skills observed in the active child
**Delivers:** Correct skill labels on the live line.
**Blocked by:** Task 1
**Traces to:** Requirement 2

- [ ] First, capture one real `pi --mode json` run where codemode calls `tools.read`, and confirm that nested `tool_execution_start` and `tool_execution_end` events with `parentToolCallId` appear on stdout. If they do not appear, stop and ask before you use codemode `details.calls`.
- [ ] Add failing tests through the JSON stream fixture: direct and nested successful reads, failed reads, a missing start event, non-entrypoint paths, invalid directory names, duplicates, the 256 and 16 bounds, and child replacement. Test the line when no read is observed.
- [ ] Implement the parser in the `attempt()` stream loop and pass labels through the Task 1 seam. Document the skill observation limit in the README.
- [ ] Run `npm test`, `npm run test:integration`, and `npm run typecheck` from `dot_pi/agent`. Expect only current-child skills on the line. Commit with `feat(pi): report observed stage skills`.

### Slice 3: Rex activity
### Task 3: Report the runner's OSC 7501 child record
**Delivers:** A Rex working, blocked, and final state for the invoking pane, without stale records or a watch pane.
**Blocked by:** Task 1
**Traces to:** Requirement 3

- [ ] Add failing tests with an injected writer. Assert the exact sequences for working per phase, `blocked:kind=question` during recovery, `blocked:kind=permission` during runner dialogs (`confirm` and `approve`), and `done`, `error`, `idle`, and `clear` on completion, error stop, cancellation, and shutdown (including `clear` after the widget is cleared). Assert no writes when `PI_PROGRAM_STATUS=0`, no root-record writes, and `msg` sanitizing and bounds.
- [ ] Implement the formatter and the writer from the widget factory's `Terminal`. Document the child record and the operator live check in the README.
- [ ] Run `npm test`, `npm run test:integration`, and `npm run typecheck` from `dot_pi/agent`. Commit with `feat(pi): report stage activity to Rex`.

### Task 4: Final verification
**Delivers:** Evidence that all requirements hold together.
**Blocked by:** Tasks 1-3
**Traces to:** Requirements 1-3

- [ ] Review the relevant `AGENTS.md` files and change them only if a durable operator rule has changed.
- [ ] Under `dot_pi/agent`, run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all`, then remove `node_modules`. Confirm that each scenario in Requirements 1-3 maps to a passing test. List the `## Live check follow-up` as open until the operator records it.

## Live check follow-up
The operator performs this check after publication and before merge or `chezmoi apply`. It has no checkbox because no child can perform it. In an isolated Rex and Pi run, query `rex block call -b "$REX_BLOCK" program_status` during a phase and confirm a `stage-runner` record with state `working`. Focus another tab and confirm the spinner on the invoking tab while Pi's root record is idle. Confirm the final record state after exit. Record the result in the PR. If the spinner is absent, apply the stop condition in `## Validation limits`.

## Learning candidates
- 2026-11-22: Pi 1.6.0 reports OSC 7501 only for the root record and has no extension API for it, but an extension can write a separate child record (`id=...`) that coexists with Pi's root record and clears independently — evidence: `pi-tui/dist/program-status.d.ts` ("Only the root record is supported") and `rex block call -b "$REX_BLOCK" program_status` showing both records after a manual `state=working:id=stage-runner` report.
