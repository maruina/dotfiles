# Stage Runner live status implementation plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which background stage is active, how long each stage took, and which skills the active child loaded, without opening a pane.
**Smallest user-feedback slice:** The invoking Pi displays a live stage timer and retains completed durations across transitions.
**Out of Scope:** A watch pane, SQLite, changes to verdict validation, changes to publication or recovery authority, and reporting model reasoning or tool payloads.
**Architecture:** The parent owns the display and derives status from stage transitions and structured child events. The existing evidence files remain authoritative for acceptance and recovery. Display updates must not control stage transitions.
**Tech Stack:** TypeScript, Pi JSON mode, Pi TUI, Rex, Node test runner.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| skill-loader, codebase-research | Planning | Trace the stage boundary | Inspected the command, child stream, and saved run. |
| rex | Domain | Check native activity | Identified the program_status inspection API. |
| learning-lookup | Planning | Check prior guidance | No matches for Rex working or stage-runner-progress. |
| feature-worktree, chezmoi | Repository | Isolate managed changes | Created the feature branch from origin/main. |
| write | Planning | Describe observable outcomes | Distinguished retries from forward progress. |

## Implementation contract
The operator approved the parent-only display. Suggested starting points are `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `_runner.ts`, and the existing integration fixture in that directory. Keep the existing per-run numeric IDs on disk. Preserve bounded event parsing, timeouts, and recovery. Routine timer ticks must not create transcript entries. Use a monotonic elapsed clock and clear all timers and run-owned UI on exit.

### Requirement 1: Stage duration and retry labels
- GIVEN a confirmed run, WHEN execute advances to simplify and verify, THEN the invoking Pi shows one updating line with the active stage's elapsed time and the frozen durations of earlier stages.
- WHEN a stage retries after recovery, THEN show the stage-local retry number and retain its earlier duration. Do not count recovery wait as active verification. A new execute slice is not necessarily a retry. Never mark a failed stage successful or show the global evidence sequence as a retry count.

### Requirement 2: Observed skill loads
- GIVEN a successful direct `read` or a successful nested `tools.read` of a skill entrypoint, WHEN the structured result arrives, THEN show the skill name once for that child. The recorded execute session used both mechanisms: codemode tool results contained `details.calls` with name, args, and status. Match corresponding structured events; do not evaluate codemode source or scan prose.
- WHEN a read fails, metadata is absent, or a new child starts, THEN do not infer a skill name or carry the previous child's list forward. Bound and sanitize labels; never display raw tool arguments, results, or arbitrary paths.

### Requirement 3: Native Rex activity
- GIVEN background stage work in Rex, WHEN the parent is supervising the child, THEN Rex reports working on the invoking pane and its tab shows the normal working animation. Check native program state (OSC 7501) separately from terminal tab progress (OSC 9;4). Installed Pi TUI supports both; `rex block call -b "$REX_BLOCK" program_status` exposes the former.
- WHEN interaction is required, work ends, cancellation occurs, or the parent shuts down, THEN no stale runner-owned working signal remains. Preserve Pi's other activity and respect disabled terminal indicators. No normal stage creates a pane.

## Tasks
### Task 1: Show stage timing in the parent
**Delivers:** Active elapsed time, completed durations, and correct retry labels.
**Blocked by:** None
**Traces to:** Requirement 1

- [ ] Add a failing transition test using controlled times; cover success, repeated execute slices, failure, recovery, and retry. Connect the parent UI to stage lifecycle events. Keep permanent milestones but remove misleading attempt labels.
- [ ] From `dot_pi/agent`, run `npm test` and `npm run test:integration`. Confirm the transition sequence and that no stage or recovery contract changed. Commit with `feat(pi): show live stage durations`.

### Task 2: Report skills observed in the active child
**Delivers:** Correct skill labels on the live line.
**Blocked by:** Task 1
**Traces to:** Requirement 2

- [ ] Exercise direct and nested successful reads through the JSON stream fixture, plus failed reads, unrelated paths, duplicates, and child replacement. Render only observed names. Test the display when no reads are observable.
- [ ] Run `npm test` and `npm run test:integration` from `dot_pi/agent`; expect only current-child skills on the line. Commit with `feat(pi): report observed stage skills`.

### Task 3: Report native activity and qualify the operator display
**Delivers:** Rex activity during supervised work, without stale indicators or a watch pane.
**Blocked by:** Task 1
**Traces to:** Requirement 3

- [ ] Test native activity ownership and cleanup on completion, rejection, cancellation, shutdown, and recovery waits. Reuse Pi terminal support where available; do not simulate an agent turn. Confirm behavior in an isolated Rex/Pi run: query the invoking block, inspect the actual tab animation, and verify clearing at exit. Server state alone does not prove the animation.
- [ ] Document the stage line, recovery wait, and skill observation limits in the extension README. Review relevant AGENTS.md files; change them only if a durable operator rule has changed. Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` under `dot_pi/agent`. Do not claim qualification or install changes if live validation is missing. Commit with `feat(pi): report stage activity to Rex`.
