# `/pr-validate` Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/pr-validate` produce an evidence-backed, readable HTML verdict that lets Matteo decide what to tell a PR author without opening the diff.
**Smallest user-feedback slice:** Matteo approves a mock story page for #103728 with real Atlas exposure evidence or an explicit evidence gap before the prompt changes.
**Out of Scope:** Guided `/pr-review`; a shared `/pr-review` and `/to-html` template; GitHub dark styling; TypeSafe/Jev skill selection; separate review agents or sessions; a claims-ledger file; moving the Atlas query into `atlas-workflows`; extending marketplace discovery beyond `/pr-validate`; cross-references in other lifecycle prompts; clone-rule cleanup; `compute-guardrails` changes; live #4309 and #102960 runs before Matteo requests them after #103728; posting reviews or comments on GitHub.
**Architecture:** Keep the Markdown slash command and its existing worktree/data-collection contract. Use one local HTML report with a five-slot story for each item, read-only exposure checks, and a short chat summary. Extend `user-context` to expose the thinking level and add capped local marketplace discovery inside `/pr-validate` only; neither component depends on the report layout.
**Tech Stack:** Pi Markdown prompts and TypeScript extension, `node:test`, chezmoi, local Atlas CLI, Mermaid and highlight.js from CDNs in the report.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The design path identifies another worktree | Resolved and kept all repository reads and the plan edit in `maruina/pr-validate` |
| `skill-loader` | `prompt-required` | `/plan` requires skill selection | Selected the relevant domain, codebase, prose, and workflow guidance |
| `feature-worktree` | `prompt-required` | A durable plan must be committed in its feature worktree | Reused the design's existing feature worktree without moving the base checkout |
| `learning-lookup` | `prompt-required` | Planning must consult advisory learnings | Looked up narrow terms; no sections matched |
| `codebase-research` | `skill-loader` | The prompt, tests, extension, and skill share behavior | Mapped live files, tests, conventions, and the dirty baseline before choosing tasks |
| `chezmoi` | `skill-loader` | The implementation changes managed source | Used source-not-target, explicit target verification, and scoped apply rules |
| `write` | `skill-loader` | This plan and the prompt are human-readable prose | Used direct requirements and preserved prior-run uncertainty |
| `cli-best-practices` | `skill-loader` | The slash command has input, failure, and output contracts | Kept unattended runs non-blocking after analysis starts and gaps explicit |
| `mermaid-best-practices` | `skill-loader` | Report diagrams are required | Limited each diagram to one mechanism and short labels |
| `show-me` | `agent-selected` | The design's positive example is a story page | Put a visual beside the short text it supports in the mock requirement |
| `atlas-best-practices` | `skill-loader` | Replay compatibility and exposure are review criteria | Kept replay-safety proof separate from an execution-count snapshot |
| `repo-checkout` | `agent-selected` | `/pr-validate` delegates repository selection to this skill | Verified the three-organization auto-clone boundary and remote check |

Advisory lookup: `Datadog/Learnings.md` returned no matching sections for `pr-validate`, `pr-review`, `mermaid`, `marketplace`, `report`, or `user-context`; none was applied. No advisory source was skipped.

## Planning alignment
Matteo confirmed the alignment brief: preserve the uncommitted prompt/test/plan work; get mock feedback before changing the prompt; keep marketplace discovery separately reversible. Do not overwrite the prior report at `~/.pi/agent/pr-validate-reports/dd-source-103728.html` with the mock. The existing uncommitted prompt and test edits are the implementation baseline, not plan-stage changes.

## Feasibility and validation map
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Mock with real exposure evidence | `atlas workflow list --workflow-type ... --status Running --limit ... --output json`, scoped to the relevant domain/context | `atlas workflow list --help` exposes these flags; the design names #103728 | Preserve the actual read-only query, scope, timestamp, and result or error beside item 1; Matteo opens the mock | Label `Exposure: unknown`, show the failed query and decision impact; never infer zero or refresh credentials |
| Five-slot report and diagrams | Pi prompt writes a single HTML report; Mermaid in strict mode, generated labels only | Existing uncommitted `pr-validate.md` writes a report; `show-me` provides the visual precedent; Pi prompt templates support `$ARGUMENTS` | Human checks the mock in a browser; full #103728 run checks reproduction | Stop for feedback on the mock; do not change the prompt to an unapproved style |
| Safe report rendering | Escape PR and context text as HTML text; keep them out of Mermaid labels | Existing prompt and structural tests enforce the report path and escaping | Structural guard plus inspect mock and full report with untrusted excerpts | Do not ship a report that can interpret PR text as markup or script |
| Thinking-level provenance | `pi.getThinkingLevel()` in `before_agent_start`, next to `formatCurrentModel` | Pi's `border-status-editor.ts` example uses the API; `user-context.ts` and its test expose the model | Focused `user-context.test.mjs` and full-run page/chat | Show `thinking level: not available to the agent` until the extension works; do not invent a level |
| Bounded marketplace discovery inside `/pr-validate` | A Marketplace discovery subsection of the prompt's Pass 1: up to five derived terms, search local `SKILL.md` frontmatter descriptions, exclude already-loaded directories, read up to three matches | Work-profile settings list loaded directories; local marketplace exists; the prompt already runs `skill-loader` in Pass 1 | Structural markers in the `/pr-validate` prompt test for caps, exclusions, and no pull; sample search on the checkout; full-run provenance | Skip when absent or no relevant terms; ordinary skill selection unchanged |
| Read-only delegated review | `repo-checkout`, verified PR-head worktree, `gh` reads, read-only cluster and Atlas queries | Existing prompt and lifecycle tests encode workspace/safety contract; design records four runs | Focused lifecycle tests and user-owned #103728 run | Stop before analysis on workspace conflict; turn evidence outages into visible items, not guessed findings |

The Atlas CLI defaults to a limit of 10. The exposure chip must not call a capped result an exact total; use an honest lower bound or an unknown count when completion cannot be proven. An empty result is evidence only for the queried workflow type and domain/context, not for every cluster. Exposure at review time is a snapshot, not replay compatibility proof.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Review report and prompt | `dot_pi/agent/exact_prompts/pr-validate.md` | Severity, added criteria, five-slot item stories, safe HTML, model/thinking provenance, chat summary | Focused lifecycle tests, browser mock acceptance, full #103728 run |
| Prompt structural tests | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Guard interface and safety rules, not every prose rule | `node --test exact_scripts/lifecycle-prompts.test.mjs` |
| Model context | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs` | Expose active thinking level beside the model | `node --experimental-strip-types --test exact_extensions/user-context.test.mjs` |
| Marketplace discovery | `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Bounded, local marketplace search inside the review prompt | Focused structural test, sample bounded read, full-run provenance |
| Planning and guidance | `plans/pr-validate/plan.md`; inspect `dot_pi/agent/AGENTS.md` and relevant README files | Record scope and confirm whether durable instructions change | Review documentation decisions in the final task |

### Key Decisions
- Revise the existing plan rather than lose its prior acceptance-run history. Keep the uncommitted prompt and tests untouched during planning. Commit only this plan file in `/plan`.
- Preserve `/pr-review` and its distinct workspace behavior. `/pr-validate` keeps the verified, clean PR-head worktree rule and never copies `/pr-review`'s reset.
- Mock first; Matteo's approval blocks changes to the prompt's presentation contract. The mock is an execution artifact, not a chezmoi source file or a substitute for the full run.
- Retain the seven existing criteria and add Observability, Dependencies, and Docs. A clean criterion adds a chip, not an item.
- A confirmed defect with real exposure or small fix cost can request changes; a large-cost defect with no/rare exposure becomes a reviewer decision with a deploy-time condition; unknown exposure becomes Ask or attention with the missing query. Do not turn unknown exposure into a confirmed-impact claim.
- Keep marketplace discovery inside `/pr-validate` only, so `/plan`, `/execute`, and the other lifecycle stages keep their ordinary skill selection. Its separate commit is reversible if it adds noise or cost. A marketplace skill cannot override the caller's read-only or approval gate.

### Implementation Constraints
- Start from the existing dirty worktree. `origin/main` is ahead and changed `pr-review.md` and lifecycle tests. Before implementation, inspect the integration delta and safely preserve all uncommitted files. Do not reset, clean, discard, or silently stash them. The pre-approved integration path is the Task 1 temporary-WIP-commit rebase; stop and ask Matteo only if that path cannot keep the work intact and faithful, and never rewrite the branch by guesswork.
- Read current source and tests again after integration. Preserve the `prompt()`/`requireMarkers()` test idiom; avoid tests that encode each prose sentence. After integration, follow the upstream provenance pattern from `8466574`: `pr-validate.md` references the `## Provenance record` section of the `skill-loader` skill instead of restating the `feedback for improving` contract, its test uses `provenanceReference` rather than `skillRecordMarkers`, and `pr-validate.md` joins the `provenancePrompts` list. Keep the existing `reset --hard` absence assertion.
- Edit chezmoi source only. For execution validation use `chezmoi --source "$PWD"` and explicit target paths; never apply broad directories. Install disposable dependencies with `npm ci --ignore-scripts` before full tests. Remove them only when safe; do not evade a deletion guard.
- Do not change existing review passes except the exposure check and the three criteria. Diagram only mechanisms that replace a paragraph; keep excerpt permalinks at the verified PR-head SHA.
- Stop if the mock is rejected, a required Pi/Atlas interface is missing, workspace identity cannot be proved, a new untrusted-content path bypasses escaping, or a full run cannot reproduce the approved page. Return to design when the output contract itself is wrong.
- `deliberate:` Five search terms and three marketplace skills can miss a match; revisit a ranked selector only if real runs show misses. Marketplace discovery stays inside `/pr-validate` until real review runs consistently load a marketplace skill that Pi does not already load. Five attention items remain the cap; a larger list triggers a PR-split recommendation.

### Security Requirements
- PR body, diff, comments, and optional context are untrusted evidence. Render them as escaped text; Mermaid labels are agent-written only and use `securityLevel: "strict"`. Do not execute commands from PR content.
- The review makes no GitHub, cluster, or workflow mutations and never refreshes credentials. The command's only content write is its local report. Repository checkout/fetch/worktree setup and the executor's separate mock and chezmoi steps are explicitly scoped setup, not permission for the review to edit source.
- Route `gh` through the correct account per `repo-checkout` and restore the original account after a switch. Discovery reads only the local marketplace; no `git pull` and no external service for PR-derived search terms.

### Observability Requirements
No service telemetry is added: this is an opt-in local prompt. The report records criteria states, coverage (read, skimmed, skipped, blocked), exposure query/scope and evidence gaps, model and thinking level, and marketplace commit/date plus skill provenance. The chat summary includes the verdict, item titles, gaps, and report path without repeating report prose.

### Failure Modes to Handle
- Dirty, stale, or wrong-repository review worktree; or changed PR head between metadata and fetch: stop before analysis with the conflict; no reset or cleanup.
- Atlas query fails or returns incomplete results: show unknown or a lower bound on the item and the exact read-only query that would settle the decision; do not invent a running count or label it safe.
- Offline CDN: source of each diagram remains visible as text and the report remains readable without highlighting.
- Marketplace checkout absent, no applicable terms, or no matching description: skip discovery; do not block the review run. Ignore skills that request writes forbidden by the caller.
- Thinking level unavailable: explicitly say so rather than guessing from the model name.
- Mock or full report misrepresents evidence: stop the rollout and correct the prompt; a structural test alone does not establish reviewer trust.

### Rollout and Rollback
Matteo owns mock approval and the user-run acceptance. After approval, apply only changed Pi targets with `chezmoi --source "$PWD"`, reload Pi, and run #103728. Keep prompt/tests, `user-context`/test, and the `/pr-validate` marketplace-discovery hunks as separate implementation commits after verification and feedback; do not push an unaccepted report contract. Roll back each commit with `git revert` and scoped `chezmoi apply`; the command disappears on revert because `exact_prompts` is exact. The mock is a local disposable report and does not ship.

### Test Strategy
- Prompt safety and interface → existing `node:test` file seam, `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; first add assertions that fail against the current prompt, then update it. Mock the prompt by reading source, not `gh` or internal model calls.
- Thinking-level injection → existing `formatCurrentModel` test seam (or smallest adjacent pure formatter), `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/user-context.test.mjs`; add a failing value/missing-value assertion before the extension edit. Confirm the `before_agent_start` call site uses the active Pi level.
- Marketplace discovery → structural markers in the `/pr-validate` prompt test for caps, exclusions, and the no-pull rule; a sample frontmatter search in the local catalog; full #103728 run for actual selection. No new runtime code seam is justified for Markdown prompt content.
- Visual comprehension → render the mock from run 4's real content; inspect each item for five slots, evidence links, safe markup, and diagram fallback; then have Matteo view it. Automation cannot decide whether the page is readable to him.
- Full behavior → user-run `/pr-validate` on #103728 with both reference Slack quotes after `/reload`; verify the five expected items, new criteria, exposure evidence/gap, approved visual shape, and model/thinking provenance. Do not claim #4309 or #102960 validated by this run.
- Full package → `cd dot_pi/agent && npm ci --ignore-scripts`, `npm test`, `npm run test:all`; scoped `chezmoi diff`, `apply`, and explicit-file `verify` for changed targets. Run diagnostics on `user-context.ts` after editing.

## Acceptance criteria
### Requirement: Mock before implementation
The executor SHALL show Matteo a separate, browser-readable mock that uses run 4 content and verifiable Atlas exposure evidence or a named gap, without overwriting run 4's report.

#### Scenario: mock accepted or rejected
- GIVEN run 4's local report and the relevant workflow type and domain/context are identified from code
- WHEN the read-only Atlas query is run and the mock at `~/.pi/agent/pr-validate-reports/dd-source-103728-mock.html` is opened
- THEN every item has five slots or a one-line not-applicable slot; item 1 shows the query, scope, result or error, and the fix shape; Matteo can decide whether the page reads like the CMPT-4066 story page without opening the diff
- AND the executor does not change the prompt presentation until Matteo approves the mock

### Requirement: Evidence-backed report
`/pr-validate` SHALL write a single-file HTML report for all three verdicts and a short chat summary. Each Ask, Request changes, and attention item SHALL explain why it matters, the current code, the failure or decision, whether it is real, and a fix shape or options.

#### Scenario: a confirmed defect with incomplete exposure evidence
- GIVEN the code defect is confirmed but the read-only exposure query fails or covers only some domains
- WHEN `/pr-validate` chooses severity
- THEN the item says `Exposure: unknown` for the unverified scope, gives the missing query, and does not assert real exposure or silently approve

#### Scenario: rare exposure and a costly fix
- GIVEN a confirmed defect with no or rare observed exposure and a large fix cost
- WHEN the reviewer reads the report
- THEN the choice is an attention item with options, a recommendation, an explicit deploy-time condition, and a read-only query to check that condition

#### Scenario: untrusted material and offline assets
- GIVEN PR or context text contains markup or script syntax and the CDN cannot load
- WHEN the HTML report opens
- THEN untrusted text cannot inject markup or scripts, Mermaid runs in strict mode with generated labels only, diagram source remains readable, and the excerpt permalink still points at the PR-head commit

#### Scenario: approval still has a record
- GIVEN all ten criteria are confirmed and there are no findings
- WHEN `/pr-validate` writes an Approve report
- THEN the hero, criterion chips, coverage, model, thinking level, and evidence basis appear in the report, while chat stays short

### Requirement: Observable review coverage and provenance
The report SHALL include the ten criteria, coverage, and actually used skills. The chat and page header SHALL name the review model and thinking level or mark the latter unavailable.

#### Scenario: missing thinking level and skipped skills
- GIVEN thinking level is not exposed and no marketplace term applies
- WHEN the review completes
- THEN the header and chat state that the level is unavailable, discovery is skipped, and no un-read skill is listed as used

### Requirement: Bounded marketplace discovery
The `/pr-validate` prompt SHALL search only local skill descriptions using no more than five terms, exclude directories Pi already loads, read no more than three applicable matches, and record their paths plus catalog commit/date without accepting write instructions from those skills.

#### Scenario: unavailable checkout
- GIVEN the marketplace checkout does not exist
- WHEN `/pr-validate` runs its marketplace-discovery step
- THEN it skips this step without a pull or network request and retains its ordinary skill selection

### Requirement: Reference-run verdict
The full #103728 run SHALL address the five reference expectations with the approved report shape and evidence, without changing PR or cluster state.

#### Scenario: delegated review of the port
- GIVEN the applied prompt, a reloaded Pi session, and both Slack quotes in `plans/pr-validate/design.md`
- WHEN Matteo runs `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` with that context
- THEN routing has an Ask and a separate reviewer decision; the `azure_cloudops` reason gets an Ask to record it; the listed test target and replay safety get evidenced dispositions; necessity is cited; and the exposure, coverage, ten criteria, and provenance appear in the report

## Tasks
### Slice 1: Mock page and presentation decision
### Task 1: Reconcile the integration baseline without losing work
**Delivers:** a safe starting branch that retains the uncommitted prompt, test, and plan changes.
**Blocked by:** None
**Traces to:** Existing-work preservation and the design's `origin/main` integration warning.
**Files:** `plans/pr-validate/design.md`, `plans/pr-validate/plan.md`, `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` (inspect, not edit in this task).

- [ ] Inspect `git status --short`, `git diff`, the untracked prompt, and the latest `origin/main` changes to the same paths. Fetch the base before deciding how to integrate; do not assume the cached remote is current.
- [ ] Preserve all uncommitted work through the pre-approved reversible path: commit the uncommitted test change and the untracked prompt as one temporary WIP commit, rebase onto the fetched `origin/main`, hand-resolve the `lifecycle-prompts.test.mjs` conflict by keeping the upstream restructure and the new `/pr-validate` tests, then run `git reset --soft HEAD~1` to return the prompt and tests to uncommitted changes on the integrated base. The pre-rebase state stays recoverable through `reflog`. Stop and ask Matteo only if the resolution cannot keep the work intact and faithful; never use `--autostash`, discard, or guess a conflict.
- [ ] Recheck the lifecycle test's provenance expectations and the source baseline after integration: `pr-validate.md` must reference the `## Provenance record` section of the `skill-loader` skill (as `pr-review.md` now does), and its test must use `provenanceReference` rather than `skillRecordMarkers`, with `pr-validate.md` added to `provenancePrompts`. Record any remaining conflicts before authoring new report behavior. Any upstream merge must retain the existing implementation edits.

### Task 2: Make the reference mock and request approval
**Delivers:** the smallest user-feedback slice: a mock page that Matteo can accept or reject before further report work.
**Blocked by:** Task 1
**Traces to:** Mock-before-implementation requirement; design revision 2 slice.
**Files:** No repository files. Execution-only output: `~/.pi/agent/pr-validate-reports/dd-source-103728-mock.html`; input: existing run 4 report and the CMPT-4066 story page named in `plans/pr-validate/design.md`.

- [ ] Copy run 4's report to `~/.pi/agent/pr-validate-reports/dd-source-103728-run4.html` first, so the negative reference survives the Task 6 full run. Read run 4's report and the positive reference page; determine workflow types and their domain/context from the referenced PR code. Derive the domain/context from where the workflow types register, record why that scope covers the deploy target, and run one scoped query per domain when the types span domains; `atlas workflow list` defaults to `--context prod`, so state the scope explicitly on the item. Run the scoped read-only query with an explicit limit and output format. Preserve the actual result or error, scope, timestamp, and truncation status; do not refresh credentials.
- [ ] Render the mock as a separate HTML file, never overwriting `dd-source-103728.html`. Use run 4's content; escape untrusted text; keep Mermaid labels generated and `securityLevel: "strict"`.
- [ ] Check all five slots per item and the exposure query/gap on item 1. Open the mock and ask Matteo whether it conveys the reason, reality, and fix shape without the diff and matches the CMPT-4066 story shape. **Stop until approved.** If rejected, revise only the mock and repeat this task.

### Slice 2: Ship the approved delegated-review report
### Task 3: Adapt the prompt and safety tests as one vertical change
**Delivers:** an approved report format and severity policy, with the command's safety contract guarded by focused tests.
**Blocked by:** Task 2 approval
**Traces to:** Evidence-backed report and observable review coverage requirements.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [ ] Add focused structural checks for every-verdict report, short chat summary with model/thinking, strict Mermaid and safe labels, read-only exposure checks, and the existing untrusted-input/worktree guards. Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new revision-2 checks to fail against the existing prompt.
- [ ] Replace the dark, prose-heavy Output section with the approved hero, chip navigation, changed-flow map, five-slot item chapters, conditional Your question, and reference details. Add ten criterion chips and exposure/fix-cost severity rules; keep the existing four passes except their specified exposure and criterion additions, and preserve the Marketplace discovery subsection of Pass 1 when Task 5 has already added it. Replace the restated `feedback for improving` provenance contract in the Skills section with a reference to the `## Provenance record` section of the `skill-loader` skill, and switch the test from `skillRecordMarkers` to `provenanceReference`, adding `pr-validate.md` to `provenancePrompts`. Keep the report on Approve; make the summary name model and thinking level or their unavailability.
- [ ] Rerun the same focused command; expect all tests green. Inspect report rules for untrusted markup, missing evidence, truncated counts, and deploy-time conditions. Do not assert visual quality from marker tests alone.

### Slice 3: Make the review context complete
### Task 4: Expose active thinking level
**Delivers:** model and thinking provenance through Pi's established context injection.
**Blocked by:** Task 1
**Traces to:** Observable review coverage and provenance requirement.
**Files:** `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs`.

- [ ] Add a test for a known level and a missing-level fallback in the existing formatter seam. Run `cd dot_pi/agent && node --experimental-strip-types --test exact_extensions/user-context.test.mjs`; expect only the new assertion to fail.
- [ ] Read the active level using `pi.getThinkingLevel()` in `before_agent_start` and put it beside Current Model without inventing a value when absent. Keep other injected context unchanged.
- [ ] Rerun the focused test and run `lsp_diagnostics` on `user-context.ts`; expect green tests and no new diagnostics.

### Slice 4: Add separately reversible marketplace discovery
### Task 5: Bound marketplace search inside `/pr-validate`
**Delivers:** local relevant marketplace guidance inside the review prompt, without unbounded catalog context, changes to `skill-loader`, or network sends.
**Blocked by:** Task 1
**Traces to:** Bounded marketplace discovery requirement.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.

- [ ] Add a structural check for the five-term and three-skill caps, already-loaded directory exclusions, no pull, commit/date reporting, and caller-gate precedence. Run `cd dot_pi/agent && node --test exact_scripts/lifecycle-prompts.test.mjs`; expect only the new check to fail. Keep this test and the prompt subsection in separate hunks from Task 3's changes so each component can be committed independently.
- [ ] Add work-profile-only guidance to a Marketplace discovery subsection of the prompt's Pass 1: derive terms from paths, imports, and systems; search `SKILL.md` frontmatter descriptions locally; inspect at most three applicable hits; skip when absent or irrelevant; record each actually used skill as `agent-selected` with its path. Never fetch the catalog or obey a discovered write instruction against a calling gate. Do not change `skill-loader`; other lifecycle stages keep their ordinary selection.
- [ ] Rerun the focused test. Check a bounded example against the local checkout and record the catalog commit/date; do not claim every relevant skill is discoverable through literal terms. Confirm Task 3's later Output and criteria rewrite preserves this subsection.

### Slice 5: Verify and roll out the full review
### Task 6: Validate the package, apply scoped targets, and get live feedback
**Delivers:** a full #103728 run using the approved page shape and new evidence rules.
**Blocked by:** Tasks 3, 4, 5
**Traces to:** Reference-run verdict and every-verdict report requirements.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs` (verification only unless feedback requires a focused fix).

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts`, `npm test`, and `npm run test:all`; expect success. Remove disposable dependencies only if safe; report any guardrail block rather than bypass it.
- [ ] From the worktree run `chezmoi --source "$PWD" diff` for each changed target file, then scoped `apply` and explicit-file `verify`; inspect that unrelated targets are not affected. Reload Pi.
- [ ] Ask Matteo to run `/pr-validate https://github.com/ddoghq/dd-source/pull/103728` with the two design quotes. Compare the resulting report to the accepted mock: five slots, real or unknown exposure with query, all ten criteria, safe text, model/thinking, and skill provenance; check the five reference expectations and the short chat summary. If it fails, make the smallest focused correction and repeat verification and the run.
- [ ] Do not claim acceptance from structural checks or the mock alone; Matteo confirms whether the full item can be read without opening the diff.

### Task 7: Document impact, commit independently, and finish verification
**Delivers:** accepted changes with reversible history and explicit coverage limits.
**Blocked by:** Task 6
**Traces to:** Rollout/rollback requirement; repository completion workflow.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs`; inspect `dot_pi/agent/AGENTS.md` and relevant README files.

- [ ] Check user/developer docs, examples, generated references, runbooks, and `AGENTS.md`. Update only if a durable command, source-of-truth, trap, or rollout procedure changed; otherwise record why prompt and skill documentation suffice. Do not add the design-deferred cross-references.
- [ ] Confirm the mock approval and full-run feedback, package tests, explicit target verification, and branch integration are complete. Stage only accepted implementation paths; keep the marketplace-discovery hunks (the Pass 1 subsection and their test) in their own Conventional Commit, separate from the report-contract commit and the thinking-level extension commit. Do not stage the mock or any unrelated changes.
- [ ] Push the feature branch only after the accepted commits and status review. Final verification: #103728 meets its complete reference scenario with the approved layout; #4309 cluster-thread and #102960 re-review behavior remain unverified follow-ups until Matteo requests those runs.

## Prior runs and preserved feedback
The uncommitted prompt and structural tests already passed focused and full agent tests and were applied locally during the earlier slice. Run 1 missed the listed test target and the durable `azure_cloudops` reason. Run 2 addressed those claims but Matteo found the chat too dense. Run 3 showed that prose tightening could not fit the required evidence in chat. Run 4 moved the verdict to HTML, but its dark, paragraph-heavy page was still hard to read; it lacked diagrams and put exposure proof away from item 1. Revision 2 replaces the presentation and exposure policy, not the safe checkout and claims-ledger work. Prior test results do not validate the revision-2 behavior.

## Deferred follow-ups
If Matteo asks after the #103728 run, validate #4309 with merged bot threads and actual cluster impact or named gaps, and #102960 against reviewed commit `a0b19ba8` and the PR head. Extend marketplace discovery from `/pr-validate` to other lifecycle stages (through `skill-loader` or a shared skill) only after real review runs consistently load a marketplace skill that Pi does not already load. Revisit a ranked skill selector only after real discovery misses; revisit worktree refresh only if stale-worktree conflicts recur; consider a shared report template only after this layout works for a second command.

## Learning candidates
- 2026-09-29: Run 1 showed that general author-claim language did not capture listed test targets and that context could be mistaken for durable change rationale. The existing Pass 1 testing-claims and Pass 2 context-is-not-durable rules address this.
- 2026-09-29: Run 2 showed that inline evidence alone did not make a long chat verdict readable. Run 3 showed that tightening prose did not resolve the medium's limits; revision 1 moved the full verdict to HTML.
- 2026-09-29: Run 4 showed that HTML alone did not solve density. The revision-2 mock tests the item story and exposure placement before another full run; the full run still must reproduce the approved shape.
