# Pi PR Status Line Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a conditional 3rd footer line in Pi below the model status line once the current Git branch has a GitHub pull request, displaying its state (`draft`, `open`, `merged`, `closed`), clickable number and title link, CI status, and unreplied review comment count.
**Smallest user-feedback slice:** Open Pi on a feature branch with a GitHub PR and see `[state] #N <title>` (clickable OSC 8 link) on the left and CI status + unreplied comment count on the right on line 3 below the model line; see only the existing 2 footer lines on `main` or when no PR exists.
**Out of Scope:** Rex OSC 7501 notifications (`state=blocked` / `state=error`), `stage-runner` / `ddci` CI automation, cross-worktree PR inbox, pane jumping, per-check links, job logs, inline diffs, or any GitHub write operation.
**Architecture:** A dedicated Pi extension (`dot_pi/agent/exact_extensions/pr-status/`) polls GitHub GraphQL for the current branch using per-subprocess `GH_TOKEN` routing from `_shared/github.ts` and publishes the formatted line via `ctx.ui.setStatus("pr-status", ...)`. `dot_pi/agent/exact_extensions/statusline.ts` reads `"pr-status"` from `footerData.getExtensionStatuses()` and renders it as a 3rd footer line below the model line only when non-empty.
**Tech Stack:** TypeScript (Pi extension API and `@earendil-works/pi-tui`), Node.js standard library and test runner (`node:test`), Git, GitHub GraphQL via `gh`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Planning workflow | Selected applicable skills and enforced provenance rules. |
| `chezmoi` | `skill-loader` | Managed dotfiles repo | Scoped all edits to chezmoi source paths and explicit apply targets. |
| `cli-best-practices` | `skill-loader` | Non-interactive `gh` subprocesses | Enforced `GH_PROMPT_DISABLED=1`, env-only `GH_TOKEN`, bounded timeouts, and explicit error states. |
| `write` | `skill-loader` | Plan prose | Kept requirements, mechanisms, and limits concrete and verifiable. |
| `feature-worktree` | `prompt-required` | Durable plan branch | Created `maruina/pi-pr-statusline` worktree from `origin/main` without modifying the base checkout. |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| PR query, classification & formatting | `dot_pi/agent/exact_extensions/pr-status/github.ts` | Resolve routed login via `_shared/github.ts`, fetch per-subprocess `GH_TOKEN` on `work` profile, run one GraphQL query (`viewer` + branch PRs across `OPEN`/`MERGED`/`CLOSED` + `statusCheckRollup` + `reviewThreads`), classify PR state/CI/unreplied comments, sanitize text, validate HTTPS URL, and format the 3rd-line left/right segments with OSC 8 link. | `node --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Polling lifecycle extension | `dot_pi/agent/exact_extensions/pr-status/index.ts` | Register Pi lifecycle hooks (`session_start`, `agent_end`, `session_shutdown`), skip headless/non-TUI/default-branch/non-GitHub sessions, run bounded 120s polling with single in-flight request, 10s subprocess timeout, exponential backoff on failure/rate-limit, and publish via `ctx.ui.setStatus("pr-status", ...)`. | `node --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Footer 3rd-line hook | `dot_pi/agent/exact_extensions/statusline.ts` | Extract `"pr-status"` from `footerData.getExtensionStatuses()`, exclude it from line 2 `otherStatuses`, and render it on line 3 below the model line only when present, preserving OSC 8 hyperlinks and truncating cleanly with `truncateToWidth`. | `node --test dot_pi/agent/exact_extensions/statusline.test.mjs` |
| Repo test & typecheck suites | `dot_pi/agent/package.json` (unchanged; auto-discovers tests via `exact_scripts/test-runner.mjs`) | Typecheck TypeScript extensions, run all fast/integration tests, and verify Pi extension loading with `test:smoke`. | `npm test`, `npm run typecheck`, `npm run test:all` in `dot_pi/agent/` |

### Key Decisions
- **Conditional 3rd footer line via `ctx.ui.setStatus("pr-status", ...)` below the model line:** Putting PR info into line 2's `otherStatuses` would take no extra vertical space, but line 2 already carries model name, thinking level, token counts, cost, guardrails, and sandbox, which would aggressively truncate the PR title. A 3rd line rendered only when a PR exists adds zero height on `main` or before a PR is opened, keeps `pr-status` decoupled from `statusline.ts`, and reuses Pi's built-in footer re-render trigger.
- **Query all PR states (`OPEN`, `MERGED`, `CLOSED`) and prefer `OPEN`:** Filtering only `states: [OPEN]` would drop the line immediately on merge. Querying `pullRequests(headRefName: $headRef, first: 5, orderBy: { field: UPDATED_AT, direction: DESC })` and selecting the first head-repo-matched `OPEN` PR (or else the most recently updated `MERGED`/`CLOSED` PR) lets the footer show `[draft]`, `[open]`, `[merged]`, or `[closed]` right beside the link.
- **Single GraphQL query including `viewer { login }`:** A separate `gh api user` call would double subprocess overhead on every poll. Including `viewer { login }` in the same GraphQL query verifies the routed login on `work` profile and identifies the user's own comments for unreplied-thread counting at zero extra request cost.
- **Reuse `_shared/github.ts` unchanged:** `parseGitHubOwnerRepo`, `selectGitHubLogin`, and `scrubbedGhEnv` already implement remote parsing, `ddoghq`/`ddoghq-sandbox` routing, and ambient-token scrubbing for `user-context.ts` and `stage-runner/_publish.ts`. Reusing them avoids duplicating auth logic and keeps all existing consumers untouched.
- **Unreplied comments definition:** Count `reviewThreads` where `!isResolved && !isOutdated` and the last comment's `author.login` differs from `viewer.login` (case-insensitive). If `reviewThreads.pageInfo.hasNextPage` is true, append `+` (e.g. `💬 3+`) rather than silently underreporting.

### Implementation Constraints
- **Layout:** Multi-file extensions under `dot_pi/agent/exact_extensions/<name>/index.ts` (per repo `AGENTS.md`). Keep `dot_pi/agent/exact_extensions/_shared/github.ts` unchanged.
- **Performance & bounds:** One GraphQL request in flight per Pi session; 10-second timeout per `git`/`gh` subprocess; 120-second poll interval on non-default branches; exponential backoff (capped at 10 minutes) on errors or rate limits; skip polling entirely in non-TUI/headless sessions, non-GitHub repos, and on default branches (`origin/HEAD`, `main`, `master`).
- **DX & safety:** Strip terminal control sequences (`\x00-\x1f`, `\x7f-\x9f`, ANSI CSI/OSC) from PR titles before rendering. Emit OSC 8 links only for URLs parsed as `https://github.com/<owner>/<repo>/pull/<number>`. Clean up timers and abort any in-flight subprocess on `session_shutdown`.

### Security and Observability Requirements
- Use explicit `argv` with `execFile` (no shell interpolation). Always set `GH_PROMPT_DISABLED=1` and `GH_HOST=github.com` via `scrubbedGhEnv`.
- On `work` profile, fetch the routed login's token via `gh auth token --hostname github.com --user <login>` with `GH_TOKEN` and `GITHUB_TOKEN` unset, pass it only via `GH_TOKEN` env var to that `gh api graphql` subprocess, never place a token in argv/status/logs/files, and discard it immediately after the subprocess finishes. Never run `gh auth switch`.
- On transient refresh failure after a successful read, retain the last known PR line with a stale indicator (`stale`) rather than hiding the PR or printing raw stderr/tokens.

### Failure Modes to Handle
- **No `gh` token or mismatched `viewer.login`:** Clear any prior PR state only if no prior PR was established; otherwise mark stale. Never fall back to another GitHub account or switch `gh` auth.
- **Branch switch or PR closed/merged:** Re-evaluate branch on `agent_end` and each poll tick; if the user switches to `main`/default branch, immediately clear `"pr-status"` (`undefined`). If the PR transitions to `MERGED` or `CLOSED`, update the badge to `[merged]` or `[closed]`.
- **CI rollup edge cases:** Distinguish confirmed passing (`✓ CI`), failure/timed-out/action-required (`✗ CI`), pending/in-progress (`◔ CI`), empty successful rollup (`— CI`), skipped/canceled/neutral without failures (`⊘ CI`), and incomplete/error (`? CI`).
- **Truncated review threads:** If `reviewThreads.pageInfo.hasNextPage` is true, render `💬 N+` so truncation is visible.
- **Headless / non-TUI sessions:** Register no timers or subprocesses when `ctx.hasUI === false` or `ctx.mode !== "tui"`.

### Rollout and Rollback
- **Owner:** Matteo.
- **Rollout:** Preview explicit targets with `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/pr-status/index.ts ~/.pi/agent/extensions/pr-status/github.ts`, apply them with `chezmoi --source "$PWD" apply`, then `/reload` in an active Pi session on a feature branch with an open PR to verify rendering and OSC 8 link click behavior.
- **Rollback:** Revert `statusline.ts` and remove `dot_pi/agent/exact_extensions/pr-status/`, apply with `chezmoi apply`, and `/reload`. No persistent state, checkpoints, or GitHub state are modified.

### Test Strategy
- **Highest deterministic interface:** Unit tests calling the exported query/parser/formatter (`pr-status/github.ts`), extension lifecycle with injected command runner and fake timers (`pr-status/index.ts`), and `statusline.ts` footer renderer (`statusline.test.mjs`).
- **Boundaries mocked:** `git` and `gh` subprocess execution (injected runner) and timers; real `@earendil-works/pi-tui` `truncateToWidth`/`visibleWidth` are used unmocked to verify OSC 8 width and truncation behavior.
- **Narrow failing command:** `node --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` and `node --test dot_pi/agent/exact_extensions/statusline.test.mjs`.
- **Validation limits:** Automated tests do not prove live GitHub GraphQL responses or Rex terminal click handling for OSC 8 links; those are verified manually after `chezmoi apply` in Task 4 (post-apply smoke check).

## Requirements

### Requirement: R1 — Query, route, and format PR status safely
The PR status module SHALL query GitHub GraphQL for the current repository and branch without switching the active `gh` login, classify PR state (`draft`, `open`, `merged`, `closed`), CI status, and unreplied review comments, and format a sanitized line with a validated OSC 8 PR link.

#### Scenario: Dual-account routing and PR state formatting
- GIVEN a GitHub remote `ddoghq/compute` on `work` profile and branch `maruina/fix-foo` with an open PR `#42` (or draft, merged, or closed PR), failing checks, and 2 unresolved non-outdated review threads whose last comment author is not `viewer.login`,
- WHEN the PR status query runs,
- THEN it calls `gh auth token --hostname github.com --user matteo-ruina_ddog` with `GH_TOKEN`/`GITHUB_TOKEN` unset, passes the token only via `GH_TOKEN` env to `gh api graphql`, never calls `gh auth switch`, matches `headRepository.nameWithOwner`, and formats `[open] #42 <title>` (with validated OSC 8 hyperlink), `✗ CI`, and `💬 2`.

#### Scenario: CI and thread edge cases
- GIVEN responses with passing, failing, pending, empty, skipped/canceled, or incomplete checks, and threads that are resolved, outdated, replied-to by `viewer.login`, unreplied, or truncated (`hasNextPage: true`),
- WHEN classified,
- THEN only confirmed passing shows `✓ CI`, empty rollup shows `— CI`, skipped/canceled shows `⊘ CI`, incomplete shows `? CI`, resolved/outdated/self-replied threads are excluded from the unreplied count, and truncated threads show `💬 N+`.

#### Scenario: Negative — No matching PR, wrong head repo, unsafe URL, or missing/mismatched token
- GIVEN no PR matches the branch and head repository, OR the PR URL is not a valid `https://github.com/.../pull/...` URL, OR the control characters appear in the title, OR `gh auth token` fails / `viewer.login` disagrees with the routed login,
- WHEN processed,
- THEN no unmatched fork PR is shown, control sequences are stripped, no unsafe OSC 8 link is emitted, and a missing/mismatched token produces no fallback to another account and leaks no token into output or errors.

### Requirement: R2 — Render PR status on line 3 below the model line
`statusline.ts` SHALL render `"pr-status"` as a 3rd footer line below the model/usage line when non-empty, and SHALL omit line 3 when `"pr-status"` is absent.

#### Scenario: 3rd line present vs absent
- GIVEN `footerData.getExtensionStatuses()` contains `"pr-status"` with a formatted PR line including an OSC 8 hyperlink,
- WHEN `footer.render(width)` runs,
- THEN it returns 3 lines with the PR status on line 3 (below the model line), excludes `"pr-status"` from line 2, and truncates line 3 cleanly to `width` without corrupting OSC 8 escapes.
- GIVEN `"pr-status"` is absent or empty,
- WHEN `footer.render(width)` runs,
- THEN it returns the exact existing 2 lines.

### Requirement: R3 — Bounded session polling and clean shutdown
The `pr-status` extension SHALL refresh on session start, agent end, and a 120-second interval on non-default GitHub branches, back off on errors, preserve stale state on transient failures, and stop all work on shutdown.

#### Scenario: Feature branch lifecycle and stale preservation
- GIVEN a TUI session on a non-default GitHub branch,
- WHEN `session_start` and `agent_end` fire,
- THEN the extension refreshes with at most one in-flight request, updates `ctx.ui.setStatus("pr-status", ...)`, retains the last known line marked `stale` if a subsequent poll fails while applying exponential backoff, clears `"pr-status"` if the branch changes to the default branch, and cancels timers and in-flight work on `session_shutdown`.

#### Scenario: Negative — Headless session, default branch, or non-GitHub repo
- GIVEN `ctx.hasUI === false` (or non-TUI mode), OR the checkout is on `main`/`origin/HEAD`, OR `origin` is not a GitHub remote,
- WHEN `session_start` runs,
- THEN no `gh` subprocess or polling timer starts and `"pr-status"` remains unset.

## Tasks

### Task 1: Implement PR GraphQL query, classification, and formatting
**Delivers:** Pure `pr-status/github.ts` module that resolves routed `GH_TOKEN`, queries branch PRs across all states, classifies CI and unreplied comments, and formats a sanitized OSC 8 status line.
**Blocked by:** None
**Traces to:** R1
**Files:** `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Write failing unit tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` covering R1 scenarios: dual-account `GH_TOKEN` routing (`work` vs `personal` profile, no `gh auth switch`, env-only token), PR state selection (`draft`, `open`, `merged`, `closed` preferring `open` and matching `headRepository`), all CI states, unreplied vs replied/resolved/outdated/truncated threads, control-character stripping, and OSC 8 URL validation.
- [ ] Implement `dot_pi/agent/exact_extensions/pr-status/github.ts` reusing `parseGitHubOwnerRepo`, `selectGitHubLogin`, and `scrubbedGhEnv` from `../_shared/github.ts`.
- [ ] Run `node --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all R1 tests to pass.
- [ ] Refactor only after green, rerun verification, and commit with `feat(pi): add PR status GraphQL query and formatter`.

### Task 2: Render conditional 3rd footer line in `statusline.ts`
**Delivers:** `statusline.ts` displays `"pr-status"` on line 3 below the model line when present and keeps the 2-line footer unchanged when absent.
**Blocked by:** None
**Traces to:** R2
**Files:** `dot_pi/agent/exact_extensions/statusline.ts`, `dot_pi/agent/exact_extensions/statusline.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/statusline.test.mjs` covering R2: 3rd line below model line when `"pr-status"` is set, `"pr-status"` excluded from line 2, OSC 8 link truncation at narrow width, and unchanged 2-line output when `"pr-status"` is absent.
- [ ] Update `dot_pi/agent/exact_extensions/statusline.ts` to extract `"pr-status"` from `footerData.getExtensionStatuses()` and append a truncated 3rd line when non-empty.
- [ ] Run `node --test dot_pi/agent/exact_extensions/statusline.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, rerun verification, and commit with `feat(pi): render PR status on conditional third footer line`.

### Task 3: Wire bounded polling extension in `pr-status/index.ts`
**Delivers:** Auto-discovered Pi extension that polls the active feature branch on `session_start`, `agent_end`, and a 120-second timer with backoff, stale retention, and shutdown cleanup.
**Blocked by:** Task 1 and Task 2
**Traces to:** R3
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing lifecycle tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` covering R3: headless/non-TUI skip, default-branch skip, non-GitHub skip, single in-flight guard, `agent_end` refresh, branch-switch clearing, transient-failure stale retention + backoff, and `session_shutdown` timer/abort cleanup.
- [ ] Implement `dot_pi/agent/exact_extensions/pr-status/index.ts` exporting the default extension factory with injectable runner/timer seams for deterministic tests.
- [ ] Run `node --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all R1 and R3 tests to pass.
- [ ] Refactor only after green, rerun verification, and commit with `feat(pi): poll active branch PR status in footer extension`.

### Task 4: Final verification and documentation check
**Delivers:** Verified typecheck, full Pi test suite, smoke test, and documentation check.
**Blocked by:** Tasks 1-3
**Traces to:** R1, R2, R3, repo `AGENTS.md` testing and documentation requirements
**Files:** `dot_pi/agent/exact_extensions/pr-status/` (review whether `README.md` or `AGENTS.md` updates are needed)

- [ ] From `dot_pi/agent/`, run `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`, and `npm run test:all`; expect all suites and `test:smoke` to pass with zero extension load issues. Remove disposable `dot_pi/agent/node_modules` afterward.
- [ ] Review `AGENTS.md` and `dot_pi/agent/exact_extensions/pr-status/`; record why no `AGENTS.md` or standalone README update is needed (or add a concise README only if non-obvious operator configuration exists).
- [ ] Commit any documentation update with `docs(pi): document PR status line extension` if changes were needed.

## Post-publication validation
- **Live footer and OSC 8 link check:** After applying explicit chezmoi targets (`chezmoi --source "$PWD" apply ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/pr-status/`), Matteo runs `/reload` in a Pi session on a feature branch with an open PR (and on `main`). **Owner:** Matteo. **Trigger:** After `chezmoi apply`. **Expected evidence:** Line 3 appears below the model line with `[state] #N <title>`, clicking opens the PR in the browser, CI status and unreplied count match GitHub, and line 3 disappears on `main`. **Gates:** Merging to `main`.
