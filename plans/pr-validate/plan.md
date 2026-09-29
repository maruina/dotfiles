# `/pr-validate` Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/pr-validate <GitHub PR URL> [context]` prompt that reviews someone else's PR and returns an evidence-backed Approve, Ask, or Request changes verdict, guarded by structural tests.
**Smallest user-feedback slice:** A new `pr-validate.md` prompt with structural tests, applied locally for Matteo to run once on `ddoghq/dd-source#103728` with the two Slack quotes from the design.
**Out of Scope:** Guided `/pr-review` redesign; HTML output; separate agents, models, or sessions per pass; a claims-ledger file; cross-references to `/pr-validate` in `verify.md`, `systematic-review.md`, and `pr-address-feedback.md`; fixes to the clone-rule copies in `simplify.md` and `pr-address-feedback.md`; `compute-guardrails` false-positive matching; opening a PR or merging to `main`; live validation on #4309 and #102960 before feedback on #103728 (deferred until Matteo requests it after the first run).
**Architecture:** A new Markdown slash command in `dot_pi/agent/exact_prompts/`, rendered by chezmoi to `~/.pi/agent/prompts/`. It references the `repo-checkout` skill for locate-or-clone, shares the `/pr-review` worktree path without copying its unsafe reset, and reuses its data-collection pattern. Regex-marker structural tests in the existing `node:test` suite guard the contract; Matteo's live run on #103728 supplies the first behavioral feedback.
**Tech Stack:** pi Markdown prompts, `node:test`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires it before implementation recommendations | Determined the skill set below |
| `chezmoi` | `skill-loader` | Files under the chezmoi source are created and modified | Source-not-target rule, worktree `--source "$PWD"` rule, diff→apply→commit→push workflow, `npm test`/`npm run test:all` validation commands |
| `write` | `skill-loader` | The plan and the prompt are prose read by humans | Simplified Technical English, main point first, `must`/imperative for requirements, no time-bound labels in the durable prompt |
| `cli-best-practices` | `skill-loader` | Borderline: `/pr-validate` is a command with arguments and an output contract | Marginal fit (agent prompt, not a machine CLI); applied only the "never block non-interactive callers" principle, which reinforces the no-questions-after-analysis gate |
| `codebase-research` | `skill-loader` | Cross-file effects (test↔prompt, `pr-cleanup`↔worktree path) in a partially unfamiliar area | Ran locate→analyze→patterns→assumptions before recommending; verified current file contents instead of trusting the design's quotes |

Advisory learnings: `Datadog/Learnings.md` matched one section, "Render piped chezmoi templates against an initialized config, not `--init`". Reviewed and not applied: prompts are plain Markdown and the tests read files directly, so no template rendering is involved.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| `/pr-validate` prompt | `dot_pi/agent/exact_prompts/pr-validate.md` | Command spec: input, workspace, four passes, verdict, attention items, output | Structural tests; one user-run acceptance on #103728 |
| Lifecycle prompt tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Structural guards for the prompt contract | `node --test` red→green; `npm test` |

### Key Decisions
- **Claims ledger stays chat-only.** Design open question 1; the design's recommendation is accepted. A ledger file adds a handoff format before the need is proven.
- **Structural tests assert only safety-critical and interface rules.** Verdict trigger rules, thread-state adjudication, attention-item format, and evidence-gap naming are prompt content verified by the live run; a marker per prose rule couples the suite to wording. Adopted from systematic review.
- **The worktree step uses the shared path, not `/pr-review`'s destructive reset.** Design open question 2. Before any code read, confirm the checkout and any existing review worktree belong to the requested `ORG/REPO`, and compare the worktree's clean `HEAD` with `headRefOid` from the PR metadata. Reuse it only if both match. For a missing path, fetch `refs/pull/PR_NUMBER/head` from the verified base-repository remote, compare the fetched SHA with `headRefOid`, then create a detached worktree at `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` from the verified SHA. If the path exists but is dirty, stale, or belongs to another repository, stop with a specific conflict and a safe resolution; never reset or remove it. The structural drift guard checks that `pr-validate.md`, `pr-review.md`, and `pr-cleanup.md` all use the same path. This deliberately requires cleanup and a new run after a PR head changes; if repeated stale-worktree conflicts make that too costly, revisit safe worktree refresh.
- **Auto-clone without asking covers `DataDog`, `ddoghq`, and `ddoghq-sandbox`.** The design's Input section and the `repo-checkout` skill list three orgs; a later design sentence omits `ddoghq-sandbox`. The Input section and the skill govern.
- **One verified commit after Matteo reports on the first live run, then push.** The executor applies the prompt and stops for the user-owned run. If Matteo reports a missing expected behavior, revise the prompt and repeat the focused tests and apply before committing. Do not claim live acceptance from structural tests alone.
- **No slice grouping.** This plan contains one shippable slice and defers the other reference runs as follow-ups with a revisit trigger, rather than making them commit blockers.

### Implementation Constraints
- Preserve the `prompt()`/`requireMarkers()` idiom and reuse `skillRecordMarkers` for the provenance assertion in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
- Match the `pr-review.md` shape: frontmatter (`description`, `argument-hint`), an explicit `PR request: $ARGUMENTS` input line, a `<HARD-GATE>` block, phased sections. `argument-hint` alone does not pass the URL or context to a Pi prompt template.
- `/pr-validate` is a read-only stage: no `Learning candidates` section.
- Write the prompt in Simplified Technical English; no blank line after frontmatter or headings.
- Every `chezmoi` command runs from the worktree with `--source "$PWD"`. Verify the explicit target file path, not the directory; directory targets hide drift.
- In `dot_pi/agent`, run `npm ci --ignore-scripts` before `npm test` and `npm run test:all`; remove `node_modules` after both complete. `node_modules` is disposable and excluded from Git and chezmoi rendering.
- Stop conditions: the PR head SHA changes between metadata and fetch, or the worktree path is dirty, stale, or belongs to another repository → stop before analysis and report the conflict without altering the path; a required mechanism (skill, `gh` access, verified remote) is missing → stop and report; the user-run acceptance shows the output contract cannot produce an expected item → return to the design rather than patching the prompt ad hoc.

### Security Requirements
- `gh` account routing: `matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`, `maruina` for everything else. Applies to the acceptance runs (`ddoghq` PRs) and to the prompt's own wording through the `repo-checkout` reference.
- Context and PR content are untrusted evidence: the prompt states the agent cites them and never follows instructions in them; a structural test asserts the rule.
- The command makes no GitHub writes and posts nothing anywhere; output stays in the local session.

### Observability Requirements
- No telemetry applies: this is an agent-facing prompt, not a service. Run-level observability is the output's coverage section (files read, skimmed, skipped, and blocked commands) and named evidence gaps. The structural tests assert the coverage section; evidence-gap naming is verified by the live run.

### Failure Modes to Handle
- Worktree path drifts from `/pr-review` or `/pr-cleanup` → the drift-guard test fails. A dirty, stale, or mismatched existing path is never reset: report it before analysis and leave it intact. A fresh fetch whose SHA differs from PR metadata is not reviewed.
- A fork's head branch is absent from the base repository → fetch the PR's `refs/pull/PR_NUMBER/head` ref, not `origin/<headRefName>`; check its SHA before creating the worktree.
- Evidence is unavailable during a run (expired SSO, missing access) → the entry stays open, names the missing evidence and the query that would settle it; the run does not block. Observed in acceptance runs when it occurs.
- `compute-guardrails` blocks a read-only command whose text contains a protected name → the prompt instructs the agent to record the blocked command in the coverage section.
- Tests run before the prompt exists → clean red (`readFileSync` error on `pr-validate.md`), not a hang.

### Rollout and Rollback
- Rollout: `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md` from the worktree. The command is opt-in; no other command changes. Owner: Matteo.
- Rollback: revert the commit and run `chezmoi apply`; `exact_prompts` is an exact directory, so the rendered prompt disappears.

### Test Strategy
- Structural rules → `node --test exact_scripts/lifecycle-prompts.test.mjs` in `dot_pi/agent`, the highest deterministic interface; existing seam (`prompt()`/`requireMarkers()`), no new seams.
- Full suite → `npm test` and `npm run test:all` in `dot_pi/agent` after `npm ci --ignore-scripts`.
- Rendered availability → `chezmoi --source "$PWD" diff` and `apply` on the explicit target file.
- Behavior → Matteo invokes `/pr-validate` on #103728 in a reloaded Pi session, then reports the output and whether the two judgment criteria hold. Automation is impractical: this is agent judgment on a live PR. #4309 and #102960 remain reference cases for later user-requested validation, not blockers for this slice.
- No mocks: structural tests read files; live runs need real PRs.
- Narrow command expected to fail before implementation: `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs` fails because `pr-validate.md` does not exist.

## Acceptance criteria
### Requirement: Structural guards for the prompt contract
The test suite SHALL assert the safety-critical and interface rules for `pr-validate.md` and SHALL fail when they are absent. The design's prose rules are prompt content; the live run in Task 4 verifies them.

#### Scenario: red before the prompt exists
- GIVEN only Task 1 is complete
- WHEN `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs` runs
- THEN the run fails because `pr-validate.md` does not exist

#### Scenario: green after the prompt exists
- GIVEN Tasks 1 and 2 are complete
- WHEN `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs` runs
- THEN every test passes

#### Scenario: drift guard on the shared worktree path
- GIVEN Tasks 1 and 2 are complete
- WHEN the review-worktree path value in any of `pr-validate.md`, `pr-review.md`, or `pr-cleanup.md` differs from the other two
- THEN the drift-guard test fails; retaining the old path as an extra marker does not make it pass

#### Scenario: input and workspace safety contract
- GIVEN Tasks 1 and 2 are complete
- WHEN the structural tests run
- THEN they require the frontmatter contract (`description`, `argument-hint`), the literal `$ARGUMENTS` substitution, a check for a clean and correctly identified worktree at the PR head SHA, a fetch of `refs/pull/PR_NUMBER/head` checked against PR metadata for fresh worktrees, and the absence of `reset --hard` from `pr-validate.md`

### Requirement: Rendered availability
The command SHALL be available after `chezmoi apply`, with the full agent test suite green.

#### Scenario: apply renders the prompt
- GIVEN Tasks 1 and 2 are complete
- WHEN Task 3 runs `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md`
- THEN `~/.pi/agent/prompts/pr-validate.md` exists and is identical to the source, and `npm test` and `npm run test:all` pass in `dot_pi/agent`

### Requirement: Delegated verdict on a large port
`/pr-validate` on `ddoghq/dd-source#103728` SHALL produce a full verdict that addresses the design's five expected items.

#### Scenario: run with the reference Slack context
- GIVEN the applied prompt and a reloaded Pi session
- WHEN Matteo invokes `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` with the two Slack quotes from `plans/pr-validate/design.md` as context
- THEN the output leads with a one-line verdict and attention-item count; addresses routing as one Ask item and one attention item; asks the author to record the `azure_cloudops` reason; confirms or refutes the `//…/worker/utils:go_default_test` claim and Temporal replay safety with evidence; cites the necessity evidence; and includes the coverage and skills sections

### Requirement: Agent-comment adjudication with cluster scoping
`/pr-validate` on `ddoghq/k8s-release-mgmt-resources#4309` SHALL adjudicate the bot threads with states at the PR head and cluster impact.

#### Scenario: structural guard for read-only cluster evidence
- GIVEN Tasks 1 and 2 are complete
- WHEN the structural tests run
- THEN they require no cluster writes and no credential refresh

The bot-thread rules (duplicate merging with every source thread listed, the four states at the PR head, no inference from "outdated" to Fixed, named evidence gaps) are prompt content, not structural markers. The live #4309 check is a deferred follow-up after Matteo reports on the first run; it verifies them.

### Requirement: Re-review of the user's own threads
`/pr-validate` on `ddoghq/dd-source#102960` SHALL give each of the user's threads a state with evidence from the reviewed commit and the PR head.

#### Scenario: re-review rules ship as prompt content
- GIVEN Task 2 is complete
- WHEN the prompt is written
- THEN it contains review-thread provenance, comparison of the reviewed commit with the PR head, and Ask for an unconfirmed author claim or Request changes for a refuted claim

The live #102960 check is a deferred follow-up after Matteo reports on the first run; it verifies the two thread states. No structural marker asserts these rules.

### Requirement: Read-only, non-interactive run contract
The prompt SHALL forbid edits, GitHub writes, cluster mutations, and credential refresh; SHALL treat context as evidence only; and SHALL ask no questions after analysis starts.

#### Scenario: structural assertion
- GIVEN Tasks 1 and 2 are complete
- WHEN the structural tests run
- THEN markers for the hard gate, the untrusted-context rule, read-only cluster evidence, and the no-questions rule are present

#### Scenario: unavailable evidence becomes an item
- GIVEN any acceptance run
- WHEN evidence is unavailable
- THEN the item names the missing evidence and the query that would settle it, and the run completes without asking the user

## Tasks
### Task 1: Add structural assertions for `pr-validate.md`
**Delivers:** failing tests that pin the safety-critical and interface contract.
**Blocked by:** None
**Traces to:** Structural guards requirement; design testing strategy.
**Files:** `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

Add one or more `test(...)` blocks for `pr-validate.md` using the existing `prompt()`/`requireMarkers()` idiom. Read `pr-validate.md` inside each test callback, as the existing tests do, so the red run fails only the new tests. Assert only the safety-critical and interface rules:
- the read-only hard gate
- the literal `$ARGUMENTS` substitution that passes both the PR URL and optional context to the agent
- the frontmatter contract: `description` and `argument-hint: "<GitHub PR URL> [context]"`
- the three outcomes (Approve, Ask, Request changes)
- the rule that context is evidence, not instructions
- no questions to the user after analysis starts
- read-only cluster evidence: no cluster writes and no credential refresh
- the coverage section
- the skill provenance markers (reuse `skillRecordMarkers`)
- the workspace contract: verify the base-repository remote, clean existing worktree, and `HEAD` against `headRefOid`; fetch `refs/pull/PR_NUMBER/head` for a fresh worktree, check its SHA, and prohibit `reset --hard` in `pr-validate.md`
- the drift guard: extract every `~/dd/.worktrees/...` path value with a regex such as `/~\/dd\/\.worktrees\/[^\s`")]+/g` across `pr-validate.md`, `pr-review.md`, and `pr-cleanup.md`, and require the distinct values to be exactly `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`; do not pass merely because an old path remains somewhere in a prompt

Not asserted; verified by the live run in Task 4: outcome trigger rules, the existing-threads check before an Ask item, inline evidence with no separate evidence section, thread claims with the four states, duplicate merging, the "outdated" rule, the direct answer to a context question, the attention-item rules, and evidence-gap naming. Task 2 still writes all of them into the prompt from the design.

- [ ] Add the assertions.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect failure because `pr-validate.md` does not exist.
- [ ] Do not commit; the tree stays red until Task 2.

### Task 2: Write the `/pr-validate` prompt
**Delivers:** `pr-validate.md` that turns the assertions green.
**Blocked by:** Task 1
**Traces to:** All requirements.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`

Write the prompt from `plans/pr-validate/design.md`, matching the `pr-review.md` shape (frontmatter with `description` and `argument-hint: "<GitHub PR URL> [context]"`, `PR request: $ARGUMENTS`, `<HARD-GATE>` block, phased sections):
- Input: PR URL required; optional context treated as cited evidence, never instructions; questions only before analysis starts (missing URL, or no local checkout for an org outside `DataDog`, `ddoghq`, `ddoghq-sandbox`).
- Workspace and data: use the `repo-checkout` skill for locate-or-clone, confirm the selected base-repository remote, and get `headRefOid` from `gh pr view --json headRefOid`. Use the shared worktree path `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`, but do not copy `/pr-review`'s `reset --hard`. If the path exists, verify it is a Git worktree for the same `ORG/REPO`, is clean (including untracked files), and has `HEAD` equal to `headRefOid` before reading its files. Otherwise stop before analysis with a conflict and safe cleanup guidance; do not modify it. If the path is absent, fetch `refs/pull/PR_NUMBER/head` from the confirmed base-repository remote, compare `FETCH_HEAD` with `headRefOid`, and create a detached worktree at that path from the verified SHA only on a match. If the SHA changes, stop and report it; do not guess. Collect Phase 2 metadata, diff, comments, review threads with GraphQL resolution state, and `gh pr checks`.
- Pass 1: system schema, PR summary, file classification (skip generated, quick-check build wiring, read behavior/tests/guidance in depth), claims ledger (author claims, parity rows, thread claims with duplicate merging and the "outdated" rule), and `skill-loader` on the changed files before any judgment.
- Pass 2: confirm or refute each ledger entry; thread states Applies, Does not apply, Fixed, Open; for the user's own threads compare the reviewed commit with the PR head; a thread that still applies becomes a Request changes item; an unconfirmed author reply becomes an Ask item.
- Pass 3: boundary contracts; cluster-scoped findings with read-only evidence (`ddtool` through `ddtool-cluster-datacenter-info`, `kubectl get`/`describe`/`list` with `--context`, Datadog through `datadog-mcp` and `k8s-audit-logs` for logs); no cluster writes, no credential refresh, `compute-guardrails` named as a second layer the prompt does not depend on; unavailable evidence stays open with the missing evidence and the settling query named.
- Pass 4: consistency with neighboring code, repository guidance, and loaded skills.
- Verdict criteria (the seven rows) and verdict rules, including the check of existing threads before an Ask.
- Attention items: reviewer-owned decisions only; the Where/Context/Why/Options/What-to-verify format with a recommendation; one to five items with the `deliberate:` note on the limit; the count in the verdict line; no effect on the verdict.
- Output: the seven sections in the design's order; no separate evidence section; the full verdict even when the context asks a specific question; the "Skills loaded and used" provenance table.

- [ ] Write the prompt in Simplified Technical English, no blank line after frontmatter or headings.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect every test to pass.
- [ ] Refactor wording only after green, then rerun the command.
- [ ] Do not commit yet.

### Task 3: Run the full suite and apply with chezmoi
**Delivers:** a fully green suite and the rendered command at `~/.pi/agent/prompts/pr-validate.md`.
**Blocked by:** Task 2
**Traces to:** Rendered availability requirement.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` (verified, not modified)

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts`.
- [ ] Run `npm test`; expect pass. Run `npm run test:all`; expect pass.
- [ ] Remove `dot_pi/agent/node_modules`.
- [ ] From the worktree root, run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/pr-validate.md`; expect it to show only the new file.
- [ ] Run `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md`.
- [ ] Run `chezmoi --source "$PWD" verify ~/.pi/agent/prompts/pr-validate.md`; expect no output (explicit file path, not the directory). Treat npm `allow-scripts` warnings from apply as non-fatal unless the apply fails.

### Task 4: Hand off the first live acceptance run to Matteo
**Delivers:** the primary user-feedback run on the large port, performed by the user in Pi.
**Blocked by:** Task 3
**Traces to:** Delegated verdict requirement; smallest user-feedback slice.
**Files:** none (user-run validation)

- [ ] Executor: after Task 3, stop and give Matteo the invocation below. Do not try to send `/pr-validate` through Bash or mark this task complete from structural tests.
- [ ] Matteo: run `/reload` in Pi (or open a new Pi session), then invoke `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` with both Slack quotes from `plans/pr-validate/design.md` (Reference cases) as context. The prompt, through `repo-checkout`, checks `gh` access and uses `matteo-ruina_ddog` for `ddoghq/*`.
- [ ] Matteo: report whether the output meets the scenario: verdict line with attention count; routing as one Ask and one attention item; `azure_cloudops` Ask; the `go_default_test` claim and Temporal replay safety confirmed or refuted with evidence (`atlas-best-practices` loaded through `skill-loader`); necessity evidence cited; coverage and skills sections present. Also report whether the Approve/Ask decision is possible from the first section in about two minutes without the diff, and each attention item is decidable from its inline context.
- [ ] Executor: after Matteo reports, if the prompt is ambiguous, tighten its wording, rerun the focused test, `npm test`, and `npm run test:all`, reapply the explicit target with `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md`, and hand off another run after `/reload`. If the design's output contract itself cannot produce an expected item, stop and return to the design. Do not commit or push the implementation until the reported run satisfies the criteria.

### Task 5: Commit, push, and record documentation impact
**Delivers:** the first slice, verified by tests and the user-run acceptance, committed and pushed; documentation impact recorded.
**Blocked by:** Task 4
**Traces to:** Rendered availability and delegated verdict requirements; repository completion workflow.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

Documentation impact: none beyond the prompt itself. No prompt index or README lists the commands; cross-references from `verify.md`, `systematic-review.md`, and `pr-address-feedback.md` are design-deferred. The workspace rule is local to this prompt; `lifecycle-prompts.test.mjs` documents its structural guard, so no general `AGENTS.md` rule is needed.

- [ ] Confirm the worktree contains only the two intended changed files with `git status --short`.
- [ ] Commit with `feat(pi): add /pr-validate delegated PR review prompt`.
- [ ] Push with `git push -u origin maruina/pr-validate`. Do not open a PR.
- [ ] Final verification: the #103728 run produced a full verdict with the expected items, and Matteo confirmed both judgment criteria. Record that live cluster-thread adjudication and re-review remain unverified follow-ups, not completed feature-level claims.

## Deferred follow-ups
After Matteo reviews the first run, ask whether the additional coverage is worth the cost. If he requests it, run #4309 with "do the agent comments apply to the clusters?" and check merged bot findings, four-state claims, `orange.yaml`, and cluster impact or named gaps. Run #102960 with "were my two comments addressed?" and check both threads against reviewed commit `a0b19ba8` and the PR head. Keep each full verdict; these runs are not prerequisites for Task 5. Revisit the worktree-refresh policy if repeated stale-worktree conflicts block normal re-reviews.
