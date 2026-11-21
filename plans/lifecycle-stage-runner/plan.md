# Lifecycle Stage Runner Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run each execution slice, simplify the complete feature once, and obtain an independent feature-wide verdict, manually or through `/stage-runner <plan-path>`.
**Smallest user-feedback slice:** A user can follow the manual handoffs on a two-slice plan without simplifying or verifying between slices.
**Out of Scope:** Replacing `/implement`, deleting its bridge, front-half automation, work-profile PR/ARP automation, automatic PR readiness, merge, deployment, mid-stage headless dialogs, parallel agents, and third-party orchestration runtimes.
**Architecture:** A thin Pi command selects scoped models and presents the runner's progress and approval requests. A deterministic Node runner owns processes, files, Git gates, and transitions; the three existing prompts own semantic judgments. A Rex recovery pane either resumes the exact writer or starts a new writer conversation; it never forks the invoking conversation.
**Tech Stack:** Pi 1.6.0, Node.js, TypeScript, Git, Rex local socket, chezmoi, Node test runner.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | Planning workflow | Selected applicable guidance |
| `resolve-worktree` | prompt-required | Explicit design path | Resolved owning branch and committed design |
| `feature-worktree` | prompt-required | Durable plan | Kept the existing feature branch |
| `learning-lookup` | prompt-required | Prior guidance | Checked advisory store before decisions |
| `obsidian-cli` | agent-selected | Advisory lookup | Read the store for the scoped search |
| `codebase-research` | skill-loader | Shared prompts and runtime | Identified manual, bridge, and test consumers |
| `cli-best-practices` | skill-loader | New command | Separated interactive selection from process control |
| `rex` | agent-selected | Recovery ownership | Checked anchored split and process inspection support |
| `chezmoi` | skill-loader | Managed prompts and extension | Limited rollout to explicit targets |
| `write` | skill-loader | Plan | Distinguished behavior, evidence, and limits |
| `explain` | agent-selected | Prompt-mode decision | Distinguished invocation inputs from shared prompt behavior |

## Implementation Contract
Source: `plans/lifecycle-stage-runner/design.md` at `bce5425`, approved. The operator explicitly changed the manual cadence during planning. This supersedes the design's additive-only rollout for the three direct prompts, not its `/implement` fallback. The four delivery slices below together implement **design Slice 1**. No relevant prior guidance matched the advisory lookup; no advisory source was skipped.

### Components affected and feasibility
Paths in this table are relative to `dot_pi/agent/`. Task file lists below use repository-relative paths.

| Component / files | Responsibility and evidence | Verification | If unavailable |
|---|---|---|---|
| `exact_prompts/{execute,simplify,verify}.md` | Existing direct handoffs, writer IDs and PR override; change plan-backed cadence, not bridge behavior or planless forms | Prompt tests, legacy RPC tests, live earlier-slice defect | Block if either workflow loses its contract |
| `exact_extensions/stage-runner/index.ts` (new) | Select models through Pi extension context, as in `exact_extensions/ship-conductor/index.ts`; use invoking UI for live lines, confirmation and cancellation, not chat messages interpreted by a model | Selection/cancel tests and live invocation | Stop before writes on inadequate scope or missing local Rex identity |
| `exact_scripts/stage-runner.mjs` (new) | `pi --mode json` supplies session header and settlement; `--session-dir` saves sessions. Node child process APIs and Git supply exit, timeout, provenance and progress evidence | CLI subprocess tests with fixture Pi, real Git worktrees | Fail closed; no prose fallback |
| `exact_scripts/stage-recovery.mjs` (new) | Local peer/anchoring checks demonstrated in `exact_extensions/rex-fork/_fork.ts`; Rex accepts direct argv and supports pane process inspection | Fake Rex for definite/uncertain outcomes; real authenticated trial for ownership and cleanup | Never retry a split with uncertain outcome |
| `exact_scripts/test-runner.mjs` and prompt/RPC suites | Existing fast/integration split and real Pi 1.6.0 bridge coverage | Test tiers and live trial | Missing required evidence blocks qualification |

### Key decisions and constraints
- Manual and automated runs use the same stage cadence, not a third prompt mode. Keep the existing protocol-v3 path and its per-unit checks for `/implement` only. The runner supplies handoff instructions and explicit no-push/no-PR instructions per invocation. Do not pass a bridge contract. Direct manual verification keeps its current publication policy and stack-split check. Keep planless command forms intact.
- Use `/stage-runner` rather than shell-only model discovery: the current session owns `ctx.scopedModels`. Select provider, model and supported thinking level for all three stages once. Writers may match each other; neither may match the verifier. Preserve all actual writer identities across slices; do not guess provenance on manual handoff.
- Count **three verifier launches**, including startup failures. A separate writer recovery does not reset the count. Never retry a writer just to repair a malformed handoff. A richer schema-enforcing runtime might reduce format errors but would not establish Git progress or independent verification.
- Preserve repository lifecycle policy in prompts, not in an LLM coordinator. Keep existing bridge, RPC fixtures, `rex-fork`, and `rex-recovery` behavior unchanged. No new runtime dependency or service. Missing source evidence, unsupported Pi version, or unexpected prompt/bridge drift blocks execution rather than silently changing policy.

### Security, observability and failure handling
Validate canonical paths, tracked plan at HEAD, clean non-default feature branch, user-owned local Rex socket and exact invoking session/block. Pin the starting Git baseline and requirements before execution. Keep private run bundles outside Git under `~/.pi/agent/lifecycle-runs/` (directories 0700, files 0600); pass argv, not shell commands. Treat stdout, stderr, tool names, handoffs and artifact paths as untrusted data. Bound buffers and sanitize terminal output. Retain at most 16 KiB stderr per attempt, keep the newest 100 completed bundles, never prune active/uncertain runs. Local permissions do not prevent Pi from sending context to its configured provider.

Take a cooperative lock keyed by canonical worktree. Never steal a live or uncertain lock. Record attempt, stage, model, session, progress, elapsed time, stop reason and evidence for advancement (successful handoff, explicit recovered-writer acceptance, or fresh verdict). Configurable finite inactivity and wall-clock deadlines apply to headless children. On cancel or timeout send TERM, then KILL after five seconds if needed; confirm exit before release. Cancellation starts no next stage, preserves edits and commits, and reports available session IDs. An uncertain recovery process or split keeps the lock and available PID/pane identifiers for manual investigation. Never equate an idle or closed pane with approval.

### Test strategy, rollout and rollback
Use actual Git and runner processes against temporary repositories; substitute Pi, Rex and operator responses only at process/UI boundaries. Isolate session directories, lock roots, HOME, branches, and downstream effects; fixtures must not call providers, GitHub or ARP. Compare the same two-slice workload and planted earlier-slice defect for manual and automated workflows. Correlate live evidence by candidate SHA, Pi version, run ID, stage/attempt and session from launch through confirmed exit. No performance or reliability-rate claim. Fake processes cannot establish provider compliance, Rex authentication, or pane lifecycle. The operator must complete a real trial before cutover. Accept the design's narrow race between verify's final Git snapshot and runner acceptance; no independent verdict-to-HEAD pin is required in this release.

Owner: dotfiles operator. Trial candidate prompts and extension in a disposable worktree and temporary Pi agent directory before applying. Inspect `chezmoi --source "$PWD" diff` for each changed target file; apply only those explicit targets, not the whole agent directory. Preserve the legacy command. To roll back, restore the three direct prompts and guidance from the prior revision, remove only the new runner targets, and verify `/implement` still works. Do not delete recovery evidence, roll back operator commits, or remove locks without confirming process exit.

## Delivery
### Slice 1: Follow the manual sequence without intermediate closeout
### Task 1: Change plan-backed handoffs and full-feature scope
**Delivers:** One manual execution slice at a time, then one feature-wide simplify and one independent verify.
**Blocked by:** None
**Traces to:** Shared cadence and manual PR decision.
**Files:** `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_prompts/simplify.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

#### Requirement: Manual cadence
The direct commands SHALL retain slice tests, defer closeout until execution completes, and publish only after independent verification.

##### Scenario: Success and premature handoff
- GIVEN a committed plan with two incomplete slices, WHEN the first finishes, THEN offer the next `/execute`, not simplify, verify, or PR publication. After the last slice, hand off the full feature and writer identities through simplify to a fresh verifier. An ungrouped plan makes this handoff after its single execution. An unchanged simplify does not skip the verdict.
- GIVEN an unmet criterion from the first slice, WHEN the final verifier reviews the candidate, THEN report `BLOCKED` and do not publish. On `VERIFIED` retain the existing snapshot, stack-split and no-PR checks before opening a draft or updating the PR.

- [ ] Add focused failing prompt-contract assertions for both outcomes, direct writer provenance, planless compatibility, and the legacy protocol-v3 exception. Update direct instructions and remove contradictory slice-only or optional closeout text for plan-backed work only.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect new and existing contracts to pass. Run `npm run test:integration` there; expect legacy RPC behavior unchanged. After any refactor rerun the focused suite. Commit `feat(pi): simplify and verify after all execution slices`.

### Slice 2: Run a plan hands-off and stop safely
### Task 2: Launch a bounded run and accept only validated stage transitions
**Delivers:** A selectable `/stage-runner` command that completes the happy path and stops with actionable evidence on failure, without publishing.
**Blocked by:** Task 1
**Traces to:** Selection, private run state, observability, deterministic gates and bounds.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_scripts/stage-runner.mjs`, `dot_pi/agent/exact_scripts/stage-runner.test.mjs`, `dot_pi/agent/exact_scripts/_fixtures/stage-runner/pi.mjs`, `dot_pi/agent/exact_scripts/test-runner.mjs`.

#### Requirement: Evidence before advancement
The runner SHALL advance only on a successful process and stage-specific evidence. It SHALL stop at `VERIFIED` without publishing.

##### Scenario: A grouped plan completes
- GIVEN a clean feature worktree with a committed plan and distinct verifier, WHEN invoked, THEN run fresh Pi processes with explicit provider/model/thinking/session directory, one execute per incomplete slice followed by one feature simplify and verify over the pinned range. Display compact live tool, turn, stage, slice and elapsed-time updates before process exit.
- GIVEN a rejected selection, unsafe path, dirty worktree, concurrent owner, abort, timeout, absent settlement, invalid handoff, or failed progress check, WHEN the transition is evaluated, THEN do not advance. After 20 execute iterations with remaining work, report remaining tasks without recovery. An ungrouped plan must finish in one execute.

- [ ] Add failing CLI tests with temporary Git worktrees, private state and an argv-recording Pi fixture. Cover concurrent starts, cancellation, retention, LF-only byte framing (including embedded Unicode separators), session header, exit zero **and** non-aborted `agent_settled`. Keep history private and error output bounded.
- [ ] Implement the picker and runner. Connect progress, approval and cancellation to the invoking Pi UI; do not rely on Ctrl-C reaching an extension command handler. Use an explicit cancel action and session-shutdown cancellation as well as runner signal handlers. Pin the committed plan and start HEAD; require clean Git state after claimed success, a forward commit and reduced unchecked work for execute. Leave semantic fidelity to verify.
- [ ] Use unique per-attempt handoff paths. Validate strict UTF-8, at most 64 KiB, schemaVersion 1, matching `stage`, closed `status`, nonblank `summary`; writer `blocked` includes `blocker` with `step`, `reason`, `evidence`, `nextAction`; verify permits `VERIFIED` or `BLOCKED` and structured `findings`. Reject missing, oversized, stale, malformed and wrong-stage handoffs. Supply the pinned feature range, writer provenance and explicit no-publish instructions without enabling the legacy bridge.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/stage-runner.test.mjs && npm run typecheck`; expect fixture commits, handoffs and exact stage order on success, no downstream launch on rejection. Register slow subprocess tests in the integration tier. Rerun after refactoring. Commit `feat(pi): run lifecycle stages with native Pi sessions`.

### Slice 3: Resume a writer or start independent recovery
### Task 3: Recover with owned Rex processes and explicit evidence
**Delivers:** Interactive recovery that preserves work and never turns the verifier conversation into a writer.
**Blocked by:** Task 2
**Traces to:** Writer recovery, verifier attempt limit, cancellation and independence.
**Files:** `dot_pi/agent/exact_scripts/stage-recovery.mjs`, `dot_pi/agent/exact_scripts/stage-runner.mjs`, `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_scripts/stage-runner.test.mjs`, `dot_pi/agent/exact_scripts/_fixtures/stage-runner/pi.mjs`, `dot_pi/agent/exact_scripts/_fixtures/stage-runner/rex.mjs`.

#### Requirement: Recovery identity and authority
The runner SHALL resume only a saved failed writer. For verifier failures it SHALL start a fresh writer and require a fresh independent verdict.

##### Scenario: Writer recovery or refusal
- GIVEN a failed execute or simplify attempt with a saved session matching its header, WHEN recovery opens, THEN resume that session file with the failed stage model and history. Without a resumable file report the failure and stop without opening a split.
- GIVEN recovery Pi exits, WHEN the runner closes only its split and confirms clean work, writer independence, and original-attempt progress, THEN show commit/task changes and require explicit acceptance before advancing without repeating the stage. Unchanged simplify is valid. Refusal, unknown provenance, failed gate or cancellation stops the run without undoing work.

##### Scenario: Fresh recovery after verifier failure
- GIVEN `BLOCKED` or no valid verdict with an attempt left, WHEN recovery opens, THEN launch a new execute-model conversation seeded only with findings or failure details, bounded stderr and available artifact paths, never a fork or resume. After exit and clean/independence checks, launch a fresh verifier, even if nothing changed.
- GIVEN attempt three, WHEN it succeeds, THEN accept it; otherwise report evidence and stop without another pane. Count startup failures. A different session ID alone does not establish fresh history.

- [ ] Add failing fixture-process tests for exact argv, saved writer ID and history, no inherited transcript on either fresh launch, model changes, idle then exited Pi, approval/refusal, last-attempt success/failure, dirty work, cancellation, and definite versus uncertain split creation.
- [ ] Verify Rex socket/UID and invoking session/block before a direct-argv anchored split. Use `rex-fork/_fork.ts` only as a reference for peer and ownership checks, **not** its fork operation. Track the specific recovery process and owned split; wait for process exit, not idle UI or pane closure. Check recorded writer models including interactive turns. Fail closed if evidence is incomplete.
- [ ] On definite split failure print exact manual command and Rex IDs and stop; never retry an uncertain result. Confirm recovery exit before cleanup and lock release, or retain lock with evidence. Record whether the run advanced by handoff, operator acceptance or independent verdict.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/stage-runner.test.mjs && npm run typecheck`; expect original-attempt gates, preserved edits, no unintended launches, no fork and no unsafe release. Rerun after refactoring. Commit `feat(pi): recover lifecycle stages in an owned Rex split`.

### Slice 4: Qualify the runner and document operator recovery
### Task 4: Final verification
**Delivers:** Feature-level evidence for the approved workload and both recovery paths before cutover.
**Blocked by:** Task 3
**Traces to:** Authenticated trial and validation limits.
**Files:** `plans/lifecycle-stage-runner/plan.md` (record sanitized trial results with this task; private artifacts stay outside Git).

#### Requirement: End-to-end qualification
The candidate SHALL demonstrate shared cadence, real prompt-written handoffs, independent recovery, and no premature publication.

##### Scenario: Disposable two-slice trial
- GIVEN Pi 1.6.0, authenticated scoped models, working signing agent, verified local Rex and isolated disposable worktrees, WHEN the candidate runs the two-slice workload, THEN observe the complete hands-off order, valid handoffs, clean commits, and no runner publication. Repeat with a writer blocker and earlier-slice defect to observe exact writer resume, feature-wide `BLOCKED`, fresh writer recovery, and fresh verification after repair.
- GIVEN missing credentials, incomplete evidence, inherited verifier history or leftover recovery pane after confirmed normal exit, WHEN evaluating the trial, THEN do not qualify the runner. Fixture success cannot waive the trial.

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts && npm test && npm run test:all`; expect all tiers, typecheck and smoke to pass. Remove installed worktree dependencies after testing. Compare direct handoff behavior on the same plan; use explicit no-publish for disposable runs rather than creating real downstream PRs. Retain existing PR contract coverage; this trial does not prove GitHub availability.
- [ ] Use a temporary agent directory with candidate prompts/extension/scripts and authenticated provider configuration, not production writes to managed targets. Invoke `/stage-runner` on the committed disposable plan. Observe live progress, idle recovery without advancement, exit and owned-pane cleanup; inspect session history, not just IDs. Record first-attempt valid handoffs / total invocations, interventions caused solely by format, exact writer-session match, versions and sanitized outcomes. If format failures recur, block cutover and evaluate a Pi-native validated result first.
- [ ] Stop all trial processes, verify locks released or document retained uncertain locks, and remove confirmed disposable worktrees and temporary credentials/config links without deleting required evidence. Record results and commit `docs: record lifecycle stage runner qualification`.

### Task 5: Publish operator guidance and rollback instructions
**Delivers:** Instructions for choosing the manual path, new runner or legacy fallback and recovering without losing context or work.
**Blocked by:** Task 4
**Traces to:** Rollout, rollback, documentation and future-agent guidance.
**Files:** `dot_pi/agent/exact_extensions/stage-runner/README.md`, `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_extensions/ship-conductor/README.md` (inspect only unless fallback instructions are inaccurate).

- [ ] Document launch, selection, cancellation, artifact permissions/retention, uncertain-lock investigation, writer resume versus fresh writer, three-attempt limit, and the manual versus runner publication boundary. Align agent guidance with the new manual cadence while preserving legacy `/implement` instructions. Keep the old README unchanged if it still describes that command correctly. No generated references or service deployment are needed.
- [ ] Check explicit target-file diffs from this worktree and document operator rollout and rollback in the new README. Run `git diff --check` and `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect clean documentation and passing contracts. Commit `docs(pi): document stage runner operation and recovery`.
