# Pi PR Status Line Session Tracking Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one Pi footer status line per pull request created or acted on in a Pi session, even when Pi starts in a base checkout on `main` and creates or updates PRs from feature worktrees.
**Smallest user-feedback slice:** Slice 1. Multi-line rendering in `statusline.ts`, direct PR-by-number GraphQL queries in `pr-status/github.ts`, and live capture from `bash` `gh` / `gh-as` PR commands and `input` PR slash commands so opening or editing a PR from a worktree immediately adds its clickable status line to the footer.
**Out of Scope:** Scanning all local sibling worktrees via `git worktree list` regardless of session activity; tracking PRs from read-only `read`, `gh pr view`, or `gh pr list` calls; interactive PR picker UIs, pane jumping, per-check links, job logs, or GitHub write operations.
**Architecture:** `dot_pi/agent/exact_extensions/pr-status/github.ts` adds `queryPrByNumber` alongside `queryPrStatus`, sharing auth routing (`routedGhEnv` / `selectGitHubLogin`), response validation, OSC 8 linking, and CI/comment formatting, and adds a `repo#N` prefix when a PR belongs to a different repository than `ctx.cwd`. `dot_pi/agent/exact_extensions/pr-status/index.ts` tracks up to 5 deduplicated `{ owner, repo, number }` PRs per session from live `tool_result` (`bash` PR mutations), `input` (PR slash commands with a PR URL), `pi.events` (`pr-status:track` emitted by `stage-runner/index.ts`), and `/pr-status` commands, persists them via `pi.appendEntry("pr-status", { prs })`, and backfills from `ctx.sessionManager.getEntries()` on `session_start` when no persisted entry exists yet. `dot_pi/agent/exact_extensions/statusline.ts` splits `"pr-status"` on `\n` and renders one `<left>\t<right>` footer line per entry below the model line.
**Tech Stack:** TypeScript (Pi extension API, `@earendil-works/pi-tui`), Node.js standard library and `node:test`, Git, GitHub GraphQL via `gh`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Required by `/plan` before domain work | Selected matching domain skills and defined this provenance table. |
| `learning-lookup` | `prompt-required` | Required by `/plan` before feasibility decisions | Queried `Datadog/Learnings.md`; 1 matched chezmoi template section was not applicable because no `.tmpl` files change. |
| `chezmoi` | `skill-loader` | Changes target files under `dot_pi/agent/` | Scoped all edits to chezmoi source paths and explicit `--source "$PWD"` diff/apply targets. |
| `write` | `skill-loader` | Drafting the planning brief and durable plan | Applied concise, mechanism-oriented prose and explicit tradeoffs. |
| `feature-worktree` | `prompt-required` | Durable plan branch creation | Created `maruina/pi-pr-statusline-session-prs` worktree from `origin/main` without modifying the base checkout. |

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Render multiple PR lines below the model line | `statusline.ts` reads `footerData.getExtensionStatuses().get("pr-status")`, splits on `\n`, and pushes `renderLine(prLeft, prRight, width)` per non-empty line | `dot_pi/agent/exact_extensions/statusline.ts` lines 166–188 already split `"pr-status"` on `\t` and call `renderLine` | Unit tests in `statusline.test.mjs` with 1, 2, and empty lines plus OSC 8 truncation | Narrow to single-line footer (not needed; verified present) |
| Query PR status directly by `{ owner, repo, number }` | GitHub GraphQL `repository(owner: $owner, name: $repo) { pullRequest(number: $number) { ... } }` via `gh api graphql` with `routedGhEnv` | `dot_pi/agent/exact_extensions/pr-status/github.ts` and `_shared/github.ts` (`parsePullRequestUrl`, `routedGhEnv`, `selectGitHubLogin`, `scrubbedGhEnv`) | Unit tests in `pr-status/pr-status.test.mjs` with mocked `run` | Fall back to branch query only (not needed; verified present) |
| Capture live PR creation/updates from `bash` tool results | `pi.on("tool_result", ...)` inspects `event.toolName === "bash"`, `!event.isError`, `event.input.command`, and `event.content` text blocks | Pi `ToolResultEvent` / `BashToolResultEvent` in `dist/core/extensions/types.d.ts` lines 1006–1028 | Lifecycle tests in `pr-status/pr-status.test.mjs` invoking registered `tool_result` handler | Rely on `agent_end` session scan only |
| Capture PR URLs from slash commands like `/pr-address-feedback <url>` | `pi.on("input", ...)` inspects `event.text` before prompt template expansion | Pi `InputEvent` in `dist/core/extensions/types.d.ts` lines 930–940 | Lifecycle tests in `pr-status/pr-status.test.mjs` invoking registered `input` handler | Match expanded prompts in `before_agent_start` |
| Receive published/reviewed PRs from `stage-runner` | `pi.events.emit("pr-status:track", { url })` in `stage-runner/index.ts` and `pi.events.on("pr-status:track", ...)` in `pr-status/index.ts` | `ExtensionAPI.events: EventBus` in `dist/core/extensions/types.d.ts` line 1451 | Unit tests in `stage-runner/_index.test.ts` and `pr-status/pr-status.test.mjs` | Scan `stage-runner-progress` messages on `agent_end` |
| Persist tracked PRs and backfill existing sessions on `/reload` | `pi.appendEntry("pr-status", { prs })` and `ctx.sessionManager.getEntries()` scan in file order | Proven in `dot_pi/agent/exact_extensions/session-tags.ts` lines 309–315 and 369; session JSONL verified in `01a20e46-1f69-70aa-84b9-23470cff9866` | Lifecycle tests in `pr-status/pr-status.test.mjs` with mocked `getEntries()` and `appendEntry()` | Keep in-memory state only (loses state on `/reload`) |
| Manual `/pr-status` pin/remove/clear | `pi.registerCommand("pr-status", ...)` | Proven in `session-tags.ts` and `stage-runner/index.ts` | Command handler tests in `pr-status/pr-status.test.mjs` | Defer manual command (not needed; verified present) |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Multi-line footer renderer | `dot_pi/agent/exact_extensions/statusline.ts`, `dot_pi/agent/exact_extensions/statusline.test.mjs` | Split `"pr-status"` on `\n`, ignore empty lines, and render each `<left>\t<right>` segment with `renderLine(prLeft, prRight, width)` below the model line. Preserve unchanged 2-line output when empty. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs` |
| PR GraphQL client and formatter | `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` | Export `queryPrByNumber` alongside `queryPrStatus` using shared formatting, sanitization, URL validation, CI/comment helpers, and optional in-refresh token cache (`tokenCache?: Map<string, NodeJS.ProcessEnv | undefined>`). Accept a `showRepo?: boolean` option so cross-repo PRs render `repo#N <title>` while same-repo PRs render `#N <title>`. Return structured `{ key, line }` or `undefined` when not found so callers can deduplicate branch and tracked PRs by `owner/repo#number`. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Session PR tracking & polling extension | `dot_pi/agent/exact_extensions/pr-status/index.ts`, optional `dot_pi/agent/exact_extensions/pr-status/session.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` | Track up to 5 `{ owner, repo, number }` PRs per session from `tool_result`, `input`, `pi.events` (`pr-status:track`), `/pr-status`, and `session_start` persistence/backfill (`ctx.sessionManager.getEntries()`). Combine with current feature-branch PR when `ctx.cwd` is not on the default branch, deduplicating by `owner/repo#number`. Poll tracked PRs with per-PR staleness on partial failure, login token reuse within a refresh cycle, bounded 120s polling, and exponential backoff. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Stage runner event bridge | `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` | Emit `pi.events?.emit("pr-status:track", { url })` when `/arp-review` starts with a PR URL and when `progress(message)` reports `Published <pr-url>`. Guard `pi.events?.emit` so minimal test doubles that omit `events` keep working. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` |
| Repo test, typecheck, and smoke suites | `dot_pi/agent/package.json` (unchanged) | Verify TypeScript types, all unit and integration tests, and Pi extension loading. | `npm test`, `npm run typecheck`, `npm run test:all` in `dot_pi/agent/` |

### Key Decisions
- **One footer line per PR, capped at 5:** Matteo typically creates 1–2 PRs per session (confirmed by session `01a20e46-1f69-70aa-84b9-23470cff9866`, which created PRs in two repos). Capping at 5 (evicting oldest on overflow) bounds footer height and GraphQL calls per poll. *Rejected alternative:* single line showing only the most recently touched PR; its benefit was fixed 3-line height, but it hides the first PR in a two-PR session.
- **Prefix cross-repo PRs as `repo#N`, keep same-repo PRs as `#N`:** When a session opened in `resource-quotas-manager` also creates `ddoghq/k8s-platform-resources#31949`, showing `k8s-platform-resources#31949` distinguishes it immediately while keeping `#564` compact for the session's primary repository. *Rejected alternative:* always prefix `owner/repo#N`; its benefit was uniformity, but it wastes horizontal space on titles in the common same-repo case.
- **Strict PR-mutation command filter for `bash` `tool_result`:** Only extract PR URLs from successful `bash` tool results whose command invokes `gh` or `gh-as` with a PR mutation subcommand (`pr create`, `pr edit`, `pr ready`, `pr reopen`, `pr merge`, `pr close`) and whose output contains a URL validated by `parsePullRequestUrl`. *Rejected alternative:* match any GitHub PR URL in any tool output; its benefit was catching read-only inspections, but it would pollute the footer whenever the agent reads docs, issues, or unrelated PRs.
- **Session persistence via `pi.appendEntry("pr-status", { prs })` + `getEntries()` backfill:** Reconstructing from `ctx.sessionManager.getEntries()` in file order matches `session-tags.ts` (avoiding `getBranch()` dropping custom entries after a user message forks). When a `pr-status` custom entry exists, the latest one is authoritative so `/pr-status clear` or `remove` persists across `/reload`. When none exists yet, backfill scans session `toolCall`/`toolResult` pairs and `stage-runner-progress` `Published <url>` messages so `/reload` in pre-existing sessions immediately shows their PRs.
- **Retain `[merged]` and `[closed]` PR lines until removed:** Matches existing single-PR `pr-status` behavior so the user sees the transition to `merged`/`closed` in the footer and can clear it with `/pr-status remove` or `/pr-status clear`.
- **Per-PR partial failure isolation:** When polling multiple PRs, a failure on PR A marks only PR A `stale` (if it has a last-known line) while PR B still updates normally; backoff applies when any PR fails.

### Implementation Constraints
- Edit only chezmoi source files under `dot_pi/agent/`; never edit rendered targets under `$HOME` during implementation.
- Keep `pr-status` read-only with respect to GitHub and Git state; no GitHub mutations, no `git fetch`, no `gh auth switch`.
- Keep subprocess timeouts bounded at 10,000 ms, poll interval at 120,000 ms, backoff ceiling at 600,000 ms, and max tracked PRs at 5.
- Reuse `_shared/github.ts` (`parsePullRequestUrl`, `parseGitHubOwnerRepo`, `routedGhEnv`, `selectGitHubLogin`, `scrubbedGhEnv`) without duplicating URL parsing or token routing.
- Unset `PI_STAGE_RUNNER_CHILD` only if needed when running existing Rex/stage-runner tests, matching `plans/pi-pr-statusline/plan.md`.
- Preserve headless/non-TUI skip behavior (`!ctx.hasUI || ctx.mode !== "tui"`).

### Security and Observability Requirements
- Never leak `GH_TOKEN`, subprocess stderr, or raw GraphQL response bodies into the footer, notifications, or persisted session entries.
- On `work` profile, route every PR query through `routedGhEnv(pr.owner, "work", ...)` and verify `data.viewer.login.toLowerCase() === selectGitHubLogin(pr.owner)`; never fall back to ambient `GH_TOKEN` / `GITHUB_TOKEN`.
- Strip ANSI/OSC/C0/C1 control sequences from PR titles and validate OSC 8 URLs with `parsePullRequestUrl` (strict `https://github.com/<owner>/<repo>/pull/<number>`, no credentials/port/extra path/control bytes).
- Validate persisted `pr-status` custom entry payloads defensively on load; ignore malformed entries instead of throwing.
- Emit concise user-facing feedback via `ctx.ui.notify` for `/pr-status` command actions and invalid arguments.

### Failure Modes to Handle
- **Single PR query fails while another succeeds:** Keep the healthy PR's fresh line, append ` stale` to the failed PR's last-known left segment (or omit if never loaded), and schedule exponential backoff retry.
- **Deleted/inaccessible PR (`pullRequest: null` or GraphQL error):** Do not crash the extension; omit the unavailable PR or mark stale on transient error.
- **Duplicate PR from feature branch + session tracking:** Deduplicate by `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}` so the PR renders once.
- **Session with >5 PRs:** Evict the oldest tracked PR when adding a 6th unique PR.
- **Session reload after `/pr-status clear`:** Because `/pr-status clear` writes `{ prs: [] }` via `pi.appendEntry`, `session_start` sees an authoritative `pr-status` entry and does not re-backfill cleared PRs.
- **Missing `pi.events` or `sessionManager.getEntries` in minimal test doubles:** Guard optional calls cleanly so existing unit tests do not break.

### Rollout and Rollback
- **Owner:** Matteo.
- **Rollout:** From the feature worktree, preview explicit targets with `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/pr-status/github.ts ~/.pi/agent/extensions/pr-status/index.ts ~/.pi/agent/extensions/stage-runner/index.ts` (plus any new file under `pr-status/`), apply the same explicit targets with `chezmoi --source "$PWD" apply ...`, then run `/reload` in active Pi sessions (including `01a20e46-1f69-70aa-84b9-23470cff9866`) to verify live rendering.
- **Rollback:** Revert the commits on the feature branch (or revert the merge commit on `main`), run `chezmoi apply` for the same explicit targets, and `/reload`. No GitHub state is modified; any persisted `pr-status` custom entries in session JSONL files are ignored by older versions of the extension.

### Test Strategy
- **Highest deterministic supported interfaces:**
  - `statusline.test.mjs` (`contextFooter` seam) for multi-line footer rendering and OSC 8 truncation.
  - `pr-status/pr-status.test.mjs` (`queryPrByNumber`, `queryPrStatus`, and `createPrStatusExtension` DI seam) for GraphQL query/formatting, auth routing, token caching, `tool_result`/`input`/`pi.events` capture, `session_start` persistence & backfill, dedup, cap, partial failure, and `/pr-status` command handling.
  - `stage-runner/_index.test.ts` for `pr-status:track` event emission on `/arp-review` and `Published <url>` progress.
- **Boundaries mocked:** `gh` / `git` subprocess runner (`run`), timers (`setTimer`), profile (`profile`), and Pi `ExtensionAPI`/`ExtensionContext` objects.
- **Narrow failing test commands:**
  - `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs`
  - `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`
  - `node --experimental-strip-types --test dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`
- **Validation limits:** Automated tests mock `gh` subprocesses and Pi's `ExtensionAPI`; they do not verify live GitHub GraphQL responses or Rex OSC 8 link clicks. Those are verified manually under `## Post-publication validation`.

## Acceptance Criteria

### Requirement: Multi-line PR footer rendering
`statusline.ts` SHALL render one footer line below the model line for each non-empty newline-delimited entry in the `"pr-status"` extension status, preserving `<left>\t<right>` alignment and OSC 8 link closure on truncation.

#### Scenario: Two PR status lines render below the model line
- GIVEN `"pr-status"` contains two lines separated by `\n`, each formatted as `<left>\t<right>`
- WHEN `statusline.ts` renders the footer at width 160
- THEN lines 0 and 1 match the base two-line footer, line 2 renders the first PR aligned to width 160, and line 3 renders the second PR aligned to width 160.

#### Scenario: Empty or whitespace-only PR status adds no extra lines
- GIVEN `"pr-status"` is `undefined`, `""`, or `"\n"`
- WHEN `statusline.ts` renders the footer
- THEN the footer has exactly 2 lines matching the base footer.

### Requirement: Direct PR-by-number GraphQL query with cross-repo labeling
`pr-status/github.ts` SHALL query a PR by `{ owner, repo, number }` with work-profile token routing and viewer verification, reuse cached auth environments per login within a refresh cycle, and prefix the link text with `<repo>#<number>` when the PR repository differs from the session repository.

#### Scenario: Cross-repo PR in work profile routes auth and prefixes repository name
- GIVEN `profile` is `"work"` and the session repository is `ddoghq/resource-quotas-manager`
- WHEN `queryPrByNumber` queries `ddoghq/k8s-platform-resources#31949` and `ddoghq/resource-quotas-manager#564` with a shared `tokenCache`
- THEN `gh auth token --user matteo-ruina_ddog` runs once, `#31949` formats as `[open] <osc8>k8s-platform-resources#31949 <title></osc8>\t...`, and `#564` formats as `[open] <osc8>#564 <title></osc8>\t...`.

#### Scenario: Viewer login mismatch or missing token fails closed
- GIVEN `profile` is `"work"` and `gh auth token` returns `null` or GraphQL returns a different `viewer.login`
- WHEN `queryPrByNumber` runs
- THEN it rejects with `Error("Cannot read PR status")`, does not fall back to ambient `GH_TOKEN`, and leaks no token or stderr.

### Requirement: Live capture of session PRs while Pi runs on `main`
`pr-status/index.ts` SHALL track PRs created or mutated in `bash` `tool_result` outputs, passed to PR slash commands in `input`, or emitted via `pi.events` (`pr-status:track`), even when `ctx.cwd` is on `main`, and poll all tracked PRs (up to 5, deduplicated).

#### Scenario: `gh pr create` in a worktree while `ctx.cwd` is on `main`
- GIVEN Pi started on `main` with no tracked PRs
- WHEN two `bash` `tool_result` events succeed for `gh pr create` commands outputting `https://github.com/ddoghq/k8s-platform-resources/pull/31949` and `https://github.com/ddoghq/resource-quotas-manager/pull/564`
- THEN `pr-status` persists both PRs, polls both via `queryPrByNumber`, and publishes a two-line `"pr-status"` value containing both PRs.

#### Scenario: Read-only `bash` output or failed `gh pr create` is ignored
- GIVEN Pi started on `main` with no tracked PRs
- WHEN a `bash` `tool_result` runs `gh pr view` or `cat README.md` containing a PR URL, OR a `gh pr create` tool result has `isError: true`
- THEN `pr-status` does not track the PR and publishes no footer line.

#### Scenario: Partial failure marks only the failed PR stale
- GIVEN two tracked PRs both have last-known rendered lines
- WHEN a refresh succeeds for PR 2 and fails for PR 1
- THEN PR 1 renders with ` stale` on its left segment, PR 2 renders fresh without `stale`, and exponential backoff schedules the next refresh.

### Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status` command
`pr-status/index.ts` SHALL restore persisted PRs on `session_start` from `ctx.sessionManager.getEntries()`, backfill from prior session `toolCall`/`toolResult` and `stage-runner-progress` entries when no `pr-status` entry exists, accept `pr-status:track` events from `stage-runner/index.ts`, and support `/pr-status` manual pin, remove, and clear.

#### Scenario: Reloading a pre-existing session backfills created PRs
- GIVEN a session has no `"pr-status"` custom entry, but `getEntries()` contains successful `gh pr create` `toolCall`/`toolResult` pairs for `#31949` and `#564`
- WHEN `session_start` runs on `main`
- THEN `pr-status` extracts both PRs in order and polls them immediately.

#### Scenario: Clearing tracked PRs persists across reload
- GIVEN a session tracked `#564` and the user runs `/pr-status clear`
- WHEN `session_start` runs again after `/reload`
- THEN `pr-status` reads the authoritative `{ prs: [] }` entry, does not re-backfill `#564`, and clears the footer status.

#### Scenario: Invalid `/pr-status` argument notifies without changing tracked PRs
- GIVEN the user runs `/pr-status https://github.com/ddoghq/demo/issues/1`
- WHEN the command handler executes
- THEN it notifies an error via `ctx.ui.notify` and leaves the tracked PR list unchanged.

## Implementation Tasks

### Slice 1: Multi-line footer, PR-by-number query, and live session capture

### Task 1: Support multi-line `"pr-status"` rendering in `statusline.ts`
**Delivers:** `statusline.ts` renders one aligned footer line per newline-delimited PR status entry while preserving single-line and empty behavior.
**Blocked by:** None
**Traces to:** Requirement: Multi-line PR footer rendering
**Files:** `dot_pi/agent/exact_extensions/statusline.ts`, `dot_pi/agent/exact_extensions/statusline.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/statusline.test.mjs` covering two newline-delimited PR lines, OSC 8 truncation on multi-line entries, and empty/newline-only status values.
- [ ] Update `dot_pi/agent/exact_extensions/statusline.ts` to split `prStatus` on `"\n"`, skip empty lines, and render each `<left>\t<right>` line via `renderLine`.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): render multi-line PR status in statusline footer`.

### Task 2: Add `queryPrByNumber` with cross-repo prefix and per-login token caching
**Delivers:** `pr-status/github.ts` can query PRs directly by `{ owner, repo, number }` with auth routing, token reuse across PRs, and `repo#N` labeling for cross-repo PRs.
**Blocked by:** None
**Traces to:** Requirement: Direct PR-by-number GraphQL query with cross-repo labeling
**Files:** `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for `queryPrByNumber`: work-profile auth routing + `tokenCache` reuse across two PRs, viewer mismatch fail-closed, cross-repo `repo#N` prefix vs same-repo `#N`, missing PR (`pullRequest: null`), and control-char / unsafe URL handling.
- [ ] Implement `queryPrByNumber` (sharing the PR formatting and GraphQL selection fields with `queryPrStatus`) in `dot_pi/agent/exact_extensions/pr-status/github.ts`, and return the PR identity (`key` / `number` / `line`) needed for deduplication without breaking existing `queryPrStatus` callers/tests.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): add PR-by-number GraphQL query and cross-repo label`.

### Task 3: Track and poll session PRs live from `tool_result` and `input`
**Delivers:** `pr-status/index.ts` captures PRs live from `bash` `gh`/`gh-as` PR mutation results and `input` PR slash commands, polls multiple PRs even when `ctx.cwd` is on `main`, deduplicates with feature-branch PRs, enforces the 5-PR cap, and isolates per-PR partial failures.
**Blocked by:** Task 1 and Task 2
**Traces to:** Requirement: Live capture of session PRs while Pi runs on `main`
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing lifecycle tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for: two `gh pr create` tool results on `main` producing two footer lines, `input` `/pr-address-feedback <url>` capture, negative cases (read-only `gh pr view`, `isError: true`, invalid URL), deduplication with a feature-branch PR, 5-PR cap evicting oldest, and per-PR partial failure marking only the failed PR `stale`.
- [ ] Update `dot_pi/agent/exact_extensions/pr-status/index.ts` to register `tool_result` and `input` handlers, maintain the bounded deduplicated tracked PR list, poll tracked + feature-branch PRs with a shared per-refresh `tokenCache`, and publish `\n`-joined lines.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): track and poll session PRs on main branch`.

### Slice 2: Session persistence, `/reload` backfill, `stage-runner` hook, `/pr-status` command, and verification

### Task 4: Add session persistence, `session_start` backfill, `pi.events` listener, and `/pr-status` command
**Delivers:** Tracked PRs survive `/reload` via `pi.appendEntry`, pre-existing sessions backfill PRs from `ctx.sessionManager.getEntries()`, `pr-status` listens to `pi.events` `"pr-status:track"`, and `/pr-status` supports pin/remove/clear/refresh.
**Blocked by:** Task 3
**Traces to:** Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status` command
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for: `pi.appendEntry("pr-status", { prs })` persistence, `session_start` backfill from `getEntries()` (`toolCall`/`toolResult` + `stage-runner-progress` `Published <url>`), authoritative empty `{ prs: [] }` preventing re-backfill after `/pr-status clear`, malformed persisted entry resilience, `pi.events` `"pr-status:track"` handling, and `/pr-status <url>`, `/pr-status remove <url|#N>`, `/pr-status clear`, and invalid argument notification.
- [ ] Implement persistence, `getEntries()` backfill, `pi.events.on("pr-status:track", ...)` subscription (cleaned up on `session_shutdown`), and `pi.registerCommand("pr-status", ...)` in `dot_pi/agent/exact_extensions/pr-status/index.ts` (extracting pure entry-parsing helpers to `dot_pi/agent/exact_extensions/pr-status/session.ts` if it keeps `index.ts` concise).
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): persist session PRs, backfill on reload, and add /pr-status command`.

### Task 5: Emit `pr-status:track` from `stage-runner/index.ts`
**Delivers:** `/stage-runner` and `/arp-review` publish PR URLs to `pr-status` over `pi.events`.
**Blocked by:** Task 4
**Traces to:** Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status` command
**Files:** `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`

- [ ] Add a failing test in `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` verifying that `pi.events.emit("pr-status:track", { url })` is called when `/arp-review <pr-url>` starts and when `progress` reports a `Published <pr-url>` message.
- [ ] Emit `pi.events?.emit("pr-status:track", { url })` in `dot_pi/agent/exact_extensions/stage-runner/index.ts` when `prUrl` is provided to `/arp-review` and when `progress` matches a valid `Published https://github.com/.../pull/<N>` URL.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): emit pr-status:track events from stage-runner`.

### Task 6: Check documentation and future-agent guidance
**Delivers:** Confirm whether `AGENTS.md` or extension READMEs need updates for the new `pr-status` session tracking and `/pr-status` command, and apply minimal updates if warranted.
**Blocked by:** Task 5
**Traces to:** Plan documentation requirement
**Files:** `AGENTS.md`, `dot_pi/agent/exact_extensions/stage-runner/README.md`

- [ ] Inspect `AGENTS.md` and `dot_pi/agent/exact_extensions/stage-runner/README.md` to check whether any documented contract, event, or command list changed.
- [ ] Update only durable documentation that is stale or missing, or record in the execution notes why no documentation change was needed.
- [ ] Commit with `docs(pi): document session PR tracking in pr-status` if any documentation file changed.

### Task 7: Final verification
**Delivers:** Verified TypeScript typecheck, full fast + integration + smoke test suite, and clean disposable dependency cleanup.
**Blocked by:** Tasks 1-6
**Traces to:** All requirements in `## Acceptance Criteria`
**Files:** `dot_pi/agent/`

- [ ] From `dot_pi/agent/`, run `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`, and `npm run test:all` (unsetting `PI_STAGE_RUNNER_CHILD` if inherited); expect all fast, integration, typecheck, and smoke tests to pass with zero extension load errors.
- [ ] Remove disposable `dot_pi/agent/node_modules` after all suites complete and confirm `git status --short` is clean.

## Post-publication validation
- **Live backfill and multi-PR footer check:** After running `chezmoi --source "$PWD" diff` and `chezmoi --source "$PWD" apply` for the changed extension targets, Matteo runs `/reload` in Pi session `01a20e46-1f69-70aa-84b9-23470cff9866` (running on `resource-quotas-manager` `main`). **Owner:** Matteo. **Trigger:** After `chezmoi apply`. **Expected evidence:** Two PR lines appear below the model line — `k8s-platform-resources#31949` and `#564` — with accurate state, clickable OSC 8 links, CI symbols, and unreplied comment counts. **Gates:** Merging to `main`.
- **Live `/pr-status` clear and reload check:** In a live session on `main`, Matteo runs `/pr-status clear`, then `/reload`. **Owner:** Matteo. **Trigger:** After live backfill check. **Expected evidence:** The PR lines disappear and do not reappear after `/reload`. **Gates:** Merging to `main`.
