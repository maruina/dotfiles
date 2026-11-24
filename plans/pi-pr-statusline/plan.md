# Pi PR Status Line Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a conditional 3rd footer line in Pi below the model status line once the current Git branch has a GitHub pull request, displaying its state (`draft`, `open`, `merged`, `closed`), clickable number and title link, CI status, and unreplied review comment count.
**Smallest user-feedback slice:** Slice 1. Open Pi on a feature branch with a GitHub PR and see `[state] #N <title>` (clickable OSC 8 link) on line 3 below the model line; see only the existing 2 footer lines on `main` or when no PR exists. Slice 2 adds CI status and the unreplied comment count on the right side of line 3.
**Out of Scope:** Rex OSC 7501 notifications (`state=blocked` / `state=error`), `stage-runner` / `ddci` CI automation, cross-worktree PR inbox, pane jumping, per-check links, job logs, inline diffs, top-level PR conversation comments and review summary bodies in the unreplied count, or any GitHub write operation.
**Architecture:** A dedicated Pi extension (`dot_pi/agent/exact_extensions/pr-status/`) polls GitHub GraphQL for the current branch. It gets a per-subprocess `GH_TOKEN` from a routed-env helper that moves from `user-context.ts` into `_shared/github.ts`, so both extensions share one token-routing path. The extension publishes one status string through `ctx.ui.setStatus("pr-status", ...)`; the string is `<left>\t<right>`, where `<left>` is the state and the linked title and `<right>` is the CI and comment summary. `dot_pi/agent/exact_extensions/statusline.ts` reads `"pr-status"` from `footerData.getExtensionStatuses()`, splits it on the first `\t`, and renders it with `renderLine(left, right, width)` as a 3rd footer line below the model line only when the value is non-empty.
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

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Execution workflow | Selected execution skills and recorded their use. |
| `resolve-worktree` | `prompt-required` | Absolute plan path | Resolved the plan to `maruina/pi-pr-statusline`. |
| `feature-worktree` | `prompt-required` | Local slice commits | Confirmed the feature worktree and left the base checkout on `main`. |
| `codebase-research` | `skill-loader` | Shared auth and Pi extension lifecycle | Traced token routing, the footer, and the Pi API before implementation. |
| `chezmoi` | `skill-loader` | Managed Pi extensions | Kept edits in source and left rendered targets unchanged. |
| `cli-best-practices` | `prompt-required` | Plan-named skill for `gh` subprocesses | Preserved non-interactive auth and passed the token through the subprocess environment. |
| `write` | `skill-loader` | Plan ledger and commit messages | Recorded check results and kept the plan requirements unchanged. |
| `learning-candidates` | `prompt-required` | Test environment assumption | Recorded how the stage-runner child environment affected existing tests. |

Slice 1 writer: `openai/gpt-6.2-sol`.

| Slice 2 skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Execution workflow | Selected skills for the query and ledger changes. |
| `resolve-worktree` | `prompt-required` | Absolute plan path | Resolved the plan to the pinned candidate's worktree. |
| `feature-worktree` | `prompt-required` | Local slice commits | Confirmed the feature branch and left the base checkout on `main`. |
| `codebase-research` | `skill-loader` | GraphQL query and footer | Traced the query result through `setStatus` to the footer and checked the GitHub schema. |
| `chezmoi` | `skill-loader` | Managed Pi extension | Kept changes in source and did not apply them. |
| `cli-best-practices` | `prompt-required` | Plan-named skill for `gh` subprocesses | Preserved one non-interactive query and kept credentials in the subprocess environment. |
| `write` | `skill-loader` | Plan ledger and commit messages | Recorded test evidence without changing requirements. |

Slice 2 writer: `openai/gpt-6.2-sol`.

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Shared routed GitHub env | `dot_pi/agent/exact_extensions/_shared/github.ts`, `dot_pi/agent/exact_extensions/user-context.ts` | Export `routedGhEnv(owner, profile, run, { cwd, timeoutMs = 3000, baseEnv = process.env })`, moved from `user-context.ts` `getGitHubEnv`; `user-context.ts` keeps its 3000 ms token timeout and `pr-status` passes 10000 ms. On `work` profile it runs `gh auth token --hostname github.com --user <selectGitHubLogin(owner)>` with a scrubbed env through the injected runner and returns `scrubbedGhEnv(cleanEnv, token)`; on `personal` profile it returns `undefined`. `user-context.ts` keeps its remote parsing and calls the shared helper. `stage-runner/_publish.ts` imports only existing exports and needs no change. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/_shared/github.test.mjs dot_pi/agent/exact_extensions/user-context.test.mjs` |
| PR query, classification & formatting | `dot_pi/agent/exact_extensions/pr-status/github.ts` | Take an injected runner with the `AsyncRunner` signature used by `user-context.ts`, get the routed env from `routedGhEnv`, run one GraphQL query (`viewer` + branch PRs across `OPEN`/`MERGED`/`CLOSED`; Slice 2 adds `statusCheckRollup` + `reviewThreads`), classify PR state, CI, and unreplied comments, sanitize text, validate the HTTPS URL, and format the `<left>\t<right>` status string with an OSC 8 link. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Polling lifecycle extension | `dot_pi/agent/exact_extensions/pr-status/index.ts` | Register Pi lifecycle hooks (`session_start`, `agent_end`, `session_shutdown`), skip headless/non-TUI/default-branch/non-GitHub sessions, run bounded 120s polling with a single in-flight request, a 10s subprocess timeout, and exponential backoff on failure or rate limit, and publish through `ctx.ui.setStatus("pr-status", ...)`. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Footer 3rd-line hook | `dot_pi/agent/exact_extensions/statusline.ts` | Extract `"pr-status"` from `footerData.getExtensionStatuses()`, exclude it from line 2 `otherStatuses`, split it on the first `\t`, and render it on line 3 with `renderLine(left, right, width)` only when present. The extension owns its own colors; `statusline.ts` does not apply a theme to line 3. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs` |
| Repo test & typecheck suites | `dot_pi/agent/package.json` (unchanged; auto-discovers tests via `exact_scripts/test-runner.mjs`) | Typecheck TypeScript extensions, run all fast/integration tests, and verify Pi extension loading with `test:smoke`. | `npm test`, `npm run typecheck`, `npm run test:all` in `dot_pi/agent/` |

### Key Decisions
- **Conditional 3rd footer line via `ctx.ui.setStatus("pr-status", ...)` below the model line:** Putting PR info into line 2's `otherStatuses` would take no extra vertical space, but line 2 already carries model name, thinking level, token counts, cost, guardrails, and sandbox, which would aggressively truncate the PR title. A 3rd line rendered only when a PR exists adds zero height on `main` or before a PR is opened, keeps `pr-status` decoupled from `statusline.ts`, and reuses Pi's footer re-render: `setStatus` calls `ui.requestRender()`.
- **`<left>\t<right>` status string contract:** `setStatus` carries one string, but `renderLine` needs separate left and right segments so it can truncate the title first and keep CI and comments visible. `pr-status` joins the segments with one `\t`; `statusline.ts` splits on the first `\t` and treats a missing `\t` or an empty right segment as left-only. A tab is safe as a separator because `sanitizeTitle` removes tabs from PR titles, and Pi's built-in footer (`sanitizeStatusText`) shows a tab as a space when `statusline.ts` is not loaded.
- **Query all PR states (`OPEN`, `MERGED`, `CLOSED`) and prefer `OPEN`:** Filtering only `states: [OPEN]` would drop the line immediately on merge. Querying `pullRequests(headRefName: $headRef, states: [OPEN, MERGED, CLOSED], first: 5, orderBy: { field: UPDATED_AT, direction: DESC })` and selecting the first `OPEN` PR whose `headRepository.nameWithOwner` matches the local repository (or else the most recently updated matching `MERGED`/`CLOSED` PR) lets the footer show `[draft]`, `[open]`, `[merged]`, or `[closed]` next to the link.
- **Single GraphQL query including `viewer { login }`:** A separate `gh api user` call would double subprocess overhead on every poll. Including `viewer { login }` in the same GraphQL query verifies the routed login on `work` profile and identifies the user's own comments for unreplied-thread counting at zero extra request cost.
- **Move `getGitHubEnv` into `_shared/github.ts` as `routedGhEnv`:** Keeping `_shared/github.ts` unchanged would leave the token-routing code in `user-context.ts` and force `pr-status` to copy it, so the two copies could drift in timeouts or profile rules. Moving it adds one consumer change (`user-context.ts`) and keeps `parseGitHubOwnerRepo`, `selectGitHubLogin`, and `scrubbedGhEnv` unchanged for `stage-runner/_publish.ts`.
- **CI classification (Slice 2):** Query `statusCheckRollup { contexts(first: 100) { pageInfo { hasNextPage } nodes { __typename ... on CheckRun { status conclusion } ... on StatusContext { state } } } }`. Apply the first matching rule:

  | Order | Input | Output |
  |---|---|---|
  | 1 | `statusCheckRollup` is `null`, or `contexts.nodes` is empty and `hasNextPage` is false | `— CI` |
  | 2 | Any `CheckRun.conclusion` in `FAILURE`, `TIMED_OUT`, `ACTION_REQUIRED`, `STARTUP_FAILURE`, or any `StatusContext.state` in `FAILURE`, `ERROR` | `✗ CI` |
  | 3 | `contexts.pageInfo.hasNextPage` is true, or any node has an unrecognized `__typename`, `status`, `conclusion`, or `state` value | `? CI` |
  | 4 | Any `CheckRun.status` other than `COMPLETED`, or any `StatusContext.state` in `PENDING`, `EXPECTED` | `◔ CI` |
  | 5 | Every node is `SUCCESS`, `SKIPPED`, or `NEUTRAL`, and at least one is `SUCCESS` | `✓ CI` |
  | 6 | Every other completed non-failing set (`CANCELLED`, `STALE`, or no `SUCCESS`) | `⊘ CI` |

  Assumption: `SKIPPED` and `NEUTRAL` checks next to at least one `SUCCESS` count as passing, because most PRs have skipped jobs and would otherwise never show `✓ CI`.
- **Unreplied comments definition (Slice 2):** Query `reviewThreads(first: 100) { pageInfo { hasNextPage } nodes { isResolved isOutdated comments(last: 1) { nodes { author { login } } } } }`. Count threads where `!isResolved && !isOutdated` and the last comment's `author.login` differs from `viewer.login` (case-insensitive); a `null` author counts as not the viewer. If `reviewThreads.pageInfo.hasNextPage` is true, append `+` (e.g. `💬 3+`) rather than silently underreporting.

### Implementation Constraints
- **Layout:** Multi-file extensions under `dot_pi/agent/exact_extensions/<name>/index.ts` (per repo `AGENTS.md`). The only change to `dot_pi/agent/exact_extensions/_shared/github.ts` is the new `routedGhEnv` export.
- **Performance & bounds:** One GraphQL request in flight per Pi session; 10-second timeout per `git`/`gh` subprocess; 120-second poll interval on non-default branches; exponential backoff (capped at 10 minutes) on errors or rate limits. While a backoff is active, `agent_end` does not start a refresh; only the backoff timer does. Skip polling entirely in non-TUI/headless sessions, non-GitHub repos, and on default branches (`origin/HEAD`, `main`, `master`). GraphQL connections are bounded by `first: 5` (PRs), `contexts(first: 100)`, `reviewThreads(first: 100)`, and `comments(last: 1)`.
- **DX & safety:** Strip terminal control sequences (ANSI CSI/OSC sequences first, then `\x00-\x1f` and `\x7f-\x9f`, which include `\t`) from PR titles before rendering. Emit OSC 8 links only for URLs parsed as `https://github.com/<owner>/<repo>/pull/<number>`. Clean up timers and abort any in-flight subprocess on `session_shutdown`.

### Security and Observability Requirements
- Use explicit `argv` with `execFile` (no shell interpolation); `pi.exec` has no `env` option, so it cannot carry a per-subprocess `GH_TOKEN`. Always set `GH_PROMPT_DISABLED=1` and `GH_HOST=github.com` via `scrubbedGhEnv`.
- On `work` profile, `routedGhEnv` fetches the routed login's token via `gh auth token --hostname github.com --user <login>` with `GH_TOKEN` and `GITHUB_TOKEN` unset. `pr-status` passes the token only through the `GH_TOKEN` env var of that `gh api graphql` subprocess, never places a token in argv/status/logs/files, and discards it after the subprocess finishes. Never run `gh auth switch`.
- On transient refresh failure after a successful read for the same repository and branch, retain the last known PR line with a stale indicator (`stale`) rather than hiding the PR or printing raw stderr/tokens.

### Failure Modes to Handle
- **No `gh` token or mismatched `viewer.login`:** If no PR line exists for the current repository and branch, leave `"pr-status"` unset; otherwise mark the existing line `stale`. Never fall back to another GitHub account or switch `gh` auth.
- **Branch switch or PR closed/merged:** Key the last known line by `owner/repo` and branch. Re-evaluate the branch on `agent_end` and each poll tick; when the branch differs from the key of the shown line, clear `"pr-status"` (`undefined`) before the next query, so a failed refresh never shows another branch's PR as stale. On the default branch, keep it cleared and stop polling. If the PR transitions to `MERGED` or `CLOSED`, update the badge to `[merged]` or `[closed]`.
- **Branch change latency:** `pr-status` has no access to `footerData.onBranchChange`, so a branch switch outside an agent run is detected at the next poll tick, up to 120 seconds later.
- **CI rollup edge cases:** Classify with the ordered table in Key Decisions.
- **Truncated review threads:** If `reviewThreads.pageInfo.hasNextPage` is true, render `💬 N+` so truncation is visible.
- **Headless / non-TUI sessions:** Register no timers or subprocesses when `ctx.hasUI === false` or `ctx.mode !== "tui"`.

### Rollout and Rollback
- **Owner:** Matteo.
- **Rollout:** Preview explicit targets with `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/user-context.ts ~/.pi/agent/extensions/_shared/github.ts ~/.pi/agent/extensions/pr-status/index.ts ~/.pi/agent/extensions/pr-status/github.ts`, apply the same explicit targets with `chezmoi --source "$PWD" apply ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/user-context.ts ~/.pi/agent/extensions/_shared/github.ts ~/.pi/agent/extensions/pr-status/`, then `/reload` in an active Pi session on a feature branch with an open PR to verify rendering and OSC 8 link click behavior.
- **Rollback:** Revert `statusline.ts`, `user-context.ts`, and `_shared/github.ts`, remove `dot_pi/agent/exact_extensions/pr-status/`, apply the same explicit targets with `chezmoi apply`, and `/reload`. No persistent state, checkpoints, or GitHub state are modified.

### Test Strategy
- **Highest deterministic interface:** Unit tests calling `routedGhEnv` (`_shared/github.test.mjs`), the exported query/parser/formatter (`pr-status/github.ts`), extension lifecycle with injected command runner and fake timers (`pr-status/index.ts`), and `statusline.ts` footer renderer (`statusline.test.mjs`).
- **Boundaries mocked:** `git` and `gh` subprocess execution (injected runner) and timers; real `@earendil-works/pi-tui` `truncateToWidth`/`visibleWidth` are used unmocked to verify OSC 8 width and truncation behavior.
- **Narrow failing command:** `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` and `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs`.
- **Validation limits:** Automated tests do not prove live GitHub GraphQL responses or Rex terminal click handling for OSC 8 links; those are verified manually in `## Post-publication validation`.

## Requirements

### Requirement: R1 — Query, route, and format PR state safely
The PR status module SHALL query GitHub GraphQL for the current repository and branch without switching the active `gh` login, select the PR state (`draft`, `open`, `merged`, `closed`), and format a sanitized left segment with a validated OSC 8 PR link.

#### Scenario: Dual-account routing and PR state formatting
- GIVEN a GitHub remote `ddoghq/compute` on `work` profile and branch `maruina/fix-foo` with an open PR `#42` (or draft, merged, or closed PR),
- WHEN the PR status query runs,
- THEN `routedGhEnv` calls `gh auth token --hostname github.com --user matteo-ruina_ddog` with `GH_TOKEN`/`GITHUB_TOKEN` unset, the token reaches `gh api graphql` only through the `GH_TOKEN` env, `gh auth switch` is never called, `headRepository.nameWithOwner` matches, and the left segment is `[open] #42 <title>` with a validated OSC 8 hyperlink.

#### Scenario: Negative — No matching PR, wrong head repo, unsafe URL, or missing/mismatched token
- GIVEN no PR matches the branch and head repository, OR the PR URL is not a valid `https://github.com/.../pull/...` URL, OR control characters (including `\t`) appear in the title, OR `gh auth token` fails / `viewer.login` disagrees with the routed login,
- WHEN processed,
- THEN no unmatched fork PR is shown, control sequences are stripped, no unsafe OSC 8 link is emitted, and a missing/mismatched token produces no fallback to another account and leaks no token into output or errors.

### Requirement: R2 — Render PR status on line 3 below the model line
`statusline.ts` SHALL render `"pr-status"` as a 3rd footer line below the model/usage line when non-empty, splitting it on the first `\t` into left and right segments, and SHALL omit line 3 when `"pr-status"` is absent.

#### Scenario: 3rd line present vs absent
- GIVEN `footerData.getExtensionStatuses()` contains `"pr-status"` as `<left>\t<right>` with an OSC 8 hyperlink in `<left>`,
- WHEN `footer.render(width)` runs,
- THEN it returns 3 lines with the PR status on line 3 (below the model line), excludes `"pr-status"` from line 2, keeps `<right>` right-aligned, and truncates `<left>` cleanly to `width` without corrupting OSC 8 escapes.
- GIVEN `"pr-status"` has no `\t`,
- WHEN `footer.render(width)` runs,
- THEN line 3 renders the whole value as the left segment.
- GIVEN `"pr-status"` is absent or empty,
- WHEN `footer.render(width)` runs,
- THEN it returns the exact existing 2 lines.

### Requirement: R3 — Bounded session polling and clean shutdown
The `pr-status` extension SHALL refresh on session start, agent end, and a 120-second interval on non-default GitHub branches, back off on errors, preserve stale state only for the same repository and branch, and stop all work on shutdown.

#### Scenario: Feature branch lifecycle and stale preservation
- GIVEN a TUI session on a non-default GitHub branch,
- WHEN `session_start` and `agent_end` fire,
- THEN the extension refreshes with at most one in-flight request, updates `ctx.ui.setStatus("pr-status", ...)`, retains the last known line marked `stale` if a subsequent poll fails while applying exponential backoff, skips `agent_end` refreshes while the backoff is active, and cancels timers and in-flight work on `session_shutdown`.

#### Scenario: Negative — Branch switch with a failing refresh
- GIVEN a PR line is shown for branch `feature-a`,
- WHEN the branch changes to `feature-b` (or to the default branch) and the next query fails,
- THEN `"pr-status"` is cleared and no `stale` line for `feature-a` is shown.

#### Scenario: Negative — Headless session, default branch, or non-GitHub repo
- GIVEN `ctx.hasUI === false` (or non-TUI mode), OR the checkout is on `main`/`origin/HEAD`, OR `origin` is not a GitHub remote,
- WHEN `session_start` runs,
- THEN no `gh` subprocess or polling timer starts and `"pr-status"` remains unset.

### Requirement: R4 — CI status and unreplied review comments
The PR status module SHALL classify CI with the ordered table in Key Decisions and count unreplied review threads, and SHALL put both in the right segment of the status string.

#### Scenario: CI and thread classification
- GIVEN PR `#42` with failing checks and 2 unresolved non-outdated review threads whose last comment author is not `viewer.login`,
- WHEN the PR status query runs,
- THEN the status string is `<left>\t✗ CI  💬 2`.

#### Scenario: Negative — CI and thread edge cases
- GIVEN responses with a `null` rollup, an empty context list, failing, truncated (`hasNextPage: true`), unrecognized, pending, all-passing with skipped, and cancelled-only checks, and threads that are resolved, outdated, replied-to by `viewer.login`, authored by a `null` author, or truncated (`hasNextPage: true`),
- WHEN classified,
- THEN each check set maps to the table row in Key Decisions (`— CI`, `✗ CI`, `? CI`, `◔ CI`, `✓ CI`, `⊘ CI`), resolved/outdated/self-replied threads are excluded from the unreplied count, a `null` author counts as unreplied, and truncated threads show `💬 N+`.

## Tasks

### Slice 1: PR state and link on line 3
Delivers the smallest user-feedback slice: `[state] #N <title>` with a clickable link on line 3 on a feature branch with a PR, and only 2 footer lines otherwise.

### Task 1: Move routed GitHub env into `_shared/github.ts`
**Delivers:** `routedGhEnv` in `_shared/github.ts`, used by `user-context.ts`, with unchanged `user-context` behavior.
**Blocked by:** None
**Traces to:** R1
**Files:** `dot_pi/agent/exact_extensions/_shared/github.ts`, `dot_pi/agent/exact_extensions/_shared/github.test.mjs`, `dot_pi/agent/exact_extensions/user-context.ts`

- [x] Write failing tests in `dot_pi/agent/exact_extensions/_shared/github.test.mjs` for `routedGhEnv` with an injected runner: `work` profile calls `gh auth token --hostname github.com --user <routed login>` with `GH_TOKEN`/`GITHUB_TOKEN` unset and returns an env with only `GH_TOKEN` set to the token; `personal` profile returns `undefined` without a subprocess; a failed token fetch returns `undefined`.
- [x] Add `routedGhEnv` to `dot_pi/agent/exact_extensions/_shared/github.ts` and replace the body of `getGitHubEnv` in `dot_pi/agent/exact_extensions/user-context.ts` with a call to it after the existing remote parse.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/_shared/github.test.mjs dot_pi/agent/exact_extensions/user-context.test.mjs`; expect all tests to pass with no `user-context.test.mjs` change.
- [x] Refactor only after green, rerun verification, and commit with `refactor(pi): share routed GitHub env helper`.

The focused test first failed because `routedGhEnv` was missing. After implementation, two existing Rex hook tests failed because they inherited `PI_STAGE_RUNNER_CHILD=1`. The same command prefixed with `env -u PI_STAGE_RUNNER_CHILD` passed all 22 tests; the explicit child-mode fixture still sets the variable. `npm run typecheck` passed.

### Task 2: Implement PR GraphQL query, state selection, and left segment
**Delivers:** `pr-status/github.ts` with an injected runner that resolves the routed env, queries branch PRs across all states, and formats a sanitized left segment with an OSC 8 link.
**Blocked by:** Task 1
**Traces to:** R1
**Files:** `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [x] Write failing unit tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` covering R1 with an injected runner: dual-account `GH_TOKEN` routing (`work` vs `personal` profile, no `gh auth switch`, env-only token), `viewer.login` mismatch, PR state selection (`draft`, `open`, `merged`, `closed`, preferring `open` and matching `headRepository`), control-character and `\t` stripping, and OSC 8 URL validation.
- [x] Implement `dot_pi/agent/exact_extensions/pr-status/github.ts` using `routedGhEnv`, `parseGitHubOwnerRepo`, and `selectGitHubLogin` from `../_shared/github.ts`; the runner signature matches `AsyncRunner` in `user-context.ts`.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all R1 tests to pass.
- [x] Refactor only after green, rerun verification, and commit with `feat(pi): add PR status GraphQL query and formatter`.

The R1 tests first failed because `pr-status/github.ts` did not exist. All 4 R1 tests and `npm run typecheck` passed after implementation.

### Task 3: Render conditional 3rd footer line in `statusline.ts`
**Delivers:** `statusline.ts` displays `"pr-status"` on line 3 below the model line, split on the first `\t`, and keeps the 2-line footer unchanged when absent.
**Blocked by:** Task 2
**Traces to:** R2
**Files:** `dot_pi/agent/exact_extensions/statusline.ts`, `dot_pi/agent/exact_extensions/statusline.test.mjs`

- [x] Add failing tests in `dot_pi/agent/exact_extensions/statusline.test.mjs` covering R2: 3rd line below the model line when `"pr-status"` is set, `"pr-status"` excluded from line 2, `<right>` right-aligned after the first `\t`, a value without `\t` rendered left-only, OSC 8 link truncation at narrow width, and unchanged 2-line output when `"pr-status"` is absent or empty.
- [x] Update `dot_pi/agent/exact_extensions/statusline.ts` to extract `"pr-status"` from `footerData.getExtensionStatuses()`, split it on the first `\t`, and append `renderLine(left, right, width)` as line 3 when non-empty.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs`; expect all tests to pass.
- [x] Refactor only after green, rerun verification, and commit with `feat(pi): render PR status on conditional third footer line`.

The 3 new footer tests failed against the old renderer. All 10 footer tests passed after adding line 3, including truncation with the real Pi TUI implementation.

### Task 4: Wire bounded polling extension in `pr-status/index.ts`
**Delivers:** Auto-discovered Pi extension that polls the active feature branch on `session_start`, `agent_end`, and a 120-second timer with backoff, branch-keyed stale retention, and shutdown cleanup.
**Blocked by:** Tasks 1-3
**Traces to:** R3
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [x] Add failing lifecycle tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` covering R3: headless/non-TUI skip, default-branch skip, non-GitHub skip, single in-flight guard, `agent_end` refresh, `agent_end` skipped during backoff, branch switch to another feature branch with a failing refresh clears the line, branch switch to the default branch clears the line, same-branch transient failure keeps a `stale` line with backoff, and `session_shutdown` timer/abort cleanup.
- [x] Implement `dot_pi/agent/exact_extensions/pr-status/index.ts` exporting the default extension factory with injectable runner/timer seams for deterministic tests.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all R1 and R3 tests to pass.
- [x] Refactor only after green, rerun verification, and commit with `feat(pi): poll active branch PR status in footer extension`.

The lifecycle tests first failed because `pr-status/index.ts` did not exist. All 9 query and lifecycle tests passed after implementation. `npm run typecheck` passed, and `env -u PI_STAGE_RUNNER_CHILD npm test` passed (509 tests, 4 skips). An offline Pi 1.6.0 smoke run with a temporary `PI_CODING_AGENT_DIR` and explicit `-e` options loaded the three changed extension entrypoints without load errors. The explicit paths check the candidate without applying it to `$HOME`.

Inspected `AGENTS.md`, `dot_pi/agent/AGENTS.md`, and the extension directory. Slice 1 needs no new operator configuration or agent guidance. Task 6 retains the final documentation and full-suite checks. Matteo's live footer and OSC 8 click check remains pending after apply and gates merge.

### Slice 2: CI status and unreplied comments
Delivers: the right segment of line 3 shows the CI symbol and the unreplied review comment count.

### Task 5: Classify CI and unreplied review threads
**Delivers:** The GraphQL query includes `statusCheckRollup` and `reviewThreads` with the Key Decisions bounds, and the status string carries `<left>\t<CI>  💬 <N>`.
**Blocked by:** Task 4
**Traces to:** R4
**Files:** `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [x] Add failing tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` covering R4: one test per CI table row in Key Decisions, and unreplied, resolved, outdated, self-replied, `null`-author, and truncated threads.
- [x] Extend the query and formatter in `dot_pi/agent/exact_extensions/pr-status/github.ts` to classify CI and threads and fill the right segment.
- [x] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all R1, R3, and R4 tests to pass.
- [x] Refactor only after green, rerun verification, and commit with `feat(pi): show CI status and unreplied comments in PR status line`.

All 7 new tests failed before the query and formatter changes. All 16 focused tests passed after the changes, and TypeScript language-server diagnostics were empty. No refactor followed. GitHub's published GraphQL schema confirms that `PullRequest.statusCheckRollup` describes the PR head ref. The tests mock `gh` and do not establish live GitHub response behavior.

### Task 6: Final verification and documentation check
**Delivers:** Verified typecheck, full Pi test suite, smoke test, and documentation check.
**Blocked by:** Tasks 1-5
**Traces to:** R1, R2, R3, R4, repo `AGENTS.md` testing and documentation requirements
**Files:** `dot_pi/agent/exact_extensions/pr-status/` (review whether `README.md` or `AGENTS.md` updates are needed)

- [ ] From `dot_pi/agent/`, run `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`, and `npm run test:all`; expect all suites and `test:smoke` to pass with zero extension load issues. Remove disposable `dot_pi/agent/node_modules` afterward.
- [ ] Review `AGENTS.md` and `dot_pi/agent/exact_extensions/pr-status/`; record why no `AGENTS.md` or standalone README update is needed (or add a concise README only if non-obvious operator configuration exists).
- [ ] Commit any documentation update with `docs(pi): document PR status line extension` if changes were needed.

## Post-publication validation
- **Live footer and OSC 8 link check:** After applying the explicit chezmoi targets listed in `### Rollout and Rollback`, Matteo runs `/reload` in a Pi session on a feature branch with an open PR (and on `main`). **Owner:** Matteo. **Trigger:** After `chezmoi apply`. **Expected evidence:** Line 3 appears below the model line with `[state] #N <title>`, clicking opens the PR in the browser, CI status and unreplied count on the right match GitHub, `user-context` still reports the current branch PR, and line 3 disappears on `main`. **Gates:** Merging to `main`.

## Learning candidates
- 2026-11-24: The inherited `PI_STAGE_RUNNER_CHILD=1` suppressed the Rex hooks in two regular `user-context` tests. Unset it for the test process; the explicit child-mode fixture sets it itself. — evidence: `dot_pi/agent/exact_extensions/user-context.test.mjs:222`, `:252`, and `:278`; all 22 focused tests passed with `env -u PI_STAGE_RUNNER_CHILD`.
