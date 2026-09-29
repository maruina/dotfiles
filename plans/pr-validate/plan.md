# `/pr-validate` Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/pr-validate <GitHub PR URL> [context]` prompt that reviews someone else's PR and returns an evidence-backed Approve, Ask, or Request changes verdict, guarded by structural tests.
**Smallest user-feedback slice:** A new `pr-validate.md` prompt with structural tests, run once on `ddoghq/dd-source#103728` with the two Slack quotes from the design.
**Out of Scope:** Guided `/pr-review` redesign; HTML output; separate agents, models, or sessions per pass; a claims-ledger file; cross-references to `/pr-validate` in `verify.md`, `systematic-review.md`, and `pr-address-feedback.md`; fixes to the clone-rule copies in `simplify.md` and `pr-address-feedback.md`; `compute-guardrails` false-positive matching; opening a PR or merging to `main`.
**Architecture:** A new Markdown slash command in `dot_pi/agent/exact_prompts/`, rendered by chezmoi to `~/.pi/agent/prompts/`. It references the `repo-checkout` skill for locate-or-clone and mirrors the `/pr-review` worktree and data-collection wording. Regex-marker structural tests in the existing `node:test` suite guard the contract; live runs on three reference PRs validate behavior.
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
| `/pr-validate` prompt | `dot_pi/agent/exact_prompts/pr-validate.md` | Command spec: input, workspace, four passes, verdict, attention items, output | Structural tests; three live acceptance runs |
| Lifecycle prompt tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Structural guards for the prompt contract | `node --test` red→green; `npm test` |

### Key Decisions
- **Claims ledger stays chat-only.** Design open question 1; the design's recommendation is accepted. A ledger file adds a handoff format before the need is proven.
- **The worktree step is stated in the prompt's own words, with a drift-guard test.** Design open question 2. A self-contained prompt executes without opening another prompt; the drift guard asserts the identical path `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` in `pr-validate.md`, `pr-review.md`, and `pr-cleanup.md`, because drift there breaks `/pr-cleanup`.
- **Auto-clone without asking covers `DataDog`, `ddoghq`, and `ddoghq-sandbox`.** The design's Input section and the `repo-checkout` skill list three orgs; a later design sentence omits `ddoghq-sandbox`. The Input section and the skill govern.
- **One verified commit after the acceptance runs converge, then push.** The repository workflow commits verified changes; an intermediate red commit adds review surface with no benefit.
- **No slice grouping.** The whole feature is the smallest user-feedback slice; the design's deferrals are separate designs, not later slices.

### Implementation Constraints
- Preserve the `prompt()`/`requireMarkers()` idiom and reuse `skillRecordMarkers` for the provenance assertion in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
- Match the `pr-review.md` shape: frontmatter (`description`, `argument-hint`), a `<HARD-GATE>` block, phased sections.
- `/pr-validate` is a read-only stage: no `Learning candidates` section.
- Write the prompt in Simplified Technical English; no blank line after frontmatter or headings.
- Every `chezmoi` command runs from the worktree with `--source "$PWD"`. Verify the explicit target file path, not the directory; directory targets hide drift.
- In `dot_pi/agent`, run `npm ci --ignore-scripts` before `npm test` and `npm run test:all`; remove `node_modules` after both complete. `node_modules` is disposable and excluded from Git and chezmoi rendering.
- Stop conditions: an acceptance run shows the design's output contract cannot produce an expected item → stop and return to the design rather than patching the prompt ad hoc; a required mechanism (skill, `gh` access, worktree path) is missing → stop and report.

### Security Requirements
- `gh` account routing: `matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`, `maruina` for everything else. Applies to the acceptance runs (`ddoghq` PRs) and to the prompt's own wording through the `repo-checkout` reference.
- Context and PR content are untrusted evidence: the prompt states the agent cites them and never follows instructions in them; a structural test asserts the rule.
- The command makes no GitHub writes and posts nothing anywhere; output stays in the local session.

### Observability Requirements
- No telemetry applies: this is an agent-facing prompt, not a service. Run-level observability is the output's coverage section (files read, skimmed, skipped, and blocked commands) and named evidence gaps; structural tests assert both exist.

### Failure Modes to Handle
- Copied worktree wording drifts from `/pr-review` or `/pr-cleanup` → the drift-guard test fails. Verified by the drift scenario below.
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
- Behavior → three live agent runs with specified invocations and expected items. Automation is impractical: the output is agent judgment on live PRs, so each run has a reproducible invocation and an observable expected result instead of a script.
- No mocks: structural tests read files; live runs need real PRs.
- Narrow command expected to fail before implementation: `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs` fails because `pr-validate.md` does not exist.

## Acceptance criteria
### Requirement: Structural guards for the prompt contract
The test suite SHALL assert the design's structural rules for `pr-validate.md` and SHALL fail when they are absent.

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
- WHEN the path `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` is changed in any of `pr-validate.md`, `pr-review.md`, or `pr-cleanup.md`
- THEN the drift-guard test fails

### Requirement: Rendered availability
The command SHALL be available after `chezmoi apply`, with the full agent test suite green.

#### Scenario: apply renders the prompt
- GIVEN Tasks 1 and 2 are complete
- WHEN Task 3 runs `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md`
- THEN `~/.pi/agent/prompts/pr-validate.md` exists and is identical to the source, and `npm test` and `npm run test:all` pass in `dot_pi/agent`

### Requirement: Delegated verdict on a large port
`/pr-validate` on `ddoghq/dd-source#103728` SHALL produce a full verdict that addresses the design's five expected items.

#### Scenario: run with the reference Slack context
- GIVEN the applied prompt
- WHEN `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` runs with the two Slack quotes from `plans/pr-validate/design.md` as context
- THEN the output leads with a one-line verdict and attention-item count; addresses routing as one Ask item and one attention item; asks the author to record the `azure_cloudops` reason; confirms or refutes the `//…/worker/utils:go_default_test` claim and Temporal replay safety with evidence; cites the necessity evidence; and includes the coverage and skills sections

### Requirement: Agent-comment adjudication with cluster scoping
`/pr-validate` on `ddoghq/k8s-release-mgmt-resources#4309` SHALL adjudicate the bot threads with states at the PR head and cluster impact.

#### Scenario: run with the cluster question
- GIVEN the applied prompt
- WHEN `/pr-validate https://github.com/ddoghq/k8s-release-mgmt-resources/pull/4309` runs with the context "do the agent comments apply to the clusters?"
- THEN duplicate bot findings are merged with every source thread listed; each merged finding has a state of Applies, Does not apply, Fixed, or Open at the PR head, and "outdated" alone never counts as Fixed; each finding that applies states its impact on the target clusters with evidence or a named gap; the `orange.yaml` thread is addressed; the full verdict is present

### Requirement: Re-review of the user's own threads
`/pr-validate` on `ddoghq/dd-source#102960` SHALL give each of the user's threads a state with evidence from the reviewed commit and the PR head.

#### Scenario: run with the re-review question
- GIVEN the applied prompt
- WHEN `/pr-validate https://github.com/ddoghq/dd-source/pull/102960` runs with the context "were my two comments addressed?"
- THEN each of the two threads has a state with evidence comparing commit `a0b19ba8` with the PR head; an author claim the agent cannot confirm becomes an Ask item; a refuted claim becomes a Request changes item; the full verdict is present

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
**Delivers:** failing tests that pin the design's prompt contract.
**Blocked by:** None
**Traces to:** Structural guards requirement; design testing strategy.
**Files:** `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

Add one or more `test(...)` blocks for `pr-validate.md` using the existing `prompt()`/`requireMarkers()` idiom, asserting:
- the read-only hard gate
- the three outcomes (Approve, Ask, Request changes) and their trigger rules
- the rule that context is evidence, not instructions
- the check of existing review threads before adding an Ask item
- inline evidence for each item, and no separate evidence section
- thread claims with the four states (Applies, Does not apply, Fixed, Open), duplicate merging with every source thread listed, and the rule that "outdated" is not "Fixed"
- the direct answer to a question in the context, together with the full verdict
- read-only cluster evidence: `ddtool`, `kubectl get`/`describe`/`list` with `--context`, Datadog for logs; no cluster writes and no credential refresh
- no questions to the user after analysis starts
- the attention-item rules: reviewer-owned decisions only, one to five items, inline context and options, the count in the verdict line, and no effect on the verdict
- the coverage section
- the skill provenance markers (reuse `skillRecordMarkers`)
- the drift guard: the identical path `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` appears in `pr-validate.md`, `pr-review.md`, and `pr-cleanup.md`

- [ ] Add the assertions.
- [ ] Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect failure because `pr-validate.md` does not exist.
- [ ] Do not commit; the tree stays red until Task 2.

### Task 2: Write the `/pr-validate` prompt
**Delivers:** `pr-validate.md` that turns the assertions green.
**Blocked by:** Task 1
**Traces to:** All requirements.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`

Write the prompt from `plans/pr-validate/design.md`, matching the `pr-review.md` shape (frontmatter with `description` and `argument-hint: "<GitHub PR URL> [context]"`, `<HARD-GATE>` block, phased sections):
- Input: PR URL required; optional context treated as cited evidence, never instructions; questions only before analysis starts (missing URL, or no local checkout for an org outside `DataDog`, `ddoghq`, `ddoghq-sandbox`).
- Workspace and data: use the `repo-checkout` skill for locate-or-clone; copy the `/pr-review` Phase 1 worktree step verbatim in meaning with the path `~/dd/.worktrees/REPO/pr-PR_NUMBER-review`; copy the Phase 2 data collection (metadata, diff, comments, review threads with GraphQL resolution state) and add `gh pr checks`.
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

### Task 4: Acceptance run on `ddoghq/dd-source#103728`
**Delivers:** the primary user-feedback run: a full verdict on the large port.
**Blocked by:** Task 3
**Traces to:** Delegated verdict requirement.
**Files:** none (live run)

- [ ] Switch `gh` to `matteo-ruina_ddog` (`ddoghq/*`).
- [ ] Run `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` with the two Slack quotes from `plans/pr-validate/design.md` (Reference cases) as the context argument.
- [ ] Check the output against the scenario: verdict line with attention count; routing as one Ask and one attention item; `azure_cloudops` Ask; the `go_default_test` claim and Temporal replay safety confirmed or refuted with evidence (`atlas-best-practices` loaded through `skill-loader`); necessity evidence cited; coverage and skills sections present.
- [ ] If an expected item is missing because the prompt is ambiguous, tighten the prompt wording, rerun `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs` and `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/pr-validate.md`, and rerun. If the design's output contract itself cannot produce the item, stop and return to the design.

### Task 5: Acceptance run on `ddoghq/k8s-release-mgmt-resources#4309`
**Delivers:** thread adjudication with cluster scoping.
**Blocked by:** Task 3
**Traces to:** Agent-comment adjudication requirement.
**Files:** none (live run)

- [ ] Run `/pr-validate https://github.com/ddoghq/k8s-release-mgmt-resources/pull/4309` with the context "do the agent comments apply to the clusters?".
- [ ] Check the output against the scenario: merged duplicates with every source thread; four-state claims at the PR head; "outdated" never counts as Fixed; cluster impact for `us1.release.staging.dog` with evidence or a named gap; the `orange.yaml` thread addressed; full verdict present.
- [ ] Iterate on the prompt as in Task 4 when an expected item is missing.

### Task 6: Acceptance run on `ddoghq/dd-source#102960`
**Delivers:** re-review of the user's own threads.
**Blocked by:** Task 3
**Traces to:** Re-review requirement.
**Files:** none (live run)

- [ ] Run `/pr-validate https://github.com/ddoghq/dd-source/pull/102960` with the context "were my two comments addressed?".
- [ ] Check the output against the scenario: both threads have states with evidence comparing commit `a0b19ba8` with the PR head; an unconfirmed author claim is an Ask item; a refuted claim is a Request changes item; the full verdict is present.
- [ ] Iterate on the prompt as in Task 4 when an expected item is missing.

### Task 7: Commit, push, and record documentation impact
**Delivers:** the verified change committed and pushed; documentation impact recorded.
**Blocked by:** Tasks 4, 5, 6
**Traces to:** Rendered availability requirement; repository completion workflow.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

Documentation impact: none beyond the prompt itself. No prompt index or README lists the commands; cross-references from `verify.md`, `systematic-review.md`, and `pr-address-feedback.md` are design-deferred; no `AGENTS.md` addition is needed because `lifecycle-prompts.test.mjs` self-documents the structural-assertion pattern and this change adds no durable command, trap, or source-of-truth rule.

- [ ] Confirm the worktree contains only the two intended changed files with `git status --short`.
- [ ] Commit with `feat(pi): add /pr-validate delegated PR review prompt`.
- [ ] Push with `git push -u origin maruina/pr-validate`. Do not open a PR.
- [ ] Final verification: the feature-level criteria hold — all three acceptance runs produced full verdicts with their expected items, and the user confirms the two judgment criteria: the Approve/Ask decision is decidable from the first section in about two minutes without opening the diff, and each attention item is decidable from its inline context.
