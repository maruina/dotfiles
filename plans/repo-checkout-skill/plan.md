# Repo Checkout Skill Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Pi a reusable `repo-checkout` skill that resolves a GitHub repository reference to a local checkout — locating an existing clone or cloning into the correct root — and make `/pr-review` reuse it instead of its inline copy.
**Smallest user-feedback slice:** The validated and chezmoi-applied `repo-checkout` skill, with `pr-review.md` Phase 1 deduplicated onto it; one slice, three tasks.
**Out of Scope:** New fish functions or scripts; changes to `wt.fish` or `wtpr.fish`; retrofitting `learn.md` or `weekly-summary.md` (they use gh account routing, not repo checkout); profile-gated skill variants; GitHub PR creation for this change.
**Architecture:** One Markdown skill at `dot_pi/agent/exact_skills/repo-checkout/SKILL.md`, rendered by chezmoi to `~/.pi/agent/skills/repo-checkout/SKILL.md` and discovered by Pi through its frontmatter description. A surgical edit to `dot_pi/agent/exact_prompts/pr-review.md` replaces its inline locate-or-clone steps with a reference to the skill. Validation reuses the existing `validate-skills.mjs` seam; no new tooling.
**Tech Stack:** Markdown (SKILL.md, prompt), chezmoi, Node `validate-skills.mjs`, `git`/`gh` CLIs referenced by the skill.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires it before implementation recommendations | Matched the affected files (chezmoi source, Markdown prose) to the `chezmoi` and `write` skills |
| `resolve-worktree` | `prompt-required` | `/plan` input resolution for `maruina/repo-checkout-skill` | Ran its cross-worktree discovery for `**/plans/*/design.md`; confirmed no existing design, so planning proceeded from the confirmed alignment brief |
| `chezmoi` | `skill-loader` | Files under the chezmoi source directory are created and modified | Source layout (`exact_skills` → `~/.pi/agent/skills/`), completion workflow, `npm test`/`test:all` requirements for `dot_pi/agent/`, `--source "$PWD"` worktree trap |
| `write` | `skill-loader` | The SKILL.md and this plan are prose artifacts | One-clear-path procedures, imperative vs recommend language, no filler; applied to the skill content contract and this plan |

Advisory learnings lookup (`Datadog/Learnings.md` via Obsidian) was skipped at the user's request because the Obsidian CLI was unresponsive; no learnings were applied.

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/execute` requires it to select skills for the affected files | Matched the affected files (chezmoi source Markdown) to the `chezmoi` and `write` skills |
| `resolve-worktree` | `prompt-required` | `/execute` input resolution for the plan path | Confirmed the passed path is absolute and exists, then switched context to the owning worktree `~/src/.worktrees/dotfiles/maruina-repo-checkout-skill` on `maruina/repo-checkout-skill` |
| `chezmoi` | `skill-loader` | A new skill file and a modified prompt under the chezmoi source directory | Confirmed the `exact_skills` → `~/.pi/agent/skills/` mapping, the `--source "$PWD"` worktree trap, explicit-target diff/apply, and the completion workflow, all applied in Task 3 |
| `write` | `skill-loader` | The SKILL.md and the edited prompt are prose artifacts | Applied one-clear-path procedures, imperative language, and filler removal to the skill and the prompt edit |
| `skill-loader` | `prompt-required` | `/execute` requires it to select skills for the verification-fix round | Matched the affected file (chezmoi source Markdown) to the `chezmoi` and `write` skills; `codebase-research` skipped because the area was already researched in this session |
| `resolve-worktree` | `prompt-required` | `/execute` input resolution for the verification-fix round | Confirmed the plan path, the owning worktree, clean status, and HEAD `b803a2b` before the fix |
| `chezmoi` | `skill-loader` | The fix modifies a skill file under the chezmoi source directory | Used `--source "$PWD"` explicit-target diff and apply; confirmed the rendered target matches the source |
| `write` | `skill-loader` | The fix edits skill prose | Applied one-clear-path structure and imperative requirement language to the candidate-confirmation and bare-name rules |

## Source of Truth and Boundaries
The user-confirmed planning alignment brief (2026-09-29 conversation) is the source of truth for WHAT: option A (agent-facing skill only), `pr-review.md` dedup in scope, and the clone consent boundary preserved from `pr-review.md`.

This plan changes exactly two files:

- create `dot_pi/agent/exact_skills/repo-checkout/SKILL.md`;
- modify `dot_pi/agent/exact_prompts/pr-review.md` only in Phase 1 steps 3–4 (locate-or-clone).

Do not add fish functions, scripts, extensions, or new skill roots. Do not change `wt.fish`, `wtpr.fish`, `resolve-worktree`, `learn.md`, or `weekly-summary.md`. Do not change `validate-skills.mjs`; if the new skill fails validation for a reason that would require changing the validator, stop and report.

## Feasibility Gate
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Pi discovers the skill | A `SKILL.md` under `dot_pi/agent/exact_skills/<name>/` renders through chezmoi `dot_`/`exact_` naming to `~/.pi/agent/skills/<name>/SKILL.md`; Pi lists it in available skills by frontmatter description. | `chezmoi` skill source-layout table; 24 existing skills under `dot_pi/agent/exact_skills/`; current session's available-skills list. | `chezmoi --source "$PWD" diff ~/.pi/agent/skills/repo-checkout/SKILL.md` shows the new target; after apply, the target content matches the source; the skill appears in a new Pi session's skill list (manual). | Block; do not add an extension or prompt as a substitute. |
| Skill frontmatter is valid | `dot_pi/agent/exact_scripts/validate-skills.mjs` checks YAML frontmatter, `name` against `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$` with no `--`, `description` present and ≤1024 characters, and name uniqueness across skill roots. | Script read during planning; `package.json` exposes `npm run test:skills`. | `npm run test:skills` exits 0 in `dot_pi/agent/` with the new skill counted. | Block and report; do not weaken the validator. |
| Worktree path convention | `wt.fish` computes `$WORKTREES_ROOT/<repo>/<branch-slug>` with lowercase and `/` → `-`; roots are `~/dd/.worktrees` (work) and `~/src/.worktrees` (personal). | `dot_config/private_fish/exact_functions/wt.fish` read during planning; `private_config.fish.tmpl` sets `WORKTREES_ROOT` per profile. | Content review of SKILL.md against the Skill content contract. | Restate only the path convention and point to `wt.fish` as source of truth; do not duplicate its logic. |
| gh account routing | Existing rule: `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`; `maruina` for everything else including `DataDog/*`. | `dot_pi/agent/AGENTS.md` Tool Use section; same rule restated in `learn.md`. | Content review: the skill references the rule instead of duplicating it. | Reference the AGENTS.md rule by location; if the rule is absent at execution time, stop and report. |
| Prompt regression detection | `npm run test:prompts` runs `*-prompts.test.mjs`; `npm test` and `npm run test:all` cover unit, prompts, skills, pi-deps, and smoke. | `package.json` scripts read during planning; chezmoi AGENTS.md mandates them for `dot_pi/agent/` changes. | All commands exit 0 after the `pr-review.md` edit. | Block and report the failing suite; do not skip suites. |

## Implementation Contract
**Components Affected**

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Repo-checkout skill | `dot_pi/agent/exact_skills/repo-checkout/SKILL.md` (new) | Resolve a repo reference to a local checkout: search known roots, clone into the correct root when missing, hand off to the worktree convention when a branch is involved. | `npm run test:skills`; content checklist review; chezmoi diff/apply of the explicit target path. |
| PR review prompt | `dot_pi/agent/exact_prompts/pr-review.md` | Phase 1 reuses the `repo-checkout` skill for locate-or-clone instead of inline steps; PR-specific worktree steps stay inline. | `grep` checks; `npm run test:prompts`; `npm test`. |

**Key Decisions**

- Agent-facing skill only; no new fish function (user-confirmed option A). The Pi `bash` tool cannot call fish functions, so the skill states `git`/`gh` commands in Bash syntax, matching the `pr-review.md` convention.
- `pr-review.md` Phase 1 steps 3–4 are replaced with a skill reference (user-confirmed). Steps 1–2 (current-repo fast path) and 5–6 (PR-specific `pr-NUMBER-review` worktree) stay inline; only the duplicated locate-or-clone logic moves.
- Clone consent boundary preserved (user-confirmed): `DataDog`, `ddoghq`, and `ddoghq-sandbox` repos clone into `~/dd/REPO` without asking; any other org asks where to clone first.
- Clone over SSH (`git clone git@github.com:ORG/REPO`), matching `pr-review.md`. The gh account affects only `gh` API calls; the skill references the AGENTS.md routing rule by location instead of restating it.
- The skill is global (`exact_skills`), not profile-gated: the roots (`~/dd`, `~/go/src`, `~/src`) and rules apply identically on work and personal profiles.
- The skill scopes itself to main checkouts. Worktree discovery is deferred to the existing `resolve-worktree` skill, named in the description and body, to prevent trigger overlap.

**Skill content contract**
The new SKILL.md MUST contain all of the following; this is the pinned interface, not drafted prose:

- Frontmatter: `name: repo-checkout`; `description` ≤1024 characters that triggers on "check out a repo", "clone a repo", "where is repo X locally", and a GitHub repo URL with no local checkout, and states the main-checkout-only boundary with deferral of worktree discovery to `resolve-worktree`.
- Input forms: bare repo name, `ORG/REPO`, HTTPS URL, SSH URL.
- Locate order: current repository (`git remote -v`) → `~/dd/REPO` → `~/go/src/github.com/ORG/REPO` → bounded `find` across those roots → report not found.
- Special case: `maruina/dotfiles` resolves to the chezmoi source at `~/.local/share/chezmoi`.
- Clone rules: Datadog orgs (`DataDog`, `ddoghq`, `ddoghq-sandbox`) → `git clone git@github.com:ORG/REPO ~/dd/REPO` without asking; any other org → ask the user where to clone before proceeding.
- gh account routing: reference the AGENTS.md rule; apply it only to `gh` API calls; never use `gh auth status --show-token`.
- Branch handoff: when a branch is involved, create the worktree with `git worktree add` at `$WORKTREES_ROOT/<repo>/<branch-slug>` (lowercase, `/` → `-`), name `wt.fish` as the convention's source of truth, and name `resolve-worktree` for finding existing worktrees.
- Commands in Bash syntax (Pi `bash` tool), Fish only if showing commands for the user to copy.

**Implementation Constraints**

- Match the frontmatter and prose style of existing skills such as `resolve-worktree` and `chezmoi`. Markdown style: no blank line after frontmatter or headings; one blank line between sections; US English; ASD-STE100.
- Run every chezmoi command with `--source "$PWD"` from the worktree, and diff/apply the explicit target file path (directory targets can hide drift).
- Before tests in `dot_pi/agent/`, run `npm ci --ignore-scripts`; keep dependencies until `npm test` and `npm run test:all` complete, then remove `dot_pi/agent/node_modules`.
- Stop conditions: the new skill fails `validate-skills.mjs` for a reason that would require validator changes; `npm test` or `test:all` fails for reasons unrelated to this change; the gh routing rule is absent from `dot_pi/agent/AGENTS.md` at execution time.
- Skipped source: advisory learnings lookup (Obsidian) skipped at user request; no learnings applied.

**Security Requirements**

- The skill must not add credential handling: clones use the existing SSH agent; `gh` calls follow the existing account routing rule by reference. Never instruct `gh auth status --show-token`.
- The skill must not widen the auto-clone consent boundary beyond `DataDog`, `ddoghq`, and `ddoghq-sandbox`.

**Observability Requirements**

Not applicable as runtime telemetry: this is local agent tooling with no deployed service. Failures surface as `validate-skills.mjs` errors, failing npm suites, and `chezmoi diff` output, each covered by the Test Strategy.

**Failure Modes to Handle**

| Failure mode | Expected behavior | Verification |
|---|---|---|
| Missing/invalid frontmatter, invalid name, duplicate name, oversized description | `npm run test:skills` exits non-zero with a named error | Task 1 runs the validator and expects exit 0 |
| `pr-review.md` edit breaks prompt structure | `npm run test:prompts` or `npm test` fails | Task 2 runs both |
| `chezmoi apply` reads the wrong tree from the worktree | Use `--source "$PWD"`; verify rendered target content matches the worktree source | Task 3 explicit-path diff/apply and content comparison |
| Trigger overlap with `resolve-worktree` | Description and body scope the skill to main checkouts and defer worktree discovery | Task 1 content checklist |

**Rollout and Rollback**

- Rollout: local-only. Commit on `maruina/repo-checkout-skill`, push, then `chezmoi --source "$PWD" apply` the two explicit target paths. Owner: Matteo.
- Rollback: revert the commits and re-apply; the `exact_skills` `exact_` attribute removes the rendered `~/.pi/agent/skills/repo-checkout/` directory once the source is gone.

**Test Strategy**

- Skill validity → `npm run test:skills` in `dot_pi/agent/` (existing seam: `validate-skills.mjs`; no new seam introduced).
- Rendering → `chezmoi --source "$PWD" diff <target>` then apply and compare source to target content for both files.
- Prompt regression → `npm run test:prompts`, then `npm test` and `npm run test:all` for the full suite.
- Skill behavior (locate order, consent boundary, handoff) → manual content checklist against the Skill content contract. Automation is impractical: skill selection is model-driven, so the deterministic seam is file presence plus frontmatter validity; a manual check that the skill appears in a new Pi session's skill list covers discovery.
- Narrow commands expected to fail before implementation: `test -f dot_pi/agent/exact_skills/repo-checkout/SKILL.md` and `grep -q 'repo-checkout' dot_pi/agent/exact_prompts/pr-review.md`. `validate-skills.mjs` is additive and does not fail before the file exists; there is no meaningful failing-first validator run for a new skill file.

## Acceptance Requirements
### Requirement: Skill validates and renders
The system SHALL include a `repo-checkout` skill whose SKILL.md passes `validate-skills.mjs` and renders to `~/.pi/agent/skills/repo-checkout/SKILL.md` through chezmoi.

#### Scenario: Validator passes with the new skill
- GIVEN `dot_pi/agent/exact_skills/repo-checkout/SKILL.md` exists
- WHEN `npm run test:skills` runs in `dot_pi/agent/`
- THEN it exits 0, reports no errors, and counts the new skill

#### Scenario: Chezmoi renders and applies the target
- GIVEN the worktree source on branch `maruina/repo-checkout-skill`
- WHEN `chezmoi --source "$PWD" diff ~/.pi/agent/skills/repo-checkout/SKILL.md` runs
- THEN the diff shows the new target file, and after `chezmoi --source "$PWD" apply ~/.pi/agent/skills/repo-checkout/SKILL.md` the target content matches the source

#### Scenario: Pi discovers the skill
- GIVEN the applied target
- WHEN a new Pi session starts
- THEN `repo-checkout` appears in the session's available skills (manual check)

### Requirement: Skill defines the locate-or-clone procedure
The skill SHALL contain every behavior in the Skill content contract: input forms, locate order, `maruina/dotfiles` special case, clone consent boundary, gh routing by reference, and branch handoff with `wt.fish` and `resolve-worktree` named.

#### Scenario: Content checklist review
- GIVEN the written SKILL.md
- WHEN reviewed against the Skill content contract checklist
- THEN every contracted behavior is present and no auto-clone rule covers an org outside `DataDog`, `ddoghq`, and `ddoghq-sandbox`

### Requirement: pr-review reuses the skill
`pr-review.md` Phase 1 SHALL reference the `repo-checkout` skill for locate-or-clone and SHALL NOT keep inline clone instructions, while retaining the current-repo fast path and the PR-specific worktree steps.

#### Scenario: Prompt updated and suites green
- GIVEN the edited `dot_pi/agent/exact_prompts/pr-review.md`
- WHEN `grep -q 'repo-checkout' dot_pi/agent/exact_prompts/pr-review.md` and `npm run test:prompts` run
- THEN the grep succeeds, no `git clone git@github.com` instruction remains in Phase 1, and the prompt tests exit 0

## Task Sequence
### Task 1: Add the repo-checkout skill
**Delivers:** A validated `repo-checkout` SKILL.md implementing the full Skill content contract.
**Blocked by:** None
**Traces to:** Requirement: Skill validates and renders; Requirement: Skill defines the locate-or-clone procedure
**Files:** `dot_pi/agent/exact_skills/repo-checkout/SKILL.md` (new)

- [x] Confirm the failing-first check: `test -f dot_pi/agent/exact_skills/repo-checkout/SKILL.md` fails.
- [x] Write the SKILL.md to satisfy every item in the Skill content contract, matching the frontmatter and prose style of `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`.
- [x] Run `cd dot_pi/agent && npm ci --ignore-scripts`.
- [x] Run `npm run test:skills` in `dot_pi/agent/`; expect exit 0 with the new skill counted. (Validated 41 skills, up from 40.)
- [x] Self-review the SKILL.md against the Skill content contract checklist; fix gaps and rerun `npm run test:skills`.
- [x] Commit with `feat(pi): add repo-checkout skill`.

### Task 2: Reuse the skill in pr-review
**Delivers:** `pr-review.md` Phase 1 delegates locate-or-clone to the `repo-checkout` skill with no duplicated logic.
**Blocked by:** Task 1
**Traces to:** Requirement: pr-review reuses the skill
**Files:** `dot_pi/agent/exact_prompts/pr-review.md`

- [x] Confirm the failing-first check: `grep -q 'repo-checkout' dot_pi/agent/exact_prompts/pr-review.md` fails.
- [x] Replace Phase 1 steps 3–4 with a step that uses the `repo-checkout` skill to locate or clone `ORG/REPO`; keep steps 1–2 and 5–6 unchanged.
- [x] Run `npm run test:prompts` in `dot_pi/agent/`; expect exit 0. (43/43 pass.)
- [x] Run `grep -n 'git clone git@github.com' dot_pi/agent/exact_prompts/pr-review.md`; expect no matches in Phase 1.
- [x] Commit with `refactor(pi): reuse repo-checkout skill in pr-review`.

### Task 3: Documentation review, full verification, apply, and push
**Delivers:** The verified, rendered, and pushed change; documentation impact explicitly assessed.
**Blocked by:** Task 2
**Traces to:** Goal; Requirement: Skill validates and renders (apply scenario)
**Files:** `AGENTS.md`, `CLAUDE.md`, `dot_pi/agent/AGENTS.md` (assess only; change only if a gap is found)

- [x] Assess the three guidance files for a durable gap (for example, an undocumented skill-validation command). Expected outcome: no change, because skills are auto-discovered by frontmatter and the chezmoi skill already documents `npm test`; record the decision and rationale in the execution ledger either way. (No change: no durable gap found.)
- [x] Run `npm test` and `npm run test:all` in `dot_pi/agent/`; expect exit 0.
- [x] Run `chezmoi --source "$PWD" diff ~/.pi/agent/skills/repo-checkout/SKILL.md` and `chezmoi --source "$PWD" diff ~/.pi/agent/prompts/pr-review.md`; review both diffs.
- [x] Apply both explicit target paths with `chezmoi --source "$PWD" apply <target>` and compare each rendered target against its worktree source.
- [x] Confirm `repo-checkout` appears in a new Pi session's available skills (manual). (Best available non-interactive evidence: the rendered target exists at `~/.pi/agent/skills/repo-checkout/SKILL.md` with valid frontmatter; Pi has no `--list-skills` flag, so the in-session listing remains a manual check.)
- [x] Remove `dot_pi/agent/node_modules`.
- [x] Push `maruina/repo-checkout-skill` to origin.

## Documentation Impact
Task 3 records the assessment of `AGENTS.md`, `CLAUDE.md`, and `dot_pi/agent/AGENTS.md`. No README or runbook exists for this area; the skill is self-documenting through its frontmatter description.

## Execution Ledger
- 2026-09-29: Plan written and committed on `maruina/repo-checkout-skill` after user-confirmed alignment brief. Advisory learnings lookup skipped at user request (Obsidian CLI unresponsive).
- 2026-09-29: Task 1 complete — created `dot_pi/agent/exact_skills/repo-checkout/SKILL.md`; `npm run test:skills` validated 41 skills (up from 40); committed `f43bd16`.
- 2026-09-29: Deviation — SKILL.md was written without a trailing newline; added one and folded it into the Task 1 commit with a fixup. No functional change; all sibling skills end with a newline.
- 2026-09-29: Task 2 complete — replaced `pr-review.md` Phase 1 steps 3–4 with a `repo-checkout` skill reference, renumbered 5–6 to 4–5; `npm run test:prompts` passed 43/43; no `git clone git@github.com` remains; committed `a8049ed`.
- 2026-09-29: Task 3 complete — guidance files assessed with no durable gap, so no change; `npm test` and `npm run test:all` exited 0; chezmoi explicit-target diff/apply rendered both files, and each target matched its source; `dot_pi/agent/node_modules` removed; ledger committed and branch pushed.
- 2026-09-29: Verification-fix round — `/verify` blocked on two findings: name-only lookup could resolve a same-named checkout of a different organization, and the bare-name first-match rule conflicted with the list-candidates rule. Fixed `repo-checkout/SKILL.md`: every name-matched candidate must be confirmed with `git -C <candidate> remote -v` pointing at exactly `ORG/REPO`; bare names collect candidates and resolve by the repositories their remotes name (one repository → first in order; different repositories → list each path with its `ORG/REPO` and ask); the `maruina/dotfiles` special case now precedes the locate order. Committed as `2803012`.
- 2026-09-29: Fix-round verification — `npm run test:skills` validated 41 skills; `npm run test:prompts` passed 43/43; `npm test` and `npm run test:all` exited 0 (unit 162, prompts 43, skills, pi-deps, smoke); `chezmoi --source "$PWD" diff/apply` on the explicit target rendered the fix and the target matches the source.
- 2026-09-29: Deviation — the compute-guardrails extension blocked `rm -rf dot_pi/agent/node_modules` in-session (recursive filesystem delete policy). The dependencies remain in the worktree so a fresh `/verify` can run the suites without installing; remove them manually with `rm -rf dot_pi/agent/node_modules` from the worktree root after verification.

## Learning candidates
- 2026-09-29: The compute-guardrails extension blocks in-session `rm -rf`, including the repo-prescribed `dot_pi/agent/node_modules` cleanup after `npm test` and `npm run test:all` complete; do not bypass it with an equivalent command — hand the removal to the user for a terminal. Evidence: blocked command in this session; `AGENTS.md` Pi Agent Development section prescribing the cleanup.
