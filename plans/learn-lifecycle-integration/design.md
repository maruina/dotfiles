# Learn Lifecycle Integration Design
## Status
Approved on 2026-09-13 and amended after systematic review with user confirmation. The amendment adds branch-correlated plan resolution, complete pre-verification behavioral checks, and disposable-vault staleness validation.
## Problem
Learning moments occur mid-workflow — `/systematic-review` findings, `/simplify` lessons, and `/pr-address-feedback` adjudications — but nothing captures them at the moment they occur. `/learn` is a separate, manually triggered command that is routinely forgotten, and no lifecycle prompt references it in any handoff; the only mentions are a lifecycle line in `simplify.md` and one sentence in the root `AGENTS.md`. When `/learn` runs late, it must rediscover candidates from retained sessions and merged pull requests: archaeology instead of adjudication.

Three further gaps:

- `/learn` routes every accepted learning to `Datadog/Learnings.md`, including learnings that are really "a skill's or prompt's guidance was wrong or missing"; those belong in skills or prompts, which are behavior-bearing chezmoi-managed files that should enter the normal development workflow.
- The learning store has no staleness control. A section contradicted by current source keeps being injected into `/brainstorm` and `/plan` decisions, and stale guidance at decision time is worse than none.
- `/learn`'s current no-argument mode silently performs the heavyweight daily scan: GitHub account switching, broad session sweeps, and 1000-result merged-PR searches.
## User and audience
The primary user is Matteo, operating Pi across `maruina` and Datadog (`matteo-ruina_ddog`) repositories. Future Pi sessions are the primary consumer: `/brainstorm` and `/plan` consult the learning store at decision time. The design must remain understandable without this conversation.
## Goals
- Make plain `/learn` resolve the work's artifacts predictably: prefer the current branch-correlated `**/plans/<branch-slug>/plan.md` in the current worktree, then use global plan discovery with sibling `design.md`, design fallback, and stop-and-suggest when nothing exists.
- Drop the retrospective daily scan entirely; `/learn` runs plain mode (resolve the work's plan and ledger candidates) or contextual mode (PR/plan/design path, or free-form guidance).
- Keep contextual mode unchanged: `/learn <PR URL | plan/design path | context>`.
- Capture learning candidates at the moment they occur in a `## Learning candidates` plan section, created only when a candidate exists, written only by writable lifecycle stages.
- Add a non-derivability bar to `/learn` adjudication and to ledger capture: only guidance a fresh model would not reliably produce and apply unaided.
- Add staleness control: `/learn`'s staged rewrite re-validates sections older than six months, corrects or removes contradicted ones in the same approved preview, and bumps the date line to last-validated; `/brainstorm` and `/plan` treat older-than-six-months sections as hypotheses.
- Add a routing rule: agent-behavior learnings become concrete skill or prompt improvement proposals in `/learn`'s report; they do not enter the vault and are not auto-applied.
- Add the `/learn` trigger at the natural moment: `/pr-address-feedback`'s follow-up names plain `/learn` when candidates exist.
- Keep prompt additions minimal: one-to-three lines per capture duty.

## Non-goals
- No changes to `/learn`'s HARD-GATE, snapshot and compensation transaction, source precedence, privacy rules, or qualification paths beyond the added tests and the maintenance pass.
- No session IDs in `design.md` or `plan.md`.
- No `learn-evidence.mjs` changes.
- No automatic skill or prompt edits from `/learn`; improvement proposals enter the normal lifecycle.
- No hard section-count cap on the learning store.
- No capture duty in read-only stages: `/systematic-review` and `/verify` keep their HARD-GATEs and write nothing.
- No `/verify`-time reminder.

## Context reviewed
- `dot_pi/agent/exact_prompts/learn.md`: plain and contextual modes, evidence source precedence, adjudication qualification paths, exact preview and transaction contract, the "one exact staged final document" rewrite, and the no-candidate rule.
- `dot_pi/agent/exact_prompts/brainstorm.md` and `plan.md`: the `### Advisory learning lookup` paragraphs, "current source takes precedence" rule, and the plan ledger contracts (`## Skills loaded and used`, `### Execution`).
- `dot_pi/agent/exact_prompts/execute.md` and `simplify.md`: plan-ledger duties, deviation notes, the simplify plan-note, lifecycle line, and handoff phrases.
- `dot_pi/agent/exact_prompts/verify.md` and `systematic-review.md`: read-only HARD-GATEs and the plan-review checklist.
- `dot_pi/agent/exact_prompts/pr-address-feedback.md` and `pr-cleanup.md`: autonomy contract, adjudication decisions (`adopt as suggested`, `adopt different approach`, ...), Phase 6 output, and follow-up section; `pr-cleanup` only removes review worktrees, so `/pr-address-feedback` is the terminal author-flow prompt.
- `resolve-worktree` skill: glob discovery across all worktrees, single-match confirmation, multi-match list-and-ask, context switch to the owning root.
- `dot_pi/agent/exact_scripts/learn-evidence.mjs`: `sessions-window`, `sessions-search`, `session-context`, and `learning-sections` commands; sessions are retrieved by date windows and search terms, not session IDs.
- Pi prompt-template documentation: prompt templates interpolate `$ARGUMENTS`/`$@` only; the current session ID is available to extensions (`ctx.sessionManager`), not to prompt text.
- Root `AGENTS.md` workflow section: the existing `/learn` sentence.
- `Datadog/Learnings.md`: ten H2 sections with an update-date line, repository code spans, tags, and evidence bullets.

### Advisory learning lookup
Read the complete `Datadog/Learnings.md` on 2026-09-13 and piped it through `learn-evidence.mjs learning-sections` with terms `session`, `learning`, `plan`, `prompt`, and `evidence`. All ten sections matched only on the generic term `evidence`; none concern the Pi learning workflow, session capture, or learning routing. No material guidance applied to this design.

### Unavailable or deferred evidence
- No measurement exists of how often `/learn` currently runs or which qualification path produces accepted entries; effectiveness validation is observational over the next work cycles.
- Whether six months is the right staleness threshold is unproven; it is a single tunable constant applied identically in `/learn` re-validation and `/brainstorm`/`/plan` consumption.
## Current behavior
- `/learn` with no arguments runs daily mode: previous local day scan across retained sessions plus merged PRs of both GitHub accounts. `/learn` with context runs contextual mode.
- No lifecycle handoff mentions `/learn`.
- The plan ledger: `/plan` and `/execute` maintain `## Skills loaded and used` plus `### Execution`; `/simplify` appends a simplification note; `/pr-address-feedback` has no ledger duty.
- The learning store: ten H2 sections, each with an update date (learn.md: "an update date"), tags, and evidence bullets; each approved `/learn` run stages one exact final document of the whole store rather than appending sections.
- `/brainstorm` and `/plan` run the advisory lookup, treat learnings as advisory, and apply the source-precedence rule; nothing surfaces section age.
- `resolve-worktree` discovers candidate files across every worktree, asks for confirmation on a single match, and lists-and-asks on multiple matches.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| The dominant learning source is accepted PR reviewer feedback | `/learn` qualification path 3 exists for accepted reviewer guidance; user reports feedback as the usual source | `/simplify` and `/plan` capture would matter more than designed | First-cycle observation of ledger entries and `/learn` runs |
| Ledger candidates stay within shareable-evidence bounds | Capture duty mandates PR thread URLs, repo-relative paths, and command names | Ledger entries in public repos could leak private references | First `/learn` run over a ledger; review ledger entries in the implementation PR |
| The current branch identifies the active plan on the common path | Branches follow `maruina/<feature>` and plans follow `plans/<feature>/plan.md`; this worktree has nine inherited plans but one branch-correlated plan | Plain mode could select an unrelated inherited plan | Test local branch correlation with inherited plans, then test global and no-match fallbacks |
| Date-line-as-last-validated fits the existing format | learn.md already labels the line "an update date"; provenance lives in evidence bullets with URLs and dates | Original-learning date is lost | Manual check on the first maintenance pass |
| Current store size keeps re-validation cost acceptable | Store holds 10 sections and the staged rewrite already reads the whole document | Unbounded store growth could eventually make aged re-validation expensive | Observe maintenance-pass size and duration; add a separate bound or batching design if the store grows materially |

## Design overview
Four coordinated mechanisms plus small lifecycle-line updates, all prompt-text changes in chezmoi.
### 1. `/learn` interface: plain and contextual
Mode resolution by `$ARGUMENTS`:

- Empty → plain mode.
- Anything else → contextual mode, unchanged.

Plain mode:

1. Read the current branch and derive its feature slug by removing the first `<owner>/` prefix when present. In the current worktree, search recursively for `**/plans/<branch-slug>/plan.md`. If exactly one match exists, resolve that explicit path with the `resolve-worktree` skill and switch context; if multiple matches exist, list them and ask.
2. If no branch-correlated plan exists, preflight `**/plans/*/plan.md` across every worktree. Invoke `resolve-worktree` with that `$GLOB` only when candidates exist, preserving its confirmation and ambiguity contract.
3. Read the resolved plan completely, including `## Learning candidates`, and read its sibling `design.md` when present.
4. If no plan candidate exists anywhere, preflight and resolve `**/plans/*/design.md` the same way.
5. If neither artifact exists, stop and suggest explicit context — a plan/design path, PR URL, or described guidance; never invoke the resolver's generic no-match stop.
6. Resolution and reading are permitted; the HARD-GATE forbids repository and vault mutation, not context resolution.
7. Evidence set: ledger candidates, the sibling design, the current conversation, the branch's PR via `gh pr list --head <branch> --state all --limit 20` with explicit zero/multiple-match handling, and `sessions-search` recurrence adjudication as today. Preserve the existing account-routing and login capture/restore contract.

Frontmatter: update `argument-hint` to `[<PR URL | plan/design path | context>]`.

### 2. Ledger capture: writable stages only
Each of the four writable stage prompts gains a one-to-three-line duty. When a candidate occurs, the stage appends one bullet to the plan's `## Learning candidates` section and creates the section only on the first candidate:

`- YYYY-MM-DD: <what happened> — evidence: <shareable pointer: PR thread URL, repo-relative file and line, or command and result>`

Capture pre-filter, identical in spirit to the adjudication bar: record only surprises — evidence disproved the model's initial approach, a reviewer corrected a genuine blind spot, or a tool or environment behaved non-obviously. Never record routine best practice the model would produce unaided, and never record design rationale.

- `plan.md`: candidates from `/systematic-review` findings and reviewer feedback that disproved an initial approach and changed the design or plan.
- `execute.md`: wrong turns and disproven plan assumptions discovered during implementation, extending the existing deviation-notes duty.
- `simplify.md`: lessons where a materially simpler path existed and was initially missed, extending the existing plan-note duty.
- `pr-address-feedback.md`: accepted reviewer guidance — `adopt as suggested` with generalizable content, and `adopt different approach` outcomes where the chosen alternative embodies a lesson. Write to the plan ledger when the plan is in the PR worktree; otherwise report candidates in the Phase 6 output only.
- `pr-address-feedback.md` follow-up: when candidates were recorded or accepted reviewer guidance exists, end with the suggestion to run plain `/learn`.
- Read-only stages capture nothing directly: `/systematic-review` and `/verify` findings flow through the stages above.

### 3. Adjudication additions in `/learn`
Non-derivability test, extending the "Propose a learning only when..." clause: a qualifying candidate must encode at least one non-derivable element — an environment fact, tool quirk, semantic trap, or demonstrated model blind spot. Formulation: would a fresh model reliably produce and apply this guidance unaided at the moment it matters? If yes, reject even when the mistake repeated. Independent recurrence (qualification path 1) is evidence of non-derivability in practice; the test sharpens the paths rather than replacing them.

Routing rule: adjudicate each qualifying candidate to exactly one primary target.

- Domain or technical guidance → `Datadog/Learnings.md` through the existing transaction.
- Agent-behavior guidance — a skill's or prompt's guidance is wrong or missing → a concrete improvement proposal in the `/learn` report. The proposal enters the normal lifecycle; do not write it into the vault and do not edit skills from `/learn`.
- Dual candidates: vault entry only for the domain part; proposal for the skill or prompt part.

### 4. Staleness control
`/learn` maintenance pass, in every mode that stages a rewrite: when preparing the exact staged final document, re-adjudicate every section whose date line is strictly earlier than the local calendar date shifted back six calendar months against current source, tools, documentation, and consumption-time corrections. A date exactly on the threshold is not older; a missing or malformed date requires re-adjudication and explicit reporting. Apply the same qualification and routing rules to corrected guidance: retain and update a contradicted section only when a non-derivable corrected intervention remains; otherwise remove it. Removals appear in the preview as `### Removal: <title>` with reason and share the same one-approval transaction. Surviving sections' dates bump to last validated. Amend the no-candidate rule: preview and ask approval whenever additions, updates, removals, or the pending legacy migration deletion exist.

Consumption guard: the `### Advisory learning lookup` paragraphs in `brainstorm.md` and `plan.md` each gain one sentence — sections whose date is older than six months are hypotheses to re-check against current evidence, not established facts.

### 5. Lifecycle line updates
- Root `AGENTS.md`: after the work lands, run `/learn`, which resolves the plan and its recorded learning candidates.
- `simplify.md` lifecycle line already mentions `/learn`; verify wording consistency with plain-mode semantics and update if needed.
- `learn.md` frontmatter argument-hint per mechanism 1.

## Components and boundaries
| Component | File | Responsibility |
|---|---|---|
| Learning interface | `dot_pi/agent/exact_prompts/learn.md` | Mode resolution, plain-mode resolution contract, evidence set, non-derivability test, routing rule, staleness maintenance pass, removal preview |
| Capture duties | `dot_pi/agent/exact_prompts/plan.md`, `execute.md`, `simplify.md`, `pr-address-feedback.md` | One-line `## Learning candidates` duties; `/pr-address-feedback` follow-up reminder |
| Consumption guard | `dot_pi/agent/exact_prompts/brainstorm.md`, `plan.md` | Age-aware sentence in each advisory learning lookup |
| Workflow doc | `dot_pi/agent/AGENTS.md` | Updated `/learn` workflow sentence |
| Unchanged | `verify.md`, `systematic-review.md`, `pr-cleanup.md`, `learn-evidence.mjs`, `resolve-worktree` skill, vault transaction protocol | No changes |

## Alternatives considered
### Session IDs in design.md and plan.md
Merit: precise session retrieval would shortcut evidence discovery for late `/learn` runs. Rejected: the evidence pipeline retrieves by date windows and search terms, not session IDs; PR URLs and commits are durable, shareable anchors while local session paths are private evidence references; and prompt templates interpolate only `$ARGUMENTS`, so acquiring the current session ID would need a racy newest-file heuristic or new extension plumbing.
### Reminders only, no ledger capture
Merit: the smallest possible change — a few one-line reminders and no contract change to `/learn`. Rejected: mid-session discoveries that never reach GitHub, such as silently fixed systematic-review findings and simplify lessons, remain discoverable only by expensive retrospective archaeology; the capture gap stays.
### Hard section-count cap on the store
Merit: a trivially enforceable bound on store growth. Rejected as arbitrary: the non-derivability bar controls input quality and the staleness pass prunes dead entries; a count cap would force deleting good entries while sparing bad ones based on insertion order.
### `/verify`-time `/learn` reminder
Merit: `/verify` always runs before PR creation, so the trigger would fire once per plan. Rejected: `/verify` is a read-only verdict gate, not a learning moment, and the richest source — PR reviewer feedback — arrives after it; the reminder belongs at the terminal author-flow prompt.
### Automatic skill edits from `/learn`
Merit: immediate propagation of agent-behavior learnings with no manual step. Rejected: skills are behavior-bearing chezmoi-managed code; unreviewed writes would bypass the review gate and let one ambiguous session teach permanent behavior. The `/troubleshoot` design reached the same conclusion for routing candidates.
### Weekly-summary candidate scan
Merit: observability for dormant candidates across all merged plans. Deferred: not needed for the core loop; reconsider if candidates accumulate unaddressed.

## Risks and mitigations
| Risk | Mitigation |
|---|---|
| Prompt bloat across lifecycle prompts | One-to-three-line budget per capture duty; the ledger reuses the existing plan-ledger pattern |
| Ledger noise: derivable entries recorded anyway | Capture pre-filter plus `/learn` adjudication rejection; the ledger is pre-adjudication evidence, so noise costs a rejection step, not vault pollution |
| Re-validation cost grows with the store | At the current 10-section scale, inspect every aged section during the staged rewrite; observe growth and design batching or a cap separately if this becomes material |
| Retrospective discoverability regression: plain `/learn` only surfaces learnings for work that wrote a plan | `/pr-address-feedback` reminder plus the `AGENTS.md` sentence; free-text `/learn` covers guidance outside plans; the tradeoff is accepted and named in self-review |
| Inherited plans make global discovery noisy | Prefer the unique current branch-correlated plan; preserve global list-and-ask only as fallback |
| Removal preview mistakes: losing a good entry | The existing snapshot and compensation transaction covers the whole store; removals require explicit approval |
| Committed ledger entries leak private references in public repos | The capture duty mandates shareable pointers only; learn.md privacy rules already exclude session paths and secrets |

## Operability and maintenance
A local agent workflow, not a service. Observable artifacts: `## Learning candidates` entries in committed plans, `/learn` preview and removal reports, and date lines in `Datadog/Learnings.md`. Maintenance is self-contained: every `/learn` run re-validates aged sections; design and plan artifacts record consumption-time corrections; skill-shaped proposals flow into the normal lifecycle. Ownership is entirely chezmoi-managed by Matteo.

## Rollout and rollback
Rollout: one PR to `maruina/dotfiles`. Before `/verify`, validate source prompts with `pi --no-prompt-templates --prompt-template "$PWD/dot_pi/agent/exact_prompts"` and inspect targeted `chezmoi --source "$PWD" diff` output without applying. After a fresh `VERIFIED` result, apply all changed managed prompt, guidance, and test-script targets, then run rendered checks. Prompts are read at invocation, so there is no migration or version compatibility concern.
Rollback: `git revert`, inspect the same targeted diff, and apply all reverted managed targets.

## Security and data handling
- Ledger entries live in committed plan files, including public repositories: only shareable evidence pointers — PR thread URLs, repo-relative file paths, command names and results. Never session paths, tokens, secrets, or vault content.
- The vault transaction is unchanged: 0600 snapshots, a staged final document outside the repository and vault, one approval, byte-exact read-back, and compensation on failure.
- The staleness dry run targets only a uniquely named disposable vault; every Obsidian command must use its explicit `vault=<name>` selector. Access to `main` or ambient-vault fallback fails the test.
- Removing stale sections reduces private-data accumulation.

## Testing strategy
Prompt behavior and marker tests change; `learn-evidence.mjs` and its unit tests remain untouched. Validation:

1. Structural: touched prompts have valid frontmatter, `$ARGUMENTS` expands, and exact handoff phrases remain intact.
2. Consistency: the `simplify.md` lifecycle line, `AGENTS.md` sentence, and `/pr-address-feedback` follow-up agree on plain-learn semantics.
3. Controlled dry runs before `/verify`, using the source prompt directory: plain `/learn` in a worktree with inherited plans selects the current branch-correlated plan; `/learn` with no plan anywhere suggests explicit context without scanning; a deliberately derivable candidate is rejected citing the non-derivability test; and agent-behavior guidance becomes an improvement proposal rather than a vault entry. Snapshot and compare real GitHub login and vault state where those runs inspect real evidence; reject every preview.
4. Staleness dry run before `/verify`: create and register a disposable Obsidian vault containing one wholly contradicted section dated `2000-01-01`; add a test-only system instruction requiring every Obsidian command to name that vault and forbidding access to `main`; invoke the source `/learn`, expect a `### Removal:` preview in the one-approval transaction, reject it, verify the fixture is unchanged, then unregister and remove the disposable vault.
5. First real cycle: the next PR with reviewer feedback records ledger candidates, the `/pr-address-feedback` follow-up names `/learn`, and plain `/learn` adjudicates them.

The implementation PR itself follows `/execute` → `/verify`; prompt changes are behavior-bearing per `/verify`'s risk classification.

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `agent-selected` | Plain `/learn`'s resolution contract depends on the skill's explicit-path, glob, and ambiguity semantics | Reused explicit-path resolution for the branch-correlated common path and global list-and-ask as fallback; preflight no-match handling avoids conflicting with the skill's mandatory stop |
| `obsidian-cli` | `prompt-required` | The brainstorm advisory lookup and disposable-vault validation require exact vault targeting | Read the complete store; later confirmed the installed CLI supports `vault=<name>` and exact `path=<path>` targeting for an isolated staleness test |
| `chezmoi` | `agent-selected` | The revised rollout changes managed prompt, guidance, and test-script targets | Kept validation against source prompts before `/verify` and moved complete managed-target application after `VERIFIED` |
| `cli-best-practices` | `agent-selected` | Plain `/learn` adds mode selection, fallback behavior, and PR discovery | Made the common input path deterministic and recovery explicit; Pi prompt semantics take precedence over inapplicable structured-output guidance |
| `script-best-practices` | `agent-selected` | The testing strategy uses temporary-directory and source-prompt shell commands | Required quoted paths, bounded disposable resources, explicit cleanup, and no ambient-vault reliance |
| `write` | `agent-selected` | The approved resolution and validation decisions required design prose changes | Clarified sequencing, test obligations, and the distinction between pre-verification checks and post-verification rollout |

## Self-review notes
The design was reviewed skeptically for safety, maintainability, and noise control.
- Accepted downside named: removing the daily scan removes the zero-effort retrospective. If no `/learn` variant runs, candidates sit dormant in merged plan ledgers. The trigger is instead wired to `/pr-address-feedback`, the natural terminal moment; the removal also eliminates the silent heavyweight scan that touched GitHub auth state and the vault on every no-argument invocation.
- Accepted concern: capture duties rely on the model's own judgment to pre-filter surprises, so a weak model may record derivable entries. The ledger is pre-adjudication evidence and `/learn` re-filters with the same test, so ledger noise costs a rejection step, not vault pollution.
- Rejected finding: a `/verify`-time reminder. It would guarantee one trigger per plan, but `/verify` is a verdict gate and the richest learning source arrives after it; the reminder belongs where learning happens.
- Rejected finding: a hard section-count cap. The quality bar plus staleness pruning is the real bound.
- Closed observation: legacy flag-style Obsidian syntax returned a fuzzy match during discovery. The installed CLI's canonical `obsidian vault=<name> read path=<path>` form was verified with the exact `main` path and is required for the disposable-vault test.

## Decision records
- Decision: plain `/learn` resolves the current branch-correlated plan first, then uses global plan discovery, sibling design, design fallback, and stop-and-suggest. Rationale: worktrees inherit many historical plans, so unrestricted global discovery is ambiguous on the common path; `resolve-worktree` still owns explicit-path resolution and fallback selection.
- Decision: the retrospective daily scan is removed. Rationale: it was a silent heavyweight sweep touching GitHub auth state on every no-argument invocation, and the forgetting problem is addressed by structural capture and a terminal-flow reminder; plain `/learn` is a narrow resolution of the work's own plan, and free-text context covers guidance outside plans.
- Decision: candidates live in a `## Learning candidates` plan section written only by writable stages. Rationale: the plan is the one durable artifact that spans the workflow and already hosts stage ledgers; chat-only capture dies with `/new`; read-only gates keep their HARD-GATEs.
- Decision: a non-derivability test applies at both capture and adjudication. Rationale: the store must encode what models cannot reliably derive — environment facts, semantic traps, demonstrated blind spots; recurring failures are proof of non-derivability in practice, so the test sharpens rather than replaces the qualification paths.
- Decision: the section date line means last validated, and every `/learn` run is the maintenance moment for sections older than six months. Rationale: the transaction already stages the whole store, so re-validation is nearly free; age visibility at consumption stops stale guidance from masquerading as fact.
- Decision: skill-shaped learnings become proposals, never automatic writes, and never vault entries. Rationale: behavior-bearing chezmoi-managed files need the review gate; routing knowledge grows only through evidence and review.
