# Standalone `/arp-review` Command Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/arp-review [--max-heads <N>]` command to the `stage-runner` extension that runs the ARP (Agentic Review Platform) poll, triage-and-fix, push, settlement, and re-review loop on an already-created PR until ARP reports no open findings, a finding requires the operator, or the head cap is reached.
**Smallest user-feedback slice:** `/arp-review` validates arguments and PR preconditions, runs `reviewPublished` on the current PR head, and completes cleanly when ARP reports no open findings. When ARP reports open findings, Slice 1 stops and reports their IDs without a fix attempt; this is the same stop that the `maxHeads` cap produces after head 1, so the Slice 1 test uses `--max-heads 1` and stays valid after Slice 2.
**Out of Scope:** Stacked PRs (PRs whose `baseRefName` is not the repository default branch); PR creation, PR title/body/readiness edits, or GitHub comment posting; automatic `invalid` or `out_of_scope` ARP resolutions; separate independent `/verify` model selection, runner-run repository test commands, or Rex recovery panes; changes to `/stage-runner`, `/stage-runner-design`, `/pr-create`, or `/pr-update` behavior.
**Architecture:** Add a `runArpReview()` entrypoint in `stage-runner`. It shares the worktree lock, private run bundle, and cancellation handling with `supervise()` through an extracted `acquireRun()` helper. It uses `_publish.ts` `inspect()` and `lookup()` for target and PR checks, `publication.publish()` for non-force pushes, and the `_arp.ts` Streamable HTTP MCP review/settlement loop. Register `/arp-review` in `index.ts` with single-model selection, explicit consent for remote writes, and `/stage-runner-cancel` support. Embed the `/pr-address-feedback` adjudication criteria in a dedicated `arpReviewFixPrompt()` so the fix child builds a targeted PR model, fixes and tests sound findings locally, and marks disputed, alternative-approach, already-addressed, or unclear findings `needs-operator` so the runner stops before pushing. The runner trusts the fix child's test report; it does not run repository tests itself.
**Tech Stack:** TypeScript, Pi 1.6.x extensions, Git, GitHub CLI, Node.js test runner.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `feature-worktree` | `prompt-required` | Keep plan and edits off `main` | Created worktree `/Users/matteo.ruina/dd/.worktrees/chezmoi/maruina-arp-review` on branch `maruina/arp-review`. |
| `write` | `agent-selected` | Plan prose; `AGENTS.md` requires `write` for plans | Applied STE wording and explicit causal/failure descriptions. |

### Execution
Slice 1 writer: `openai/gpt-6.2-sol`.

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Select execution guidance | Matched the TypeScript extension, managed source, and documentation scope to the domain skills. |
| `resolve-worktree` | `prompt-required` | Resolve the supplied plan | Confirmed the absolute path belongs to `maruina/arp-review` and checked the pinned commit and plan blob there. |
| `feature-worktree` | `prompt-required` | Keep edits off `main` | Used the existing feature worktree. |
| `codebase-research` | `skill-loader` | Inspect shared runner behavior | Traced run ownership, recovery, publication, ARP review, and fixture boundaries before editing. |
| `chezmoi` | `skill-loader` | Edit managed Pi resources | Limited edits to the source worktree; did not apply them. |
| `write` | `skill-loader` | Update the execution ledger | Recorded evidence and limitations without changing requirements. |

## Decision source
No `design.md` exists. `AGENTS.md` permits starting at `/plan` when the design is clear. Decisions marked "user-confirmed" come from the operator's answers in the `/plan` conversation on 2026-11-24 and in the `/systematic-review` follow-up on the same branch.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Command entrypoint and argument parser | `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_arp-review.ts` | Register `/arp-review` in `index.ts`, call `parseArpReviewArgs()` from `_arp-review.ts` for `--max-heads <N>` (default `5`, min `1`, max `10`), select one model and thinking level, wire confirmation, widget, Rex OSC 7501 status, and `/stage-runner-cancel`. | `_runner.test.ts` argument parser tests; `_index.test.ts` and `lifecycle-prompts.test.mjs` registration checks. |
| Shared run lifecycle | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` | Extract `acquireRun()` (worktree lock, private run directory, `SIGTERM`/`SIGINT` cancellation, lock release, completed marker, `prune()`) from `supervise()` so `run()`, `runDesign()`, and `runArpReview()` use one implementation. | Existing `_integration.test.ts` suite unchanged; one new lock-contention scenario. |
| ARP review loop | `dot_pi/agent/exact_extensions/stage-runner/_arp-review.ts` | Implement `runArpReview()` with `acquireRun()`, `attempt()`, `anchorFinding()`, `acceptFixes()`, `publication.publish()`, and `reviewPublished()`. Run the bounded poll → triage/fix → non-force push → settle → re-review loop. | `_integration.test.ts` subprocess tests with bare remote and fixtures. |
| Shared fix acceptance | `dot_pi/agent/exact_extensions/stage-runner/_runner.ts` | Extract `anchorFinding(git, prev, finding)` and `acceptFixes({ git, prev, candidate, fixes })` from the inline closures in `supervise()` so both runners share path-traversal, ancestry, blob, diff-hunk, and fix-range validation. Handoff parsing (`findingFixes()` or `partitionFindingFixes()`) and the `/stage-runner` check `Fix changed plan.md` stay with each caller. | Existing `arp-fix-*` integration scenarios unchanged; `_runner.test.ts` unit tests. |
| ARP prompt and handoff partitioning | `dot_pi/agent/exact_extensions/stage-runner/_arp.ts` | Add `arpReviewFixPrompt()` embedding `/pr-address-feedback` adjudication rules and `partitionFindingFixes()` so all `needs-operator` reasons are reported together before stopping. Add a required `settlementReason` option to `ReviewOptions` so each caller states the settlement text; `reviewPublished()` sends `reason` as `<settlementReason>: <changeSummary>`. Keep `fixPrompt()`, `findingFixes()`, and the `/stage-runner` text `Independently verified fix:` unchanged. | `_runner.test.ts` unit tests; `_integration.test.ts` settlement assertions. |
| Fixtures | `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs` | Handle `arpReviewFixPrompt()` (start the prompt with `ARP fix.` so the existing fixture branch applies) and mixed `needs-operator` cases. | `_integration.test.ts`. |
| Docs and guidance | `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md` | Document `/arp-review`, its consent, stop reasons, and recovery after a stop between push and settlement. Add a one-line `/arp-review` mention to the lifecycle paragraph. | `lifecycle-prompts.test.mjs`; `npm test`. |

### Key Decisions
- **Reuse `stage-runner` rather than creating a separate extension.** A separate extension would isolate registration. However, it would duplicate lock ownership, cancellation state, and ARP/GitHub hardening, and two lock implementations could let `/stage-runner` and `/arp-review` run in the same worktree at the same time.
- **Single model with `/pr-address-feedback` adjudication instead of an independent `/verify` stage (user-confirmed).** The fix child builds a targeted model of the PR (`base..head`), adjudicates each finding on relevance, correctness, and suggested solution, implements and tests sound fixes locally, and returns `needs-operator` for alternative approaches, pushbacks, already-addressed items, or unclear findings. A second verifier model would catch fixes that the author misjudged, but it adds latency and cost that the operator does not want for standalone PR review loops.
- **Trust the fix child's test report (user-confirmed).** The runner checks the Git range of the fix commits but does not run repository tests. `/arp-review` is responsible for the remote ARP calls and the push; the fix child is responsible for local tests.
- **Keep permanent resolutions limited to `addressed`.** `_arp.ts` only permits `agentic_review_resolve_finding` with `resolution: "addressed"` after the fixing commit is confirmed on the remote PR head. Any finding marked `needs-operator` stops the run before pushing and surfaces all reasons to the operator.
- **Truthful settlement text (user-confirmed).** `/arp-review` settles with `reason: "Author-tested fix: <changeSummary>"` because no independent verifier checks the fix. `/stage-runner` keeps `Independently verified fix: <changeSummary>`. The text is permanent in ARP, so a false verification claim cannot be corrected later.
- **Default `--max-heads 5`, bounded to `1..10` (user-confirmed).** The cap bounds cost and stops the loop when ARP reports new findings on every push. Raising the upper bound requires no code change other than the constant, but each extra head can add up to one fix child run and one 20-minute ARP wait.
- **No stacked PRs (user-confirmed).** Reuse the existing `lookup()` check in `_publish.ts`, which requires `pr.baseRefName === base` (the repository default branch).
- **Reuse `lookup()` instead of changing `inspect()`.** `inspect()` already returns `lookup()`, which yields the open PR's `number`, `url`, and `headRefOid`. Adding PR metadata to `target` would break the `JSON.stringify(target)` comparisons in `publish()` and `pushStartup()` after every push, because `headRefOid` changes.
- **Do not require Rex.** Unlike `/stage-runner` and `/stage-runner-design`, `/arp-review` does not spawn Rex recovery panes, so it does not call `checkRex(pi)`. It still emits OSC 7501 status when running in a terminal that supports it.

### Implementation Constraints
- **Argument parsing:** Accept empty arguments (defaults `maxHeads = 5`) or `--max-heads <N>` (also `--max-heads=<N>`) where `N` is an integer in `[1, 10]`. Reject unknown flags, extra positional arguments, or out-of-range values before model selection or lock acquisition.
- **Preconditions before confirmation:**
  - Clean worktree on a non-default feature branch.
  - `publication.inspect()` succeeds with `target.profile === "work"`, `target.review === true` (`ddoghq/*` or `ddoghq-sandbox/*`), and an open PR (`target.pr !== null`).
  - `remoteHead === originalHead` and `(await lookup()).headRefOid === originalHead`. Stop before confirmation if local commits are unpushed or diverged.
- **Initial head monitoring:** Build `checkHead(signal)` for the initial head from `lookup()`: it fails when the PR URL or `headRefOid` differs from the reviewed head. After a push, use the `checkHead` returned by `publication.publish()`.
- **Confirmation disclosure:** Name the profile, SSH repository, branch, PR URL, current `HEAD` SHA, GitHub login, `maxHeads`, and the authorized remote writes: up to one silent ARP review request per head when ARP permits an action, non-force pushes of tested fix commits, and permanent `addressed` settlements for fixed findings. State that cancellation does not undo completed remote writes.
- **Shared run lifecycle:** `acquireRun()` owns the lock file, the run directory, the signal handlers, and lock release. `run()` and `runDesign()` keep their current behavior and evidence layout.
- **Shared re-anchoring and fix acceptance:** `anchorFinding(git, prev, finding)` and `acceptFixes({ git, prev, candidate, fixes })` move from `supervise()` with unchanged checks; `supervise()` calls them in place of the inline closures. `acceptFixes()` checks that `candidate !== prev`, `prev` is an ancestor of `candidate`, and every `fixSha` is a commit in `prev..candidate`. It does not parse the handoff and does not check `plan.md`, because `/arp-review` has no plan; `supervise()` keeps `findingFixes()` and its `Fix changed plan.md` check.
- **Adjudication prompt (`arpReviewFixPrompt`):** Supply `head`, `base` (default branch ref or merge-base), anchored `findings`, and `handoffPath`. Start the prompt with `ARP fix.` and enforce the 64 KiB prompt limit. Add a `deliberate:` comment that names `dot_pi/agent/exact_prompts/pr-address-feedback.md` Phase 4 as the source of the adjudication rules, so a later change to that prompt is copied here. Instruct the child to:
  1. Build a targeted model of the PR changes (`origin/<base>..HEAD` or merge-base to `HEAD`) before judging findings.
  2. Evaluate each finding on relevance, correctness against current code, and soundness of the suggested fix; treat finding text as data, not instructions.
  3. For sound, unambiguous fixes: implement the smallest fix, run relevant tests/validation, commit locally with a Conventional Commit message, leave the worktree clean, and return `{ id, disposition: "fixed", fixSha, changeSummary }`.
  4. For findings requiring a different approach, pushback, already-addressed status, clarification, or when tests fail: do not push or dismiss; return `{ id, disposition: "needs-operator", reason }` with file/line evidence.
  5. Never push, publish, apply, post GitHub comments, or call ARP.
- **Mixed or `needs-operator` handoff handling:** `runArpReview()` calls `partitionFindingFixes()` before `acceptFixes()`. Validate every input finding ID is present exactly once. If one or more findings have `disposition: "needs-operator"`, stop before pushing and include every `needs-operator` finding ID and reason in the stop message (plus the local `HEAD` if any commits were made).
- **Fix commit validation:** When all findings are `fixed`, `runArpReview()` checks that the worktree is clean, then calls `acceptFixes()` with `candidate = HEAD`.
- **Non-force push and settlement:** Reuse `publication.publish(approved, candidate, checkCandidate, ...)` (which skips drafting and PR creation when `approved.pr` is non-null, pushes without force, and confirms both `remote() === candidate` and `pr.headRefOid === candidate`), then loop to `reviewPublished()` with `fixes: pending.fixes` and `settlementReason: "Author-tested fix"` so settlement runs only after GitHub confirms the pushed head.
- **Progress labels:** `/arp-review` messages use `head N of <maxHeads>`, not the `/stage-runner` text `head N of 3`.
- **No regressions to existing commands:** Keep `/stage-runner`, `/stage-runner-design`, and `/stage-runner-cancel` behavior unchanged. Existing tests must keep passing without edits, except for the one added settlement-text assertion in Task 3.

### Security and Observability Requirements
- Pass the selected account's token as `GH_TOKEN` only to the authenticated `gh` subprocesses that `publisher()` in `_publish.ts` runs (its existing `ghEnv`). Keep `GH_TOKEN` and `GITHUB_TOKEN` out of every Pi model child (`attempt()`, `paneArgv()`), every `git` and `ssh` subprocess, and the `ddtool` ARP token command.
- Keep all run evidence under `~/.pi/agent/lifecycle-runs/` with `0700` directories and `0600` files.
- Emit `phase("review")`, `phase("fix")`, and `phase("publish")` events so the Pi widget and Rex OSC 7501 status show live progress and phase totals.
- Every stop message names the stop reason. It also names the PR URL, the current head SHA, and the affected finding IDs when the runner knows them. A stop that happens before `lookup()` confirms an open PR omits the PR URL, and a stop before any remote call makes no call to find it.

### Failure Modes to Handle
| Failure | Required behavior |
|---|---|
| Invalid `--max-heads` or unknown args | Notify error immediately; no model prompt, no lock, no remote call. |
| Another runner holds the worktree lock | Stop before any remote call; report the lock. |
| Personal profile or non-`ddoghq`/`ddoghq-sandbox` repo | Stop before confirmation; no ARP call, no remote write. |
| No open PR for branch, or stacked PR | Stop before confirmation; no ARP call, no remote write. |
| Local `HEAD` differs from `remoteHead` or `pr.headRefOid` | Stop before confirmation; report local vs remote/PR SHA; no push. |
| Dirty worktree or default branch | Stop before confirmation; no remote call. |
| Operator declines confirmation | Release lock cleanly; no ARP call, no child, no remote write. |
| Fix child marks any finding `needs-operator` | Stop before push; report all `needs-operator` IDs and reasons; no remote write or settlement. |
| Fix child fails, returns invalid handoff, leaves dirty tree, or `fixSha` outside `prev..HEAD` | Stop before push; no remote write or settlement. |
| Head cap (`maxHeads`) reached with open findings | Stop after review capture without launching another fix; report open finding IDs. |
| Cancellation (`/stage-runner-cancel` or shutdown) | Abort active poll/child, release lock, report cancellation; do not attempt to undo already-confirmed remote writes. |
| Stop between a confirmed push and settlement | Report the pushed SHA and the unsettled finding IDs. The findings stay `open` in ARP, so a later `/arp-review` run sends them to the fix child again; the README tells the operator to settle them manually first. |

### Test Strategy
- Unit tests in `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts` for `parseArpReviewArgs`, `arpReviewFixPrompt`, `partitionFindingFixes`, `anchorFinding`, and `acceptFixes`.
- Registration checks in `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` and `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` verifying `/arp-review` is registered.
- Subprocess integration tests in `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts` using the existing bare remote + `_fixtures/pi.mjs`, `_fixtures/gh.mjs` (the `BARE.pr` marker creates the PR before the run), and `_fixtures/ssh.mjs`:
  - Slice 1: clean initial head (0 open findings) → completes with 0 pushes and 0 fix launches; open findings with `--max-heads 1` → stops with their IDs and 0 fix launches; preconditions (personal profile, non-ddoghq org, missing PR, stacked PR, unpushed local commit, dirty worktree, held lock, declined confirmation) → stop with 0 pushes and 0 ARP calls.
  - Slice 2: review → fix → push → settle → clean re-review → completes; `needs-operator` (single and mixed) → stops before push with all reasons reported and 0 remote pushes; `fixSha` outside `prev..HEAD` → stops with 0 pushes; `--max-heads` cap reached → stops with open finding IDs and no extra fix launch.
- The existing `/stage-runner` integration scenarios (including all `arp-fix-*` cases) must pass unchanged after each extraction.
- Verification commands (run from `dot_pi/agent`):
  - `node --test exact_extensions/stage-runner/_runner.test.ts exact_extensions/stage-runner/_index.test.ts`
  - `node --test exact_extensions/stage-runner/_integration.test.ts`
  - `npm test && npm run typecheck`
  - Final: `npm ci --ignore-scripts`, `npm test`, `npm run test:all`, then remove `node_modules`.

### Rollout and Rollback
- **Rollout:** Apply after independent feature-wide `/verify`. The live trial in `## Post-publication validation` is optional for this release (operator waiver); fix forward any issue found in live use.
- **Rollback:** Stop active runs, confirm child exit, revert the `/arp-review` commits, run `chezmoi diff` and `chezmoi apply` only for the changed target files under `~/.pi/agent/extensions/stage-runner/`, `~/.pi/agent/scripts/lifecycle-prompts.test.mjs`, and `~/.pi/agent/AGENTS.md` (name each file, because a directory target can hide drift), and restart Pi. `/stage-runner` keeps working because the extracted helpers keep their behavior.

## Acceptance criteria
### Requirement: Parse `/arp-review` arguments
The command SHALL accept no arguments (defaulting `maxHeads` to `5`) or `--max-heads <N>` / `--max-heads=<N>` for integer `N` in `1..10`, and reject invalid input before model selection or locking.

#### Scenario: Default and valid `--max-heads`
- GIVEN `/arp-review` or `/arp-review --max-heads 3` or `/arp-review --max-heads=10`
- WHEN arguments are parsed
- THEN `maxHeads` resolves to `5`, `3`, or `10` respectively.

#### Scenario: Invalid arguments (negative)
- GIVEN `/arp-review --max-heads 0`, `/arp-review --max-heads 11`, `/arp-review --max-heads abc`, or `/arp-review --unknown`
- WHEN arguments are parsed
- THEN parsing throws an actionable error and no lock or remote call occurs.

### Requirement: Enforce PR and profile preconditions before confirmation
The runner SHALL require a clean worktree on a non-default branch, the `work` profile, a `ddoghq/*` or `ddoghq-sandbox/*` repository, an existing open PR targeting the default branch, and `HEAD === remoteHead === pr.headRefOid`.

#### Scenario: Unpushed local commit blocks before confirmation (negative)
- GIVEN an open PR whose `headRefOid` lags local `HEAD` by one commit
- WHEN `runArpReview()` starts
- THEN it stops before calling `confirm()`, with zero pushes and zero ARP calls.

#### Scenario: Personal profile or non-work org blocks before confirmation (negative)
- GIVEN `profile: "personal"` or a `DataDog/*` repository
- WHEN `runArpReview()` starts
- THEN it stops before calling `confirm()`, with zero pushes and zero ARP calls.

#### Scenario: Stacked PR, dirty worktree, or held lock blocks (negative)
- GIVEN an open PR whose base is not the default branch, an untracked file in the worktree, or a lock held by another runner
- WHEN `runArpReview()` starts
- THEN it stops before calling `confirm()`, with zero pushes and zero ARP calls.

### Requirement: Review the current head
The runner SHALL call `reviewPublished()` for the current PR head and complete with `"ARP complete"` when ARP reports zero open findings.

#### Scenario: Clean initial head
- GIVEN an open PR at `head1` and ARP reports zero open findings for `head1`
- WHEN `runArpReview()` runs
- THEN it completes with zero pushes and zero fix launches.

### Requirement: Loop review, triage/fix, push, and settlement until clean
The runner SHALL invoke `arp-fix` with the `/pr-address-feedback` adjudication prompt when open findings exist, push tested fix commits without force, settle fixed findings as `addressed` after GitHub confirms the head, and re-review until ARP reports zero open findings or `maxHeads` is reached.

#### Scenario: One fix round reaches clean review
- GIVEN an open PR at `head1` where ARP returns one open finding, the fix child commits a fix `head2` and returns `disposition: "fixed"`, and ARP reports zero open findings for `head2`
- WHEN `runArpReview()` runs
- THEN `head2` is pushed without force, the finding is settled as `addressed` with `fix_commit_sha: head2` and a `reason` that starts with `Author-tested fix:`, and the run completes with `"ARP complete"`.

#### Scenario: Finding marked `needs-operator` stops before push (negative)
- GIVEN ARP returns two open findings and the fix child marks one `fixed` and one `needs-operator` (or both `needs-operator`)
- WHEN `runArpReview()` processes the handoff
- THEN it stops without pushing or settling any finding, and the error reports every `needs-operator` finding ID and reason.

#### Scenario: Fix commit outside the fix range stops before push (negative)
- GIVEN the fix child returns a `fixSha` that is not in `prev..HEAD`
- WHEN `runArpReview()` processes the handoff
- THEN it stops with zero pushes and zero settlements.

#### Scenario: Head cap stops the loop
- GIVEN `maxHeads: 2` and ARP continues to report open findings on head 2
- WHEN `runArpReview()` completes review of head 2
- THEN it stops without launching a second fix, reporting the head limit and remaining open finding IDs.

---

## Tasks

### Slice 1: Review the current PR head and stop or complete
### Task 1: Extract the shared run lifecycle
**Execution:** All 113 existing subprocess integration scenarios passed. TypeScript type checking and `git diff --check` passed.
**Delivers:** One lock, run-directory, and cancellation implementation that `/arp-review` can reuse.
**Blocked by:** None
**Traces to:** Implementation Constraints "Shared run lifecycle".
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`

- [x] Extract `acquireRun()` from `supervise()` (lock file, run directory, `SIGTERM`/`SIGINT` handlers, completed marker, `prune()`, lock release) without changing `run()` or `runDesign()` behavior. No new failing test is practical, because this is a behavior-preserving extraction; the existing integration suite is the regression check.
- [x] Run `cd dot_pi/agent && node --test exact_extensions/stage-runner/_integration.test.ts && npm run typecheck` and require all existing scenarios to pass.
- [x] Commit with `refactor(pi): extract stage-runner run lifecycle`.

### Task 2: Add `/arp-review` with preconditions and a single review
**Delivers:** A usable `/arp-review` that reviews the current head, completes when clean, and stops with finding IDs when findings are open.
**Blocked by:** Task 1
**Traces to:** Requirements "Parse `/arp-review` arguments", "Enforce PR and profile preconditions before confirmation", "Review the current head".
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_arp-review.ts`, `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_extensions/stage-runner/README.md`, `dot_pi/agent/AGENTS.md`

- [ ] Add focused failing tests: `parseArpReviewArgs` unit tests in `_runner.test.ts`; `/arp-review` registration in `_index.test.ts` and in the command loop of `lifecycle-prompts.test.mjs`; integration scenarios for the clean head, open findings with `--max-heads 1` and no fix launch, and every precondition in the Test Strategy.
- [ ] Implement `parseArpReviewArgs(arg)` and `runArpReview()` in `_arp-review.ts`. In Slice 1, any open finding stops the run with the head-cap message after head 1. Use `acquireRun()`, the preconditions, `lookup()`-based `checkHead`, the confirmation disclosure, and `reviewPublished()` on the current head. Pass the single model as `models.execute`. Register `/arp-review` in `index.ts` with single-model selection, the confirmation dialog, `phaseDisplay`, `rexActivity`, and `/stage-runner-cancel` support, without `checkRex(pi)`.
- [ ] Document `/arp-review [--max-heads <N>]` in `README.md` (consent, stop reasons). Add a one-line `/arp-review` mention to the lifecycle paragraph of `dot_pi/agent/AGENTS.md`.
- [ ] Run `cd dot_pi/agent && node --test exact_extensions/stage-runner/_runner.test.ts exact_extensions/stage-runner/_index.test.ts && node --test exact_extensions/stage-runner/_integration.test.ts && npm test && npm run typecheck`.
- [ ] Commit with `feat(pi): add /arp-review for existing PR heads`.

### Slice 2: Fix, push, settle, and re-review
### Task 3: Extract fix acceptance and add the adjudication helpers
**Delivers:** Shared anchoring and fix-range validation, the adjudication prompt, and complete `needs-operator` reporting.
**Blocked by:** Task 2
**Traces to:** Implementation Constraints "Shared re-anchoring and fix acceptance", "Adjudication prompt", "Mixed or `needs-operator` handoff handling".
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_runner.ts`, `dot_pi/agent/exact_extensions/stage-runner/_arp.ts`, `dot_pi/agent/exact_extensions/stage-runner/_runner.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`

- [ ] Add focused failing unit tests for `anchorFinding` (path traversal, missing blob, overlapping hunk, shifted lines), `acceptFixes` (no progress, `fixSha` outside the range), `arpReviewFixPrompt` (rules present, `ARP fix.` prefix, 64 KiB limit with mixed findings), and `partitionFindingFixes` (all fixed, mixed, all `needs-operator`, duplicate/missing/unknown IDs). Add an assertion to an existing `/stage-runner` settlement scenario in `_integration.test.ts` that the recorded `arp-settlement-<id>-request.json` `reason` starts with `Independently verified fix:`.
- [ ] Extract `anchorFinding(git, prev, finding)` and `acceptFixes(...)` from `supervise()` and call them from `supervise()`. Add `arpReviewFixPrompt(head, base, findings, out)` with the `deliberate:` source comment, and `partitionFindingFixes(value, findings)` returning `{ fixes, needsOperator }`, in `_arp.ts`. Add the required `settlementReason` option to `ReviewOptions` and pass `"Independently verified fix"` from `supervise()`.
- [ ] Run `cd dot_pi/agent && node --test exact_extensions/stage-runner/_runner.test.ts && node --test exact_extensions/stage-runner/_integration.test.ts && npm run typecheck` and require all existing `arp-fix-*` scenarios to pass.
- [ ] Commit with `refactor(pi): share ARP fix acceptance and add adjudication prompt`.

### Task 4: Add the fix, push, settle, and re-review loop
**Delivers:** The full `/arp-review` loop up to `maxHeads`.
**Blocked by:** Task 3
**Traces to:** Requirement "Loop review, triage/fix, push, and settlement until clean".
**Files:** `dot_pi/agent/exact_extensions/stage-runner/_arp-review.ts`, `dot_pi/agent/exact_extensions/stage-runner/_fixtures/pi.mjs`, `dot_pi/agent/exact_extensions/stage-runner/_integration.test.ts`, `dot_pi/agent/exact_extensions/stage-runner/README.md`

- [ ] Add focused failing integration scenarios for one fix round to a clean review (assert the recorded settlement `reason` starts with `Author-tested fix:`), single and mixed `needs-operator`, `fixSha` outside the range, and the `maxHeads` cap. Extend `_fixtures/pi.mjs` for mixed `needs-operator` dispositions.
- [ ] Replace the Slice 1 stop on open findings with the loop: `attempt("arp-fix")`, `partitionFindingFixes()`, `acceptFixes()`, `publication.publish()`, and `reviewPublished()` with `fixes` and `settlementReason: "Author-tested fix"`. Keep the head-cap stop; the Slice 1 `--max-heads 1` scenario must pass unchanged. Use `head N of <maxHeads>` in messages.
- [ ] Add a README recovery note: after a stop between a confirmed push and settlement, settle the reported finding IDs manually per `## Review or fix a finding manually in the work profile` before the next `/arp-review` run.
- [ ] Run `cd dot_pi/agent && node --test exact_extensions/stage-runner/_integration.test.ts && npm test && npm run typecheck`.
- [ ] Commit with `feat(pi): fix and settle ARP findings in /arp-review`.

### Task 5: Final verification
**Delivers:** Evidence that the full suites pass before independent `/verify`.
**Blocked by:** Task 4
**Traces to:** All requirements.
**Files:** None.

- [ ] From `dot_pi/agent`, run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all`. Record the results in this plan. Keep dependencies until both commands complete, then remove `node_modules`.
- [ ] Run `git diff --check main...HEAD` and confirm no unrelated files changed. Do not apply, push, or publish.

## Post-publication validation
- Owner: Matteo Ruina (operator).
- Trigger: the first `/arp-review` run on a real PR with ARP findings after merge and `chezmoi apply`.
- Expected evidence: a fix push, an `addressed` settlement whose `reason` starts with `Author-tested fix:`, and a clean re-review. When a real finding produces `needs-operator`, also record a stop with zero pushes. Record the PR URL, heads, and finding IDs in the follow-up issue or PR.
- Gate: none for this release. On 2026-11-25 the operator waived the pre-merge live trial that `dot_pi/agent/exact_extensions/stage-runner/README.md` requires, because no disposable PR with ARP findings is available. The integration tests establish the runner's behavior against `gh` and ARP fixtures. Live authentication, review capture, and settlement stay untested until the first real run. The operator accepts this gap and will fix forward.

## Learning candidates
- 2026-11-24: Adding open-PR metadata to the `target` that `publisher().inspect()` returns breaks the `JSON.stringify(target)` checks in `publish()` and `pushStartup()` after every push; use the `lookup()` that `inspect()` already returns. — evidence: `dot_pi/agent/exact_extensions/stage-runner/_publish.ts` lines 157-161 and the `confirmed()` check in `publish()`
