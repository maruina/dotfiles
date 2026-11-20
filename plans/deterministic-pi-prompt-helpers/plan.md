# Deterministic Pi Prompt Helpers Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace multi-step LLM shell choreography in Pi extensions, skills, and prompts with deterministic, tested CLI helpers and non-mutating per-process GitHub authentication.
**Smallest user-feedback slice:** `user-context.ts` automatically runs `fish -c rex-name-session` in the background when `REX_SESSION` and `REX_BLOCK` are set, and drops the session-naming prompt chore so new Rex Pi sessions no longer spend an initial tool turn running `rex-name-session`.
**Out of Scope:** Automating semantic `rex-name-task` label selection, automating curated `/sync-home-assistant-skills` updates, running destructive deletions inside `disk-cleanup.mjs`, or changing `ship-conductor` bridge protocol versions.
**Architecture:** Deterministic Node.js ESM CLIs in `dot_pi/agent/exact_scripts/` (`sync-vendored-skills.mjs`, `lifecycle-git.mjs`, `disk-cleanup.mjs`, and `pr-validate-report/collect.mjs`) and a Fish helper (`dot_config/private_fish/exact_functions/gh-as.fish`) execute Git, filesystem, and GitHub queries using only standard-library modules and installed CLIs. Prompts and skills invoke these helpers and consume their versioned JSON output while keeping human approval gates and semantic decisions in the prompt templates.
**Tech Stack:** TypeScript, Node.js ESM (`node:child_process`, `node:crypto`, `node:fs`, `node:path`, `node:test`), Fish shell, Git, GitHub CLI (`gh`), Rex CLI (`rex`), chezmoi.

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

## Advisory learning lookup
Queried `Datadog/Learnings.md` via `obsidian read path="Datadog/Learnings.md" | node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/learn-evidence.mjs" learning-sections --term rex --term worktree --term prompt --term gh --term vendored --term lifecycle`. Thirteen sections matched (`Render piped chezmoi templates against an initialized config, not --init` and twelve distributed-systems/Kubernetes entries). None conflicted with or altered these local Pi script and prompt changes.

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Auto-run `rex-name-session` from `user-context.ts` | Trigger `runAsync("fish", ["-c", "rex-name-session"], cwd, 3000)` once per `(cwd, REX_SESSION, REX_BLOCK)` when both env vars are set; remove the `rex-name-session` line from `formatRexContext` | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_config/private_fish/exact_functions/rex-name-session.fish` | Unit tests in `dot_pi/agent/exact_extensions/user-context.test.mjs` and `dot_pi/agent/exact_scripts/rex-naming.test.mjs` | Keep `rex-name-session.fish` unchanged; ignore background helper failures so `before_agent_start` never fails |
| Deterministic vendored-skill sync CLI | `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` discovers `VENDOR.md` files, clones/fetches upstream repos under `${GO_REPOS_ROOT:-$HOME/go/src/github.com}/<org>/<repo>`, compares `origin/HEAD`, copies upstream files (or `Files` subset), strips trailing horizontal whitespace on lines when needed, updates `Pinned commit`, and emits JSON | 13 `VENDOR.md` files under `dot_pi/agent/exact_skills*/`; `dot_pi/agent/exact_prompts/sync-vendored-skills.md` | `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` using local Git repo fixtures | Fail with structured JSON error and non-zero exit code before modifying skill files |
| Non-mutating per-org `gh` auth in `collect.mjs` and `gh-as.fish` | Map `ddoghq` and `ddoghq-sandbox` (case-insensitive) to `matteo-ruina_ddog` and all other owners to `maruina` (matching `_publish.ts`); resolve token via `gh auth token --hostname github.com --user <login>` and pass `GH_TOKEN` + `GH_HOST=github.com` to child `gh` processes | `dot_pi/agent/exact_extensions/ship-conductor/_publish.ts:81-82`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` | `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` and `dot_pi/agent/exact_scripts/gh-as.test.mjs` with fake `gh` binaries | In `collect.mjs`, mark sources unavailable with `auth_unavailable` and emit partial/unavailable envelope; in `gh-as.fish`, exit non-zero on stderr without running `gh` under the wrong account |
| Lifecycle Git helper CLI (`lifecycle-git.mjs`) | Subcommands `verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` wrapping read-only `git` commands with JSON output | `dot_pi/agent/exact_prompts/plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md` | `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs` with temporary Git worktree fixtures + `lifecycle-prompts.test.mjs` + `learn-prompts.test.mjs` | Exit non-zero with structured JSON diagnostic so the calling prompt stops or hands off |
| Disk cleanup measurement & worktree scanner (`disk-cleanup.mjs`) | Subcommands `measure` (`df`, bounded `du`, `docker system df`, `pgrep`) and `scan-worktrees` (`git worktree list --porcelain`, dirty/locked/orphan checks, per-org `gh pr list` merge checks) emitting JSON | `dot_pi/agent/exact_prompts/disk-cleanup.md` | `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` with fake `git`/`gh`/`du`/`df` fixtures | Report unavailable command/account in JSON output without deleting or mutating anything |

## Consumer map
| Modified surface | Consumers found via `rg` | Planned action |
|---|---|---|
| `user-context.ts` (`formatRexContext`, `loadRexLines`) | `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs` | Task 1 updates `user-context.ts` and `user-context.test.mjs`; `rex-name-session.fish` and `rex-naming.test.mjs` remain unchanged |
| `sync-vendored-skills.md` and `VENDOR.md` files | `dot_pi/agent/exact_prompts/sync-vendored-skills.md`, 13 `VENDOR.md` files under `dot_pi/agent/exact_skills*/`, `dot_pi/agent/AGENTS.md` | Task 2 adds `sync-vendored-skills.mjs` + tests and shrinks `sync-vendored-skills.md`; `VENDOR.md` files and `AGENTS.md` already reference `/sync-vendored-skills` and need no change |
| `pr-validate-report/github-url.mjs` and `collect.mjs` | `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `workspace.mjs`, `collect.test.mjs`, `workspace.test.mjs`, `dot_pi/agent/exact_prompts/pr-validate.md` | Task 3 adds `githubAccountForOwner` in `github-url.mjs`, updates `collect.mjs` and `collect.test.mjs`; `workspace.mjs` and `pr-validate.md` call `collect.mjs` with the same CLI signature and need no change |
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
| Disk cleanup helper CLI | `dot_pi/agent/exact_scripts/disk-cleanup.mjs`, `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs`, `dot_pi/agent/exact_prompts/disk-cleanup.md` | Read-only `measure` and `scan-worktrees` subcommands with per-org `gh auth token` PR merge lookups | `node --test dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` |
| Package & docs wiring | `dot_pi/agent/package.json`, `dot_pi/agent/AGENTS.md` | Wire new test files into `npm test` scripts and document `gh-as` and new helper scripts | `cd dot_pi/agent && npm test && npm run test:all` |

### Key Decisions
- **Auto-run `rex-name-session` in `user-context.ts` once per `(cwd, REX_SESSION, REX_BLOCK)`:** Avoids spending an LLM tool turn on every new Rex session while keeping `rex-name-session.fish` as the single implementation of the single-tab/single-pane and `keep:` safety checks. Running it every turn without a key would add unnecessary subprocess overhead on multi-turn sessions.
- **Consolidate lifecycle Git operations into `dot_pi/agent/exact_scripts/lifecycle-git.mjs`:** Subcommands (`verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, `compare-snapshots`) share `git worktree list --porcelain` parsing, path canonicalization, and Git runner helpers. Separate scripts would duplicate worktree parsing and CLI boilerplate across three files.
- **Fail closed (`auth_unavailable`) when `gh auth token` fails in `collect.mjs` and `gh-as.fish`:** Falling back to ambient `gh` auth would silently query GitHub with the wrong organization identity when the target account is unavailable.
- **Keep `disk-cleanup.mjs` strictly read-only (`measure` and `scan-worktrees`):** Destructive operations (`git worktree remove`, `go clean -modcache`, `bzl dd disk-space gc`, `docker image prune`) remain gated by user confirmation in `disk-cleanup.md`.

### Implementation Constraints
- Preserve all prompt context byte budgets in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` (`plan.md` <= 17,200 bytes, `verify.md` <= 13,700 bytes, `execute.md` <= 14,500 bytes, `systematic-review.md` <= 12,500 bytes, `simplify.md` <= 9,500 bytes, `brainstorm.md` <= 14,000 bytes).
- Preserve all required prompt contract markers in `lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs`.
- Use only Node.js built-in modules (`node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`, `node:url`, `node:util`) in `exact_scripts/*.mjs` so scripts run in rendered `~/.pi/agent/scripts/` without extra runtime dependencies.
- Never print `GH_TOKEN` values or raw `gh` stderr containing tokens to stdout or stderr.

### Security and Observability Requirements
- **Security:** Resolve GitHub tokens with `gh auth token --hostname github.com --user <login>` into in-memory variables and pass them only via child-process `env.GH_TOKEN`. Strip inherited `GH_TOKEN` and `GITHUB_TOKEN` when resolving tokens, and never pass tokens on command-line arguments or log them in JSON envelopes or stderr diagnostics. Validate paths and refs with `--` or `--end-of-options` before passing to `git`.
- **Observability:** No external telemetry applies to local CLI helpers. Each CLI emits structured JSON with `schemaVersion: 1` on stdout and concise, secret-free error codes/messages on stderr with semantic exit codes (`0` success, `1` operational/check failure, `2` usage/argument error).

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
- Preview with `chezmoi --source "$PWD" diff` and apply only the verified target files after `/verify` passes.
- Roll back by reverting the branch commits and re-applying `~/.pi/agent` and `~/.config/fish/functions/gh-as.fish` with `chezmoi apply`. Owner: Matteo Ruina.

### Test Strategy
- Highest supported interface: invoke each CLI script and Fish function as a child process (or exported entrypoint with injected process runner where appropriate) against real temporary Git repositories/worktrees and fake external binaries (`gh`, `rex`, `du`, `df`, `docker`, `pgrep`) on `PATH`.
- Narrow failing commands per slice:
  - Slice 1: `node --experimental-strip-types --test dot_pi/agent/exact_extensions/user-context.test.mjs`
  - Slice 2: `node --test dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs`
  - Slice 3: `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/gh-as.test.mjs`
  - Slice 4: `node --test dot_pi/agent/exact_scripts/lifecycle-git.test.mjs dot_pi/agent/exact_scripts/disk-cleanup.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs`
- Full verification: in `dot_pi/agent/`, run `npm ci --ignore-scripts`, `npm test`, and `npm run test:all`, then remove `dot_pi/agent/node_modules`.
- Validation limits: contract tests verify prompt markers, byte budgets, and deterministic CLI behavior against local Git repos and fake CLIs; they do not prove live LLM compliance across every model. This gap is accepted and matches existing repository prompt tests.

---

## Acceptance Criteria

### Requirement 1: Automatic Rex session naming in `user-context.ts`
The `user-context` extension SHALL automatically run `fish -c rex-name-session` in the session working directory when `REX_SESSION` and `REX_BLOCK` are set, and SHALL NOT instruct the model to run `rex-name-session` in the injected Rex guidance block.

#### Scenario: Rex session with `REX_SESSION` and `REX_BLOCK` set
- GIVEN `REX_SESSION` and `REX_BLOCK` are non-empty in the environment
- WHEN `ensureRexSessionNamed` / `loadRexLines` runs for a working directory
- THEN it invokes `fish -c rex-name-session` in that `cwd` once per `(cwd, REX_SESSION, REX_BLOCK)` key
- AND the formatted `## Rex` guidance includes `rex-name-task` instructions without mentioning `rex-name-session`.

#### Scenario: Outside Rex or missing `REX_BLOCK` (negative)
- GIVEN `REX_SESSION` or `REX_BLOCK` is unset
- WHEN `ensureRexSessionNamed` / `loadRexLines` runs
- THEN it does not invoke `fish -c rex-name-session` or `rex`.

### Requirement 2: Deterministic vendored-skill synchronization CLI
`sync-vendored-skills.mjs` SHALL discover `VENDOR.md` files under `exact_skills`, `exact_skills_work`, and `exact_skills_personal`, fetch upstream clones under `${GO_REPOS_ROOT:-$HOME/go/src/github.com}/<org>/<repo>`, update out-of-date skills (full subpath or `Files` list) while preserving `VENDOR.md` and stripping trailing horizontal whitespace on lines when needed, update `Pinned commit`, and emit a `schemaVersion: 1` JSON report.

#### Scenario: Out-of-date and up-to-date vendored skills
- GIVEN two vendored skills (one tracking a full subpath with a new upstream commit and one already at `origin/HEAD`) and one hand-maintained skill without `VENDOR.md`
- WHEN `node dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` runs
- THEN the out-of-date skill's files and `Pinned commit` in `VENDOR.md` are updated to `origin/HEAD`
- AND the up-to-date skill is reported as `up_to_date` without file writes
- AND the hand-maintained skill directory without `VENDOR.md` is untouched.

#### Scenario: Unknown or non-vendored skill filter (negative)
- GIVEN a skill name argument that does not match any directory containing `VENDOR.md`
- WHEN `node dot_pi/agent/exact_scripts/sync-vendored-skills.mjs <unknown-skill>` runs
- THEN it exits with code `2`, writes a structured error to stderr, and modifies no files.

### Requirement 3: Non-mutating per-org GitHub authentication in `collect.mjs` and `gh-as.fish`
`collect.mjs` and `gh-as.fish` SHALL route `ddoghq` and `ddoghq-sandbox` (case-insensitive) to `matteo-ruina_ddog` and all other owners to `maruina`, resolve a token with `gh auth token --hostname github.com --user <login>`, and pass `GH_TOKEN` in the child environment without calling `gh auth switch` or printing the token.

#### Scenario: `collect.mjs` routes `ddoghq` and non-`ddoghq` PRs by owner
- GIVEN a PR URL under `ddoghq/dd-source` and a PR URL under `DataDog/dd-go`
- WHEN `node dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs <url>` runs
- THEN it calls `gh auth token --hostname github.com --user matteo-ruina_ddog` for `ddoghq/dd-source` and `--user maruina` for `DataDog/dd-go`
- AND passes the returned token as `GH_TOKEN` to every read-only `gh` source query.

#### Scenario: `gh-as.fish` routes explicit logins, `owner/repo`, and GitHub URLs
- GIVEN `gh-as` is invoked with `ddoghq/dd-source pr view 1` or `DataDog/dd-go pr view 1` or `matteo-ruina_ddog api user`
- WHEN `gh-as` runs
- THEN it resolves the token for the mapped login (`matteo-ruina_ddog` or `maruina`) and runs `gh` with `GH_TOKEN` set in the child environment and the target argument removed.

#### Scenario: Token lookup failure does not query under ambient account or leak secrets (negative)
- GIVEN `gh auth token` exits non-zero
- WHEN `collect.mjs` or `gh-as.fish` runs
- THEN `collect.mjs` marks all sources `unavailable` with error `auth_unavailable` without invoking any of the 7 source queries, and `gh-as.fish` exits non-zero without invoking the subcommand or printing any token.

### Requirement 4: Deterministic lifecycle Git helper (`lifecycle-git.mjs`)
`lifecycle-git.mjs` SHALL provide read-only subcommands `verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` emitting `schemaVersion: 1` JSON, and `plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, and `resolve-worktree/SKILL.md` SHALL use them.

#### Scenario: `verify-design-approval` accepts a valid status-only approval commit and rejects invalid states
- GIVEN a Git repository where the latest commit touching `plans/demo/design.md` has one parent, modifies only `plans/demo/design.md` with no mode change, changes only `Status: Draft` to `Status: Approved` in the header, and matches the working tree and index blobs
- WHEN `node dot_pi/agent/exact_scripts/lifecycle-git.mjs verify-design-approval <design-path>` runs
- THEN it exits `0` with `approved: true` and the verified commit and blob SHA.

#### Scenario: `verify-design-approval` rejects dirty, multi-file, or unapproved designs (negative)
- GIVEN a `design.md` whose latest commit also modified another file, or has uncommitted working-tree changes, or already has `Status: Approved` from its initial creation commit
- WHEN `node dot_pi/agent/exact_scripts/lifecycle-git.mjs verify-design-approval <design-path>` runs
- THEN it exits `1` with `approved: false`, the failure `reason`, `alreadyApprovedWithoutValidCommit` when applicable, and the `/systematic-review` handoff command.

#### Scenario: `resolve`, `discover-plan`, `snapshot`, and `compare-snapshots` operate deterministically
- GIVEN a repository with multiple worktrees, nested `plans/<slug>/plan.md` files, and tracked/untracked changes
- WHEN `resolve` (`--path` or `--glob`), `discover-plan`, `snapshot`, and `compare-snapshots` run
- THEN `resolve` and `discover-plan` return canonical paths, worktree roots, branches, headings, and candidate lists without mutating Git state, and `compare-snapshots` exits `0` when identical and `1` with field-level `deltas` when tracked or untracked state changes.

### Requirement 5: Deterministic disk-cleanup measurement and worktree scanner (`disk-cleanup.mjs`)
`disk-cleanup.mjs` SHALL provide read-only `measure` and `scan-worktrees` subcommands that emit `schemaVersion: 1` JSON without deleting files or switching global `gh` accounts, and `disk-cleanup.md` SHALL use them for Steps 1 and 2.

#### Scenario: `scan-worktrees` classifies worktrees and checks PR state per org
- GIVEN base repositories with clean merged-PR, dirty merged-PR, open-PR, no-PR, locked, foreign-branch, and orphaned worktrees
- WHEN `node dot_pi/agent/exact_scripts/disk-cleanup.mjs scan-worktrees` runs
- THEN it classifies each worktree into `merged_clean`, `merged_dirty`, `open_pr`, `no_pr`, `flagged`, or `orphaned` using per-org `GH_TOKEN` lookups (including per-branch fallback when bulk `gh pr list` misses a branch)
- AND it performs no worktree removals, branch deletions, or recursive deletes.

#### Scenario: `measure` and `scan-worktrees` never mutate disk or global auth state (negative)
- GIVEN dirty worktrees, crash dumps, and caches exist on disk
- WHEN `disk-cleanup.mjs measure` or `disk-cleanup.mjs scan-worktrees` runs
- THEN no files, worktrees, branches, or `gh auth` configurations are modified.

---

### Slice 1: Auto-run `rex-name-session` in `user-context.ts` and drop the prompt chore

### Task 1: Auto-run `rex-name-session` in `user-context.ts`
**Delivers:** Automatic background execution of `fish -c rex-name-session` when `REX_SESSION` and `REX_BLOCK` are set, and removal of the `rex-name-session` instruction from `formatRexContext`.
**Blocked by:** None
**Traces to:** Requirement 1
**Files:** `dot_pi/agent/exact_extensions/user-context.ts`, `dot_pi/agent/exact_extensions/user-context.test.mjs`

- [ ] Update `dot_pi/agent/exact_extensions/user-context.test.mjs` with failing tests asserting that `formatRexContext` / `loadRexLines` omits `rex-name-session` while keeping `rex-name-task` guidance, and that `ensureRexSessionNamed(cwd, env, run)` runs `fish -c rex-name-session` in `cwd` once per `(cwd, REX_SESSION, REX_BLOCK)` when both `REX_SESSION` and `REX_BLOCK` are set and never runs when either is unset.
- [ ] Implement `ensureRexSessionNamed` in `dot_pi/agent/exact_extensions/user-context.ts`, invoke it from `before_agent_start` (non-blocking / error-tolerant), and remove the `rex-name-session` sentence from `formatRexContext`.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/user-context.test.mjs dot_pi/agent/exact_scripts/rex-naming.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command above.
- [ ] Commit with `feat(pi): auto-run rex-name-session from user-context`.

### Slice 2: Deterministic `sync-vendored-skills.mjs` CLI and compact `sync-vendored-skills.md`

### Task 2: Extract `sync-vendored-skills.mjs` and shrink `sync-vendored-skills.md`
**Delivers:** `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` with unit/integration tests and a compact `dot_pi/agent/exact_prompts/sync-vendored-skills.md`.
**Blocked by:** None
**Traces to:** Requirement 2
**Files:** `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs`, `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs`, `dot_pi/agent/exact_prompts/sync-vendored-skills.md`, `dot_pi/agent/package.json`

- [ ] Write focused failing tests in `dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` covering `--help`, full-directory skill sync, `Files`-list partial sync, trailing horizontal whitespace stripping when `Local divergence` notes whitespace stripping (or preserving clean `git diff --check` output), `up_to_date` skip when pinned commit matches `origin/HEAD`, `--dry-run` mode, preservation of hand-maintained skills without `VENDOR.md`, and exit code `2` on unknown skill names.
- [ ] Implement `dot_pi/agent/exact_scripts/sync-vendored-skills.mjs` and shrink `dot_pi/agent/exact_prompts/sync-vendored-skills.md` to invoke `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/sync-vendored-skills.mjs"`, run `chezmoi diff` and `chezmoi apply` on the skill target directories, and summarize the JSON result. Wire `sync-vendored-skills.test.mjs` into `dot_pi/agent/package.json`.
- [ ] Run `node --test dot_pi/agent/exact_scripts/sync-vendored-skills.test.mjs` and `node dot_pi/agent/exact_scripts/validate-skills.mjs`; expect all tests and skill validations to pass.
- [ ] Refactor only after green, then rerun verification.
- [ ] Commit with `feat(pi): extract deterministic sync-vendored-skills script`.

### Slice 3: Per-org `gh auth token` routing in `collect.mjs` and non-mutating `gh-as` Fish helper

### Task 3: Add per-org `GH_TOKEN` routing to `collect.mjs` and add `gh-as.fish`
**Delivers:** Non-mutating per-organization `gh auth token` resolution in `pr-validate-report/collect.mjs` and a `gh-as` Fish function in `dot_config/private_fish/exact_functions/gh-as.fish`.
**Blocked by:** None
**Traces to:** Requirement 3
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/github-url.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`, `dot_config/private_fish/exact_functions/gh-as.fish`, `dot_pi/agent/exact_scripts/gh-as.test.mjs`, `dot_pi/agent/package.json`

- [ ] Add failing tests in `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` and `dot_pi/agent/exact_scripts/gh-as.test.mjs` verifying that `ddoghq` and `ddoghq-sandbox` route to `matteo-ruina_ddog`, all other owners route to `maruina`, `gh auth token --hostname github.com --user <login>` is called once, `GH_TOKEN` is passed in the child environment, `gh auth switch` is never called, tokens never appear on stdout/stderr, and token lookup failures fail closed (`auth_unavailable` in `collect.mjs`, exit `1` in `gh-as.fish`).
- [ ] Export `githubAccountForOwner(owner)` in `dot_pi/agent/exact_scripts/pr-validate-report/github-url.mjs`, update `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` to resolve and pass `GH_TOKEN` to every `runGh` call, create `dot_config/private_fish/exact_functions/gh-as.fish`, and wire `gh-as.test.mjs` into `dot_pi/agent/package.json`.
- [ ] Run `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs dot_pi/agent/exact_scripts/pr-validate-report/workspace.test.mjs dot_pi/agent/exact_scripts/gh-as.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command above.
- [ ] Commit with `feat(pi,fish): route gh auth tokens per org without global switch`.

### Slice 4: Deterministic `lifecycle-git.mjs` and `disk-cleanup.mjs` CLIs and prompt integration

### Task 4: Add `lifecycle-git.mjs` and integrate with `plan.md`, `verify.md`, `learn.md`, `pr-address-feedback.md`, and `resolve-worktree`
**Delivers:** `dot_pi/agent/exact_scripts/lifecycle-git.mjs` (`verify-design-approval`, `resolve`, `discover-plan`, `snapshot`, `compare-snapshots`) and updated prompt/skill instructions within context byte budgets.
**Blocked by:** Task 3
**Traces to:** Requirement 4
**Files:** `dot_pi/agent/exact_scripts/lifecycle-git.mjs`, `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs`, `dot_pi/agent/exact_skills/resolve-worktree/SKILL.md`, `dot_pi/agent/exact_prompts/plan.md`, `dot_pi/agent/exact_prompts/verify.md`, `dot_pi/agent/exact_prompts/learn.md`, `dot_pi/agent/exact_prompts/pr-address-feedback.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`, `dot_pi/agent/package.json`

- [ ] Write failing tests in `dot_pi/agent/exact_scripts/lifecycle-git.test.mjs` covering `verify-design-approval` (valid status-only approval commit, merge commit rejection, multi-file commit rejection, dirty working tree rejection, already-Approved initial commit detection), `resolve` (`--path` and `--glob` across multiple worktrees with mtime and current-checkout sorting), `discover-plan` (branch-slug match, multiple-match ambiguity, fallback to worktree plans/designs, empty-repo `none` status), and `snapshot` / `compare-snapshots` (clean, staged, unstaged, untracked content mutation, candidate commits).
- [ ] Implement `dot_pi/agent/exact_scripts/lifecycle-git.mjs`, update `resolve-worktree/SKILL.md`, `plan.md`, `verify.md`, `learn.md`, and `pr-address-feedback.md` to invoke `lifecycle-git.mjs`, update `lifecycle-prompts.test.mjs` and `learn-prompts.test.mjs`, and wire `lifecycle-git.test.mjs` into `dot_pi/agent/package.json`.
- [ ] Run `node --test dot_pi/agent/exact_scripts/lifecycle-git.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs dot_pi/agent/exact_scripts/learn-prompts.test.mjs`; expect all tests (including prompt byte-budget checks) to pass.
- [ ] Refactor only after green, then rerun the test command above.
- [ ] Commit with `feat(pi): add lifecycle-git helper CLI for prompts and worktree resolution`.

### Task 5: Add `disk-cleanup.mjs` and shrink `disk-cleanup.md`
**Delivers:** Read-only `dot_pi/agent/exact_scripts/disk-cleanup.mjs` (`measure` and `scan-worktrees`) and updated `dot_pi/agent/exact_prompts/disk-cleanup.md`.
**Blocked by:** Task 3 and Task 4
**Traces to:** Requirement 5
**Files:** `dot_pi/agent/exact_scripts/disk-cleanup.mjs`, `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs`, `dot_pi/agent/exact_prompts/disk-cleanup.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, `dot_pi/agent/package.json`

- [ ] Write failing tests in `dot_pi/agent/exact_scripts/disk-cleanup.test.mjs` covering `measure` (root `df`, consumer `du` summaries, top `Library/Caches` entries, `docker system df` when running vs stopped, `bzl (test|build)` detection, crash dumps, and trash) and `scan-worktrees` (`merged_clean`, `merged_dirty`, `open_pr`, `no_pr`, `flagged` locked/foreign branch, `orphaned` directory detection, per-org `GH_TOKEN` routing, and per-branch PR fallback when bulk `gh pr list` truncates).
- [ ] Implement `dot_pi/agent/exact_scripts/disk-cleanup.mjs`, update `dot_pi/agent/exact_prompts/disk-cleanup.md` to run `disk-cleanup.mjs measure` in Step 1 and `disk-cleanup.mjs scan-worktrees` in Step 2 while keeping all `<HARD-GATE>` safety rules, add prompt contract assertions in `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`, and wire `disk-cleanup.test.mjs` into `dot_pi/agent/package.json`.
- [ ] Run `node --test dot_pi/agent/exact_scripts/disk-cleanup.test.mjs dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command above.
- [ ] Commit with `feat(pi): add deterministic disk-cleanup measurement and worktree scanner`.

### Task 6: Update `AGENTS.md` guidance and run final verification
**Delivers:** Updated future-agent guidance in `dot_pi/agent/AGENTS.md` and full-suite verification across all slices.
**Blocked by:** Tasks 1-5
**Traces to:** Requirements 1, 2, 3, 4, and 5
**Files:** `dot_pi/agent/AGENTS.md`, `dot_pi/agent/exact_scripts/learn-prompts.test.mjs`

- [ ] Update `dot_pi/agent/AGENTS.md` to document `gh-as` for non-mutating per-organization GitHub CLI calls and note automatic Rex session naming in `user-context`, while keeping the account routing and capture/restore rules checked by `learn-prompts.test.mjs`.
- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts && npm test && npm run test:all && rm -rf node_modules`; expect all unit, prompt, skill, collector, and smoke tests to pass and `git status --porcelain` to be clean.
- [ ] Run `git diff --check origin/main..HEAD`; expect no whitespace or conflict errors.
- [ ] Commit any documentation updates with `docs(pi): document gh-as and deterministic prompt helpers`.
