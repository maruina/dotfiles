# Deterministic Pi Prompt Helpers Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace multi-step LLM shell choreography in Pi extensions, skills, and prompts with deterministic, tested CLI helpers and non-mutating per-process GitHub authentication.
**Smallest user-feedback slice:** `user-context.ts` automatically runs `fish -c rex-name-session` in the background from Pi’s startup directory in an interactive Pi process with Rex context, so new Rex Pi sessions no longer spend an initial tool turn on session naming.
**Out of Scope:** Automating semantic `rex-name-task` label selection, automating curated `/sync-home-assistant-skills` updates, running destructive deletions inside `disk-cleanup.mjs`, or changing `ship-conductor` bridge protocol versions.
**Architecture:** Deterministic Node.js ESM CLIs in `dot_pi/agent/exact_scripts/` (`sync-vendored-skills.mjs`, `lifecycle-git.mjs`, `disk-cleanup.mjs`, and `pr-validate-report/collect.mjs`) and a Fish helper (`dot_config/private_fish/exact_functions/gh-as.fish`) execute Git, filesystem, and GitHub queries using only standard-library modules and installed CLIs. Prompts and skills invoke these helpers and consume their versioned JSON output while keeping human approval gates and semantic decisions in the prompt templates.
**Tech Stack:** TypeScript, Node.js ESM (`node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:test`), Fish shell, Git, GitHub CLI (`gh`), Rex CLI (`rex`), chezmoi.

**Requirements source:** No upstream `design.md` was found. This plan records the requirements. During systematic review, the user confirmed that all four slices stay in scope and that automatic Rex naming uses Pi’s startup directory in the interactive process only.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/plan` requires loading `skill-loader` before task-specific work | Selected applicable domain and language skills for chezmoi, CLI design, shell scripts, codebase research, and prose |
| `resolve-worktree` | `prompt-required` | `/plan` requires checking for an upstream `design.md` across worktrees | Enumerated all worktrees and confirmed no upstream design exists for this task |
| `learning-lookup` | `prompt-required` | `/plan` requires consulting `Datadog/Learnings.md` before planning decisions | Queried `Datadog/Learnings.md` via `learn-evidence.mjs`; confirmed no conflicting learnings |
| `codebase-research` | `skill-loader` | Multi-component changes across extensions, scripts, prompts, skills, and Fish functions | Traced callers, test suites, prompt byte budgets, and existing CLI patterns (`workspace.mjs`, `_publish.ts`, `learn-evidence.mjs`) |
| `chezmoi` | `skill-loader` | All affected files live under `~/.local/share/chezmoi/` | Applied source-path conventions, `exact_` directory rules, and validation commands |
| `cli-best-practices` | `skill-loader` | Creating and modifying CLI helpers (`sync-vendored-skills.mjs`, `collect.mjs`, `lifecycle-git.mjs`, `disk-cleanup.mjs`, `gh-as.fish`) | Defined `--help`, JSON stdout contracts, stderr diagnostics, non-interactive flags, and token redaction |
| `script-best-practices` | `skill-loader` | Creating `gh-as.fish` and shell command invocations | Applied argument validation, local variable scoping, exit-code preservation, and safe quoting |
| `write` | `skill-loader` | Drafting the planning alignment brief and `plan.md` | Used clear, literal prose, explicit component names, and repository Markdown spacing |
| `feature-worktree` | `prompt-required` | Durable plans must be written and committed in a feature worktree | Created `maruina/deterministic-pi-prompt-helpers` from `origin/main` via `wt switch --create` |
| `learning-candidates` | `prompt-required` | Confirmed review fixes changed the Rex process guard and smoke check | Recorded why inherited Rex variables and the installed Pi smoke check were insufficient |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | `/execute` requires skill selection | Selected skills for the affected extension and plan ledger |
| `resolve-worktree` | `prompt-required` | The plan is in another worktree | Resolved the plan and used its owning worktree |
| `feature-worktree` | `prompt-required` | Execution changes files | Confirmed the plan's feature branch and clean worktree |
| `chezmoi` | `skill-loader` | The extension is managed by chezmoi | Edited source files only and deferred target application until verification |
| `codebase-research` | `skill-loader` | The extension changes process behavior | Traced hook, subprocess, context guidance, tests, and Pi extension lifecycle |
| `write` | `skill-loader` | The plan ledger and context guidance contain prose | Kept changes concise and preserved the plan requirements |
| `cli-best-practices` | `skill-loader` | Slice 2 adds a CLI | Applied structured output, non-interactive execution, and preview guidance |
| `learning-candidates` | `prompt-required` | The exact-directory assumption was disproved | Recorded the isolated chezmoi fixture result for later review |
| `script-best-practices` | `skill-loader` | Slice 3 adds a Fish wrapper | Applied validation, scoping, and exit-status guidance |

## Advisory learning lookup
Queried `Datadog/Learnings.md` via `obsidian read path="Datadog/Learnings.md" | node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs" learning-sections --term rex --term worktree --term prompt --term gh --term vendored --term lifecycle`. Thirteen sections matched (`Render piped chezmoi templates against an initialized config, not --init` and twelve distributed-systems/Kubernetes entries). None conflicted with or altered these local Pi script and prompt changes.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Auto-run `rex-name-session` from `user-context.ts` | Trigger `runAsync("fish", ["-c", "rex-name-session"], startupCwd, 3000)` once per interactive Pi process when both Rex variables are set; remove the `rex-name-session` instruction from `formatRexContext` | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_config/private_fish/exact_functions/rex-name-session.fish` | Unit tests in `dot_pi/agent/exact_extensions/user-context.test.mjs` and `dot_pi/agent/exact_scripts/rex-naming.test.mjs` | Keep `rex-name-session.fish` unchanged; ignore background helper failures so `before_agent_start` never fails |
| Deterministic vendored-skill sync CLI | `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` discovers `VENDOR.md` files, clones/fetches upstream repos under `${GO_REPOS_ROOT:-$HOME/go/src/github.com}/<org>/<repo>`, resolves `origin/HEAD` to a commit, reads upstream files (or `Files` subset) from that commit, not the clone’s checkout, strips trailing horizontal whitespace on lines when needed, updates `Pinned commit`, and emits JSON | 13 `VENDOR.md` files under `dot_pi/agent/exact_skills*/`; `dot_pi/agent/exact_prompts/sync-vendored-skills.md` | `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` using local Git repo fixtures | Fail with structured JSON error and non-zero exit code before modifying skill files |
| Non-mutating per-org `gh` auth in `collect.mjs` and `gh-as.fish` | Map `ddoghq` and `ddoghq-sandbox` (case-insensitive) to `matteo-ruina_ddog` and all other owners to `maruina` (matching `_publish.ts`); resolve token via `gh auth token --hostname github.com --user <login>` and pass `GH_TOKEN` + `GH_HOST=github.com` to child `gh` processes | `dot_pi/agent/exact_extensions/ship-conductor/_publish.ts:81-82`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` | `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` and `dot_pi/agent/exact_scripts/gh-as.test.mjs` with fake `gh` binaries | In `collect.mjs`, mark sources unavailable with `auth_unavailable` and emit partial/unavailable envelope; in `gh-as.fish`, exit non-zero on stderr without running `gh` under the wrong account |
| Lifecycle Git helper CLI (`lifecycle-git.mjs`) | Subcommands `verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` wrapping read-only `git` commands with JSON output | `dot_pi/agent/exact_prompts/plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md` | `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs` with temporary Git worktree fixtures + `lifecycle-prompts.test.mjs` + `learn-prompts.test.mjs` | Exit non-zero with structured JSON diagnostic so the calling prompt stops or hands off |
| Disk cleanup measurement & worktree scanner (`disk-cleanup.mjs`) | `measure` uses `df`, bounded `du`, `docker system df`, and `pgrep`; `scan-worktrees` uses `wt list` and `wt step prune --dry-run` plus orphan-directory discovery | `dot_pi/agent/exact_prompts/disk-cleanup.md`, installed Worktrunk v0.82.0 | `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` with local Git worktrees and fake measurement commands | Report unavailable evidence and do not remove anything; Worktrunk may write its local cache |

## Consumer map
| Modified surface | Consumers found via `rg` | Planned action |
|---|---|---|
| `user-context.ts` (`formatRexContext`, `loadRexLines`) | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs` | Task 1 updates `user-context.ts` and `user-context.test.mjs`; `rex-name-session.fish` and `rex-naming.test.mjs` remain unchanged |
| `sync-vendored-skills.md` and `VENDOR.md` files | `dot_pi/agent/exact_prompts/sync-vendored-skills.md`, 13 `VENDOR.md` files under `dot_pi/agent/exact_skills*/`, `dot_pi/agent/AGENTS.md` | Task 2 adds `sync-vendored-skills.mjs` + tests and shrinks `sync-vendored-skills.md`; `VENDOR.md` files and `AGENTS.md` already reference `/sync-vendored-skills` and need no change |
| `pr-validate-report/github-url.mjs` and `collect.mjs` | `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `workspace.mjs`, `collect.test.mjs`, `workspace.test.mjs`, `dot_pi/agent/exact_prompts/pr-validate.md` | Task 3 adds `githubAccountForOwner` and updates `collect.mjs`. `workspace.mjs` and `pr-validate.md` need no code or prompt changes because the schema and exit-code contract stay the same. `workspace.test.mjs` verifies the metadata-unavailable path |
| `gh-as.fish` and `AGENTS.md` GitHub account rule | `dot_config/private_fish/exact_functions/gh-as.fish`, `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` | Task 3 adds `gh-as.fish` + `gh-as.test.mjs`; Task 6 documents `gh-as` in `AGENTS.md` while preserving all regex markers asserted by `learn-prompts.test.mjs` |
| `plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, `disk-cleanup.md`, `resolve-worktree/SKILL.md` | `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs` | Tasks 4 and 5 update the prompts/skill and add/update tests in `lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs` while staying within prompt byte budgets |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Rex session auto-naming | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs` | Run `fish -c rex-name-session` automatically when `REX_SESSION` and `REX_BLOCK` are set; remove the `rex-name-session` prompt chore from `formatRexContext` | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/user-context.test.mjs` |
| Vendored skill sync CLI & prompt | `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs`, `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs`, `dot_pi/agent/exact_prompts/sync-vendored-skills.md` | Discover `VENDOR.md` skills, clone/fetch upstream repos, diff/copy files (or `Files` subset), update `Pinned commit`, and emit JSON summary | `node --test dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` |
| Per-org `gh` token routing & `gh-as` | `dot_pi/agent/exact_scripts/pr-validate-report/github-url.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`, `dot_config/private_fish/exact_functions/gh-as.fish`, `dot_pi/agent/exact_scripts/gh-as.test.mjs` | Resolve per-org token via `gh auth token --hostname github.com --user <login>` and pass `GH_TOKEN` to child `gh` calls without mutating global auth state | `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/gh-as.test.mjs` |
| Lifecycle Git helper CLI | `dot_pi/agent/exact_scripts/lifecycle-git.mjs`, `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/learn.md`, `dot_pi/agent/exact_prompts/pr-address-feedback.md` | Deterministic `verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` subcommands and prompt/skill integrations | `node --test dot_pi/agent/exact_scripts/lifecycle-git.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs` |
| Disk cleanup helper CLI | `dot_pi/agent/exact_scripts/disk-cleanup.mjs`, `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs`, `dot_pi/agent/exact_prompts/disk-cleanup.md` | `measure` and non-destructive Worktrunk `scan-worktrees`; Worktrunk may write caches | `node --test dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` |
| Package & docs wiring | `dot_pi/agent/package.json`, `dot_pi/agent/AGENTS.md` | Wire new test files into `npm test` scripts and document `gh-as` and new helper scripts | `cd dot_pi/agent && npm test && npm run test:all` |

### Key Decisions
- **Auto-run `rex-name-session` once per interactive Pi process:** Capture Pi’s startup directory before task routing. A slash command that targets another worktree does not change the naming directory. Require `ctx.mode === "tui"`. Do not use `ctx.hasUI` because Pi also sets it in RPC mode. This excludes `/implement` children that inherit both Rex variables. Keep `rex-name-session.fish` as the only implementation of the single-tab, single-pane and `keep:` checks.
- **Consolidate lifecycle Git operations into `dot_pi/agent/exact_scripts/lifecycle-git.mjs`:** Subcommands (`verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, `compare-snapshots`) share `git worktree list --porcelain` parsing, path canonicalization, and Git runner helpers. Separate scripts would duplicate worktree parsing and CLI boilerplate across three files.
- **Fail closed (`auth_unavailable`) when `gh auth token` fails in `collect.mjs` and `gh-as.fish`:** Falling back to ambient `gh` auth would silently query GitHub with the wrong organization identity when the target account is unavailable.
- **Use Worktrunk for worktree discovery:** The user chose Worktrunk's integration policy instead of GitHub PR-state checks and approved Worktrunk cache writes during `scan-worktrees`. The helper never removes worktrees or branches. The prompt requires explicit approval before removal, including integrated candidates.

### Implementation Constraints
- Preserve all prompt context byte budgets in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` (`plan.md` <= 17,200 bytes, `verify.md` <= 13,700 bytes, `execute.md` <= 14,500 bytes, `systematic-review.md` <= 12,500 bytes, `simplify.md` <= 9,500 bytes, `brainstorm.md` <= 14,000 bytes).
- Preserve all required prompt contract markers in `lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs`.
- Use only Node.js built-in modules (`node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `node:url`, `node:util`) in `exact_scripts/*.mjs` so scripts run in rendered `~/.pi/agent/scripts/` without extra runtime dependencies.
- Never print `GH_TOKEN` values or raw `gh` stderr containing tokens to stdout or stderr.

### Security and Observability Requirements
- **Security:** Resolve GitHub tokens with `gh auth token --hostname github.com --user <login>` into in-memory variables and pass them only via child-process `env.GH_TOKEN`. Strip inherited `GH_TOKEN` and `GITHUB_TOKEN` when resolving tokens, and never pass tokens on command-line arguments or log them in JSON envelopes or stderr diagnostics. Validate paths and refs with `--` or `--end-of-options` before passing to `git`.
- **Observability:** No external telemetry applies to local CLI helpers. Node CLIs emit structured JSON with `schemaVersion: 1` on stdout and concise, secret-free diagnostics on stderr. Exit codes are `0` for success, `1` for operational or check failure, and `2` for invalid arguments. `collect.mjs` returns `0` when it produces a valid evidence envelope, even when all sources are unavailable. `gh-as` preserves the wrapped command’s output and exit status.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| `rex-name-session` fails or times out in `user-context.ts` | Ignore failure without throwing or blocking `before_agent_start` context injection | `user-context.test.mjs` |
| `sync-vendored-skills.mjs` given an unknown skill name or non-vendored skill | Exit `2` with JSON error naming the invalid skill before modifying any files | `sync-vendored-skills.test.mjs` |
| `gh auth token` fails in `collect.mjs` or `gh-as.fish` | `collect.mjs` marks all sources `unavailable` (`auth_unavailable`) without calling source queries; `gh-as.fish` prints diagnostic to stderr and exits `1` without invoking `gh` | `collect.test.mjs`, `gh-as.test.mjs` |
| `verify-design-approval` inspects an unapproved, multi-file, merge-commit, or dirty `design.md` | Exit `1` with JSON `approved: false`, specific failure `reason`, `alreadyApprovedWithoutValidCommit` flag when applicable, and `handoffCommand` | `lifecycle-git.test.mjs` |
| `snapshot` / `compare-snapshots` detects modified tracked or untracked files during `/verify` | Exit `1` with JSON `match: false` and exact `deltas` list (`branch`, `head`, `statusPorcelain`, `stagedDiffHash`, `unstagedDiffHash`, `untrackedFiles`) | `lifecycle-git.test.mjs` |
| `disk-cleanup.mjs` encounters stopped Docker/Colima, active `bzl test`/`bzl build`, or orphaned worktree directory | Record `dockerDf: { available: false }`, `bazelRunning: true`, and `classification: "orphaned"` in JSON output without failing the scan | `disk-cleanup.test.mjs` |

### Rollout and Rollback
- From the verified worktree, use `chezmoi --source "$PWD" diff` on the explicit changed target files. Apply only those targets after `/verify` passes. Install each helper and its callers together.
- To roll back, revert the slice and re-apply its changed targets from the reverted source. Include the removed `gh-as` target if Slice 3 is rolled back. Owner: Matteo Ruina.

### Test Strategy
- Highest supported interface: invoke each CLI script and Fish function as a child process (or exported entrypoint with injected process runner where appropriate) against real temporary Git repositories/worktrees and fake external binaries (`gh`, `rex`, `du`, `df`, `docker`, `pgrep`) on `PATH`.
- Narrow failing commands per slice:
  - Slice 1: `node --experimental-strip-types --test dot_pi/agent/exact_extensions/user-context.test.mjs`
  - Slice 2: `node --test dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs`
  - Slice 3: `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/gh-as.test.mjs`
  - Slice 4: `node --test dot_pi/agent/exact_scripts/lifecycle-git.test.mjs dot_pi/agent/exact_scripts/disk-cleanup.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs`
- Full verification: in `dot_pi/agent/`, run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all`, then remove `dot_pi/agent/node_modules`.
- Validation limits: local Git repos and fake CLIs verify subprocess arguments, file state, and failure handling. The isolated Pi smoke check verifies candidate loading and the Rex hook without live GitHub, Rex, or model services. These checks do not establish live service or model behavior. A missing required local check blocks delivery; do not substitute the installed Pi configuration for the candidate.

---

## Acceptance Criteria

### Requirement 1: Automatic Rex session naming in `user-context.ts`
The `user-context` extension SHALL attempt `fish -c rex-name-session` in the background once per interactive Pi process with nonempty `REX_SESSION` and `REX_BLOCK`. It SHALL use Pi’s startup directory and retain the existing `rex-name-task` guidance without instructing the model to run `rex-name-session`.

#### Scenario: Interactive Pi targets another worktree
- GIVEN Pi starts in repository A with both Rex variables set
- WHEN the first prompt targets worktree B and a later prompt starts
- THEN the hook starts `fish -c rex-name-session` once in repository A without waiting for it
- AND only the existing Fish layout and `keep:` checks decide whether the session name changes.

#### Scenario: No eligible Rex session (negative)
- GIVEN a missing Rex variable, or a noninteractive Pi process with both variables inherited
- WHEN `before_agent_start` runs
- THEN it does not invoke `fish -c rex-name-session`.

#### Scenario: Interactive naming fails (negative)
- GIVEN the process qualifies for automatic naming but the subprocess fails or times out
- THEN context injection continues without retrying the name change.

### Requirement 2: Deterministic vendored-skill synchronization CLI
`sync-vendored-skills.mjs` SHALL discover `VENDOR.md` files under `exact_skills`, `exact_skills_work`, and `exact_skills_personal`, fetch upstream clones under `${GO_REPOS_ROOT:-$HOME/go/src/github.com}/<org>/<repo>`, update out-of-date skills (full subpath or `Files` list) while preserving `VENDOR.md` and stripping trailing horizontal whitespace on lines when needed, update `Pinned commit`, and emit a `schemaVersion: 1` JSON report.

#### Scenario: Out-of-date and up-to-date vendored skills
- GIVEN an out-of-date skill whose clone has a checkout different from `origin/HEAD`, an up-to-date skill, and a hand-maintained skill without `VENDOR.md`
- WHEN the helper runs with `--source` set to the intended chezmoi source root
- THEN the out-of-date skill’s files come from the exact commit recorded in `Pinned commit`, not the clone’s checkout
- AND the up-to-date skill is reported as `up_to_date` without file writes
- AND the hand-maintained skill directory without `VENDOR.md` is untouched.

#### Scenario: Unknown or non-vendored skill filter (negative)
- GIVEN a skill name argument that does not match any directory containing `VENDOR.md`
- WHEN `node dot_pi/agent/exact_scripts/sync-vendored-skills.mjs <unknown-skill>` runs
- THEN it exits with code `2`, writes a structured error to stderr, and modifies no files.
- GIVEN the requested commit, subpath, or file cannot be read, or its destination escapes the intended skill directory
- THEN the helper exits nonzero without advancing any pin or allowing the prompt to apply the skill targets.

### Requirement 3: Non-mutating per-org GitHub authentication in `collect.mjs` and `gh-as.fish`
`collect.mjs` and `gh-as.fish` SHALL route `ddoghq` and `ddoghq-sandbox` (case-insensitive) to `matteo-ruina_ddog` and all other owners to `maruina`, resolve a token with `gh auth token --hostname github.com --user <login>`, and pass `GH_TOKEN` in the child environment without calling `gh auth switch` or printing the token.

#### Scenario: `collect.mjs` routes `ddoghq` and non-`ddoghq` PRs by owner
- GIVEN a PR URL under `ddoghq/dd-source` and a PR URL under `DataDog/dd-go`
- WHEN `node dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs <url>` runs
- THEN it calls `gh auth token --hostname github.com --user matteo-ruina_ddog` for `ddoghq/dd-source` and `--user maruina` for `DataDog/dd-go`
- AND passes the returned token as `GH_TOKEN` to every read-only `gh` source query.

#### Scenario: `gh-as.fish` routes explicit logins, `owner/repo`, and GitHub URLs
- GIVEN `gh-as` is invoked with `ddoghq/dd-source pr view 1`, a `github.com` repository URL and `pr list`, or `matteo-ruina_ddog api user`
- WHEN `gh-as` runs from an unrelated checkout with a conflicting inherited `GH_REPO`
- THEN it uses the mapped or explicit login and pins the repository form to `github.com/OWNER/REPO` independently of the checkout and inherited environment
- AND it rejects unsupported command forms and explicit host or repository overrides before token lookup. The wrapper supports repository-form `pr view <number>` and `pr list`, and login-form `api user`. It rejects positional PR URLs and flags that select another host or repository.

#### Scenario: Token lookup failure does not query under ambient account or leak secrets (negative)
- GIVEN `gh auth token` exits non-zero
- WHEN `collect.mjs` or `gh-as.fish` runs
- THEN `collect.mjs` exits `0` with its existing `partial` envelope and all seven sources `unavailable` with `auth_unavailable`, without invoking source queries
- AND `workspace.mjs preflight` reports metadata unavailable and does not fetch
- AND `gh-as.fish` exits nonzero without invoking the subcommand or printing any token.

### Requirement 4: Deterministic lifecycle Git helper (`lifecycle-git.mjs`)
`lifecycle-git.mjs` SHALL provide read-only subcommands `verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` emitting `schemaVersion: 1` JSON, and `plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, and `resolve-worktree/SKILL.md` SHALL use them.

#### Scenario: `verify-design-approval` accepts a valid status-only approval commit and rejects invalid states
- GIVEN `git log -1 --first-parent --full-history --format=%H -- <design-path>` identifies a one-parent commit that changes only the design file’s header from `Status: Draft` to `Status: Approved`, with no mode change
- AND the approved design blob matches the design in HEAD, the index, and the working tree
- WHEN `node dot_pi/agent/exact_scripts/lifecycle-git.mjs verify-design-approval <design-path>` runs
- THEN it exits `0` with `approved: true` and the verified commit and blob SHA.

#### Scenario: `verify-design-approval` rejects dirty, multi-file, or unapproved designs (negative)
- GIVEN the approval commit also modifies another file, the working copy is dirty, `Status: Approved` appears in the initial creation commit, or the index and working tree match a previous approved blob while HEAD differs
- WHEN `node dot_pi/agent/exact_scripts/lifecycle-git.mjs verify-design-approval <design-path>` runs
- THEN it exits `1` with `approved: false`, the failure `reason`, `alreadyApprovedWithoutValidCommit` when applicable, and the `/systematic-review` handoff command.

#### Scenario: `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` operate deterministically
- GIVEN a repository with multiple worktrees, nested `plans/<slug>/plan.md` files, and tracked/untracked changes
- WHEN `resolve` (`--path` or `--glob`), `discover-plan`, `snapshot`, and `compare-snapshots` run
- THEN `resolve` and `discover-plan` return canonical paths, worktree roots, branches, headings, and candidate lists without mutating Git state, and `compare-snapshots` exits `0` when identical and `1` with field-level `deltas` when tracked or untracked state changes.

### Requirement 5: Deterministic disk-cleanup measurement and Worktrunk preview (`disk-cleanup.mjs`)
`disk-cleanup.mjs` SHALL provide `measure` and `scan-worktrees` subcommands with `schemaVersion: 1` JSON. The scan SHALL use `wt list` and `wt step prune --dry-run` rather than GitHub PR queries. Worktrunk may write its local cache; the helper SHALL NOT remove worktrees or branches.

#### Scenario: Worktrunk preview
- GIVEN clean integrated, dirty, locked, unintegrated, branch-only, and orphaned worktrees
- WHEN `scan-worktrees` runs
- THEN it reports Worktrunk's integration and preview evidence, dirty and locked states, branch-only candidates, and orphaned directories without claiming PR merge state.
- AND unavailable or ambiguous evidence is flagged, not eligible for removal.
- AND the prompt requires explicit approval before removal and does not run bulk prune against unreviewed candidates.

#### Scenario: No destructive scan (negative)
- GIVEN dirty worktrees, crash dumps, and caches exist on disk
- WHEN `measure` or `scan-worktrees` runs
- THEN no worktrees, branches, files outside Worktrunk's cache, or `gh auth` configurations are removed or modified.

---

### Slice 1: Auto-run `rex-name-session` in `user-context.ts` and drop the prompt chore

### Task 1: Auto-run `rex-name-session` in `user-context.ts`
**Status:** Complete.
**Delivers:** Automatic background execution of `fish -c rex-name-session` when `REX_SESSION` and `REX_BLOCK` are set, and removal of the `rex-name-session` instruction from `formatRexContext`.
**Blocked by:** None
**Traces to:** Requirement 1
**Files:** `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs`

- [x] Add focused failing tests in `dot_pi/agent/exact_extensions/user-context.test.mjs` for the registered hook: startup directory versus task target, duplicate turns, inherited Rex variables in RPC mode, a missing Rex variable, and a failed naming attempt. Verify that the result retains `rex-name-task` guidance without a `rex-name-session` instruction.
  - The focused test failed as expected before implementation: naming was absent and the old guidance remained. The tests also cover extension reload.
- [x] Capture the startup directory when the extension loads. In `before_agent_start`, start the bounded Fish command at most once per eligible TUI process without waiting for it. Remove the `rex-name-session` instruction and limit the remaining failure guidance to `rex-name-task`.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/user-context.test.mjs dot_pi/agent/exact_scripts/rex-naming.test.mjs`; expect all tests to pass.
  - The first implementation check found a removed task-timing instruction and a macOS `/var` symlink mismatch in the test. Restored the timing instruction and compared canonical paths; the rerun passed all 19 tests.
- [x] Refactor only after green, then rerun the test command above.
  - No implementation refactor was needed. Strengthened the test to confirm Fish remains running when the hook returns, then reran all 19 tests successfully.
- [x] Commit with `feat(pi): auto-run rex-name-session from user-context`.

### Slice 2: Deterministic `sync-vendored-skills.mjs` CLI and compact `sync-vendored-skills.md`

### Task 2: Extract `sync-vendored-skills.mjs` and shrink `sync-vendored-skills.md`
**Status:** Complete. The user approved making vendored skill directories exact, including removal of target files absent from the source. An isolated fixture showed that nested directories must also be exact. The user approved updating the `k8s-api-design` and `k8s-controller-dev` manifests from `DataDog/claude-marketplace` to `ddoghq/claude-marketplace` after the existing clone showed the latter origin and the former GitHub API lookup returned 404 for `maruina`.
**Delivers:** `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` with unit/integration tests and a compact `dot_pi/agent/exact_prompts/sync-vendored-skills.md`.
**Blocked by:** None
**Traces to:** Requirement 2
**Files:** `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs`, `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs`, `dot_pi/agent/exact_prompts/sync-vendored-skills.md`, `dot_pi/agent/package.json`, and the 13 vendored skill source directories.

- [x] Make every vendored skill directory and its nested directories exact. Keep the helper compatible with exact source paths and create exact nested directories for upstream content. Test removal of stale root and nested target files with an isolated chezmoi source and destination; do not apply the candidate to the home directory before verification.
  - The isolated fixture removed stale root and nested targets. All 47 existing vendored files match their original Git blob hashes after the directory renames.
- [x] Write focused failing tests in `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` covering `--help`, full-directory skill sync, `Files`-list partial sync, trailing horizontal whitespace stripping when `Local divergence` notes whitespace stripping (or preserving clean `git diff --check` output), `up_to_date` skip when pinned commit matches `origin/HEAD`, `--dry-run` mode, preservation of hand-maintained skills without `VENDOR.md`, exit code `2` on unknown skill names, an upstream checkout behind the fetched commit, and an invalid source or destination path that cannot advance the pin.
  - The focused command failed before implementation because the helper did not exist. Historical `VENDOR.md` uses comma-separated backtick-quoted `Files` entries.
- [x] Add the helper and update `sync-vendored-skills.md` to pass the resolved chezmoi source root with `--source` and forward every requested skill filter. Preview with `--dry-run` before source writes. Resolve and validate the selected content from the immutable commit before writing; update the pin only after the copy succeeds. Use the same source and check the explicit changed targets before `chezmoi apply`. Stop on any failed sync or validation and report partial writes, if any. Wire `sync-vendored-skills.test.mjs` into `dot_pi/agent/package.json`.
- [x] Run `node --test dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` and `node dot_pi/agent/exact_scripts/validate-skills.mjs`; expect all tests and skill validations to pass.
  - Eight tests passed and 46 skills validated. The npm script and work and personal profile validations also passed. The tests use local Git fixtures and do not establish live upstream availability.
- [x] Refactor only after green, then rerun verification.
  - Added a failing test for a selected file changing executable mode, fixed duplicate source entries, and reran both required commands successfully. Added fail-closed origin identity checks with local fixtures.
- [x] Commit with `feat(pi): extract deterministic sync-vendored-skills script`.

### Slice 3: Per-org `gh auth token` routing in `collect.mjs` and non-mutating `gh-as` Fish helper

### Task 3: Add per-org `GH_TOKEN` routing to `collect.mjs` and add `gh-as.fish`
**Status:** Complete. The user requested execution of all remaining slices before one independent verification.
**Delivers:** Non-mutating per-organization `gh auth token` resolution in `pr-validate-report/collect.mjs` and a `gh-as` Fish function in `dot_config/private_fish/exact_functions/gh-as.fish`.
**Blocked by:** None
**Traces to:** Requirement 3
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/github-url.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/workspace.test.mjs`, `dot_config/private_fish/exact_functions/gh-as.fish`, `dot_pi/agent/exact_scripts/gh-as.test.mjs`, `dot_pi/agent/package.json`

- [x] Add failing tests in `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` and `dot_pi/agent/exact_scripts/gh-as.test.mjs` verifying that `ddoghq` and `ddoghq-sandbox` route to `matteo-ruina_ddog`, all other owners route to `maruina`, `gh auth token --hostname github.com --user <login>` is called once, `GH_TOKEN` is passed in the child environment, `gh auth switch` is never called, tokens never appear on stdout/stderr, and token lookup failures fail closed. Test repository targeting with an unrelated checkout, conflicting `GH_REPO`, and explicit overrides. Add a `workspace.test.mjs` case that runs the actual collector with a fake `gh`, expects `metadata unavailable` and checks that preflight does not fetch.
- [x] Export `githubAccountForOwner(owner)` in `dot_pi/agent/exact_scripts/pr-validate-report/github-url.mjs`, update `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` to resolve and pass `GH_TOKEN` to every `runGh` call, and create `gh-as.fish` with the host and repository binding in Requirement 3. Preserve the collector’s schema and exit-code contract. Wire `gh-as.test.mjs` into `dot_pi/agent/package.json`.
- [x] Run `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/pr-validate-report/workspace.test.mjs dot_pi/agent/exact_scripts/gh-as.test.mjs`; expect all tests to pass.
  - All 25 tests passed. Fish syntax and JavaScript diagnostics passed. One earlier test run loaded the user's Fish configuration, which changed `PATH` and let the read-only wrapper call the installed `gh`; the test now uses `fish --no-config` and fake `gh`.
- [x] Refactor only after green, then rerun the test command above.
  - No refactor was needed after the passing run.
- [x] Commit with `feat(pi,fish): route gh auth tokens per org without global switch`.

### Slice 4: Deterministic `lifecycle-git.mjs` and `disk-cleanup.mjs` CLIs and prompt integration

### Task 4: Add `lifecycle-git.mjs` and integrate with `plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, and `resolve-worktree`
**Status:** Complete.
**Delivers:** `dot_pi/agent/exact_scripts/lifecycle-git.mjs` (`verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, `compare-snapshots`) and updated prompt/skill instructions within context byte budgets.
**Blocked by:** None
**Traces to:** Requirement 4
**Files:** `dot_pi/agent/exact_scripts/lifecycle-git.mjs`, `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/learn.md`, `dot_pi/agent/exact_prompts/pr-address-feedback.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`, `dot_pi/agent/package.json`

- [x] Write failing tests in `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs` covering `verify-design-approval` (valid status-only approval commit, merge commit rejection, multi-file commit rejection, dirty working tree rejection, already-Approved initial commit detection, a staged reversion that matches the approved blob but not HEAD, and merge history that distinguishes first-parent traversal from the default), `resolve` (`--path` and `--glob` across multiple worktrees with mtime and current-checkout sorting), `discover-plan` (branch-slug match, multiple-match ambiguity, fallback to worktree plans/designs, empty-repo `none` status), and `snapshot` / `compare-snapshots` (clean, staged, unstaged, untracked content mutation, candidate commits).
- [x] Implement `dot_pi/agent/exact_scripts/lifecycle-git.mjs`, update `resolve-worktree/SKILL.md`, `plan.md`, `verify.md`, `learn.md`, and `pr-address-feedback.md` to invoke `lifecycle-git.mjs`, update `lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs`, and wire `lifecycle-git.test.mjs` into `dot_pi/agent/package.json`. Preserve the `/plan` approval gate from Requirement 4. Keep prompt confirmation for discovered targets and exact `/verify` state comparisons, including candidate commits and untracked content.
- [x] Run `node --test dot_pi/agent/exact_scripts/lifecycle-git.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs`; expect all tests (including prompt byte-budget checks) to pass.
  - All 83 tests passed, including budget checks. Skill validation and JavaScript diagnostics passed. The first integrated run found `verify.md` 28 bytes over budget; the instruction was shortened without removing a gate.
- [x] Refactor only after green, then rerun the test command above.
  - Added failing cases for staged design mode changes and slash-containing branch slugs, corrected both, and reran the full focused command successfully.
- [x] Commit with `feat(pi): add lifecycle-git helper CLI for prompts and worktree resolution`.

### Task 5: Add `disk-cleanup.mjs` and shrink `disk-cleanup.md`
**Status:** Complete. The user directed this task to use Worktrunk instead of GitHub PR queries and approved Worktrunk cache writes during scans. `wt list` and `wt step prune --dry-run` may write `.git/wt/cache/` but must not remove worktrees or branches. Worktrunk reports content integration, not PR merge state; the prompt requires explicit approval for removals.
**Delivers:** Non-destructive `dot_pi/agent/exact_scripts/disk-cleanup.mjs` (`measure` and Worktrunk-based `scan-worktrees`) and updated `dot_pi/agent/exact_prompts/disk-cleanup.md`.
**Blocked by:** Task 3 and Task 4
**Traces to:** Requirement 5
**Files:** `dot_pi/agent/exact_scripts/disk-cleanup.mjs`, `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs`, `dot_pi/agent/exact_prompts/disk-cleanup.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/package.json`

- [x] Write failing tests in `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` covering measurement, Worktrunk list and prune preview, integrated and non-integrated worktrees, dirty and locked worktrees, branch-only candidates, orphaned directories, unavailable evidence, and preservation of registrations, refs, and files. Use real disposable Git worktrees and Worktrunk, plus fake measurement commands.
- [x] Add the non-destructive helper and update `disk-cleanup.md` to use Worktrunk while keeping all `<HARD-GATE>` rules. Require explicit approval for each removal. Before removal, recheck registration, branch ownership, lock, dirty state, and recorded tip; stop if evidence changed or is unavailable. Never run bulk prune against unreviewed candidates or override a Worktrunk refusal. Add prompt assertions and wire `disk-cleanup.test.mjs` into `dot_pi/agent/package.json`.
- [x] Run `node --test dot_pi/agent/exact_scripts/disk-cleanup.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
  - All 72 focused tests passed, including six disk helper tests and a real local squash-merge fixture. The fixture checks Git files, registrations, refs, and dirty content; only Worktrunk cache changes are allowed. JavaScript diagnostics passed.
- [x] Refactor only after green, then rerun the test command above.
  - A stronger Git-file comparison found that Worktrunk caches its detected default branch in Git config. The helper now passes an existing `worktrunk.default-branch` or local `origin/HEAD` as per-process Git config and flags a repository when neither is available. The focused suite passed after the fix.
- [x] Commit with `feat(pi): add deterministic disk-cleanup measurement and worktree scanner`.

### Task 6: Document Rex naming and `gh-as`
**Status:** Complete.
**Delivers:** Usage and account rules in `dot_pi/agent/AGENTS.md`.
**Blocked by:** Task 1 and Task 3
**Traces to:** Requirements 1 and 3
**Files:** `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`

- [x] Add a failing prompt contract assertion that distinguishes calls routed by `gh-as` from direct `gh` calls that still require account switching and restoration.
- [x] Document the supported `gh-as` forms and the startup-directory rule for interactive Rex naming. Run `node --test dot_pi/agent/exact_scripts/learn-prompts.test.mjs`, then commit with `docs(pi): document rex naming and gh-as`.
  - The new assertion failed before the documentation change; all 10 tests passed after it. The guidance also identifies the new helper scripts and the Worktrunk cache exception.

### Task 7: Final verification
**Delivers:** Evidence that the cumulative candidate satisfies all five requirements before any apply.
**Blocked by:** Tasks 1-6
**Traces to:** Requirements 1–5

- [ ] Run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` in `dot_pi/agent`. Remove the disposable `dot_pi/agent/node_modules` only after the suite completes. Check `git diff --check origin/main..HEAD` and confirm that verification did not change Git state. A failing test first is not applicable to this verification-only task.
- [ ] Use a temporary `PI_CODING_AGENT_DIR` and explicitly load candidate `user-context.ts` with `--no-extensions -e`. Reuse the offline test-model pattern from `dot_pi/agent/exact_extensions/ship-conductor/_rpc.test.ts` to run a turn in RPC mode with Rex variables, a fake `rex` that returns the context fixture, and a fake `fish` that records any call. Assert from the injected context that the candidate hook ran, kept `rex-name-task` guidance, and did not call Fish. Task 1’s TUI-mode hook test must show the positive startup-directory behavior; the stock `--list-models` smoke check alone proves neither contract.
- [ ] Record the result for each requirement against the cumulative candidate: startup-directory naming and RPC exclusion; exact pinned vendored bytes and no apply on failure; repository-bound GitHub routing and collector failure propagation; unchanged approval and snapshot guards; and Worktrunk previews without worktree or branch removal. Block delivery if any required check is missing.

## Learning candidates
- 2026-11-20: Pi RPC children inherit the parent’s Rex identifiers, so Rex variables alone cannot identify the process that owns a visible pane — evidence: `dot_pi/agent/exact_extensions/ship-conductor/_spawn.ts:85–109`.
- 2026-11-20: The Pi `test:smoke` command can pass against installed extensions without loading a candidate or running its hook — evidence: `dot_pi/agent/package.json:23–24`.
- 2026-11-20: An `exact_` parent does not remove deleted files inside a non-exact child directory; `chezmoi diff` for the removed target reports `not managed` and applying the child leaves the file — evidence: isolated chezmoi source and destination fixture for `exact_skills/demo/removed.md`.
- 2026-11-20: Fish startup configuration can reorder `PATH` ahead of a fake executable in subprocess tests; `fish --no-config` keeps the fixture isolated — evidence: `dot_pi/agent/exact_scripts/gh-as.test.mjs`.
- 2026-11-20: Worktrunk `list` can persist its inferred `worktrunk.default-branch` in local Git config even during a preview; pass an established branch through process-scoped Git config to avoid the write — evidence: `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs`.
