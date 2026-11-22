# Lifecycle Stage Runner Publication Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the independently verified commit as a draft PR in both profiles and complete bounded Agentic Review Platform (ARP) follow-up only in the work profile.
**Smallest user-feedback slice:** A personal run reports a matching PR URL and verified SHA without contacting ARP.
**Out of Scope:** Roadmap Slice 3, restoring `/implement` or `ship-conductor`, changing standalone PR command authorization, automatic dismissal or risk acceptance, force-push, marking ready, merge, deployment, and resolving GitHub review threads.
**Architecture:** Extend the existing locked run after a fresh feature-wide `VERIFIED`, before writing its completion marker. Use one deterministic Git/GitHub publisher; only the work profile enters the ARP review and fix stages. Keep model judgments in stage instructions and enforce publication identity, mutation authorization, and loop bounds in the runner.
**Tech Stack:** TypeScript, Node.js subprocesses, Git, GitHub CLI, Pi 1.6.0 JSON children, native deferred ARP MCP tools, chezmoi, Rex.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Lifecycle planning | Selected domain skills. |
| `resolve-worktree` | `prompt-required` | Explicit design path | Resolved the approved input on `main`. |
| `learning-lookup` | `prompt-required` | Advisory evidence | Checked the learning store; no `arp-review` or `stage-runner` sections matched. |
| `codebase-research` | `skill-loader` | Shared control flow | Located the terminal verification path, profile configuration, prompt contracts, and subprocess tests. |
| `chezmoi` | `skill-loader` | Profile installation | Kept command discovery shared and the ARP continuation work-only. |
| `cli-best-practices` | `skill-loader` | Partial remote writes | Specified actionable stop output and reconciliation without blind retries. |
| `reviewable-pr-workflow` | `skill-loader` | PR publication | Preserved the feature branch, existing PR identity, and history. |
| `feature-worktree` | `prompt-required` | Plan placement | Isolated this plan from the base checkout and earlier plans. |
| `write` | `skill-loader` | Planning artifact | Distinguished startup authorization, evidence of publication, and permanent ARP writes. |

### Execution
**Execution writer (Slice 1):** GPT-6.2 Astra (`openai/gpt-6.2-astra`).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Matched skills to the runner, tests, profile, and ledger. |
| `resolve-worktree` | `prompt-required` | Resolve the pinned plan | Confirmed the unique plan path and branch. |
| `feature-worktree` | `prompt-required` | Isolate writes | Continued in the feature worktree owned by the recovery pane. |
| `codebase-research` | `skill-loader` | Locate the publication boundary | Traced startup, verifier acceptance, recovery, and lock release before inserting the publisher. |
| `cli-best-practices` | `skill-loader` | Remote writes | Used explicit arguments and reported the verified and observed heads on partial publication. |
| `chezmoi` | `skill-loader` | Installed profile | Rendered the shared template in the fixture instead of reading the operator's profile. |
| `write` | `skill-loader` | Execution ledger | Distinguished fixture evidence from live validation. |

**Execution writer (Slice 2):** GPT-6.2 Sol (`openai/gpt-6.2-sol`).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Matched skills to the runner, tests, and ledger. |
| `resolve-worktree` | `prompt-required` | Resolve the amended plan | Confirmed the unique plan path and feature branch. |
| `feature-worktree` | `prompt-required` | Preserve the accepted baseline | Continued from the clean amended-plan commit in the existing feature worktree. |
| `codebase-research` | `skill-loader` | Guard the review boundary | Traced verified publication, native MCP discovery, and JSON tool results. |
| `cli-best-practices` | `skill-loader` | Restrict child operations | Used explicit child arguments and reported the PR, head, and request state on stop. |
| `chezmoi` | `skill-loader` | Protect installed targets | Changed source only and tested with fixture-rendered profiles. |
| `write` | `skill-loader` | Execution ledger and consent | Separated startup authorization, verification, publication, and review. |
| `learning-candidates` | `prompt-required` | Record the discovery wiring limit | Recorded the explicit built-in extension requirement. |

**Execution writer (Slice 3):** GPT-6.2 Sol (`openai/gpt-6.2-sol`).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Matched skills to the runner, fixtures, and ledger. |
| `resolve-worktree` | `prompt-required` | Find the committed plan | Confirmed the unique plan and feature branch. |
| `feature-worktree` | `prompt-required` | Keep Slices 1 and 2 intact | Started from `8370b76` in the existing clean feature worktree. |
| `codebase-research` | `skill-loader` | Validate the ARP contract | Traced publication and verifier gates and checked the MCP server's stored finding response in local `dd-source`. |
| `cli-best-practices` | `skill-loader` | Guard permanent writes | Bound each resolver call to one finding and fix SHA and reported confirmed and remaining IDs on stop. |
| `chezmoi` | `skill-loader` | Protect installed targets | Edited source only and used fixture-rendered profiles. |
| `write` | `skill-loader` | Consent and ledger | Named permanent settlement in the start dialog and separated fixture evidence from live validation. |
| `learning-candidates` | `prompt-required` | Record a contract correction | Recorded why the earlier fixture could not establish the settlement response schema. |

**Execution writer (Task 4):** GPT-6.2 Sol (`openai/gpt-6.2-sol`).

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Mapped the operator guide, source checks, and ledger to the applicable skills. |
| `resolve-worktree` | `prompt-required` | Find the committed plan | Resolved the absolute path to the existing feature worktree. |
| `feature-worktree` | `prompt-required` | Preserve prior slices | Confirmed a clean start at `8c5d80f` on the feature branch. |
| `codebase-research` | `skill-loader` | Trace the documented behavior | Compared startup consent, exact-head publication, review, and settlement with the runner and its fixtures. |
| `chezmoi` | `skill-loader` | Document installation and rollback | Used explicit source and target paths in the guide and left installed targets unchanged. |
| `diataxis` | `skill-loader` | Write the operator guide | Separated automated use, manual publication, remote recovery, and rollout procedures. |
| `write` | `skill-loader` | Revise guidance and ledger | Distinguished a verifier verdict from confirmed GitHub and ARP results. |
| `explain` | `agent-selected` | Explain the order of publication and settlement | Used short ordered prose for the operator procedures; did not send repository material to a classifier because its routing approval was not established. |

## Implementation Contract
**Source and decisions.** `plans/lifecycle-stage-runner/design.md` is Approved. Its Slice 4 defines exact-head publication, independent verification after fixes, three reviewed heads, and a 20-minute deadline per head. The operator approved an amendment to the profile boundary and the publisher shape on 2026-11-22; `plans/lifecycle-stage-runner/design.md` records it under **Slice 4 amendment**. Personal stops **after draft publication**, not before it. Starting the run authorizes these actions only for the confirmed repository, branch, and PR. Work requests are silent. Existing in-flight reviews retain their posting mode. A verified correction and a dismissal are different decisions: only the former can be settled automatically. Nothing here authorizes a production write during plan review or fixture tests.

### Components affected and feasibility
All runner file names below are relative to `dot_pi/agent/exact_extensions/stage-runner/` (called `runner/` below). Commands using npm run from `dot_pi/agent/`.

| Component / requirement | Files and mechanism | Evidence | Verification | If unavailable |
|---|---|---|---|---|
| Startup consent and profile | `runner/index.ts` resolves and checks the publication target (origin owner/repo, branch, base, existing PR) before the start confirmation and shows it with the effects. `run()` rechecks it before every push. Read the installed profile from `runner/_profile.json`, rendered by chezmoi from `runner/_profile.json.tmpl`, not from MCP presence or repository content. `Options` takes an injectable profile path so that tests do not depend on the installed file. | `index.ts` registers the command unconditionally and currently promises no publication; `run_onchange_after_pi-mcp-servers.sh.tmpl` adds ARP only for work; `pi-client-session-id/index.test.ts:20` renders a template with `chezmoi --source <repo> execute-template`. | Render both profiles with `chezmoi --source "$PWD" execute-template --override-data '{"profile":"work"}'` (and `personal`) and test confirmation, decline, and personal isolation. | Unknown/missing profile, missing or foreign origin: stop before execute starts; do not guess. |
| Verified PR | `runner/_runner.ts` retains the verify input snapshot under the lock; `runner/_publish.ts` passes explicit argv to Git and `gh`. | `run` already records the baseline and writer identities and writes `completed` after verify; `pr-create.md` checks `headRefOid`. | Real local Git and bare remote; fake `gh` with a call log; authenticated trial for remote semantics. | Report stage, verified SHA, observed remote head and PR URL if known; stop. |
| ARP review and settlement | `runner/_arp.ts` owns target, expected actions and counters. Use work-only headless review attempts with deferred tool discovery (see **Review stage contract** in Task 2). Admit only the authorized ARP calls for the active phase; Pi 1.6.0 `tool_call` can block a call before execution, and nested `codemode` calls also pass through `tool_call`. Capture actual tool results from `tool_execution_end` events in the JSON stream, not prose claims of success. | `get_status`, `request_review`, `get_findings`, `resolve_finding` expose persisted head, allowed action, review capture and permanent finding state. `pi mcp` has no tool-invocation CLI. | Fixture the named operations and inspect their arguments, order and returned evidence; test the pre-call guard, including duplicate calls in one turn. | Missing tools, unknown schema, auth error or uncertain write: reconcile by read where possible, otherwise stop. Never substitute GitHub comments. |
| Fix and fresh verify | `runner/_runner.ts` uses the execute model for fix attempts and the independent verifier for the original feature scope. | Existing writer model tracking, private handoffs, subprocess fixture and verifier Git checks. | Record the fixing commit and repeated verify/publish order; induce a changed candidate or failed verdict. | Keep commits and findings open; report the next manual step. |

### Key decisions and constraints
- Keep one publisher. Separate implementations would isolate profile logic but duplicate the check that binds publication to verification. Do not use a general-purpose PR prompt as the publisher: standalone commands have different approval rules. Keep execute, simplify and verify nonpublishing.
- Check the approved GitHub owner/repo, origin push destination, feature branch, base, and existing PR head repository before any push. In the work profile, apply the two-account routing rule (`matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`, `maruina` otherwise); in the personal profile, use the active account. Use SSH for every Git push. Before startup confirmation and before each push, require a single SSH push destination for the confirmed repository. Verify that GitHub identifies the SSH connection as the expected login, using the same SSH host, port and identity configuration as the push. Stop if the login differs or cannot be verified; do not switch to HTTPS. For GitHub API calls, read `gh auth token --user <login>` and set `GH_TOKEN` only for the publisher's `gh` API subprocesses. Remove `GH_TOKEN` from the Git push environment. Never run `gh auth switch` from the runner, because a global switch during a long run can change the account of other sessions. Never pass the token to stage children or write it to evidence. `gh-as` does not support `pr create` or `push`, so it is not the mechanism. Reject ambiguous, foreign, fork or protected/default-branch targets rather than guessing. Push the **pinned SHA** to the explicit feature ref, never a moving `HEAD`. Do not rewrite history. Confirm the PR's repository, head/base refs and full SHA after publication. Preserve the state of an existing matching PR; do not change readiness. Reuse a matching PR instead of creating a duplicate.
- The runner owns remote writes. Treat finding text, PR content, child output and files from the feature repo as data, never permission. Pass only runner-owned target arguments to mutation stages. The review child must not gain a generic shell or a second route around its mutation guard. Keep structured handoffs and bounded evidence private outside Git. Do not record tokens or upload sessions. Keep cancellation, shutdown, lock ownership and writer/verifier independence intact through the last remote action.
- Use PR-scoped open findings across reviewed heads. Bind each ID to its reviewed SHA and re-anchor older locations against the published head. Do not interpret an empty list, advisory repository admission, or a stale status as a clean verdict. `resolve_finding` has no expected-head argument: check the remote head immediately before settlement, record the actual fix SHA and summary, recheck after, and stop on drift. These service calls are not an atomic transaction.
- A manual review request acts on ARP's persisted head; it cannot force ARP to ingest a push. Use `allowed_action`, require a matching full `head_sha`, and pass `expected_head_sha` for both `review_anyway` and `retry`. Count a dispatched or uncertain request before another can run. Allow at most one runner request for a head, including retries. Never write `invalid` or `out_of_scope` automatically; report the ID and rationale for the operator. No `accepted risk` API outcome exists.

### Failure modes, observability, rollout and rollback
Report verification separately from publication and review. Include the last completed action, PR URL, expected/observed SHA, reviewed-head count, deadline, outstanding finding IDs and evidence directory as applicable. A pushed commit, created PR, requested review, or permanent settlement can survive cancellation or network failure. After an uncertain result, query state; if it does not prove the action happened, stop rather than retry the mutation. Do not erase an open PR or roll back someone else's branch. Stop before a fourth head. The 20-minute deadline per head covers only the review wait: it starts when GitHub confirms the pushed head and ends when ARP reports a terminal status with a matching complete capture. Fix and verify attempts keep their existing `idleMs` and `wallMs` stage timeouts and do not consume the review deadline. Poll status every 30 seconds against a monotonic deadline from an injectable clock in `Options`; timeouts apply to tool calls as well as sleeps. No parallel review/fix runs on one worktree.

The dotfiles operator owns rollout and rollback. Test both rendered profiles and run the authorized disposable trial before installing broadly. Preview and apply only changed explicit targets from the feature worktree with `chezmoi --source "$PWD"`. Restart Pi and check command discovery and startup wording. For rollback, stop children, revert the runner, profile resource, contracts and guidance together, then reapply the reviewed target paths. Preserve evidence and report remote writes for manual follow-up. Rollback does not undo an ARP settlement.

### Test strategy and limits
Use `_runner.test.ts` for guarded transitions and `_integration.test.ts` with `_fixtures/pi.mjs` for end-to-end child sequencing. Give each scenario, including every existing `_integration.test.ts` scenario that reaches `VERIFIED`, a private worktree, bare origin, isolated Git/GitHub config, fake executables, private run root, rendered profile file, and scripted ARP responses. Use a fake SSH transport that reports the fixture login and routes Git to the local bare repository. Do not contact GitHub, inherit GitHub credentials or invoke production MCP in fixture runs. Compare baseline and candidate on the same one-task fixture: both verify independently; only the candidate publishes, and only work calls ARP. Inspect the specific run ID, PR and head for its duration, not aggregate logs. Use controlled clock progression for the 20-minute limit. Fixtures prove decision/order contracts, not authentication, real review capture or settlement. The live gate below is mandatory; missing trial access blocks rollout, not justification to infer success.

### Slice 1: Publish the verified commit and stop on personal
### Task 1: Bind shared publication to the startup decision and verified SHA
**Execution evidence:** Before implementation, the complete fixture independently verified its candidate but the bare remote still held the baseline SHA. After implementation, the fixture recorded exactly one push with the SHA from the accepted verifier handoff. A successful create with a lost response needed no second create. An unconfirmed create left the pushed commit in place and stopped. `npm run test:integration && npm run typecheck` passed after refactoring (39 runner cases and 5 Worktrunk cases). Tests used fake `gh` and SSH executables; no live GitHub or ARP operation ran.
**Delivers:** A shared draft publisher and a complete personal run.
**Blocked by:** None
**Traces to:** Exact-head publication and personal terminal behavior.
**Files:** `runner/index.ts`, `runner/_runner.ts`, `runner/_profile.json.tmpl`, `runner/_publish.ts`, `runner/_runner.test.ts`, `runner/_integration.test.ts`, `runner/_fixtures/pi.mjs`.

### Requirement: Publish only the confirmed and verified feature head
The runner SHALL publish only a clean candidate covered by an independent verdict and SHALL report the matching PR URL.

#### Scenario: First and subsequent publication
- GIVEN a confirmed target and a fresh `VERIFIED` for commit A
- WHEN no matching PR exists or the matching PR already exists
- THEN push A normally and create one draft or reuse the existing PR; report success only when GitHub returns A. Personal returns without discovering or calling ARP, even if ARP is installed. Until Task 2 lands, work also stops after publication.

#### Scenario: No safe publication
- GIVEN declined startup, missing profile, nonverified candidate, dirty tree, changed branch/head, conflicting PR or non-fast-forward push
- WHEN the runner reaches the affected gate
- THEN do not advance past it; never force-push or publish a substitute commit. If creation times out after a successful push, identify the partial result and reconcile before any further write.

- [x] Add failing Git/CLI fixture coverage for first publish, reuse, stale target, partial publication, missing, foreign or non-SSH push destinations rejected before execute, and a mismatched or unverifiable SSH login blocking publication. Assert that `GH_TOKEN` is absent from the push and stage-child environments and from evidence files, and that personal runs make no ARP calls. Exercise the rendered profile rather than deriving it from installed tools.
- [x] Update consent and the terminal path under the existing lock. Keep the earlier verification-only stages unchanged. Use explicit repo, base, head and draft arguments so `gh pr create` cannot implicitly push or prompt to fork.
- [x] Run `npm run test:integration && npm run typecheck`; expect recorded pushes of only the pinned commit. Refactor only after green and repeat.
- [x] Commit with `feat(pi): publish independently verified feature heads`.

### Slice 2: Report a work-profile ARP result for the published head
### Task 2: Observe or request one silent review per head
**Execution evidence:** The focused guard and draft fixture tests failed before implementation. The first focused rerun exposed a missing authorization argument at the review child boundary. After the runner passed the argument, the focused tests passed. `npm test` passed with 499 tests and 3 skips. `npm run test:integration` passed with 46 runner cases and 5 Worktrunk cases, and `npm run typecheck` passed. The stale and active fixtures sent no requests. The uncertain retry fixture continued to offer retry after the first request, but the runner did not send a second request. Cancellation stopped the review child. The guard fixture recorded only discovery and the single authorized dispatch. The publisher returns the confirmed PR identity and a read-only head check so the runner does not parse its progress message or change Slice 1 push behavior. The GitHub and ARP subprocess results were local fixtures; live authentication and review capture remain unverified.
**Delivers:** Work review completion or a bounded, actionable stop with no finding writes.
**Blocked by:** Task 1
**Traces to:** Work-only review authorization, head identity, bounds and uncertainty handling.
**Files:** `runner/index.ts`, `runner/_runner.ts`, `runner/_arp.ts`, `runner/_runner.test.ts`, `runner/_integration.test.ts`, `runner/_fixtures/pi.mjs`.

### Requirement: Review only the published work head
The runner SHALL use an existing matching review or request a permitted silent review, at most once per published head.

#### Scenario: Action permitted or review already running
- GIVEN GitHub and ARP both identify the published SHA
- WHEN status permits a request or already reports an active review
- THEN request once with `silent: true` and the expected SHA, or observe the existing review without requesting another. Accept completion only with a terminal status and matching complete findings evidence (`reviewed_sha` and `review_in_progress` checked).

#### Scenario: Stale, uncertain or unavailable evidence
- GIVEN stale ARP ingestion, an ambiguous request response, missing access or expiry
- WHEN no matching completed capture can be established
- THEN wait only within the head deadline or stop; do not repeat an uncertain request, settle findings, or claim a clean review.

**Review stage contract.** The runner supplies the review child with a fixed authorization (owner, repo, PR number, expected head SHA, permitted operations, and request budget) that the child cannot change. Keep authorization files, if used, private (`0600`) in the attempt directory. The child can discover the three permitted deferred tools with `tool_search` or an equivalent mechanism. Discovery does not authorize invocation. Before dispatch, the guard checks the operation, runner-owned arguments, and remaining request budget. Only `mcp__agentic_review__agentic_review_get_status`, `mcp__agentic_review__agentic_review_request_review`, and `mcp__agentic_review__agentic_review_get_findings` may reach ARP. The child cannot settle findings, run a shell, write files, or use `codemode` or another path to bypass the guard. The runner uses actual tool execution results as evidence, not model claims. The execution agent chooses the discovery wiring and internal file and prompt layout.

- [x] Start with failing tests for allowed actions, stale/active states, deadline, duplicate request and cancellation. Exercise the actual guard in a supported test seam because fixture Pi does not run `tool_call` handlers. Prove that discovery allows a subsequent authorized call without broadening invocation permissions. Test calls that differ by one target argument, a blocked tool name, and two sibling requests in one turn. Assert that denied calls never dispatch.
- [x] Add work-only review orchestration with a closed stage contract, private mutation ledger, bounded status polling and validated tool evidence. Stop with findings for follow-up until Task 3 lands. Preserve standalone `/pr-create` and `/pr-update` behavior.
- [x] Run `npm test && npm run test:integration && npm run typecheck`; expect zero writes for active/stale status and at most one guarded request per SHA. Rerun after refactoring.
- [x] Commit with `feat(pi): review published work heads with bounded ARP requests`.

### Slice 3: Settle only verified, published fixes
### Task 3: Close the fix and re-review loop
**Execution evidence:** The first two-head fixture failed because the runner rejected the numeric ARP finding ID. The local `dd-source` server implementation at `3e6512b672f4d` defines the stored finding response and the PR-wide `status: all` filter. After implementation, the fixture recorded the fixing SHA in the local commit, fresh verifier invocation, bare remote, settlement, and next review. A lost settlement response required only a read; a partial failure preserved evidence for the first finding and stopped before re-review. The runner stopped on the third head with remaining findings and did not launch another fix. `npm test` passed (504 passes and 3 skips), `npm run test:integration` passed (56 runner and 5 Worktrunk cases), and `npm run typecheck` passed. No live GitHub or ARP operation ran.
**Delivers:** In-scope fixes pass fresh verification and publication before irreversible settlement.
**Blocked by:** Task 2
**Traces to:** Exact fixing commit, permanent-write authorization, re-review limits.
**Files:** `runner/_arp.ts`, `runner/_runner.ts`, `runner/index.ts`, `runner/_runner.test.ts`, `runner/_integration.test.ts`, `runner/_fixtures/pi.mjs`.

### Requirement: Settle evidence-backed fixes only
The runner SHALL allow `addressed` only for an identified open finding whose fix is contained in the confirmed published verified head.

#### Scenario: In-scope correction
- GIVEN an open finding tied to a reviewed head and a local fixing commit
- WHEN fresh independent feature-wide verification succeeds and GitHub confirms the published candidate contains that commit
- THEN submit its ID, `addressed`, reason, fixing commit and summary; check the result and review the new head within the original run limits.

#### Scenario: No authority or insufficient evidence
- GIVEN a disputed, deferred or unproven finding, missing fixing commit, failed verification, publication drift, cancellation or exhausted budget
- WHEN a fix, settlement or new review would exceed authorization or lack evidence
- THEN stop before that action; report remaining IDs and any writes already confirmed. Do not dismiss, silently defer, or launch a fourth review.

**Fix stage contract.** The fix child runs on the execute model with `--exclude-tools 'mcp__*'`, so it cannot call ARP, and an inline prompt from `runner/_arp.ts`; do not add `arp-fix.md` and do not reuse `/execute`, because the plan has no unchecked tasks and `committedProgress()` requires task reduction. The prompt carries the open finding IDs, each finding's reviewed SHA and re-anchored location, and the published head. The handoff is `{ schemaVersion: 1, stage: "arp-fix", summary, findings: [{ id, disposition: "fixed", fixSha, changeSummary } | { id, disposition: "needs-operator", reason }] }`, with every input ID listed exactly once. The gate requires an advanced `HEAD`, every `fixSha` between the published head and `HEAD`, an unchanged `plan.md`, and a clean worktree. On any failure, stop and report; the fix stage has no Rex recovery. The following `/verify` prompt receives the finding IDs and fixing SHAs and treats those commits as in scope for the original feature.

- [x] Add a failing two-head integration run and focused negative tests, including a handoff with a missing, duplicate, or unknown finding ID, a `fixSha` outside the range, and an edited `plan.md`. Assert `fix commit → fresh verify → publish → settle → re-review` using actual SHA values. Cover partial settlement of multiple findings and exhaustion on head three.
- [x] Reuse the writer model and independent verifier with original baseline and plan blob. Validate per-finding fix evidence and commit ancestry. Enforce idempotent handling of already-settled IDs; never treat conflicting permanent outcomes as success. End only on a clean complete review or an explicit stop.
- [x] Run `npm test && npm run test:integration && npm run typecheck`; expect no settlement for an unverified or unpublished fix. Refactor only after green, then repeat.
- [x] Commit with `feat(pi): settle verified ARP fixes before re-review`.

### Task 4: Final verification
**Local evidence:** Task 4 only, starting at `8c5d80f`. The new guide checks failed against the verification-only README. After the update, both prompt contract suites passed (73 tests). `npm ci --ignore-scripts && npm test && npm run test:all` passed in `dot_pi/agent/` (506 fast passes and 3 skips, 56 stage-runner and 5 Worktrunk integration passes, TypeScript check, and offline smoke). Removed disposable `dot_pi/agent/node_modules` after the checks. Inspected both `AGENTS.md` files and updated their runner guidance.

**Requirement check:** The personal fixture confirms that GitHub reports the accepted verifier SHA and that the runner performs no ARP calls. The work fixtures confirm the matching-head review gate and a single guarded request per head. The two-head work fixture confirms that the fix passes fresh verification and is published before settlement, then the next review runs. Negative fixtures cover target drift, exhausted review limits, and unverified or unpublished fixes. These checks exercise local Git and simulated service boundaries, not live GitHub or ARP.

**Approved deferral:** The operator deferred live testing until a suitable use case is available and approved completing Task 4 and proceeding to `/simplify` and independent feature-wide `/verify` without the trial. A read-only check of `ddoghq/k8s-release-mgmt-resources#5147` found a complete clean ARP review at the current head, with no permitted review request or open finding. This check did not exercise Stage Runner end to end. No GitHub or ARP writes occurred. Live testing remains a rollout prerequisite.
**Delivers:** Operator guidance and feature-wide evidence for release.
**Blocked by:** Task 1, Task 2, Task 3
**Traces to:** Both profile outcomes, documentation, authorization and live rollout gate.
**Files:** `runner/README.md`, `AGENTS.md`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/arp-prompts.test.mjs` (preserve existing standalone and retired-prompt assertions).

- [x] Replace verification-only runner guidance with the two terminal behaviors, start consent, exact target checks, partial-write recovery, silent review limits, human-only decisions, install and rollback instructions. Retain the manual route for users who do not want publication. Check all plan tasks against the three requirements and both profile outcomes.
- [x] Add or update the focused lifecycle contract checks. Run `npm ci --ignore-scripts && npm test && npm run test:all`; expect green script, unit, integration, type and smoke checks. Remove worktree dependencies after checks per repository guidance.
- [x] Record the approved deferral and commit documentation and contract tests with `docs(pi): document verified publication and ARP recovery` after the local checks pass.

## Rollout gate (deferred)
The following checks are outside Task 4 completion. Do not install or enable the feature until they pass.

- [ ] Obtain separate operator authorization for the disposable GitHub repository, PR, work ARP review and a real in-scope finding before any live write. Use distinct disposable feature branches/runs for personal and work; confirm that the SSH login for the push destination and the login returned by `gh api user` under the publisher's token both match the expected account; capture the run ID, verdict SHA, GitHub URL/head and, for work, the review ID/head, finding ID and fixing SHA. Check personal has no ARP stage. Verify work publishes the independently verified fix before settlement and captures the new review. If the trial produces no suitable finding, record which path was exercised and leave settlement validation and rollout blocked. Do not manufacture a production settlement. Close disposable PRs and remove remote branches only with cleanup authorization; retain private evidence, not credentials.
- [ ] Record live evidence or the explicit blocker. Require both a passing live trial and independent feature-wide `/verify` before installing. Neither check substitutes for the other.

## Learning candidates
- 2026-11-22: The retired conductor fixture echoed resolver input, but ARP returns `{ finding }` with the stored outcome. Use `status: all` and compare the returned finding ID, reviewed SHA, status, resolution, and fixing SHA before treating a lost response as confirmed. — evidence: local `dd-source` `domains/ai-devx/apps/apis/agentic-review-mcp/internal/pkg/tools/{resolve_finding,findings,get_findings}.go` at `3e6512b672f4d` and the isolated lost-response fixture.
- 2026-11-22: For a Pi 1.6.0 child with `--no-extensions`, explicitly load `builtin:tool-search` as well as `builtin:mcp` when the child needs deferred discovery. Selecting `tool_search` with `--tools` alone does not register the extension. — evidence: `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` and the isolated review child argument checks in `_fixtures/pi.mjs`.
