# context-kit Same-Run Delivery Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver every context-kit file (nested instruction files, local siblings, and path-scoped rules) in the same run that discovers it, and block `edit`/`write` until the applicable files are in model context.
**Smallest user-feedback slice:** In one run, the first Go edit in dd-source is blocked, `.claude/rules/go.md` and the other applicable files are injected in the same turn with a visible compact tree, and the retried edit succeeds.
**Out of Scope:** `ls`/`grep`/`find` triggers; realpath and symlink containment; the vendored and build directory exclusion list; `git check-ignore` filtering; removal of `.pi/agentsignore`, `.pi/skillignore`, and `.pi/ruleignore` support (0% usage, reported as a cleanup candidate only); changes to file selection in a directory (context-kit keeps injecting both `AGENTS.md` and `CLAUDE.md` and keeps no `AGENTS.override.md` precedence); upstreaming rules and siblings into the `nested-context` package (option 4, owned by Juanpe Araque).
**Architecture:** context-kit keeps its own single discovery engine for all three file kinds. It adopts the delivery model of `nested-context` (DataDog/datadog-pi-packages `packages/nested-context`, commit `d436611`): steer injection at `tool_call`, a pending/loaded state machine confirmed in the `context` event, mutation blocking, direct-interaction confirmation by tool call id, compaction reset, and per-branch persisted state. The state machine lives in a new `_delivery.ts` module, modeled on `nested-context`'s `state.ts` and not imported across repositories.
**Tech Stack:** TypeScript pi extension (`@earendil-works/pi-coding-agent` 0.80.6 types, pi 1.0.0 runtime), `node:test` with `--experimental-strip-types`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Required at the start of `/plan` | Selected `chezmoi` and `codebase-research`. No language skill matches `.ts` files. |
| `learning-lookup` | `prompt-required` | Advisory lookup before planning decisions | Searched for pi, extension, steer, context, `before_agent_start`, `tool_call`, prompt caching, and chezmoi. No section was relevant to this change. |
| `chezmoi` | `skill-loader` | Files under the chezmoi source change | Source paths under `dot_pi/agent/exact_extensions/`, `npm ci` and `npm run test:context-kit` validation, apply from the worktree for the live check, and the commit workflow. |
| `codebase-research` | `skill-loader` | Unfamiliar code in two repositories | Mapped both extensions, the pi 0.80.6 type surface, the stub-`pi` test pattern, the `traceHook` dependencies, and the coupling to the usage backfill parser. |
| `feature-worktree` | `prompt-required` | A durable plan is written and committed | Created `maruina/context-kit-same-run-delivery` from `origin/main` under `~/src/.worktrees/dotfiles/`. |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | Resolve the plan path and switch to its owner | Confirmed the plan is in `maruina/context-kit-same-run-delivery`; all repository work uses that root. |
| `feature-worktree` | `prompt-required` | Continue implementation in the plan's feature worktree | Verified this is the intended non-main worktree. |
| `skill-loader` | `prompt-required` | Select stage-specific guidance before implementation | Identified chezmoi, unfamiliar-code, and prose guidance; no language skill applies to these TypeScript files. |
| `chezmoi` | `skill-loader` | The extension lives in the chezmoi source | Keep edits in source paths, use the worktree as `--source`, and run the required validation workflow. |
| `codebase-research` | `skill-loader` | Delivery changes span unfamiliar extension event behavior | Mapped discovery, state, test, and nested-context patterns before implementation. |
| `write` | `skill-loader` | Update the plan progress ledger | Keep execution notes concise and preserve the plan's scope. |
| `reviewable-pr-workflow` | `skill-loader` | Prepare the completed slice for a reviewable PR | Applied the stack-split check; the changes form one coherent task and do not need a stack split. |

## Advisory learnings
- Source: Obsidian `Datadog/Learnings.md`, read with `learn-evidence.mjs learning-sections`.
- Result: no matched section applies to pi extension delivery or prompt caching. The plan uses no learning.

## Background and current behavior
- `dot_pi/agent/exact_extensions/context-kit/index.ts` records discoveries in `tool_call` (only `read`, `write`, `edit`) and injects them in `before_agent_start`. That hook runs once per user prompt, so files found during an autonomous run reach the model only at the next user message. The README states: "Discovered context is injected on the next user turn, not mid-turn."
- Injection is one hidden custom message (`customType: "context-kit-discovery"`, `display: false`) with one `## <absolute path>` block per file. `_usage.ts` `parseDiscoveryMessage` and `exact_scripts/backfill-context-kit-usage.mjs` parse this format.
- `injectedAsMessages` is in-memory only. After a session restore, the same files are injected again. The header comment of `index.ts` records this as a known V1 gap.
- There is no size limit. No file injected so far is larger than 24 KiB.
- Both approaches append messages and do not change the system prompt, so the prefix cache stays valid. The move from `before_agent_start` to steer delivery changes timing, not caching.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Delivery state | `dot_pi/agent/exact_extensions/context-kit/_delivery.ts` (new) | Discovered, pending, direct-pending, and loaded sets; queue, confirm, blocking, compaction reset, snapshot, and rebuild from branch entries | `_delivery.test.ts` |
| Message builder | `dot_pi/agent/exact_extensions/context-kit/index.ts` (`buildDiscoveryMessage`) | Same `## <path>` format, 24 KiB per-file truncation, 96 KiB per-batch omission, `details.paths` | `_lifecycle.test.ts`, existing `_usage.test.ts` parse tests |
| Event wiring | `dot_pi/agent/exact_extensions/context-kit/index.ts` | `tool_call` discovery, steer delivery, and blocking; `context` confirmation; `tool_result` direct interactions; `session_start`, `session_tree`, and `session_compact` | `_lifecycle.test.ts` |
| UI renderer | `dot_pi/agent/exact_extensions/context-kit/index.ts` | Compact tree for `context-kit-discovery` messages, never file contents | `_lifecycle.test.ts` |
| Status | `dot_pi/agent/exact_extensions/context-kit/_status.ts` | `Blocked mutations: N` line in the current-session block | `_status.test.ts`, `_status-command.test.ts` |
| Docs | `dot_pi/agent/exact_extensions/context-kit/README.md`, `index.ts` header comment | Describe the new delivery model and replace "Keep one-turn lag" | Review |

### Key Decisions
- **Option 2:** context-kit adopts the nested-context delivery model rather than switching packages, splitting, or upstreaming. Rules (36%) and local siblings (14%) need mutation blocking as much as nested files (50%), and one engine avoids two extensions racing on the same `tool_call` events.
- **Visible compact tree:** messages use `display: true` with a registered renderer that shows `✓ context-kit loaded:` and one line per file (kind label and cwd-relative path). Blocked edits then show the reason in the UI. The model receives file contents either way. Messages remain `display: false` in Task 1 until Task 3 registers the renderer, preventing raw file contents from leaking to the TUI.
- **Mutation blocking reason format:**
  ```text
  context-kit: context files apply to <targetPath> but their contents have not been delivered to you yet:
  - <path1>
  - <path2>
  They are being delivered to you now. Retry the same call after you have received them.
  ```
- **Size limits:** use the same values as nested-context: 24 KiB per file (truncate on a UTF-8 boundary, then add `[truncated: file exceeds the per-file size limit]`) and 96 KiB per batch. A file that would exceed the batch total is skipped, and smaller files after it can still fit. Skipped files are listed by path, are not marked loaded, and keep mutations blocked until the model reads them directly (Slice 2) or a later batch delivers them.
- **Failure mode:** fail open on exceptions during discovery: notify a warning and let the tool call run. A file that applies but fails to read is not marked loaded and is removed from the blocking set for that call. The block reason, or a warning if no block occurs, names it. This prevents an edit that can never succeed.
- **Startup local siblings:** siblings of Pi-loaded files (for example `dd-source/AGENTS.local.md`) stay on the `before_agent_start` message path. They reach context before the first model call and are confirmed by the same `context` handler. In `before_agent_start`, check that the startup sibling is not already loaded in delivery state (`!state.loaded.has(local)`) before queueing it into `newBlocks` to prevent re-injecting on every prompt turn.
- **Message format compatibility:** keep `customType: "context-kit-discovery"` and the `## <absolute path>` block format. Put the header and the omitted-files list before the first block so `parseDiscoveryMessage` does not count that text in the last file's bytes. `details.paths` is additive.

### Implementation Constraints
- Do not change the system prompt on the injection path. The `.pi/agentsignore` and `.pi/skillignore` system-prompt edits in `before_agent_start` stay unchanged.
- Keep `walkUpForAgents`, `findLocalSibling`, `findMatchingRules`, and the ignore loaders unchanged. The plan changes delivery, not selection.
- Wrap the new handlers with `traceHook` like the existing ones. The test stub must provide `pi.events.emit` and `ctx.sessionManager.getSessionId()`.
- The `tool_call` path is hot. Keep the added work to in-memory set operations and one `pi.appendEntry` per state change. Persist only when the state changes.
- Stop and re-plan if the live check shows that a steer message sent during `tool_call` does not reach the model before its next call on pi 1.0.0.
- Safety > performance > developer experience: the blocking rule must hold even when parallel calls run in the same batch, which is why delivery is confirmed in `context` and not at `sendMessage` time.

### Security Requirements
- No new trust boundary. The extension reads only files that discovery already selects under the session cwd (plus rule sources from `defaultRuleSources`). There is no network access and no subprocess. Containment stays the existing `relative()` check. Realpath hardening is out of scope.
- File contents never appear in the UI renderer, only paths.

### Observability Requirements
- `/context-kit status` keeps its current output and adds `Blocked mutations: N` for the current session.
- The usage record keeps its schema. Files count when they are queued for delivery, as today.
- Discovery exceptions and unreadable files produce a `ctx.ui.notify(..., "warning")` when `ctx.hasUI` is true.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Exception in discovery | Warn, do not block, do not mark anything | Lifecycle test with a throwing rule source or an injected fault |
| Applicable file unreadable at injection | Not marked loaded, removed from the blocking set, named in the reason or warning | Lifecycle test that makes the file unreadable after discovery |
| Batch exceeds 96 KiB | Skipped files listed, still blocking until delivered | Lifecycle test with large fixtures |
| Parallel `edit` calls in one batch | Each is blocked until `context` confirms delivery | Lifecycle test: two `tool_call` events before any `context` event |
| Steer message dropped (run aborted) | `before_agent_start` clears pending; the next access re-announces the files | Lifecycle test |
| Session restore or `/tree` | State rebuilt from the active branch; no re-injection of loaded files | Lifecycle test with a branch fixture |
| Compaction | Loaded set reset; reminder with paths only; the next access injects again | Lifecycle test |

### Rollout and Rollback
- Owner: Matteo Ruina (personal dotfiles).
- Rollout: merge the PR to `maruina/dotfiles` `main`, then run `chezmoi apply ~/.pi/agent/extensions/context-kit` and `/reload` in open sessions.
- Rollback: `git revert` the merge commit, then run `chezmoi apply ~/.pi/agent/extensions/context-kit` and `/reload`. The usage store schema does not change, so records stay compatible in both directions.
- Do not install `packages/nested-context` together with context-kit. Both would inject nested files twice.

### Test Strategy
- Highest deterministic interface: the registered extension factory driven by a stub `pi`, following `_status-command.test.ts` and `packages/nested-context/tests/lifecycle.test.ts`. A new `_lifecycle.test.ts` creates temp fixture trees (`AGENTS.md`, `AGENTS.local.md`, `.claude/rules/go.md` with `paths:` frontmatter), sends `tool_call`, `tool_result`, `context`, `before_agent_start`, and `session_*` events, and asserts on `sendMessage` calls and options, `tool_call` block results, `appendEntry` data, and renderer output.
- This is a justified new seam: existing tests cover only the command and helper modules, not event behavior.
- Mock only the pi API surface (`on`, `registerCommand`, `registerMessageRenderer`, `sendMessage`, `appendEntry`, `events.emit`, `ctx.sessionManager`, `ctx.ui`). Use the real filesystem through temp directories, and `PI_CONTEXT_KIT_USAGE_DIR` for the usage store.
- Unit tests for `_delivery.ts` cover state transitions directly.
- Setup in the worktree: `cd dot_pi/agent && npm ci --ignore-scripts`.
- Narrow command expected to fail before implementation: `cd dot_pi/agent && npm run test:context-kit`. It fails because `tool_call` returns no block and sends no message.
- Live check (manual, because no automated harness runs a real pi model loop): see Task 6.

## Acceptance Criteria
### Requirement: Same-run delivery
The system SHALL send newly applicable context-kit files as a steer message during the `tool_call` that discovers them.

#### Scenario: Read discovers nested file and rule
- GIVEN a cwd with `sub/AGENTS.md` and `.claude/rules/go.md` matching `**/*.go`
- WHEN a `read` of `sub/x.go` arrives
- THEN `sendMessage` is called once with `customType: "context-kit-discovery"`, `deliverAs: "steer"`, both `## <path>` blocks, and `details.paths` listing both
- AND the read is not blocked

#### Scenario: No duplicate delivery
- GIVEN those files were confirmed loaded
- WHEN another `read` or `edit` under `sub/` arrives in this or a later run
- THEN no new message is sent

### Requirement: Mutation blocking
The system SHALL block `edit` and `write` while any applicable nested file, local sibling, or rule file is not confirmed loaded.

#### Scenario: First edit blocked, retry succeeds
- GIVEN no file is loaded
- WHEN an `edit` of `sub/x.go` arrives
- THEN the result is `{ block: true }` with a reason that lists the undelivered paths and asks for a retry
- AND the files are sent in the same call
- WHEN a `context` event contains that message and the `edit` is retried
- THEN the retry is not blocked

#### Scenario: Parallel edits before delivery
- GIVEN two `edit` calls in one batch before any `context` event
- THEN both are blocked and the files are sent once

#### Scenario: Startup sibling
- GIVEN `AGENTS.local.md` is the sibling of a Pi-loaded `AGENTS.md`
- WHEN `before_agent_start` runs, then a `context` event contains its message, then an `edit` arrives in the cwd
- THEN the sibling does not block the edit

### Requirement: Size limits
The system SHALL truncate files over 24 KiB and SHALL not inline files past 96 KiB per batch.

#### Scenario: Large file
- GIVEN an applicable 30 KiB file
- THEN its block holds 24 KiB or less, ends on a valid UTF-8 boundary, and carries the truncation marker

#### Scenario: Batch overflow
- GIVEN applicable files whose total is over 96 KiB
- THEN the skipped paths are listed before the first block, are not in `details.paths`, and keep mutations blocked

### Requirement: Fail-open discovery
The system SHALL not block a tool call because of an internal discovery error, and SHALL not block on an applicable file that cannot be read.

#### Scenario: Unreadable file
- GIVEN an applicable file that cannot be read at injection time
- WHEN an `edit` arrives
- THEN the edit is not blocked by that file, and a warning names it

### Requirement: Visible compact tree
The system SHALL render `context-kit-discovery` messages as `✓ context-kit loaded:` followed by one line per file with its kind and cwd-relative path, and SHALL not render file contents.

#### Scenario: Render
- GIVEN a message with two paths in `details.paths`
- THEN the renderer output has three lines and no file content

### Requirement: Blocked-mutation observability
`/context-kit status` SHALL report `Blocked mutations: N` for the current session.

#### Scenario: Count
- GIVEN one blocked edit
- WHEN `/context-kit status` runs
- THEN the output contains `Blocked mutations: 1`

### Requirement: Direct interactions count
The system SHALL treat a successful direct `read`, `edit`, or `write` of a context-kit file as delivery once its tool result appears in a `context` event, matched by tool call id.

#### Scenario: Direct read of rule
- GIVEN `.claude/rules/go.md` is not loaded
- WHEN a `read` of that file succeeds and a later `context` event contains its non-error tool result
- THEN a later `edit` of `sub/x.go` is not blocked by `go.md`, and `go.md` is never injected

#### Scenario: Before confirmation
- GIVEN the read result has not appeared in any `context` event
- THEN `go.md` is not re-injected, and an `edit` in its scope is still blocked

#### Scenario: Failed read
- GIVEN the direct `read` fails
- THEN nothing is marked, and the next access injects the file

### Requirement: Branch-persisted state and compaction
The system SHALL persist delivery state per branch, rebuild it on `session_start` and `session_tree`, and reset loaded state on `session_compact`.

#### Scenario: Session restore
- GIVEN a branch whose entries include a snapshot with `sub/AGENTS.md` loaded
- WHEN `session_start` runs and an `edit` under `sub/` arrives
- THEN nothing is injected and the edit is not blocked

#### Scenario: Tree navigation
- GIVEN state marked on another branch
- WHEN `session_tree` switches to a branch without those marks
- THEN the next access injects the files again

#### Scenario: Compaction
- GIVEN loaded files
- WHEN `session_compact` runs
- THEN one message lists the discovered paths without their contents, and the next access injects them again

#### Scenario: Usage record survives restore
- GIVEN a usage record that already lists injected files for this session
- WHEN the session restores and a new file is injected
- THEN the saved record keeps the earlier files and adds the new one

## Tasks
### Slice 1: Same-run delivery and mutation blocking
Delivers the smallest user-feedback slice: blocked first edit, same-turn visible injection with size limits, successful retry.

### Task 1: Delivery state and same-run blocking
**Execution status:** Complete.
**Delivers:** Steer injection at `tool_call` and blocking of `edit`/`write` until a `context` event confirms delivery, for nested files, local siblings, and rules.
**Blocked by:** None
**Traces to:** Requirements "Same-run delivery" and "Mutation blocking"
**Files:** `dot_pi/agent/exact_extensions/context-kit/_delivery.ts` (new), `dot_pi/agent/exact_extensions/context-kit/_delivery.test.ts` (new), `dot_pi/agent/exact_extensions/context-kit/_lifecycle.test.ts` (new), `dot_pi/agent/exact_extensions/context-kit/index.ts` (the existing `test:context-kit` glob `context-kit/*.test.ts` already picks up the new test files)

- [x] Run `cd dot_pi/agent && npm ci --ignore-scripts`, then `npm run test:context-kit`; all 61 existing tests passed. `npm ci` reported five existing audit findings (1 low, 2 moderate, 2 high); dependency changes are out of scope.
- [x] Write `_lifecycle.test.ts` with a stub-`pi` harness and fixture trees, plus the scenarios for these two requirements. Write `_delivery.test.ts` for queue, confirm, `blockingPaths`, and `clearPending`.
- [x] Run `npm run test:context-kit`; the new tests failed before implementation (no delivery-state module, no same-run message or mutation block, and no startup message paths).
- [x] Implement `_delivery.ts`: `createState`, `queue(paths) → newly queued`, `confirmDelivered(paths)`, `blockingPaths(applicable, inPrompt)`, `clearPending`. In `index.ts`: compute the applicable set in `tool_call` (walk-up files, their local siblings, matching rules, minus Pi-loaded paths and ignore matches), queue and send new files with `deliverAs: "steer"` and `display: false`, block mutations with `blockReason(targetPath, blocking)` (using the agreed format), confirm in a `context` handler from `details.paths`, clear pending in `before_agent_start`, check `!state.loaded.has(local)` before adding startup siblings to the `before_agent_start` message with `details.paths`, and update `injectedFiles`, increment `injectionMessages`, and call `saveUsageRecord` when injections occur in `tool_call`. Remove `injectedAsMessages` and the per-run discovered sets that this replaces.
- [x] Run `npm run test:context-kit`; all 68 tests passed. `git diff --check` passed.
- [x] Review after green; no refactor was needed. Re-ran the focused suite after the final test and type corrections; all 68 tests passed.
- [x] Commit with `feat(pi): deliver context-kit files in the same run and block unguided edits` (`a5c6437`).

### Task 2: Size limits and fail-open handling
**Execution status:** Complete.
**Delivers:** Bounded batches, and no edit blocked by an internal error or an unreadable file.
**Blocked by:** 1
**Traces to:** Requirements "Size limits" and "Fail-open discovery"
**Files:** `dot_pi/agent/exact_extensions/context-kit/index.ts`, `dot_pi/agent/exact_extensions/context-kit/_lifecycle.test.ts`, `dot_pi/agent/exact_extensions/context-kit/_usage.test.ts` (one test that `parseDiscoveryMessage` still parses a message with truncation and omitted-files text)

- [x] Add failing scenarios for a 30 KiB file, batch overflow, an unreadable file, and a discovery exception.
- [x] Run `npm run test:context-kit`; the new size, unreadable-file warning, and fail-open scenarios failed as expected; the parser compatibility test passed.
- [x] Implement the limits in the message builder (`MAX_FILE_BYTES = 24 * 1024`, `MAX_BATCH_BYTES = 96 * 1024`), the pre-block omitted list, the removal of unreadable files from the blocking set with a warning, and a `try`/`catch` around discovery in `tool_call` that warns and returns `undefined`.
- [x] Run `npm run test:context-kit`; all 74 tests passed. `git diff --check` passed; LSP reported no diagnostics for the changed TypeScript files.
- [x] Commit with `feat(pi): bound context-kit injection size and fail open on discovery errors` (`47918cd`).

### Task 3: Visible tree and blocked-mutation count
**Execution status:** Complete.
**Delivers:** The UI shows what loaded and why an edit was blocked; status reports blocked mutations.
**Blocked by:** 1
**Traces to:** Requirements "Visible compact tree" and "Blocked-mutation observability"
**Files:** `dot_pi/agent/exact_extensions/context-kit/index.ts`, `dot_pi/agent/exact_extensions/context-kit/_status.ts`, `dot_pi/agent/exact_extensions/context-kit/_status.test.ts`, `dot_pi/agent/exact_extensions/context-kit/_status-command.test.ts`, `dot_pi/agent/exact_extensions/context-kit/_lifecycle.test.ts`

- [x] Add failing tests for renderer output and `Blocked mutations: N`. Update the status-command stub to accept `registerMessageRenderer`.
- [x] Run `npm run test:context-kit`; renderer, status count, and cwd metadata assertions failed as expected.
- [x] Register the renderer with `Text` from `@earendil-works/pi-tui`, following `exact_extensions/turn-timer/index.ts`. Set `display: true` on discovery messages. Add the counter and the status line.
- [x] Run `npm run test:context-kit`; all 74 tests passed. `git diff --check` passed.
- [x] Commit with `feat(pi): show context-kit deliveries and blocked edits` (`aabe3cf`).

### Slice 2: Direct interactions count
Delivers: reading an instruction or rule file directly counts as delivery and unblocks edits once confirmed.

### Task 4: Direct-interaction confirmation
**Delivers:** No redundant injection after a direct read, edit, or write of a context-kit file, and safe blocking until its result is in context.
**Blocked by:** 1
**Traces to:** Requirement "Direct interactions count"
**Files:** `dot_pi/agent/exact_extensions/context-kit/_delivery.ts`, `dot_pi/agent/exact_extensions/context-kit/_delivery.test.ts`, `dot_pi/agent/exact_extensions/context-kit/index.ts`, `dot_pi/agent/exact_extensions/context-kit/_lifecycle.test.ts`

- [ ] Add failing scenarios: direct read of a rule, before confirmation, failed read, and direct read of a nested `AGENTS.md`.
- [ ] Run `npm run test:context-kit`; expect those tests to fail.
- [ ] Add `recordDirectPending(toolCallId, path)` and `confirmDirectDelivery(resultIds)` to `_delivery.ts`. Direct-pending paths are not re-queued but still block. Add an `isContextKitFile(path)` predicate (basename `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.md`, or `CLAUDE.local.md`, or a file under `/.claude/rules/` or `/.cursor/rules/`). Add a `tool_result` handler for successful `read`/`edit`/`write`. Confirm non-error tool result ids in `context`. Exclude the target itself from its own applicable set in `tool_call`, and never block a direct `read`. Clear direct pending in `before_agent_start`.
- [ ] Run `npm run test:context-kit`; expect all tests to pass.
- [ ] Commit with `feat(pi): count direct reads of context-kit files as delivery`.

### Slice 3: Branch-persisted state and compaction
Delivers: no re-injection after session restore or `/tree`, and a path-only reminder after compaction. This closes the V1 gap in the `index.ts` header comment.

### Task 5: Persist, rebuild, and reset state
**Delivers:** Delivery state survives restore per branch, and compaction resets it safely.
**Blocked by:** 1
**Traces to:** Requirement "Branch-persisted state and compaction"
**Files:** `dot_pi/agent/exact_extensions/context-kit/_delivery.ts`, `dot_pi/agent/exact_extensions/context-kit/_delivery.test.ts`, `dot_pi/agent/exact_extensions/context-kit/index.ts`, `dot_pi/agent/exact_extensions/context-kit/_lifecycle.test.ts`

- [ ] Add failing scenarios: session restore, tree navigation, compaction, and usage record survives restore.
- [ ] Run `npm run test:context-kit`; expect those tests to fail.
- [ ] Add `snapshotState`, `rebuildFromBranch(entries)` (last `context-kit-state` custom entry on the branch; malformed data → empty state), and `compactionReset() → discovered paths`. Persist with `pi.appendEntry("context-kit-state", snapshot)` only on state change. Rebuild on `session_start` and `session_tree`. On `session_compact`, reset loaded state and send one `context-kit-compaction` message that lists paths only. On `session_start`, seed `injectedFiles` and `injectionMessages` from `loadUsageRecord(usageDir, sessionId)` when present.
- [ ] Run `npm run test:context-kit`; expect all tests to pass.
- [ ] Commit with `feat(pi): persist context-kit delivery state per branch and reset on compaction`.

### Final: Documentation and verification
### Task 6: Documentation, future-agent guidance, and live check
**Delivers:** Docs that match the new behavior, and evidence that the delivery works in a real pi session.
**Blocked by:** 2, 3, 4, 5
**Traces to:** Goal; feature-level acceptance
**Files:** `dot_pi/agent/exact_extensions/context-kit/README.md`, `dot_pi/agent/exact_extensions/context-kit/index.ts` (header comment), `dot_pi/agent/AGENTS.md` (check only)

- [ ] README: replace "Discovered context is injected on the next user turn, not mid-turn" and the design choice "Keep one-turn lag" with the same-run delivery model, the reason (mutation safety) and why caching is unaffected. Document blocking, direct interactions, size limits, fail-open rules, compaction and branch state, the UI tree, and the warning not to run `packages/nested-context` at the same time. Record the unused `.pi/*ignore` support as a cleanup candidate.
- [ ] `index.ts` header: update the prompt-caching table and remove the V1 session-restore gap note.
- [ ] `dot_pi/agent/AGENTS.md`: has no context-kit guidance today. Add nothing unless a durable trap was found during execution. Record the decision in the PR.
- [ ] Run `cd dot_pi/agent && npm test`; expect all suites to pass.
- [ ] Live check: run `chezmoi --source "$PWD" apply ~/.pi/agent/extensions/context-kit` from the worktree root. Start a new pi session in `~/dd/dd-source`. Ask for a one-line comment edit in a Go file under a directory with a nested `AGENTS.md`. Expect: a blocked `edit` with the reason, a `✓ context-kit loaded:` tree that includes `.claude/rules/go.md`, and a successful retried `edit` in the same run. Run `/context-kit status`; expect `Blocked mutations: 1`. Run `/reload`, then another edit in the same directory; expect no new injection. Discard the dd-source change with `git -C ~/dd/dd-source checkout -- <file>`. Automation is impractical because the check needs a real model loop.
- [ ] If the live check fails, restore the target with `chezmoi apply ~/.pi/agent/extensions/context-kit` from the base checkout on `main`, and stop.
- [ ] Commit with `docs(pi): document context-kit same-run delivery`.

**Final verification:** the live check above proves the feature-level criteria that only the complete feature can satisfy: same-run delivery on pi 1.0.0, the visible UI, and no re-injection after `/reload`.

## Learning candidates
None yet.
