# Rex Fork Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/rex-fork tab|right|below` to create an independent copy of the active Pi branch in a verified local Rex tab or split without changing the source session or sending a model prompt.
**Smallest user-feedback slice:** Fork a persisted, settled conversation into one verified Rex tab.
**Out of Scope:** Pi recovery, copycat migration, colleague-specific launch profiles or code, palette mailboxes, automatic worktree creation, terminal-history copying, interrupted-tool recovery, approval transfer, arbitrary CLI-flag replay, global chezmoi application, and concurrent changes to runtime dependencies.
**Architecture:** A Pi extension validates the invoking TUI and local Rex pane, snapshots the active branch through a separate public `SessionManager`, and makes one Rex creation request. The destination opens the snapshot with `--session` and publishes a short-lived receipt so the source can distinguish verified startup from uncertain creation. The source session remains active and unchanged.
**Tech Stack:** TypeScript, Node.js built-ins, public Pi extension and `SessionManager` APIs, Rex JSON APIs, and the repository's Node test runner with jiti.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Lifecycle planning | Selected applicable guidance and recorded provenance. |
| `feature-worktree` | prompt-required | Isolated writes | Continued in the dedicated `maruina/rex-fork` worktree. |
| `codebase-research` | skill-loader | Unfamiliar fork behavior | Examined Pi persistence, Rex schemas, and repository tests before choosing mechanisms. |
| `chezmoi` | skill-loader | Managed extension | Kept source changes separate from targets and parallel work. |
| `cli-best-practices` | skill-loader | Slash-command interface | Required explicit arguments, bounded calls, and actionable partial-failure reports. |
| `write` | skill-loader | Plan and command documentation | Used concrete mechanisms and observable contracts. |
| `diataxis` | skill-loader | Extension README | Separated command reference from setup and failure-recovery instructions. |
| `learning-lookup` | prompt-required | Advisory planning evidence | Attempted a narrow lookup and recorded its failure rather than assuming advice. |
| `obsidian-cli` | agent-selected | Learning lookup requires Obsidian | Used the CLI without reading the vault directly. |

## Source and approval
The latest user directive limits this work to `/rex-fork`. The user approved the planning alignment brief, its two slices, their dependency, focus behavior, and bounded startup verification with “Ok, do that.” This plan records that approved brief; there is no upstream design document for this feature.

The worktree started from fetched `origin/main` at `8775893`. Do not move the base checkout from `main`, change the vendor-copycat or pi-restore worktrees, or copy private colleague code into this public repository. The colleague's extension is evidence of API use, not an implementation source.

## Evidence and existing patterns
- Pi 1.5.2 `docs/extensions.md` documents `registerCommand`, `ctx.mode`, session lifecycle events, and the read-only `ctx.sessionManager` view. `hasUI` alone does not establish an interactive TUI.
- Pi 1.5.2 `dist/core/session-manager.js`, `createBranchedSession()` at line 1217, copies the root-to-leaf branch, generates a new session ID, and sets `parentSession`. It changes the manager on which it is called, so it must run on a separate manager opened from the persisted source file. A returned path alone does not prove a file was written when there is no conversation.
- The colleague's `tb-pi` checkout, `extensions/tb-rex/fork.ts` and `tests/fork.test.ts`, demonstrates separate-manager branching and failure tests. Inspect these read-only; implement independently through public APIs.
- Rex `api describe session.new_window --json` exposes explicit `session_id`, `layout`, and `focus`. `session.new_split` exposes `anchor_id`, `direction`, and `side`, so a split need not use the focused pane.
- Rex's terminal shell block accepts an argument array and `cwd`. Its shell `none` option starts the command directly. Resolve and validate the installed Pi launch command instead of constructing a shell string.
- `dot_pi/agent/exact_extensions/session-tags.test.mjs` shows the repository's fake extension registration and temporary-session test pattern. `ship-conductor/_bridge.ts` uses public `getAgentDir()`.
- `dot_pi/agent/package.json` provides `test:unit`, `test`, and `test:all`. Add this suite without replacing existing entries or losing parallel copycat changes.
- The advisory lookup through `learning-sections --term rex --term createBranchedSession` failed with `invalid_arguments: --session-dir must be an existing directory`; the pipeline also exceeded its time limit. No learning-store guidance was applied.
- LSP initialization in the colleague's checkout failed because TypeScript was unavailable. No dependencies were installed to resolve that research gap. Obtain candidate-file diagnostics during implementation without changing shared runtime dependencies.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Independent active branch | `SessionManager.open()` then `createBranchedSession(activeLeaf)` on the separate manager | Pi public declarations and installed implementation | Real temporary transcript with competing branches; compare source bytes, ID, and leaf | Refuse before creating Rex resources. |
| Local source identity | Local Unix endpoint, `whoami`, session/block inspection, and process ownership/ancestry | Rex JSON commands; earlier process inspection identifies this Pi in its pane | Live source plus wrong-user, stale-ID, remote, and unrelated-process fixtures | Refuse; never use the focused pane as a substitute. |
| Tab or anchored split | One `session.new_window` or `session.new_split` request | Live Rex API schemas | Assert payloads; inspect real isolated layouts | Report failure with snapshot and attempt details. |
| Destination cwd and conversation | Installed Pi launched with argument array, `--session`, source cwd, and explicit agent directory | Pi CLI and Rex terminal schema; earlier manual fork opened successfully | Destination receipt plus real session manager/process inspection | Report created/unverified, not success. |
| No model prompt | No positional prompt, `sendUserMessage`, or terminal input to the child | Pi's session-only CLI launch | Assert argv/API calls and observe no added user/assistant turns during isolated startup | Block delivery if startup sends a prompt. |
| Bounded uncertainty handling | Per-invocation receipt and creation state, timeout, no retries | Standard filesystem/process APIs; public `session_start` event | Inject lost replies, wrong receipts, shutdown, and restart | Preserve evidence and request manual inspection. |

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Extension entrypoint | `dot_pi/agent/exact_extensions/rex-fork/index.ts` | Default factory; command registration, completions, lifecycle, notifications, startup receipt | Fake ExtensionAPI tests and live TUI smoke tests |
| Fork implementation | `dot_pi/agent/exact_extensions/rex-fork/_fork.ts` | Validation, independent snapshot, local identity, launch payload, bounded verification | Real SessionManager tests; injected Rex/process/filesystem failures |
| Tests | `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs` | Unit, session integration, and opt-in isolated Rex/Pi smoke coverage | Focused Node command and smoke mode |
| Test registration | `dot_pi/agent/package.json` | Include the focused suite in existing unit coverage | `npm run test:unit` |
| Command documentation | `dot_pi/agent/exact_extensions/rex-fork/README.md` | Usage, limits, failure inspection, test isolation, rollout | Review against tests and actual output |

No existing shared type, workflow contract, or public symbol changes. Consumers of `package.json` retain their existing commands. Existing sessions need `/reload` only after an explicitly coordinated target deployment.

### Key Decisions
- Require exactly one argument: `tab`, `right`, or `below`. Missing or additional arguments show usage and perform no writes or creation requests. This is a TUI slash command, not a new process CLI; stdout/JSON flags and pagination do not apply.
- Reject busy requests rather than wait or queue them. Queueing can capture later messages, which would make the fork point less clear. Require an idle agent, no pending messages, no active UI prompt, and no overlapping fork operation.
- Use the active persisted leaf, not the newest file or latest completed message from an arbitrary branch. Revalidate session identity, generation, and idle state immediately before the synchronous snapshot step. Refuse missing/unpersisted leaves and sessions without a persisted conversation.
- Use a separate manager because branching the live manager would replace source state. Verify that the snapshot exists, has a different session ID/path, and retains the source cwd and active branch metadata.
- Retain the invoking cwd and agent directory. Launch the installed Pi directly with `--session`, not `--fork`, because the snapshot is already independent. Do not replay arbitrary flags, prompts, credentials, or colleague-specific environment. Reject unsupported launch setups rather than silently substituting a different Pi configuration.
- Focus the destination. For `right`, use `horizontal` and `after`; for `below`, use `vertical` and `after`. Both pass the invoking `anchor_id`. Rex ends an existing zoom when it creates a split; document this native behavior.
- A startup receipt establishes that the expected Pi session actually started; a successful creation response alone does not. Limit the receipt protocol to this invocation, with no external mailbox or permanent polling service.
- A failed or ambiguous creation is not permission to repeat it. Never automatically retry creation, close a returned pane, or delete a possibly launched snapshot. Explicit user inspection precedes a manual retry.
- Calling `pi --session` is simpler than snapshotting, but would reopen the source rather than create an independent conversation; reject that alternative. A palette mailbox supports external triggers, but its background publisher and polling are outside this command's scope.

### Implementation Constraints
- Verify local Unix transport, peer UID, host/server identity, explicit session/block membership, and that the source Pi owns the pane's relevant process tree. Environment IDs alone are not proof. Pin the endpoint and identity throughout the operation and recheck before creation; do not autostart a replacement Rex server.
- Use public Pi/Rex APIs and Node built-ins. No dependency additions or private bundled imports. No source transcript parsing/rewrite as a replacement for `SessionManager`.
- Bound each Rex subprocess to 7 seconds and its Rex request to 5 seconds. Reject nonzero exits, killed or truncated output, and invalid response shapes. Allow at most one creation call per invocation.
- Wait at most 15 seconds for startup verification, checking at most once per 250 ms. Use no persistent interval. Receipt verification must match the attempt nonce, snapshot path/ID, cwd, server instance, session/block, and destination process identity.
- Cancel pending local work on session shutdown/reload/replacement. Invalidate continuations with a generation token; after creation, cancellation is uncertain completion, not automatic rollback. Do not assume `ctx.signal` exists in command handlers.
- Serialize fork commands in one source instance. Later source messages cannot enter a completed snapshot. Repeated successful user invocations intentionally create distinct forks.
- Stop if a required API is missing, launch provenance cannot be verified, or real isolation cannot be established. Do not weaken verification to make a smoke test pass.
- Do not install or remove shared runtime dependencies while the migration session publishes. Any disposable test dependencies belong only in this feature worktree. Coordinate before a targeted deployment; a planning commit needs no deployment.

### Security and Observability Requirements
- Store attempt and receipt metadata in a private per-invocation directory beneath the effective agent directory, using UUID names, directory mode `0700`, files `0600`, atomic publication, and exclusive creation where appropriate. Accept only the attempt paths generated by this protocol; validate before reading a child-provided path. Do not include transcript bodies, credentials, or complete environment dumps.
- Keep the independent transcript in the Pi session store with the same private-data treatment as other session files. Successful transient receipt data can be removed; retain failed/uncertain attempt metadata and the snapshot for manual inspection. Never recursively scan or clean unrelated sessions.
- Notify through `ctx.ui.notify`, without adding prompt or custom transcript messages. Distinguish refusal, snapshot failure, definite creation failure, created/unverified, and verified startup. Include known Rex IDs and the snapshot path when manual inspection is needed.
- Failed attempts accumulate only when invoked by the user, not in a background retry loop. Document how to remove inspected attempt metadata; never remove an active fork transcript as receipt cleanup.

### Failure Modes to Handle
Invalid arguments; non-TUI execution; missing/remote/stale identity; wrong user or unrelated process; source session changes; busy/queued work; active UI prompt; overlapping commands; absent or partially persisted conversation; snapshot IO failure; unsupported launcher; Rex rejection; malformed/truncated response; timeout after possible creation; destination startup failure; missing/wrong/stale receipt; server restart; extension shutdown during a pending operation. A preflight refusal makes no creation request; uncertain completion preserves resources and never reports verified success.

### Rollout and Rollback
Owner: Matteo, with the executing agent performing only approved operations. After review and verification, coordinate with the parallel publishing session before applying only the extension's explicit target files from this worktree with `--source "$PWD"`. Do not apply the full extension directory or global settings. Confirm `/rex-fork` registration after `/reload`. Commit/push according to repository policy only when safe; implementation rollout is not authorized by this planning step.

To roll back, remove only this extension's deployed files through the corresponding source change, then `/reload`. Existing fork tabs and transcripts remain usable and must not be closed or deleted automatically. The test-script change affects development only. Do not revert parallel migration changes.

### Test Strategy
Use the public command registration seam with a fake `ExtensionAPI`, the real public `SessionManager` on temporary transcripts, and injected Rex command execution at the external-process boundary. Tests must show that the source file bytes, active ID/leaf, and independent fork do not change when later source messages are appended. Cover compaction/model metadata and exclusion of an abandoned branch without multiplying unrelated fixture dimensions.

From `dot_pi/agent`, the narrow failing command is `node --import jiti/register --test exact_extensions/rex-fork/rex-fork.test.mjs`. Add a named tab test first, then run it with `--test-name-pattern=tab`. Each focused test must fail for the relevant missing behavior before implementation and pass afterward. Do not change existing test scripts beyond registering this suite.

The opt-in command is `PI_REX_FORK_SMOKE=1 node --import jiti/register --test exact_extensions/rex-fork/rex-fork.test.mjs`. Smoke mode must create a private temporary Rex socket/state/config, temporary Pi agent/session directories, and candidate-extension loading. Start only the test server via its explicit socket and `--state-dir`; pin that endpoint on every child and cleanup call. Reject the user's server endpoint. Use the installed Pi and candidate extension in both source and destination, without credentials, inherited recovery/conductor state, real project hooks, or model prompts. Teardown only test-owned processes/server/files, including on timeout. Startup and teardown must have fixed deadlines.

For the comparable baseline, open the synthetic source session in the same isolated Pi/Rex setup without invoking the command; assert one pane and no new turns. For the candidate, invoke the slash command from that TUI, inspect the created resource and receipt, and assert one new Pi with the exact snapshot/cwd and no user/assistant turns added by the launch. Exercise tab, right, and below independently with clean fixtures. Observe each candidate through receipt completion and a further 2-second settled window. There is no inference-performance claim and no production telemetry requirement.

Mocks establish request shape and failure control flow, not that Pi starts. Real isolated Rex/Pi smoke evidence is required before delivery. Logout/reboot, remote servers, custom launch wrappers, and recovery are not claimed. If isolation or startup verification is unavailable, report a delivery blocker instead of inferring success from absent errors.

## Acceptance requirements
### Requirement R1: Explicit, safe invocation
The command SHALL accept only `tab`, `right`, or `below` in a verified local TUI with a persisted, settled conversation.

#### Scenario: Accepted source
- GIVEN a local verified Rex Pi TUI with a persisted active branch and no queued work
- WHEN the user invokes `/rex-fork tab`
- THEN the command captures that branch and makes one creation request for the invoking session.

#### Scenario: Refused source or input
- GIVEN invalid/missing arguments, non-TUI mode, busy/queued work, an active UI prompt, or invalid local identity
- WHEN the command runs
- THEN it explains the refusal and writes no snapshot or launch request.

### Requirement R2: Independent snapshot
The command SHALL preserve the source and create a distinct persisted session containing only its active branch, cwd, and applicable session metadata.

#### Scenario: Branched source
- GIVEN a persisted source with an abandoned branch and model/compaction metadata on the active path
- WHEN the command snapshots the active leaf
- THEN the copy has a new ID/path, references the source as parent, retains active-path metadata and cwd, excludes the abandoned branch, and leaves source bytes/ID/leaf unchanged.

#### Scenario: Unpersisted or changing source
- GIVEN a missing persisted leaf, no persisted conversation, snapshot IO failure, or a session-generation change before creation
- WHEN snapshot/launch preparation runs
- THEN no Rex creation occurs and the command reports the specific failure.

### Requirement R3: Exact destination without a prompt
The command SHALL launch the independent snapshot with the source cwd in the requested Rex location, focus it, and send no model prompt.

#### Scenario: Tab or split
- GIVEN a verified source whose pane is not the user's focused pane
- WHEN `/rex-fork tab`, `/rex-fork right`, or `/rex-fork below` runs
- THEN exactly one destination opens in that source session, a split uses the source pane as anchor with the requested direction, and the destination runs the snapshot with no launch-generated conversation turn.

#### Scenario: Wrong destination
- GIVEN a mismatched receipt, failed Pi startup, or unexpected destination identity
- WHEN creation completes or verification expires
- THEN the command does not report verified success and sends no corrective prompt or terminal input.

### Requirement R4: Bounded partial failure
The command SHALL make at most one creation request per invocation and distinguish verified startup from uncertain creation.

#### Scenario: Lost creation reply
- GIVEN Rex may have created a pane but the reply times out or is malformed
- WHEN the request fails
- THEN the command retains the snapshot/attempt details, reports uncertainty with inspection information, and neither retries nor closes the possible destination.

#### Scenario: Lifecycle change
- GIVEN a fork operation waiting on inspection or startup verification
- WHEN the extension shuts down, the source session changes, or Rex's instance changes
- THEN remaining pre-creation work stops; any already submitted creation remains uncertain and is not repeated or destroyed.

## Implementation tasks
### Slice 1: Fork a conversation into a verified tab
**Blocked by:** None
**Delivers:** One independently usable tab command with snapshot isolation, source validation, startup verification, and bounded failures.

### Task 1: Deliver the verified tab fork
**Delivers:** `/rex-fork tab` creates one independent conversation without changing the source or prompting a model.
**Blocked by:** None
**Traces to:** R1, R2, R3 tab behavior, R4
**Files:** `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/package.json`

- [ ] Coordinate before dependency operations. Read the repository guidance and installed Pi public declarations. Use LSP for known symbols before edits and obtain candidate-file diagnostics. Do not install into the global runtime or colleague checkout.
- [ ] Add the focused failing tab test through command registration and real temporary session managers. Cover R1/R2 refusals, source invariance, launch arguments, receipt mismatch, lost replies, and lifecycle races in the same vertical slice.
- [ ] Implement the default factory and the smallest helper that passes. Add argument completion; in this slice reject not-yet-supported split targets explicitly without launching. Register the focused suite in `test:unit` without losing other entries.
- [ ] Run `node --import jiti/register --test exact_extensions/rex-fork/rex-fork.test.mjs` from `dot_pi/agent`; expect passing deterministic tests and explicit skips for opt-in live cases.
- [ ] Run the smoke command from Test Strategy with the tab case; expect exactly one new Pi at the saved snapshot/cwd, a matching receipt, no launch-generated turn, and cleanup limited to the temporary server.
- [ ] Refactor only after green and rerun the focused tests. Commit with `feat(pi): fork conversations into verified rex tabs`.

### Slice 2: Fork into right and below splits
**Blocked by:** Slice 1
**Delivers:** The complete requested command, anchored splits, command reference, and final integration evidence.

### Task 2: Add right and below destinations
**Delivers:** Both split variants use the same verified snapshot/launch path and anchor to the invoking pane.
**Blocked by:** Task 1
**Traces to:** R1, R3, R4
**Files:** `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`

- [ ] Add failing tests for `right` and `below`, including a different focused pane, invalid anchor, and uncertain split creation.
- [ ] Implement `session.new_split` with explicit source `anchor_id`, `side: after`, and the matching horizontal/vertical direction. Reuse the tab snapshot, launch, and receipt path without duplicate creation or fallback.
- [ ] Run the focused test and opt-in smoke commands from Test Strategy; expect both orientations to target the invoking pane and all tab behavior to remain green.
- [ ] Refactor only after green, rerun verification, and commit with `feat(pi): fork conversations into anchored rex splits`.

### Task 3: Document usage and future-agent constraints
**Delivers:** Command usage and failure handling match the tested behavior.
**Blocked by:** Task 2
**Traces to:** R1-R4 and the documentation requirement
**Files:** `dot_pi/agent/exact_extensions/rex-fork/README.md`

- [ ] Document the three commands, persisted/idle/local prerequisites, focus and zoom behavior, cwd retention, normal installed-Pi launch limits, and the absence of model prompts or approval transfer.
- [ ] Document refusal versus created/unverified, snapshot/attempt inspection before manual retry, private metadata cleanup, isolated test commands, and targeted rollout/rollback coordination.
- [ ] Review root `AGENTS.md` and `dot_pi/agent/AGENTS.md`; leave both unchanged because these extension-specific commands and traps belong in this README, not global instructions. Record any contrary review finding before widening file scope.
- [ ] Compare every documented outcome with tests; commit with `docs(pi): document rex fork usage and recovery limits`.

### Task 4: Final verification
**Delivers:** Recorded feature-level evidence for all three destinations and their failure contracts.
**Blocked by:** Task 1, Task 2, Task 3
**Traces to:** R1-R4 and repository verification policy
**Files:** `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/package.json`, `dot_pi/agent/exact_extensions/rex-fork/README.md`, `plans/rex-fork/plan.md`

- [ ] After coordinating with the parallel publisher, run `npm ci --ignore-scripts` only in this worktree's `dot_pi/agent` before `/verify`. Keep those disposable dependencies until both complete suites finish.
- [ ] Run the focused suite, `npm run test:unit`, `npm test`, and `npm run test:all` from `dot_pi/agent`. Compare unrelated failures with the unchanged base using isolated dependencies only when needed. Earlier research observed unrelated lifecycle-prompt failures; do not silently fix them or count them as passing.
- [ ] Run `PI_REX_FORK_SMOKE=1 node --import jiti/register --test exact_extensions/rex-fork/rex-fork.test.mjs`; require real tab/right/below startup evidence, matching cwd/session identity, no prompt-generated turns, preserved source state, and isolated cleanup.
- [ ] Check candidate TypeScript diagnostics, `git diff --check`, changed-file scope, README accuracy, source/target separation, and that no colleague code, secrets, generated dependencies, or runtime attempt data entered Git.
- [ ] Record verification commands/results and any blockers in this plan. Remove disposable worktree dependencies only after both complete suites finish. Do not apply global targets, change runtime dependencies, or claim delivery if required smoke evidence is missing.
