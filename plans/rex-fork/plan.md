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

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Execution guidance | Selected command, worktree, source-management, and research skills. |
| `resolve-worktree` | prompt-required | Absolute plan path | Resolved the supplied path to this feature worktree. |
| `feature-worktree` | prompt-required | Isolated execution | Confirmed `maruina/rex-fork` and a clean initial worktree. |
| `chezmoi` | skill-loader | Managed extension | Kept deployed targets and shared runtime dependencies unchanged. |
| `codebase-research` | skill-loader | Public Pi/Rex APIs | Checked session branching, terminal creation, and local identity APIs before implementation. |
| `cli-best-practices` | skill-loader | Slash command | Applied explicit input and partial-failure requirements. |
| `write` | skill-loader | Execution ledger | Recorded approval and evidence without changing scope. |
| `rex` | agent-selected | Installed Rex behavior | Read the installed CLI guide and inspected API schemas. |
| `learning-candidates` | prompt-required | Unexpected live-test behavior | Recorded the isolated TUI submission failure and startup metadata observation. |
| `script-best-practices` | skill-loader | Shell command in `package.json` | Preserved the existing `sh` runner and quoted extension path when registering the suite. |

#### Slice 2 execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Execution guidance | Selected matching skills. |
| `resolve-worktree` | prompt-required | Plan path | Resolved the plan to this worktree. |
| `feature-worktree` | prompt-required | Isolated execution | Continued on `maruina/rex-fork`. |
| `chezmoi` | skill-loader | Managed source | Kept runtime and target files unchanged. |
| `codebase-research` | skill-loader | Fork behavior | Traced the command and Rex response shapes. |
| `cli-best-practices` | skill-loader | Slash command | Checked arguments and partial-failure reports. |
| `write` | skill-loader | Ledger and README | Applied concise, precise prose. |
| `diataxis` | skill-loader | README | Separated command reference and recovery guidance. |
| `rex` | agent-selected | Installed Rex API | Inspected the split schema and behavior. |

Execution started on Slice 1 only. The user approved disposable dependency installation in this feature worktree and prohibited deployment, shared runtime dependency changes, and changes to the vendor-copycat or pi-restore worktrees. `npm ci --ignore-scripts --prefix dot_pi/agent` passed (246 packages; zero reported vulnerabilities). Worktree dependencies remain installed until the required suites finish. Task 1 initially stopped on isolated startup verification. The following blocker notes are historical; see Slice 1 completion evidence for the final state.

#### Initial Slice 1 evidence and blocker
- Added uncommitted `rex-fork/index.ts`, `_fork.ts`, and `rex-fork.test.mjs`. The command implementation, snapshot helper, and receipt protocol are incomplete candidates, not delivered functionality. Test registration in `package.json`, additional failure/race coverage, and the task commit remain pending.
- The first focused tab run failed because `_fork.ts` did not exist. The snapshot implementation then passed. Adding compaction coverage exposed an assertion difference between absent JSON properties and in-memory `undefined` properties; comparing serialized branch metadata fixed the test representation without dropping compaction fields.
- `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` passed six deterministic tests before the live test was added. Both candidate TypeScript files had zero LSP diagnostics at that point.
- The smoke baseline initially failed because Pi startup appended `thinking_level_change: off` to the synthetic fixture. The fixture now includes that metadata before startup; the source-byte invariant was not removed.
- `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` then passed the six deterministic cases but failed the live tab test in three focused attempts. The isolated source editor displayed `/rex-fork tab` after `rex send` and `rex send-key enter`, but the creation condition did not occur before the deadline. Adding source-screen diagnostics and a 250 ms delay before Enter did not resolve it. The screen also reported no available models and an offline `fd` warning; their causal role is not established. The available server log contains no candidate creation request. Stop under the repeated-verification-failure rule; do not infer that the command or destination startup works.
- Each smoke run used a private temporary endpoint, state/config, HOME, agent directory, session store, and synthetic cwd with no credentials or prompts to a model. Teardown stopped only the test server and removed its temporary files. Shared runtime dependencies, deployed targets, and other worktrees were not changed.
- No complete-suite evidence, verified live destination evidence, commit, push, or deployment exists. Disposable worktree dependencies remain installed.

#### First approved blocker investigation
The user approved investigation of isolated Rex/Pi input submission and continuation of Slice 1. A temporary test-only `onTerminalInput` probe confirmed registration of `/rex-fork` and receipt of Enter (`0d`). Pi's editor accepts argument completion on Enter without submitting when the completion prefix is an argument. The smoke driver now dismisses completion with Escape before Enter. This resolved submission; the isolated candidate creates one new tab and starts Pi. The driver also now pins `REX_SERVER` in the child environment, which was missing, and records destination screens on failure.

The installed Pi process uses `dist/bundle/cli.js`, not only `dist/cli.js`. The candidate launcher now recognizes both installed layouts without accepting arbitrary launch wrappers or flags. This remains within the installed-Pi launch requirement.

Startup receipt verification then failed in three focused attempts. The destination reports: expected its Node PID and UID 502, but Rex reports the foreground process as `/usr/bin/login`, UID 0, with a different PID and no cwd. The candidate `session.new_window` terminal options set `shell: none` but omit `login`; the installed terminal schema documents `login` as defaulting to true. Do not weaken the identity check. Proposed next step: explicitly set `login: false` to request the direct launch, then rerun isolated verification. This change has not been made because the repeated-failure stop gate was reached. User direction is required to resume.

The latest smoke run still passed all six deterministic cases and failed the one live case. Tests, metadata cleanup, bounded polling/cancellation details, additional failure/race coverage, test registration, and commit readiness remain incomplete. No target apply, shared dependency operation, commit, or push occurred.

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

From `dot_pi/agent`, the narrow failing command is `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` (or with `--import jiti/register` once dependencies exist). Add a named tab test first, then run it with `--test-name-pattern=tab`. Each focused test must fail for the relevant missing behavior before implementation and pass afterward. Do not change existing test scripts beyond registering this suite.

The opt-in command is `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs`. Smoke mode must create a private temporary Rex socket/state/config, temporary Pi agent/session directories, and candidate-extension loading. Start only the test server via its explicit socket and `--state-dir`; pin that endpoint on every child and cleanup call. Reject the user's server endpoint. Use the installed Pi and candidate extension in both source and destination, without credentials, inherited recovery/conductor state, real project hooks, or model prompts. Teardown only test-owned processes/server/files, including on timeout. Startup and teardown must have fixed deadlines.

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

## Learning candidates
- 2026-11-18: A synthetic persisted Pi session without thinking metadata acquired a `thinking_level_change: off` entry during isolated TUI startup; initialize applicable metadata before measuring source-byte invariance — evidence: `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, opt-in smoke baseline.
- 2026-11-18: Pi argument completion consumes Enter to accept an argument without submitting the command; the isolated `/rex-fork tab` driver submits after Escape dismisses completion — evidence: `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, input probe and subsequent live tab creation.
- 2026-11-18: A Rex terminal created through `session.new_window` with `shell: none` and omitted `login` reported `/usr/bin/login` with UID 0 during Pi startup receipt verification. The terminal schema defaults `login` to true; direct-launch verification must account for this native wrapper rather than accept its identity as Pi — evidence: opt-in smoke destination screen and `rex block types --json`.

## Implementation tasks
### Slice 1: Fork a conversation into a verified tab
**Delivers:** One independently usable tab command with snapshot isolation, source validation, startup verification, and bounded failures.

### Task 1: Deliver the verified tab fork
**Delivers:** `/rex-fork tab` creates one independent conversation without changing the source or prompting a model.
**Blocked by:** None
**Traces to:** R1, R2, R3 tab behavior, R4
**Files:** `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/package.json`

- [x] Coordinate before dependency operations. Run `npm ci --ignore-scripts` only in this worktree's `dot_pi/agent` so disposable test dependencies exist for local test runs. Read the repository guidance and installed Pi public declarations. Use LSP for known symbols before edits and obtain candidate-file diagnostics. Do not install into the global runtime or colleague checkout.
- [x] Add the focused failing tab test through command registration and real temporary session managers. Cover R1/R2 refusals, source invariance, launch arguments, receipt mismatch, lost replies, and lifecycle races in the same vertical slice.
- [x] Implement the default factory and the smallest helper that passes. Add argument completion; in this slice reject not-yet-supported split targets explicitly without launching. Register the focused suite in `test:unit` without losing other entries.
- [x] Run `node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` from `dot_pi/agent`; expect passing deterministic tests and explicit skips for opt-in live cases.
- [x] Run the smoke command from Test Strategy with the tab case; expect exactly one new Pi at the saved snapshot/cwd, a matching receipt, no launch-generated turn, and cleanup limited to the temporary server.
- [x] Refactor only after green and rerun the focused tests. Commit with `feat(pi): fork conversations into verified rex tabs`.

#### Slice 1 completion evidence
The user approved setting `login: false` and resuming verification. That change removed the native login wrapper from destination startup. A further failing registration test reproduced macOS `/var` versus `/private/var` cwd aliases; canonical path comparison fixed the destination check without accepting a different directory or changing PID/UID/executable checks.

The command now invalidates external-call continuations on source lifecycle changes and bounds verification subprocesses by the remaining 15-second receipt deadline. A failing cancellation test drove the continuation guard. A failing metadata-IO test drove reporting the retained snapshot path when attempt preparation fails. Startup publication checks destination generation and session identity before writing its receipt. Tests cover refused input/state, local identity, source isolation and model/compaction metadata, IO failures, launcher limits, overlap, generation changes before/after creation, server replacement, malformed/truncated replies, missing/wrong receipts, and uncertain creation without retries or resource deletion.

Final implementation evidence from `dot_pi/agent`:
- Focused deterministic suite: 23 passed, one opt-in smoke test skipped.
- `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs`: 24 passed, zero skipped. The synthetic baseline stayed at one tab with unchanged source bytes. The candidate created and focused one new tab, published a matching startup receipt, retained the source cwd/session branch, preserved source bytes, and added no conversation turn through the additional 2-second settled window. Teardown stopped only the private test server and removed its temporary state.
- `npm run test:unit`: 389 tests, 388 passed, zero failed, one opt-in smoke test skipped. Registration preserves all existing test entries.
- LSP diagnostics for both TypeScript files and the test file: none. `git diff --check`: passed before the commit.

Initial snapshot, direct-launch, canonical-cwd, cancellation, and metadata-IO regressions were observed failing before their fixes. Other refusal and uncertainty coverage was added around the implementation rather than through a separate failing run for each case. Temporary raw-input instrumentation was replaced with a startup registration assertion after the autocomplete cause was confirmed.

No global deployment is approved or performed. Do not apply this worktree's targets. Root `AGENTS.md` and `dot_pi/agent/AGENTS.md` were inspected and remain unchanged. Slice 2 owns the README, split implementation, and complete-feature test suites. Disposable worktree dependencies remain installed for those suites. The command deliberately refuses non-foreground or custom-wrapper launch setups instead of inferring ancestry or replaying flags. All failures after creation dispatch remain conservatively unverified when the CLI cannot establish whether creation occurred; no retry or rollback is automatic.

Slice 1 was complete at this handoff. Slice 2 and its independent verification had not started at that time.

### Slice 2: Fork into right and below splits
**Delivers:** The complete requested command, anchored splits, command reference, and final integration evidence.

### Task 2: Add right and below destinations
**Status:** Complete. Slice 1 received independent verification with no blocking findings. Copycat publication was merged as `9fefd1f`; the user previously approved worktree-only dependency installation. `npm ci --ignore-scripts --prefix dot_pi/agent` passed for Slice 2. No shared runtime files or targets were changed.

**Delivers:** Both split variants use the same verified snapshot/launch path and anchor to the invoking pane.
**Blocked by:** Task 1
**Traces to:** R1, R3, R4
**Files:** `dot_pi/agent/exact_extensions/rex-fork/index.ts`, `dot_pi/agent/exact_extensions/rex-fork/_fork.ts`, `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`

- [x] Add failing tests for `right` and `below`, including a different focused pane, invalid anchor, and uncertain split creation.
- [x] Implement `session.new_split` with explicit source `anchor_id`, `side: after`, and the matching horizontal/vertical direction. Reuse the tab snapshot, launch, and receipt path without duplicate creation or fallback.
- [x] Run the focused test and opt-in smoke commands from Test Strategy; expect both orientations to target the invoking pane and all tab behavior to remain green.

The four focused split cases initially failed because the command rejected splits. The deterministic suite then passed 27 tests with three opt-in smoke cases skipped. The isolated smoke suite passed all 30 tests, including both orientations with a different active window; it verified source-anchored layout, focus, receipt, source bytes, and no launch-generated turn. TypeScript and test diagnostics and `git diff --check` passed.
- [x] Refactor only after green, rerun verification, and commit with `feat(pi): fork conversations into anchored rex splits` (`d1f4302`).

### Task 3: Document usage and future-agent constraints
**Status:** Complete.

**Delivers:** Command usage and failure handling match the tested behavior.
**Blocked by:** Task 2
**Traces to:** R1-R4 and the documentation requirement
**Files:** `dot_pi/agent/exact_extensions/rex-fork/README.md`

- [x] Document the three commands, persisted/idle/local prerequisites, focus and zoom behavior, cwd retention, normal installed-Pi launch limits, and the absence of model prompts or approval transfer. (Failing test not practical: documentation task verified against command output and test contracts).
- [x] Document refusal versus created/unverified, snapshot/attempt inspection before manual retry, private metadata cleanup, isolated test commands, and targeted rollout/rollback coordination.
- [x] Review root `AGENTS.md` and `dot_pi/agent/AGENTS.md`; leave both unchanged because these extension-specific commands and traps belong in this README, not global instructions. Record any contrary review finding before widening file scope.
- [x] Compare every documented outcome with tests; commit with `docs(pi): document rex fork usage and recovery limits` (`4156c40`).

### Task 4: Final verification
**Status:** Complete with the user-approved baseline exception below. Fresh independent verification remains pending. No targets were applied.

**Delivers:** Recorded feature-level evidence for all three destinations and their failure contracts.
**Blocked by:** Task 1, Task 2, Task 3
**Traces to:** R1-R4 and repository verification policy
**Files:** `dot_pi/agent/exact_extensions/rex-fork/rex-fork.test.mjs`, `dot_pi/agent/package.json`, `dot_pi/agent/exact_extensions/rex-fork/README.md`, `plans/rex-fork/plan.md`

- [x] After coordinating with the parallel publisher, verify disposable dependencies in `dot_pi/agent` (rerun `npm ci --ignore-scripts` if needed) before `/verify`. Retain the dependencies for fresh independent verification as the user directed.
- [x] Run the focused suite, `npm run test:unit`, `npm test`, and `npm run test:all` from `dot_pi/agent`. Compare unrelated failures with the unchanged base using isolated scratch state. Record the failures, not a passing result, and run the short-circuited checks separately.
- [x] Run `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs`; require real tab/right/below startup evidence, matching cwd/session identity, no prompt-generated turns, preserved source state, and isolated cleanup.
- [x] Check candidate TypeScript diagnostics, `git diff --check`, changed-file scope, README accuracy, source/target separation, and that no colleague code, secrets, generated dependencies, or runtime attempt data entered Git.
- [x] Record verification commands/results and the approved exception in this plan. Do not apply global targets or change runtime dependencies. Retain disposable worktree dependencies for fresh independent verification.

#### Final execution evidence and baseline exception
The user approved an exception only for failures proven identical on unchanged base `8775893`. Feature regressions and missing feature checks remain blockers. An isolated `git archive 8775893` scratch tree ran `npm run test:prompts`: 92 passed and three failed. The candidate has no changes to `exact_scripts/lifecycle-prompts.test.mjs` or `exact_prompts` relative to that base, and its failures have the same test names and assertion messages:
- `design approval requires a fresh comprehension review, not author self-review`: missing `/material.*revision.*fresh review/is`.
- `design-only review isolates the document and bypasses general review`: missing `/stop after its verdict/i`.
- `lifecycle prompts stay within prompt context budgets`: `systematic-review.md` is 13440 bytes; budget is 12500.

From `dot_pi/agent`:
- The focused deterministic suite passed 27 tests, with three opt-in cases skipped. `npm run test:unit` passed 392 tests, with those three skipped.
- `npm test` and `npm run test:all` both exited 1 at the same three prompt failures. They did not run later scripts because the scripts use `&&`; neither command is recorded as passing.
- The short-circuited checks passed separately: `npm run test:pr-validate-report` (35 tests), `npm run test:pr-validate-collector` (12 tests), `npm run test:skills`, and `npm run test:pi-deps`. `npm run test:smoke` passed with an empty temporary agent directory and temporary HOME, so it does not validate the installed global extension set.
- `PI_REX_FORK_SMOKE=1 node --experimental-strip-types --test exact_extensions/rex-fork/rex-fork.test.mjs` passed all 30 tests. The isolated Rex/Pi cases verified tab, right, and below startup and receipt completion, snapshot/cwd, source bytes, no added conversation turns, and the two-second settled window. Both splits anchored to the invoking pane when another window was active.
- TypeScript and test LSP diagnostics were empty. `git diff --check 8775893` passed. The changed files are the four extension files, `package.json` test registration, and this plan. No dependency tree or attempt metadata is tracked. A targeted secret-pattern scan found no matches. The README was checked against the implementation and tests.

The user directed that disposable worktree dependencies remain for fresh independent verification. Do not deploy, push, open a PR, or start that verification from this execution session.
