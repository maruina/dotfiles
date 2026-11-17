# Automatic ARP Completion Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Work-profile `/implement` SHALL finish verified implementation work with a draft PR and a bounded, silent Agentic Review Platform (ARP) review-and-fix loop without an additional approval dialog.
**Smallest user-feedback slice:** After all implementation slices pass, create or update the draft PR and report a completed silent ARP review of its exact pushed head.
**Out of Scope:** Personal-profile automation, changes to standalone PR command authorization, merging, marking PRs ready, deployment, automatic authentication, unrelated fixes, and general crash-resume orchestration.
**Architecture:** Keep the existing per-slice execute/simplify/verify loop. Add a feature-scoped completion phase that uses fresh RPC children for PR publication, ARP assessment, and fixes, and reuses independent verification after fixes. The coordinator owns typed transitions, limits, candidate checks, cancellation, and final status; prompts own review judgment and GitHub/MCP procedures.
**Tech Stack:** TypeScript, Pi RPC extensions and prompts, TypeBox, Node test runner, chezmoi templates, GitHub CLI, ARP MCP.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | agent-selected | Lifecycle planning | Selected applicable skills and preserved provenance. |
| `codebase-research` | skill-loader | Unfamiliar coordinator behavior | Traced stages, RPC startup, protocol, state storage, prompts, and tests. |
| `chezmoi` | skill-loader | Managed source changes | Kept planning in the source worktree and scoped future apply operations. |
| `feature-worktree` | prompt-required | Plan writes | Created `maruina/implement-arp` from fetched `origin/main` in a feature worktree. |
| `reviewable-pr-workflow` | skill-loader | PR publication contract | Preserved draft status, GitHub account routing, stack handling, and review-aware history rules. |
| `cli-best-practices` | skill-loader | `/implement` workflow and reports | Required typed results, explicit failures, bounded automation, and no added approval dialog. |
| `learning-lookup` | prompt-required | Planning decisions | Attempted advisory lookup; source helper lacked its Pi dependency and the command timed out. No learning-store content informed decisions. |
| `learning-candidates` | prompt-required | Planning ledger policy | Applied the surprise filter; no candidate recorded. |
| `write` | skill-loader | Plan prose | Used concrete component names and observable contracts. |

## Confirmed scope and source evidence
The user confirmed the planning alignment brief in this session: automation is authorized by work-profile `/implement`; at most three reviewed heads; a 20-minute deadline per head for capture and review completion; stop rather than claim success on missing authentication, unsupported actions, ambiguous findings, or exhausted bounds. Both slices below are required for the complete feature.

Current source evidence at `3c56398`:
- `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts` runs per-slice stages and finishes when `selectExecutionUnit` reports completion. It snapshots candidates and requires typed outcomes.
- `_protocol.ts`, `_prompts.ts`, `_state.ts`, `index.ts`, and `_spawn.ts` share the three-stage contract. `_unit.ts` validates selected-unit ledger changes. These consumers must remain consistent.
- `dot_pi/agent/exact_prompts/execute.md` implements a selected unit; direct `verify.md` publishes only after `VERIFIED`. Orchestrated verification submits its typed result instead.
- `dot_pi/agent/exact_prompts/pr-create.md` creates a draft but only offers ARP after separate approval; `pr-update.md` permits only an ARP status check. Preserve those standalone limits.
- `_rpc.test.ts` uses the real Pi agent loop with an in-memory provider; `_fixtures/rpc-driver.ts` supplies deterministic actions. Tests are not evidence of production ARP behavior.
- Work-only rendering exists in `dot_pi/agent/exact_extensions/compute-guardrails.ts.tmpl`; profile selection must use chezmoi data, not the presence of a work directory or MCP server.
- ARP MCP declarations support `silent: true`, `allowed_action`, `expected_head_sha`, PR-wide findings, and permanent `addressed`/`invalid`/`out_of_scope` resolutions. Requesting a review uses persisted state; it does not discover new commits or force a review of an already completed head. Reused in-flight reviews retain their posting mode.

## Implementation Contract
### Components Affected
All file paths in this plan are repository-relative.

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Profile gate | New `dot_pi/agent/ship-conductor-profile.json.tmpl`; `dot_pi/agent/exact_extensions/ship-conductor/index.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_index.test.ts` | Render an explicit work/personal value; read it from `getAgentDir()` and pass the completion policy into the coordinator. `personal` finishes as `verified` after the final slice; missing or invalid policy blocks at completion entry after all slices pass and never enables production writes. | Both rendered profiles and missing/invalid policy cases with `PI_CODING_AGENT_DIR` isolated in `_index.test.ts`. |
| Completion coordinator | New `dot_pi/agent/exact_extensions/ship-conductor/_completion.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_completion.test.ts`; `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.test.ts` | Start completion only after all slices pass; enforce candidate identity, limits, transitions, and terminal reports. Bypass interactive `handleStop` session-model recovery during completion and report manual recovery commands directly. | Injected stage runner and clock, real temporary Git repositories. |
| Shared child contract | `dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_spawn.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_spawn.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_models.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_models.test.ts` | Add feature-scoped completion configuration and typed results without weakening existing slice contracts. Update every affected exhaustive consumer. | Schema rejection, identity checks, report/config bounds, existing stage regressions. |
| Completion policy prompts | New `dot_pi/agent/exact_prompts/pr-publish.md`, `dot_pi/agent/exact_prompts/arp-review.md`, `dot_pi/agent/exact_prompts/arp-fix.md`; `dot_pi/agent/exact_prompts/verify.md` | Publish without duplicate ARP offers; review silently; adjudicate findings; fix within approved feature requirements; verify fixes independently. | Prompt tests and real RPC fixture. |
| Integration tests | `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_index.test.ts`; `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/arp-prompts.test.mjs` | Prove stage and tool ordering through the real agent loop; retain standalone PR limits. | Focused suites and full gates. |
| Documentation | `dot_pi/agent/exact_extensions/ship-conductor/README.md`, `dot_pi/agent/AGENTS.md`, `AGENTS.md` | Document authorization, limits, availability failures, cancellation, and verification requirements. | Source inspection, doc review, profile preview. |

Inspect all imports and exhaustive stage checks before editing. A listed file needs no edit if semantic inspection proves that it is unaffected; record that evidence. Do not refactor unrelated code.

### Key Decisions
- Work-profile invocation authorizes publication, silent review requests/retries, in-scope fixes, verified pushes, and supported finding resolutions. Existing model selectors and blocker dialogs remain; there is no added routine ARP approval dialog. `personal` profile policy finishes the run as `verified` after the final slice without starting completion; a missing or malformed `ship-conductor-profile.json` blocks at completion entry after all slices pass without enabling ARP writes.
- Add a completion module rather than running ARP from every slice or hiding it inside `/pr-create`. The latter options need less coordinator work but review intermediate states or introduce duplicate loops. Interactive session-model recovery (`handleStop`) applies only to slice rounds (`execute`, `simplify`, `verify`); completion stops bypass `handleStop` and report the PR, head SHA, settled finding IDs, and manual recovery command directly.
- Use three feature-scoped child responsibilities: `pr-publish`, `arp-review`, and `arp-fix`. Reuse the selected execute model for these responsibilities and the existing independent verify model for fresh verification. No additional model picker is required.
- Use a discriminated feature scope in immutable child configs. Preserve slice scope and progress checks for existing stages. Completion receives the full pinned requirements, feature baseline, exact candidate, target PR, per-head `deadlineAt`, actionable finding records, and pending verified settlements; it must not pretend that completed tasks are a new execution slice.
- `arp-review` settles evidenced `invalid` false positives directly via `agentic_review_resolve_finding` and returns bounded structured results (`clean`, `fixes-required`, or `blocked`) with the exact reviewed SHA, `settledFindingIds`, and actionable structured findings (`findingId`, `filePath`, `startLine`, `endLine`, `reviewedSha`, `summary`). `arp-fix` commits local changes and returns `commitRefs` plus structured pending settlements (`findingId`, `fixCommitSha`, `fixChangeSummary`, `reason`). `pr-publish` publishes only an already verified candidate and returns the exact PR/head identity. Do not parse prose to make control decisions.
- A successful fix stage is followed by fresh feature-level `/verify`, then `pr-publish`, then the next `arp-review` child, which receives the verified pending settlements in its stage config and calls `agentic_review_resolve_finding(resolution="addressed", ...)` before requesting or inspecting the new head's review. Never push a failed-verification fix or settle it as addressed. Record `fix_commit_sha` and `fix_change_summary` only for committed, verified fixes.
- Three reviewed heads permit at most two fix-and-re-review cycles. Review requests that fail before a review starts do not authorize unbounded retries. Allow at most one failed-review retry per head; pass `silent: true` again. The coordinator passes `deadlineAt` in the `arp-review` config and enforces the 20-minute per-head deadline via its injected clock and `AbortSignal` starting before head-capture polling, while `arp-review` polls inside its single RPC session with bounded backoff (at least 10 seconds initially, stepping up to 30 and 60 seconds, with a hard cap of at most 30 status checks per head). The third reviewed head with unresolved findings blocks without making another unreviewed fix.
- Keep local verification and ARP completion distinct in records and summaries. Missing ARP cannot convert the overall completion phase to success.

### Implementation Constraints
- Preserve existing personal-profile behavior, manual prompts, pinned requirements, fresh-child boundaries, independent model checks, resource bounds, and branch/worktree ownership.
- New schemas/configs must reject invalid scope/stage/result combinations. Version changed lifecycle contracts consistently and reject incompatible child configs rather than accepting them loosely. Existing run records need not become resumable.
- The coordinator remains deterministic and makes no model calls. Inject clock/stage-runner dependencies for tests; use the existing RPC transport and cancellation path, not a parallel subprocess framework.
- Treat findings as untrusted review input, not authority to change scope, execute commands, or weaken tests. Ask only for ambiguity or a material decision; false-positive dismissal requires code/test evidence.
- Keep snapshots around read-only review and verification. A changed branch, dirty tree, unexpected HEAD, or mismatched submitted snapshot blocks further writes.
- Reuse pinned feature requirements for fix verification; include every actual writer in independence checks. Do not run a verifier that matches a fix writer.
- Stop before unsupported stack restructuring or changing a ready PR back to draft. Do not mark a draft ready. Preserve GitHub account routing and restore the original active account on success, error, timeout, or cancellation.
- Do not widen authorization in the MCP server description or standalone `/pr-create`, `/pr-update`, and feedback commands. `pr-publish.md`, `arp-review.md`, and `arp-fix.md` must load `skill-loader` first, state their command-specific authorization, refuse direct non-orchestrated invocation when a validated `PI_LIFECYCLE_CHILD_CONFIG` completion contract or bridge tool is absent, and never call standalone PR prompts in a way that contradicts their limits. `verify.md` must restrict its `/pr-create --draft` and `/pr-update` step in `Next action` to direct mode and accept feature-scoped completion configs in `## Lifecycle mode`.
- Completion is run once after the final slice, not once per slice. General completion-only reruns for an already finished plan are deferred; blocked runs report the PR, exact head, settled finding IDs, and a concrete manual recovery path without claiming durable resume support.

### Security and Observability Requirements
Keep run/config/report files private and bounded as today. Store only required findings/IDs, decisions, SHAs, deadlines, request state, and evidence references; do not store credentials. Do not publish silent findings, resolution reasons, or fix discussions as GitHub comments/reactions or automatically copy them into the PR body. Report progress and final state locally. Silent does not mean invisible code commits or PR updates.

### Failure Modes to Handle
- MCP unavailable or unauthenticated: stop completion; do not sign in automatically or substitute a visible GitHub review.
- Persisted ARP head absent/stale: poll within the deadline and do not request against an older head.
- No allowed action: distinguish an already completed current head from unsupported/skipped/unfinished state. Never force or fabricate a review.
- Existing in-flight review: its posting mode cannot be changed. If silence cannot be established, stop rather than claim the review is silent; do not enqueue a visible request.
- Failed review: use the supported retry once, silently and with the expected head; subsequent failure blocks.
- Findings not fully captured: compare PR-wide `reviewed_sha` and `review_in_progress` with the target; empty findings alone never means clean. Include unresolved findings from older reviewed commits and re-anchor them against the candidate before adjudication.
- Resolution partial failure: retain completed operations in the report; re-read state and do not invent successful settlements or repeat a contradictory permanent resolution.
- User/external push: detect a target-head change and stop; do not review, dismiss, or push against an unintended candidate.
- Verification failure: return blocked, leave the local fix commit explicit, and do not push or request re-review.
- Cancellation: terminate the active child, retain the lock if termination is uncertain, and start no later stage. Already queued ARP work may continue remotely; report that limit.

### Rollout and Rollback
Owner: Matteo Ruina. Preview and apply only changed target files from the feature worktree using `chezmoi --source "$PWD"`. Test work and personal rendering before apply. Reload Pi after applying extension changes. To roll back, stop an active run, revert the source commit, apply those explicit targets, and reload. Source rollback does not undo PR creation, pushes, queued reviews, or permanent finding resolutions.

### Test Strategy
Use the existing injected stage runner and temporary Git repositories for state-machine behavior. Add a clock dependency only for bounded waiting/deadlines. Use an isolated fixture MCP tool provider registered with `pi.registerTool` in `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts` in the real RPC test to prove deferred discovery, `silent: true`, head guards, and resolution arguments without production writes. This fixture must execute tool calls through the real agent loop, not only inspect prompt strings. Keep the existing Pi 1.5.0 real-loop requirement and do not weaken required checks to match an installed version.

Install disposable test dependencies in `dot_pi/agent` at the start of Task 1 with `npm ci --ignore-scripts` so TypeScript imports and the lockfile-pinned `node_modules/.bin/pi` (1.5.0) binary are available for every task; keep `dot_pi/agent/node_modules` until Task 4 (`npm test` and `npm run test:all`) completes, then remove it as required by repository guidance.

Focused commands from `dot_pi/agent`:
- `PATH="$PWD/node_modules/.bin:$PATH" node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'`
- `node --test exact_scripts/lifecycle-prompts.test.mjs exact_scripts/arp-prompts.test.mjs`

A disposable-worktree live smoke must load candidate prompts/extensions using a temporary `PI_CODING_AGENT_DIR` as described in root `AGENTS.md`. It must demonstrate automatic transition, typed outcomes, cancellation, and a fix followed by fresh verification. Isolate GitHub/ARP writes in fixtures for the local smoke. A production ARP end-to-end check additionally needs an authenticated MCP connection and a suitable draft PR; no production review request is authorized merely to test this plan. The real-service check remains an explicit delivery evidence gap until it is performed or its omission is accepted by the user. No hosted report or browser is required.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Work-only automation | Rendered profile policy consumed from `getAgentDir()` | Existing chezmoi profile conditions and extension file loading | Work/personal render and startup tests | Do not enable writes; report missing/invalid policy. |
| Fresh completion stages | Existing RPC stage runner plus typed feature scope | `_spawn.ts`, `_bridge.ts`, `_protocol.ts` | Real agent-loop fixture | Block; do not replace with prose outcomes. |
| Silent ARP review | Deferred MCP discovery, status/request/findings tools | Tool schemas inspected during this session | Fixture records discovery and request arguments; real-service check separately | Stop completion. |
| New-head review | Compare GitHub `headRefOid`, ARP `head_sha`, `allowed_action`, `expected_head_sha` | MCP request contract | Stale-head and capture-delay tests | Stop at deadline. |
| Fix and dismiss | `arp-fix` local writer; permanent resolution tool with reasons | Existing writer stages and MCP resolution contract | Valid/invalid/ambiguous/partial-write tests | Block affected operations. |
| Independent verification | Existing verify child with feature scope and writer provenance | Existing verify and model identity contracts | Fix invalidates verdict; new verifier checks exact candidate | Stop without push. |

## Acceptance Requirements
### Requirement R1: Work-only final completion
The system SHALL start feature completion only after all slices pass, and SHALL preserve personal-profile behavior.
- GIVEN multiple slices, WHEN an intermediate slice passes, THEN no completion child starts.
- GIVEN a work run whose final slice passes, WHEN completion starts, THEN PR publication precedes ARP review with no added approval dialog.
- GIVEN a personal run or invalid profile policy, WHEN execution ends, THEN automatic ARP writes do not occur.

### Requirement R2: Exact-head silent review
The system SHALL accept only a completed, fully captured review of the intended pushed head as ARP evidence.
- GIVEN a draft PR and a captured current head, WHEN an allowed review request is made, THEN it has `silent: true` and the matching `expected_head_sha`.
- GIVEN stale/missing state, unfinished capture, empty findings during review, a changed head, or an unconfirmed posting-mode review, WHEN assessed, THEN the system does not report clean or issue an unsafe request.
- GIVEN a completed current-head review, WHEN no new review action is supported, THEN the system inspects its captured findings rather than attempting to force another review.

### Requirement R3: Evidence-based fixes and resolutions
The system SHALL fix only confirmed in-scope findings and record permanent resolutions with evidence.
- GIVEN valid and false-positive findings, WHEN assessed, THEN valid issues receive tested fixes and false positives receive `invalid` with concrete reasons, without GitHub comments/reactions.
- GIVEN ambiguity or a scope change, WHEN assessed, THEN the workflow stops for a decision rather than dismissing or expanding scope automatically.
- GIVEN open findings from older heads, WHEN the PR-wide list is loaded, THEN they are re-anchored and assessed rather than ignored.

### Requirement R4: Verification before push and re-review
The system SHALL independently verify fixes before publication or addressed resolutions, then review the resulting pushed head.
- GIVEN a committed fix, WHEN verification passes for that exact candidate, THEN publish, settle the applicable finding IDs, and request or inspect the new head's review.
- GIVEN failed verification, a matching writer/verifier, or candidate drift, WHEN checked, THEN no push, addressed resolution, or re-review follows.
- GIVEN unchanged code after false-positive dismissal, WHEN all findings are settled, THEN no empty commit or redundant review request is created.

### Requirement R5: Bounded and observable completion
The system SHALL stop at three reviewed heads or the per-head deadline and SHALL report incomplete completion separately from verified implementation.
- GIVEN persistent findings or delayed capture/review, WHEN a bound is reached, THEN the workflow stops with exact PR/head/findings and a recovery action.
- GIVEN a failed review, WHEN its one supported retry is exhausted, THEN completion blocks.
- GIVEN cancellation or uncertain child termination, WHEN stopping, THEN no later stage starts and lock handling follows the existing ownership contract.

## Implementation Tasks
### Slice 1: Silent completion review after final verification
### Task 1: Publish the verified draft and obtain an exact-head silent review
**Delivers:** Work-profile `/implement` automatically publishes its fully verified feature and obtains a bounded silent review; actionable findings are reported as blocked until slice 2.
**Blocked by:** None
**Traces to:** R1, R2, R5
**Files:** `dot_pi/agent/ship-conductor-profile.json.tmpl`, `dot_pi/agent/exact_extensions/ship-conductor/index.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_index.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_completion.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_completion.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_spawn.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_spawn.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_models.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_models.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts`, `dot_pi/agent/exact_extensions/ship-conductor/README.md`, `dot_pi/agent/exact_prompts/pr-publish.md`, `dot_pi/agent/exact_prompts/arp-review.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/arp-prompts.test.mjs`.

- [x] Run `npm ci --ignore-scripts` in `dot_pi/agent` so TypeScript dependencies and `node_modules/.bin/pi` (1.5.0) are present before running extension tests. Inspect semantic references to changed shared types and functions with LSP; read applicable Pi extension/RPC/MCP docs and the complete relevant test sections before editing. Map all stage consumers, including state-file allowlists and fixtures.
- [x] Add focused failing tests for final-slice entry, no intermediate entry, `personal` completion skip, missing/invalid profile policy blocking at completion entry (with `PI_CODING_AGENT_DIR` isolated in `_index.test.ts`), draft publication, exact-head silent requests, complete capture, reused-review safety, failure bounds, `handleStop` bypass during completion, and cancellation.
- [x] Add the smallest typed feature-scoped completion contract and profile gate; preserve old slice validation. Implement publication and silent review children using existing transport and selected models. Read-only ARP assessment must not change the candidate.
- [x] Enforce coordinator-owned deadlines (`deadlineAt` in config plus coordinator clock/abort enforcement) and bounded results, with single-session bounded backoff polling in `arp-review` (10s minimum interval stepping to 30s/60s, capped at 30 status checks per head). Keep the run lock through completion. Update status/widget/summary code so verified implementation with incomplete ARP is not overall completion success.
- [x] Require `pr-publish.md` and `arp-review.md` to load `skill-loader` and refuse direct non-orchestrated invocation when `PI_LIFECYCLE_CHILD_CONFIG` or bridge tools are absent. Scope `verify.md`'s `/pr-create --draft` and `/pr-update` step in `Next action` to direct mode. Preserve standalone PR prompt limits and test that the completion publication path does not trigger an ARP offer or duplicate request. Add initial README documentation in this slice so authorization is visible immediately.
- [x] Run both focused commands from Test Strategy, LSP diagnostics, and work/personal render checks; expect all applicable tests to pass with no added prompt for routine ARP authorization.
- [x] Commit with `feat(pi): add silent ARP completion to work implement runs`.

### Slice 2: Verified fixes and new-head re-review
### Task 2: Resolve findings and independently verify fixes before re-review
**Delivers:** The complete bounded review-and-fix loop, including false-positive dismissal and verified new-head publication.
**Blocked by:** Task 1
**Traces to:** R3, R4, R5
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/_completion.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_completion.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_protocol.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_bridge.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_conductor.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_prompts.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_state.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts`, `dot_pi/agent/exact_extensions/ship-conductor/_fixtures/rpc-driver.ts`, `dot_pi/agent/exact_prompts/arp-review.md`, `dot_pi/agent/exact_prompts/arp-fix.md`, `dot_pi/agent/exact_prompts/pr-publish.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/arp-prompts.test.mjs`.

- [ ] Add failing tests for valid/invalid/ambiguous findings, old-head unresolved findings, unchanged dismissal-only results, verified fix publication, writer independence, failed verification, partial settlement, candidate drift, and the third-head stop.
- [ ] Implement bounded structured finding handoff (`findingId`, `filePath`, `startLine`, `endLine`, `reviewedSha`, `summary`), immediate `invalid` false-positive settlement (`settledFindingIds`) in `arp-review`, and the orchestrated-only `arp-fix` child returning `commitRefs` and pending settlements (`findingId`, `fixCommitSha`, `fixChangeSummary`, `reason`). Verify the full feature against pinned requirements in a fresh `verify.md` child supporting feature-scope completion configs after each fix; preserve all relevant writer identities.
- [ ] Publish only after verification passes and candidate comparison succeeds. Pass verified pending settlements into the post-publish `arp-review` config so it calls `agentic_review_resolve_finding(resolution="addressed", ...)` with verified commit references before inspecting the new head. Handle partial failures by recording `settledFindingIds` and re-reading state, not contradictory permanent writes.
- [ ] Re-enter exact-head silent review after publication, at most three reviewed heads total. Do not make a fix on the third reviewed head when that would require an unavailable fourth review. Avoid empty commits and redundant reviews when only dispositions change.
- [ ] Extend `_fixtures/rpc-driver.ts` (via `pi.registerTool`) and `_rpc.test.ts` to prove fix, fresh verify, push, settlement, and re-review ordering and negative paths without network writes. Run both focused commands and LSP diagnostics; expect passing tests.
- [ ] Commit with `feat(pi): automate verified ARP fixes and re-reviews`.

### Task 3: Document operation and inspect future-agent guidance
**Delivers:** Accurate user and maintainer instructions for automation, bounds, failures, and rollback.
**Blocked by:** Task 2
**Traces to:** R1-R5 and confirmed documentation requirement
**Files:** `dot_pi/agent/exact_extensions/ship-conductor/README.md`, `AGENTS.md`, `dot_pi/agent/AGENTS.md`.

- [ ] Update the README with work/personal behavior, invocation authorization, stage order, the three-head/20-minute limits, authentication failure, remote-review cancellation limits, partial resolutions, and recovery commands.
- [ ] Inspect both listed `AGENTS.md` files; add only durable lifecycle contract or testing traps, or record why no change is needed. Do not duplicate prompt-owned judgment policy.
- [ ] Review changed prompt descriptions and command help for consistency. Ensure no text claims production behavior that only fixtures establish.
- [ ] Commit with `docs(pi): document automatic ARP completion` when documentation changes are required.

### Task 4: Final verification
**Delivers:** Feature-level evidence that automation satisfies the confirmed scope without weakening existing lifecycle safety.
**Blocked by:** Task 2 and Task 3
**Traces to:** R1-R5
**Files:** All implementation files above; `plans/implement-arp/plan.md` as the evidence ledger.

- [ ] Run `npm ci --ignore-scripts` in `dot_pi/agent` if not already current, then both focused commands, `npm test`, and `npm run test:all`. Keep dependencies until all gates and independent `/verify` finish; remove `dot_pi/agent/node_modules` afterward as repository guidance requires.
- [ ] Execute the disposable-worktree smoke from Test Strategy with candidate prompts/extensions and isolated remote boundaries. Record setup, invocation, observed typed transitions, cancellation outcome, and cleanup. Do not run unsigned commits or bypass approval/signing checks outside isolated test fixtures.
- [ ] Establish production ARP evidence with an explicitly authorized suitable draft PR, or stop delivery and ask the user to accept the real-service evidence gap. Do not interpret mocked success as live MCP proof.
- [ ] Verify work/personal rendering and explicit target diffs using `chezmoi --source "$PWD"`; run `git diff --check` and confirm only intended changes. Apply only after independent `/verify`, with the live-evidence gap resolved or accepted. Commit/push according to repository completion rules.
- [ ] Record commands, outcomes, omissions, and exact verified candidate in the ledger; do not create an empty evidence-only commit unless required ledger changes exist.

## Learning candidates
- 2026-11-17: Running `node --experimental-strip-types --test 'exact_extensions/ship-conductor/*.test.ts'` in a fresh `dot_pi/agent` worktree fails with `ERR_MODULE_NOT_FOUND` unless `npm ci --ignore-scripts` runs in Task 1, and fails `assertPi150` in `_rpc.test.ts` when global `pi` is newer than `1.5.0` unless `PATH="$PWD/node_modules/.bin:$PATH"` prepends the lockfile-pinned Pi binary — evidence: `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts:174` and `dot_pi/agent/package-lock.json:558`.
