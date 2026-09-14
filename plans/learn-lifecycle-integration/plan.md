# Learn Lifecycle Integration Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire learning capture into the Pi lifecycle so plain `/learn` resolves the work's plan and its recorded candidates, with a non-derivability bar, skill/prompt routing, and staleness control on the learning store.
**Out of Scope:** No changes to `/learn`'s HARD-GATE, vault snapshot/compensation transaction, source precedence, or privacy rules; no `learn-evidence.mjs` changes; no session IDs in lifecycle artifacts; no capture duty in read-only stages (`/systematic-review`, `/verify`); no `/verify`-time reminder; no automatic skill or prompt edits from `/learn`; no hard section-count cap; weekly-summary candidate scan deferred.
**Architecture:** Prompt-text changes across six lifecycle prompts plus `dot_pi/agent/AGENTS.md`, with two managed marker-test files. Plain `/learn` prefers the current branch-correlated plan before global discovery; writable stages capture candidates in `## Learning candidates`, and `/learn` adjudicates them. Validate source prompts and all behavioral scenarios before `/verify`, then apply all nine changed managed targets only after `VERIFIED`.
**Tech Stack:** Pi prompt templates (Markdown + YAML frontmatter, `$ARGUMENTS`), Node `node:test` marker tests, chezmoi exact-copy sources, GitHub CLI, and real plus disposable Obsidian vaults for controlled validation.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | `/plan` input handling requires resolving the supplied design path | Confirmed the design lives in this worktree; switched context to `maruina/learn-lifecycle-integration` |
| `skill-loader` | `prompt-required` | Required at the start of `/plan` | Determined `chezmoi` and `write` as the matching skills for chezmoi-managed Markdown prompt edits |
| `chezmoi` | `skill-loader` | All touched files live under the chezmoi source tree | Confirmed exact-copy semantics, mapped both changed tests to rendered script targets, and separated pre-verification diff review from post-`VERIFIED` apply |
| `write` | `skill-loader` | Drafting plan and prompt prose | Applied clarity and concision rules to planned prompt wording and this plan |
| `cli-best-practices` | `agent-selected` | Plain `/learn` adds mode selection, fallback behavior, and PR discovery | Made branch-correlated resolution deterministic, added explicit no-match recovery, and required merged-PR discovery with `--state all` |
| `obsidian-cli` | `agent-selected` | The aged-removal scenario needs isolated vault behavior | Confirmed the installed CLI supports explicit `vault=<name>` and exact `path=<path>` targeting; designed a disposable-vault dry run that forbids access to `main` |
| `script-best-practices` | `agent-selected` | Task 5 contains source-prompt, temporary-directory, and cleanup commands | Required quoted paths, bounded temporary state, explicit cleanup, and no reliance on the ambient active vault |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | `/execute` requires resolving the plan path and switching to the owning worktree | Confirmed the plan and lifecycle docs live in the `maruina/learn-lifecycle-integration` worktree and the tree is clean |
| `skill-loader` | `prompt-required` | Required at the start of `/execute` | Determined `chezmoi` and `write` as the matching skills for the touched chezmoi-managed Markdown prompts and scripts |
| `chezmoi` | `skill-loader` | All touched files are chezmoi source | Confirmed exact-copy mapping for the nine managed targets; kept all edits source-only with no rendered-target writes |
| `write` | `skill-loader` | Prompt prose edits | Applied concision and precise-wording rules to capture duties, guard sentences, and `learn.md` modes |
| `cli-best-practices` | `agent-selected` | `learn.md` defines a command interface with modes and fallback behavior | Guided deterministic plain-mode resolution, explicit zero/multiple-match reporting, and non-blocking recovery wording |
| `script-best-practices` | `agent-selected` | Task 5 dry runs use source-prompt, temporary-directory, and cleanup shell commands | Applied quoted paths, bounded disposable state, explicit cleanup, and no ambient-vault reliance in dry-run commands |

### Advisory learning lookup
Ran the prompt-required lookup on 2026-09-13: read the complete `Datadog/Learnings.md` (10 sections) through Obsidian and piped it through `learn-evidence.mjs learning-sections` with terms `learn`, `learning`, `prompt`, `staleness`, `ledger`. One section matched ("Render piped chezmoi templates against an initialized config, not `--init`"); it is not material because no `.tmpl` files are touched. No guidance applied, consistent with the design's lookup. No evidence source was skipped.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Plain-mode plan resolution | Derive the current branch slug, prefer a unique current-worktree `**/plans/<branch-slug>/plan.md` (ask on multiple local matches), then preflight global plan/design candidates before invoking `resolve-worktree` | Branch naming and plan layout correlate in this worktree; nine `plans/*/` directories exist here, eight unrelated to the branch slug and one branch-correlated; the skill supports explicit-path and global-glob resolution but stops on no match | Marker test + source dry runs 1, 2, and 2b | If branch correlation fails, preserve global list-and-ask; if preflight finds nothing, emit `/learn`'s stop-and-suggest without invoking the resolver |
| Structural prompt contracts | `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` and `lifecycle-prompts.test.mjs` marker tests via `npm run test:prompts` | Files exist; baseline 25/25 green in this worktree | Red → green per task | n/a |
| Prompt byte budgets | Budget assertions: `brainstorm.md` ≤ 14,000, `plan.md` ≤ 18,000 bytes | Current sizes 10,947 and 15,961 (headroom 3,053 / 2,039) | Budget test stays green after additions | Tighten wording; never raise a budget without user approval |
| Rendered-target update | Before `/verify`, `chezmoi --source "$PWD" diff` all nine exact-copy targets; after `VERIFIED`, apply the same target set | Chezmoi maps six prompts, `AGENTS.md`, and both changed tests to managed targets | Reviewed pre-verification diff; post-rollout targeted diff clean and rendered tests green | Block and report drift; never apply an unverified candidate |
| Plain-mode PR evidence | `gh pr list --head <branch> --state all --limit 20` plus zero/multiple-match handling and existing account/login restoration | Installed `gh` documents `open` as the default state; the bounded `--state all` command returned merged PR #71 for `maruina/confluence-cli-migration` | Controlled branch-PR check before `/verify` | Report unavailable or ambiguous evidence; never silently treat it as absent |
| Disposable staleness validation | Register a `mktemp -d` directory as a uniquely named Obsidian vault; use canonical `obsidian vault=<name> ... path=<path>` commands and a test-only Pi system instruction that forbids `main` | Installed Obsidian CLI lists known vaults and exact vault/path selectors; `obsidian vault=main vault info=path` returned the exact configured path | Dry run 5 checks target path, tool calls, removal preview plus undated-section re-adjudication, rejection, byte-identical fixture state, unregistration, and directory cleanup | Stop; do not substitute the real vault or claim staleness behavior passed |
| Learning-section plumbing | `learn-evidence.mjs learning-sections` (unchanged) | Script usage text lists the command; `npm run test:learn` exists | `test:learn` stays green (untouched) | n/a |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Learning interface | `dot_pi/agent/exact_prompts/learn.md` | Branch-correlated plain mode, contextual mode, non-derivability test, routing rule, staleness maintenance pass, removal preview, argument-hint | `learn-prompts.test.mjs` markers; source dry runs 1–5 |
| Capture duties | `dot_pi/agent/exact_prompts/plan.md`, `execute.md`, `simplify.md`, `pr-address-feedback.md` | One-to-three-line `## Learning candidates` duties with pre-filter; `/learn` follow-up reminder | `lifecycle-prompts.test.mjs` markers; consistency `rg` |
| Consumption guard | `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md` | Age-aware sentence in each `### Advisory learning lookup` | `learn-prompts.test.mjs` marker; byte budgets |
| Workflow doc | `dot_pi/agent/AGENTS.md` | `/learn` workflow sentence names plain mode | `learn-prompts.test.mjs` lifecycle test |
| Test seam | `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`, `lifecycle-prompts.test.mjs` | Pin the new contracts; update the stale argument-hint assertion | Red before implementation, green after |
| Unchanged | `verify.md`, `systematic-review.md`, `pr-cleanup.md`, `learn-evidence.mjs`, `resolve-worktree` skill | Read-only gates and helper stay as-is | Negative `rg` checks in Task 5 |

### Key Decisions
- **Test-seam correction to the design (confirmed in the alignment brief):** the design's "no unit-test changes apply" is wrong — `learn-prompts.test.mjs` asserts `argument-hint: "\[context\]"`, which mechanism 1 changes. The plan updates that assertion and extends the marker tests for the new contracts, following the repository's established marker-test pattern.
- **Self-contained capture duties:** the candidate format and pre-filter are repeated in each writable stage within the one-to-three-line budget, because prompts are read independently and must not cross-reference each other for a contract.
- **`pr-address-feedback` ledger-plan discovery (post-review refinement):** the ledger plan is the unique branch-correlated `**/plans/<branch-slug>/plan.md` in the PR worktree, derived with the same first-`<owner>/`-prefix stripping as plain-mode resolution; zero or multiple matches fall back to Phase-6-only reporting, so the autonomy contract never requires a silent pick.
- **`simplify.md` lifecycle line stays unchanged:** its current wording ("`/learn` captures evidence-backed guidance after the work lands") is already consistent with plain-mode semantics; only the capture duty (Task 2) is added. Recorded here so Task 4 does not churn it.
- **Branch-correlated common path:** plain mode strips the first owner prefix from the current branch, searches the current worktree for `**/plans/<branch-slug>/plan.md`, and resolves a unique match explicitly. Global list-and-ask remains the fallback; a preflight handles zero candidates so the resolver's mandatory generic stop cannot override `/learn`'s recovery message.
- **Source validation before rollout:** controlled dry runs load prompts from `dot_pi/agent/exact_prompts`; no managed target is applied until a fresh `/verify` returns `VERIFIED`. Post-verification rollout applies six prompts, `AGENTS.md`, and both changed marker-test scripts.
- **One PR, per-slice commits:** five slices land as separate Conventional Commits on branch `maruina/learn-lifecycle-integration`; the PR is opened through the normal `/execute` → `/verify` flow, not inside a task.

### Implementation Constraints
- Continue in the worktree containing this plan on branch `maruina/learn-lifecycle-integration`; never commit on `main`. Use `$PWD` from that resolved root in commands rather than embedding an absolute worktree path.
- Preserve asserted phrasings that amended text must keep matching: `contextual mode`, `restore.*original.*login` (`/is`), `no learning qualifies.*do not ask for approval` (`/is`), `## Handoff` plus `Report the exact handoff phrase below` in `plan.md` and `simplify.md`.
- Negative invariant: `execute.md` and `verify.md` must never match `Datadog/Learnings.md`, `learning-sections`, or `obsidian read/create/delete`. The `execute.md` capture duty must reference only the plan's `## Learning candidates` section.
- Byte budgets: `brainstorm.md` ≤ 14,000 and `plan.md` ≤ 18,000 bytes. Keep the `plan.md` prompt's capture duty and age guard within the existing 2,039-byte headroom. Tighten wording rather than raising a budget.
- Edit chezmoi source files only; never edit rendered targets under `$HOME`.
- Stop conditions: any marker-test failure not caused by the intended red step, byte-budget overflow, unexpected diff outside the nine changed managed targets, failure to isolate the disposable vault from `main`, or ambiguity about wording that changes a lifecycle contract.

### Security Requirements
- Ledger entries in committed plan files (including public repositories) carry only shareable evidence pointers: PR thread URLs, repo-relative file paths and lines, command names and results. Never session paths, tokens, secrets, or vault content. This mirrors the design's security section and must appear in each capture duty's pre-filter text.
- The vault snapshot/compensation transaction, privacy rules, and `gh` login capture/restore contract are unchanged; Task 1 must not reword them except where the mode structure requires.
- Dry run 5 must target only the disposable vault with an explicit `vault=<unique-name>` selector on every Obsidian command. Any access to `main`, ambient-vault fallback, failed unregistration, or uncertain cleanup is a blocking isolation failure.

### Observability Requirements
Not a service; no logs, metrics, traces, or alerts apply. Observable artifacts per the design: `## Learning candidates` entries in committed plans, `/learn` preview and removal reports, and date lines in `Datadog/Learnings.md`. Task 5's dry-run checklist is the execution-time evidence.

### Failure Modes to Handle
- Marker-test regression from amended pinned phrasings → run `npm run test:prompts` after every prompt edit; fix wording to restore asserted substrings.
- Byte-budget overflow on `plan.md`/`brainstorm.md` → tighten wording; stop and ask before considering a budget change.
- Branch-correlated lookup has zero or multiple matches → use global preflight/list-and-ask for zero local matches; ask on multiple local matches; never pick silently.
- No global plan or design candidate exists → do not invoke the resolver's no-match path; stop and suggest explicit context (a plan/design path, PR URL, or described guidance).
- Disposable-vault setup is unavailable or any command targets `main` → stop the aged-removal dry run, report the isolation failure, and do not substitute the real vault.
- Chezmoi diff includes files beyond the nine reviewed targets → stop and report; do not apply.
- An executor accidentally introducing forbidden markers into `execute.md` → caught by the existing negative test in `learn-prompts.test.mjs`.

### Rollout and Rollback
- Rollout: per-slice commits and one PR to `maruina/dotfiles`; validate source prompts and inspect `chezmoi --source "$PWD" diff` during `/execute`, then run independent `/verify`. Only after `VERIFIED`, apply all nine reviewed managed targets and run rendered tests. Owner: Matteo.
- Rollback: `git revert` the affected commits, inspect the same nine-target diff, apply those reverted targets, and rerun rendered tests. Slices remain separately revertible because they touch mostly disjoint files.

### Test Strategy
- Highest deterministic supported interface for prompt-text contracts: the existing marker-test seam (`cd dot_pi/agent && npm run test:prompts`). Each task adds or updates markers first (red: the narrow command fails, naming the new test), then edits prompts (green).
- System boundaries: none mocked; the tests read prompt files directly. `learn-evidence.mjs` is untouched; `npm run test:learn` must stay green.
- Cross-file consistency: deterministic `rg` checks in Task 5 (capture duties in exactly the four writable stages; lifecycle lines agree on plain-learn semantics; negative invariant holds).
- Rendering: targeted `chezmoi --source "$PWD" diff` on all nine targets in Task 5; apply is a post-`VERIFIED` rollout step.
- Behavioral acceptance: Task 5 runs every manual dry-run scenario through source-loaded prompts before `/verify`. Dry runs 1, 2, and 2b cover branch-correlated resolution, the multi-match ask, and no-match recovery; dry run 4 supplies a deliberately derivable candidate and expects rejection without approval; dry run 5 uses a registered disposable Obsidian vault containing a wholly contradicted section dated `2000-01-01` plus an undated still-valid section, requires every Obsidian command to name that vault, expects an exact removal preview with explicit re-adjudication of the undated section, rejects it, and verifies the fixture remains unchanged. Model adjudication and approval turns make full automation impractical, but each procedure has controlled setup, observable output, state comparison, and cleanup.

## Acceptance Criteria

### Requirement: mode resolution
`/learn` SHALL resolve plain (empty arguments) and contextual (anything else) modes, with plain mode resolving the work's plan first.

#### Scenario: plain mode with inherited plans and a branch-correlated plan
- GIVEN branch `maruina/<feature>` in a worktree containing `**/plans/<feature>/plan.md` plus unrelated inherited plans
- WHEN `/learn` runs with no arguments
- THEN it resolves the unique branch-correlated plan explicitly via `resolve-worktree`, reads it completely including `## Learning candidates`, reads the sibling `design.md` when present, and adjudicates the ledger candidates as the primary candidate set without presenting unrelated plans.

#### Scenario: plain mode with multiple branch-correlated plans
- GIVEN the current worktree contains more than one `**/plans/<branch-slug>/plan.md` match
- WHEN `/learn` runs with no arguments
- THEN it presents every local match and asks which to resolve, and never selects silently.

#### Scenario: plain mode with nothing to resolve
- GIVEN no `**/plans/*/plan.md` and no `**/plans/*/design.md` resolves in any worktree
- WHEN `/learn` runs with no arguments
- THEN it stops and suggests explicit context — a plan/design path, PR URL, or described guidance — and never scans silently.

### Requirement: adjudication bar and routing
`/learn` SHALL reject candidates a fresh model would reliably produce and apply unaided, and SHALL route agent-behavior learnings to skill/prompt improvement proposals instead of the vault.

#### Scenario: derivable candidate rejected
- GIVEN a candidate whose guidance is routine best practice
- WHEN adjudication runs
- THEN it is rejected citing the non-derivability test, even if the mistake repeated.

#### Scenario: agent-behavior candidate routed
- GIVEN a qualifying candidate whose content is "a skill's or prompt's guidance is wrong or missing"
- WHEN the report is produced
- THEN the candidate appears as a concrete improvement proposal in the report, is not written to the vault, and is not auto-applied; a dual candidate yields a vault entry only for its domain part.

### Requirement: staleness control
Every `/learn` mode that stages a store rewrite SHALL re-adjudicate sections dated strictly before the local calendar date shifted back six calendar months, plus sections with missing or malformed dates; it SHALL correct or remove contradicted ones in the same approved preview and treat surviving sections' date lines as last-validated.

#### Scenario: contradicted aged section removed
- GIVEN a section older than six months contradicted by current source
- WHEN the preview is built
- THEN it includes `### Removal: <title>` with the reason, and the removal shares the same one-approval transaction.

#### Scenario: undated section re-adjudicated
- GIVEN a section with a missing or malformed date line
- WHEN the maintenance pass runs
- THEN it is re-adjudicated against current evidence and explicitly reported, and its date line is bumped to last-validated when the guidance survives.

#### Scenario: nothing to approve
- GIVEN no qualifying candidate, no aged-section correction or removal, and no pending legacy migration deletion
- WHEN adjudication completes
- THEN rejected candidates are reported with reasons, no approval is requested, and nothing is written (asserted phrasing `no learning qualifies ... do not ask for approval` preserved).

### Requirement: ledger capture
Writable lifecycle stages SHALL append only surprise candidates that a fresh model would not reliably produce and apply unaided to the plan's `## Learning candidates` section (created only on the first candidate) using the dated evidence-pointer format; read-only stages SHALL capture nothing.

#### Scenario: surprise recorded
- GIVEN evidence disproves a model's initial approach during `/execute`
- WHEN the plan ledger is updated
- THEN a bullet `- YYYY-MM-DD: <what happened> — evidence: <shareable pointer>` is appended under `## Learning candidates`.

#### Scenario: routine event not recorded
- GIVEN a routine best-practice application with no surprise
- WHEN the stage completes
- THEN no ledger entry is created.

### Requirement: terminal reminder
`/pr-address-feedback` SHALL end by naming plain `/learn` when candidates were recorded or accepted reviewer guidance exists, and SHALL NOT emit the suggestion otherwise.

#### Scenario: conditional follow-up
- GIVEN `/pr-address-feedback` recorded a candidate or accepted reviewer guidance
- WHEN Phase 6 completes
- THEN the final follow-up suggests plain `/learn`.
- AND GIVEN neither condition occurred
- WHEN Phase 6 completes
- THEN it emits no `/learn` suggestion.

### Requirement: consumption guard
`brainstorm.md` and `plan.md` advisory lookups SHALL state that sections whose date line is older than six months are hypotheses to re-check against current evidence, not established facts.

#### Scenario: aged guidance consumed cautiously
- GIVEN a matched learning section whose date is older than six months
- WHEN `/brainstorm` or `/plan` consumes it
- THEN the prompt requires current-evidence re-checking and does not treat the section as established fact.

## Tasks

### Task 1: `/learn` interface, adjudication, routing, and staleness
**Delivers:** plain/contextual mode resolution, non-derivability test, routing rule, aged-section maintenance pass with removal preview, amended no-candidate rule, and the new argument-hint, with marker tests green.
**Blocked by:** None
**Traces to:** mode resolution; adjudication bar and routing; staleness control (design mechanisms 1, 3, 4)
**Files:** `dot_pi/agent/exact_prompts/learn.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`

- [x] Red: in `learn-prompts.test.mjs`, replace the assertion `/argument-hint: "\[context\]"/` with `/argument-hint: "\[<PR URL \| plan\/design path \| context>\]"/`, and add markers for the new contracts: `/plain mode/i`, `/current branch/i`, `/branch.*slug/is`, `/current worktree/i`, `/resolve-worktree/`, `/\*\*\/plans\/\*\/plan\.md/`, `/preflight/i`, `/stop.*suggest/is`, `/suggest.*explicit context/is`, `/--state all/`, `/--limit/`, `/zero.*multiple|multiple.*zero/is`, `/non-derivab/i`, `/fresh model/i`, `/improvement proposal/i`, `/six calendar months/i`, `/strictly earlier/i`, `/missing.*malformed|malformed.*missing/is`, `/### Removal:/`, `/## Learning candidates/`. Run `cd dot_pi/agent && npm run test:prompts`; expect failure naming the new markers. _Executed against the pre-daily-removal state: 28 tests, 4 failed; revalidated after the daily-removal rework with 29/29 green._
- [x] Green: edit `learn.md` per design mechanisms 1, 3, and 4:
  - Frontmatter: `argument-hint: "[<PR URL | plan/design path | context>]"`.
  - `## Modes`: two bullets — plain (empty → the resolution contract below), contextual (anything else, unchanged). Keep the string `contextual mode`; the retrospective daily scan and its `## Daily evidence discovery` section are removed.
  - Plain mode contract: read the current branch, remove the first `<owner>/` prefix when present, and search the current worktree recursively for `**/plans/<branch-slug>/plan.md`. Resolve one match as an explicit path through `resolve-worktree`; ask if multiple local matches exist. If none exists, preflight all worktrees for `**/plans/*/plan.md` and invoke the skill with that `$GLOB` only when candidates exist; otherwise repeat the preflight/fallback for `**/plans/*/design.md`. If neither artifact exists, stop and suggest explicit context (a plan/design path, PR URL, or described guidance) without invoking the resolver's generic no-match path. State that resolution and reading are permitted while repository and vault mutation remain forbidden. Read the selected plan including `## Learning candidates` and sibling `design.md`. Evidence set: ledger candidates, sibling design, current conversation, the branch's PR via `gh pr list --head <branch> --state all --limit 20` with explicit zero/multiple-match reporting under the existing account-routing/login-restoration contract, and `sessions-search` recurrence adjudication as context.
  - Adjudication: extend "Propose a learning only when..." with the non-derivability test — would a fresh model reliably produce and apply this guidance unaided at the moment it matters; if yes, reject even when the mistake repeated; independent recurrence (qualification path 1) is evidence of non-derivability in practice.
  - Routing: each qualifying candidate gets exactly one primary target — domain/technical guidance to `Datadog/Learnings.md` through the existing transaction; agent-behavior guidance to a concrete improvement proposal in the report (never the vault, never auto-applied); dual candidates split.
  - Staleness: in every mode staging a rewrite, re-adjudicate sections whose date is strictly earlier than the local calendar date shifted back six calendar months against current source, tools, documentation, and recorded consumption-time corrections; a date exactly on the threshold is not older, while a missing or malformed date requires re-adjudication and explicit reporting. Apply the normal qualification/routing rules to corrected guidance: update only when a non-derivable corrected intervention remains, otherwise remove. Removals preview as `### Removal: <title>` with reason and share the one-approval transaction; surviving sections' date lines bump to last-validated. Amend the no-candidate rule so approval is requested whenever additions, updates, removals, or the pending legacy migration deletion exist — keeping the asserted phrasing `no learning qualifies ... do not ask for approval` intact.
- [x] Run `cd dot_pi/agent && npm run test:prompts`; expect all tests pass. _Executed: 28/28 green._
- [x] Refactor only after green, then rerun the same command. _No refactor needed; prompt text is minimal by construction; rerun green._
- [x] Commit with `feat(pi): add plain mode, non-derivability bar, routing, and staleness control to learn`.

### Task 2: ledger capture duties in writable stages
**Delivers:** one-to-three-line `## Learning candidates` capture duties with the surprise-only pre-filter in the four writable stage prompts, and the plain-`/learn` follow-up reminder in `pr-address-feedback.md`.
**Blocked by:** None
**Traces to:** ledger capture; terminal reminder (design mechanism 2)
**Files:** `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/execute.md`, `dot_pi/agent/exact_prompts/simplify.md`, `dot_pi/agent/exact_prompts/pr-address-feedback.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`

- [x] Red: add a test to `lifecycle-prompts.test.mjs` asserting each of `plan.md`, `execute.md`, `simplify.md`, `pr-address-feedback.md` matches `/## Learning candidates/`, `/— evidence: /`, and `/fresh model.*reliably|reliably.*fresh model/is`; assert `pr-address-feedback.md` matches `/recorded.*accepted reviewer guidance.*\/learn|\/learn.*recorded.*accepted reviewer guidance/is`, `/otherwise.*no.*suggest/is`, `/branch.*slug/is`, and `/zero or multiple/i`; assert `systematic-review.md` and `verify.md` do NOT match `/Learning candidates/`. Run `cd dot_pi/agent && npm run test:prompts`; expect failure naming the new test. _Executed: 29 tests, 1 failed, naming the new test._
- [x] Green: add the duty to each stage, each self-contained within three lines, using this contract: append `- YYYY-MM-DD: <what happened> — evidence: <shareable pointer: PR thread URL, repo-relative file and line, or command and result>` under the plan's `## Learning candidates` section, creating the section only on the first candidate; record only surprises that a fresh model would not reliably produce and apply unaided (evidence disproved the initial approach, a reviewer corrected a genuine blind spot, or a tool or environment behaved non-obviously); never record routine best practice or design rationale; never record session paths, secrets, or vault content. Stage-specific placement and source:
  - `dot_pi/agent/exact_prompts/plan.md`: new `## Learning candidates` section immediately before `## Handoff`; candidates come from `/systematic-review` findings and reviewer feedback that disproved an initial approach and changed the design or plan.
  - `execute.md`: extend `## Plan Updates`; candidates are wrong turns and disproven plan assumptions discovered during implementation, extending the existing deviation-notes duty. Do not reference the vault or `learning-sections` (negative invariant).
  - `simplify.md`: extend the plan-note duty in `## Commit`; candidates are lessons where a materially simpler path existed and was initially missed.
  - `pr-address-feedback.md`: capture accepted reviewer guidance — `adopt as suggested` with generalizable content, and `adopt different approach` outcomes where the chosen alternative embodies a lesson; write candidates to the plan ledger when exactly one branch-correlated `**/plans/<branch-slug>/plan.md` — the PR branch with its first `<owner>/` prefix stripped — exists in the PR worktree, and report candidates in the Phase 6 output only when zero or multiple matches exist, never picking silently; the discovery rule shares the duty's three-line budget. Extend `## Follow-up`: when candidates were recorded or accepted reviewer guidance exists, end by suggesting plain `/learn`; otherwise no suggestion.
- [x] Run `cd dot_pi/agent && npm run test:prompts`; expect all tests pass, including the byte budgets and the `execute.md`/`verify.md` negative invariant. _Executed: 29/29 green; `plan.md` headroom 1,502 bytes after Task 2._
- [x] Refactor only after green, then rerun the same command. _No refactor needed; duties are single bullets within the three-line budget._
- [x] Commit with `feat(pi): record learning candidates in writable lifecycle stages`.

### Task 3: consumption guard in advisory lookups
**Delivers:** the age-aware sentence in both `### Advisory learning lookup` paragraphs.
**Blocked by:** None
**Traces to:** consumption guard (design mechanism 4)
**Files:** `dot_pi/agent/exact_prompts/brainstorm.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`

- [x] Red: extend the brainstorm/plan consumption test in `learn-prompts.test.mjs` with marker `/older than six months.*hypotheses|hypotheses.*older than six months/is`. Run `cd dot_pi/agent && npm run test:prompts`; expect failure naming that test. _Executed: 1 failed, naming the consumption test._
- [x] Green: add one sentence to the second ("Learnings are advisory...") paragraph of each lookup: sections whose date line is older than six months are hypotheses to re-check against current evidence, not established facts.
- [x] Run `cd dot_pi/agent && npm run test:prompts`; expect all tests pass, including byte budgets (`brainstorm.md` ≤ 14,000, `plan.md` ≤ 18,000 bytes). _Executed: 29/29 green; `plan.md` 16,624 bytes (headroom 1,376), `brainstorm.md` 11,073 (headroom 2,927)._
- [x] Refactor only after green, then rerun the same command. _No refactor needed; single-sentence addition._
- [x] Commit with `feat(pi): flag aged learning sections as hypotheses in brainstorm and plan`.

### Task 4: workflow documentation (AGENTS.md)
**Delivers:** the workflow sentence names plain-`/learn` semantics; documentation and future-agent guidance impact is fully covered by this task.
**Blocked by:** 1, 2 (it documents the behavior those tasks ship)
**Traces to:** design mechanism 5; documentation impact
**Files:** `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`

- [x] Red: extend the lifecycle-guidance test in `learn-prompts.test.mjs` to assert `AGENTS.md` matches plain-`/learn` semantics (`/plain.*\/learn.*resolves the work's plan/is`). Run `cd dot_pi/agent && npm run test:prompts`; expect failure naming that test. _Executed and revalidated after the daily-removal rework: green._
- [x] Green: in `dot_pi/agent/AGENTS.md` line 47, replace the final clause "use `/learn` after the work lands when evidence supports durable guidance." with a single clause stating: after the work lands, run `/learn` — plain `/learn` resolves the work's plan and adjudicates its recorded learning candidates.
- [x] Verify the `simplify.md` lifecycle line against plain-mode semantics; per the Key Decisions it is already consistent, so change it only if the final Task 1–2 wording made it inaccurate, and record the outcome in the plan execution notes. _Execution note: `simplify.md` line 12 ("`/learn` captures evidence-backed guidance after the work lands") is consistent with plain-mode semantics and the final Task 1–2 wording; no change made._
- [x] Confirm no other `AGENTS.md` needs changes: the repo-root `AGENTS.md` contains no `/learn` or lifecycle content (verified at planning time); record this in the plan execution notes. _Execution note: repo-root `AGENTS.md` has no `/learn` or lifecycle references; no changes needed._
- [x] Run `cd dot_pi/agent && npm run test:prompts`; expect all tests pass. _Executed: 29/29 green._
- [x] Commit with `docs(pi): name plain learn in workflow guidance`.

### Task 5: integration validation and controlled source dry runs
> In progress: dependency install, full test suites, consistency checks, PR evidence, nine-target diff review, then behavioral dry runs.

**Delivers:** full source validation green, all behavioral dry-run procedures complete with unchanged protected state, and a reviewed nine-target chezmoi diff ready for independent verification.
**Blocked by:** 1, 2, 3, 4
**Traces to:** all pre-rollout requirements and the verification-ready portion of rendered-target rollout
**Files:** all source files above plus this plan for concise execution evidence; no managed targets

- [ ] Install locked dependencies first: run `cd dot_pi/agent && npm ci --ignore-scripts`. Then run `npm run test:prompts && npm run test:learn && npm test && npm run test:all`; expect all suites and the smoke check to pass. Keep ignored `node_modules` through `/verify`.
- [ ] Consistency: run `rg -l 'Learning candidates' dot_pi/agent/exact_prompts/`; expect `learn.md` plus exactly the four writable capture prompts. Run `rg -l 'append.*Learning candidates' dot_pi/agent/exact_prompts/`; expect exactly `plan.md`, `execute.md`, `simplify.md`, and `pr-address-feedback.md`. Run `rg -n 'Learnings\.md|learning-sections|obsidian (read|create|delete)' dot_pi/agent/exact_prompts/execute.md dot_pi/agent/exact_prompts/verify.md`; expect no matches. Inspect `/learn` references in `dot_pi/agent/AGENTS.md`, `simplify.md`, and `pr-address-feedback.md` for consistent plain-mode semantics.
- [ ] PR evidence command: with the correct `maruina` GitHub login active, run `gh pr list --head maruina/confluence-cli-migration --state all --limit 10 --json number,state,url`; expect merged PR #71. Restore and verify the original login if any switch was needed.
- [ ] Review, but do not apply, all changed managed targets: run `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/learn.md ~/.pi/agent/prompts/plan.md ~/.pi/agent/prompts/execute.md ~/.pi/agent/prompts/simplify.md ~/.pi/agent/prompts/pr-address-feedback.md ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/AGENTS.md ~/.pi/agent/scripts/learn-prompts.test.mjs ~/.pi/agent/scripts/lifecycle-prompts.test.mjs`. Expect only this plan's intended prompt, guidance, and marker-test changes. Unexpected target drift is a blocker.
- [ ] For dry runs 1–4 (including 2b), start fresh Pi sessions from the relevant directory with source prompts only: `pi --no-session --no-prompt-templates --prompt-template "$SOURCE_ROOT/dot_pi/agent/exact_prompts"`, where `SOURCE_ROOT` is this resolved worktree root. Do not apply managed targets.
- [ ] Dry run 1 — branch-correlated selection: run plain `/learn` in this worktree. Expect it to select `plans/learn-lifecycle-integration/plan.md` without presenting the eight unrelated inherited plans, read sibling `design.md`, adjudicate the ledger, and request no approval unless another independently valid change exists. Reject any preview; verify no repository or vault mutation.
- [ ] Dry run 2 — no artifact: create a directory with `scratch_dir="$(mktemp -d)"`, initialize an empty Git repository there, and run plain `/learn` with the source prompt directory. Expect the stop-and-suggest to name explicit context (a plan/design path, PR URL, or described guidance) without invoking the resolver's generic no-match response. Leave the scratch repository, verify the path is the generated temporary directory, and remove it.
- [ ] Dry run 2b — multiple local matches: create a second scratch directory with `multi_dir="$(mktemp -d)"`, initialize a Git repository there, create branch `maruina/multi-fixture`, and add both `plans/multi-fixture/plan.md` and `nested/plans/multi-fixture/plan.md` with minimal placeholder content. Run plain `/learn` with the source prompt directory from that repository. Expect both matches to be presented with a choice and no silent selection; decline to choose and end the session. Verify no repository or vault mutation, verify `multi_dir` names the generated temporary directory, and remove it.

- [ ] Dry run 4a — derivable rejection: invoke `/learn Candidate: Always quote shell variables. The same mistake happened twice, but this is routine guidance a fresh model can reliably produce and apply unaided.` Expect rejection citing non-derivability despite recurrence, no approval request, and no vault mutation.
- [ ] Dry run 4b — agent-behavior routing: invoke contextual `/learn` with evidence that the current `resolve-worktree` no-match contract cannot emit `/learn`'s desired fallback. Expect a concrete prompt/skill improvement proposal, no vault entry for the agent-behavior part, no automatic source edit, and no approval unless an independent domain candidate qualifies.
- [ ] Dry run 5 setup — disposable vault: create `test_vault_dir="$(mktemp -d)"` and a unique `test_vault_name`. In Obsidian's vault switcher, create/open and register that directory under the unique name. Confirm `obsidian vault="$test_vault_name" vault info=path` equals the temporary directory. Create `Datadog/Learnings.md` only in that vault with two sections: one dated `2000-01-01` whose complete guidance says to treat exit status zero as command failure because POSIX reserves zero for failure, and one with no date line whose guidance remains true against current behavior (for example, capture and restore the active GitHub login around `gh auth switch`); verify exact read-back of both sections with `obsidian vault="$test_vault_name" read path="Datadog/Learnings.md"`.
- [ ] Dry run 5 isolation: create a mode-0600 temporary system-instruction file naming the disposable vault and requiring every Obsidian command to begin with `vault="$test_vault_name"`; explicitly forbid reading or mutating vault `main` and declare any command without the disposable vault selector a failed test. Start a fresh source-prompt Pi session with `--append-system-prompt "$test_instruction_file"`. Inspect tool calls as part of the result.
- [ ] Dry run 5 execution: invoke contextual `/learn` and direct it to revalidate the aged fixture against current shell behavior, including the observable success of a status-zero command. Expect `### Removal: <title>` with the contradiction reason in the one-approval preview, plus explicit re-adjudication of the undated section with its date line bumped to last-validated as a surviving-section update in the same preview. Reject the preview; verify the disposable `Learnings.md` is byte-identical to its pre-run fixture and no command targeted `main`.
- [ ] Dry run 5 cleanup: remove the temporary system-instruction file, close and unregister the disposable vault through Obsidian's vault switcher, verify `test_vault_dir` still names the generated temporary directory, and remove that directory. If registration, explicit vault targeting, state comparison, or cleanup cannot be completed, stop and report the dry run as failed.
- [ ] Record concise command/status/state evidence for every dry run under `### Execution`; do not include vault content, tokens, session paths, or other private evidence. Commit only that plan evidence with `docs: record learn-lifecycle-integration validation evidence`.

## Post-Verification Rollout
This explicit follow-up satisfies the rendered-target update after source verification; it is not a pre-rollout `/verify` acceptance scenario. Run it only after `/verify plans/learn-lifecycle-integration/plan.md` returns `VERIFIED` for the unchanged source candidate.

1. Re-run the nine-target `chezmoi --source "$PWD" diff` from Task 5 and confirm it matches the verified source candidate.
2. Run `chezmoi --source "$PWD" apply ~/.pi/agent/prompts/learn.md ~/.pi/agent/prompts/plan.md ~/.pi/agent/prompts/execute.md ~/.pi/agent/prompts/simplify.md ~/.pi/agent/prompts/pr-address-feedback.md ~/.pi/agent/prompts/brainstorm.md ~/.pi/agent/AGENTS.md ~/.pi/agent/scripts/learn-prompts.test.mjs ~/.pi/agent/scripts/lifecycle-prompts.test.mjs`.
3. Confirm targeted `chezmoi diff` is clean.
4. Run `cd ~/.pi/agent && npm run test:prompts && npm run test:learn`; expect all rendered tests pass.
5. Report rollout evidence without modifying the already verified source candidate. If apply or rendered checks fail, stop, report the failed target or command, and use the rollback contract rather than repairing silently.

## Self-review notes
- Scope, non-goals, requirements, tasks, and validation trace bidirectionally: Tasks 1–4 implement the six source requirements; Task 5 validates every pre-rollout scenario; post-verification rollout completes the managed-target requirement.
- The design's testing strategy claimed no unit-test changes; the test-seam correction is confirmed in the alignment brief and carried in Key Decisions.
- Tasks 2 and 3 both edit `dot_pi/agent/exact_prompts/plan.md` (disjoint sections: capture duty before `## Handoff`, guard sentence in `### Advisory learning lookup`); sequencing handles it.
- This plan edits the same `dot_pi/agent/exact_prompts/plan.md` prompt that generated it; execution happens in a fresh session, so no running-session inconsistency arises.
- All behavioral dry runs now complete before `/verify`; the first real cycle remains observational validation only for reviewer-feedback capture and plain-`/learn` adjudication.
- Post-review amendments (2026-09-13, `/systematic-review`): `pr-address-feedback` names the branch-correlated ledger-plan discovery rule with a zero-or-multiple Phase-6 fallback; a new scenario plus dry run 2b covers the multi-match ask; the dry run 5 fixture gains an undated section so the missing-date re-adjudication branch is behaviorally validated.
- Execution-time scope change (2026-09-13, user-approved): the retrospective daily scan is removed. `/learn` resolves plain (empty) or contextual (anything else) modes; the `## Daily evidence discovery` section, the `previous local calendar day`/`sessions-window`/`/learn daily` markers, dry run 3, and the AGENTS.md `/learn daily` clause are dropped. `learn.md` now keeps only contextual login capture/restore for PR-driven discovery. Tasks 1 and 4 and their traces were rewritten accordingly.
