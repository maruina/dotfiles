# Pi PR Status Line Session Tracking Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show one Pi footer status line per pull request created or acted on in a Pi session, even when Pi starts in a base checkout on `main` and creates or updates PRs from feature worktrees.
**Smallest user-feedback slice:** Slice 1. Multi-line rendering in `statusline.ts`, direct PR-by-number GraphQL queries in `pr-status/github.ts`, and live capture from `bash` `gh pr create` / `gh pr edit` commands and allowlisted `/pr-address-feedback <url>` inputs so opening or editing a PR from a worktree immediately adds its clickable status line to the footer.
**Out of Scope:** Scanning all local sibling worktrees via `git worktree list` regardless of session activity; tracking PRs from read-only `read`, `gh pr view`, `gh pr list`, `gh-as` (read-only wrapper), or read-only PR prompt templates (`/pr-validate`, `/systematic-review`, `/simplify`, `/learn`); tracking `gh pr ready`/`reopen`/`merge`/`close` (which do not print a PR URL on stdout); worktree-existence-based PR removal; manual `/pr-status` pin, remove, or refresh subcommands; interactive PR picker UIs, pane jumping, per-check links, job logs, or GitHub write operations.
**Architecture:** `dot_pi/agent/exact_extensions/pr-status/github.ts` adds `queryPrByNumber` alongside `queryPrStatus`, sharing auth routing (`routedGhEnv` / `selectGitHubLogin`), response validation, OSC 8 linking, and CI/comment formatting. Both queries select `mergedAt` and return `{ key, line, state, mergedAt }` (or `undefined` when not found), adding a `repo#N` prefix when a PR belongs to a different repository than `ctx.cwd`. `dot_pi/agent/exact_extensions/pr-status/index.ts` tracks up to 5 deduplicated `{ owner, repo, number }` PRs per session from live `tool_result` (`bash` `gh pr create` / `gh pr edit`), allowlisted `input` (`/pr-address-feedback <url>`), `pi.events` (`pr-status:track` emitted by `stage-runner/index.ts`), and `/pr-status clear`, persists them via `pi.appendEntry("pr-status", { prs })`, backfills from `ctx.sessionManager.getEntries()` (`gh pr create` / `gh pr edit` `toolCall`/`toolResult` pairs) on `session_start` when no persisted entry exists yet, and prunes tracked PRs by GitHub PR state (`CLOSED` immediately; `MERGED` 24 hours after `mergedAt`). `dot_pi/agent/exact_extensions/statusline.ts` splits `"pr-status"` on `\n` and renders one `<left>\t<right>` footer line per entry below the model line.
**Tech Stack:** TypeScript (Pi extension API, `@earendil-works/pi-tui`), Node.js standard library and `node:test`, Git, GitHub GraphQL via `gh`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Required by `/plan` before domain work | Selected matching domain skills and defined this provenance table. |
| `learning-lookup` | `prompt-required` | Required by `/plan` before feasibility decisions | Queried `Datadog/Learnings.md`; 1 matched chezmoi template section was not applicable because no `.tmpl` files change. |
| `chezmoi` | `skill-loader` | Changes target files under `dot_pi/agent/` | Scoped all edits to chezmoi source paths and explicit `--source "$PWD"` diff/apply targets. |
| `write` | `skill-loader` | Drafting and updating the durable plan | Applied concise, mechanism-oriented prose and explicit tradeoffs. |
| `feature-worktree` | `prompt-required` | Durable plan branch creation | Created `maruina/pi-pr-statusline-session-prs` worktree from `origin/main` without modifying the base checkout. |
| `learning-candidates` | `prompt-required` | Confirmed review fix disproved the planned `stage-runner` hook | Recorded the `stage-runner` `progress()` vs `onEvent` finding under `## Learning candidates`. |

## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Render multiple PR lines below the model line | `statusline.ts` reads `footerData.getExtensionStatuses().get("pr-status")`, splits on `\n`, and pushes `renderLine(prLeft, prRight, width)` per non-empty line | `dot_pi/agent/exact_extensions/statusline.ts` lines 166–188 already split `"pr-status"` on `\t` and call `renderLine`; `footer-data-provider.js:127` passes status text through unchanged | Unit tests in `statusline.test.mjs` with 1, 2, and empty lines plus OSC 8 truncation | Narrow to single-line footer (not needed; verified present) |
| Query PR status directly by `{ owner, repo, number }` | GitHub GraphQL `repository(owner: $owner, name: $repo) { pullRequest(number: $number) { ... mergedAt } }` via `gh api graphql` with `routedGhEnv` | `dot_pi/agent/exact_extensions/pr-status/github.ts` and `_shared/github.ts` (`parsePullRequestUrl`, `routedGhEnv`, `selectGitHubLogin`, `scrubbedGhEnv`) | Unit tests in `pr-status/pr-status.test.mjs` with mocked `run` | Fall back to branch query only (not needed; verified present) |
| Capture live PR creation/updates from `bash` tool results | `pi.on("tool_result", ...)` inspects `event.toolName === "bash"`, `!event.isError`, `event.input.command` for `gh pr create` / `gh pr edit` (including compound commands), and extracts the first valid PR URL from `event.content` text blocks | Pi `ToolResultEvent` / `BashToolResultEvent` in `dist/core/extensions/types.d.ts` lines 1006–1028; reference session `01a20e46-1f69-70aa-84b9-23470cff9866` prints PR URL on line 1 of `gh pr create` and `gh pr edit` stdout | Lifecycle tests in `pr-status/pr-status.test.mjs` invoking registered `tool_result` handler | Rely on `agent_end` session scan only |
| Capture PR URLs from allowlisted slash commands | `pi.on("input", ...)` inspects `event.text` before prompt template expansion for `/pr-address-feedback <url>` (extension commands run before `input` and use `pi.events`) | Pi `InputEvent` in `dist/core/extensions/types.d.ts` lines 930–940 and `agent-session.js` lines 1713–1755 | Lifecycle tests in `pr-status/pr-status.test.mjs` invoking registered `input` handler | Match expanded prompts in `before_agent_start` |
| Receive published/reviewed PRs from `stage-runner` | `pi.events.emit("pr-status:track", { url })` in `stage-runner/index.ts` (from `run` and `runArpReview` `onEvent` `message` events matching `Published <url>`, plus `/arp-review <url>` after the `active`/`hasUI` guard) and `pi.events.on("pr-status:track", ...)` in `pr-status/index.ts` | `ExtensionAPI.events: EventBus` in `dist/core/extensions/types.d.ts` line 1451; `stage-runner/_runner.ts:776` and `_arp-review.ts:281` emit `{ type: "message", message: "Published <url> at <sha>" }` via `onEvent` | Unit tests in `stage-runner/_index.test.ts` and `pr-status/pr-status.test.mjs` | Drop `stage-runner` bridge and rely on manual tracking |
| Persist tracked PRs and backfill existing sessions on `/reload` | `pi.appendEntry("pr-status", { prs })` and `ctx.sessionManager.getEntries()` scan of `gh pr create` / `gh pr edit` `toolCall`/`toolResult` pairs in file order | Proven in `dot_pi/agent/exact_extensions/session-tags.ts` lines 309–315 and 369; session JSONL verified in `01a20e46-1f69-70aa-84b9-23470cff9866` | Lifecycle tests in `pr-status/pr-status.test.mjs` with mocked `getEntries()` and `appendEntry()` | Keep in-memory state only (loses state on `/reload`) |
| Manual `/pr-status clear` | `pi.registerCommand("pr-status", ...)` supporting `clear` | Proven in `session-tags.ts` and `stage-runner/index.ts` | Command handler tests in `pr-status/pr-status.test.mjs` | Defer command (not needed; verified present) |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Multi-line footer renderer | `dot_pi/agent/exact_extensions/statusline.ts`, `dot_pi/agent/exact_extensions/statusline.test.mjs` | Split `"pr-status"` on `\n`, ignore empty lines, and render each `<left>\t<right>` segment with `renderLine(prLeft, prRight, width)` below the model line. Preserve unchanged 2-line output when empty. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/statusline.test.mjs` |
| PR GraphQL client and formatter | `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` | Export `queryPrByNumber` alongside `queryPrStatus` using shared formatting, sanitization, URL validation, CI/comment helpers, and optional in-refresh token cache (`tokenCache?: Map<string, NodeJS.ProcessEnv | undefined>`). Select `mergedAt` in both queries. Accept `showRepo?: boolean` so cross-repo PRs render `repo#N <title>` while same-repo PRs render `#N <title>`. Return `{ key, line, state, mergedAt }` (or `undefined` when not found) from both `queryPrStatus` and `queryPrByNumber`, updating existing `queryPrStatus` test assertions in `pr-status.test.mjs`. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Session PR tracking & polling extension | `dot_pi/agent/exact_extensions/pr-status/index.ts`, optional `dot_pi/agent/exact_extensions/pr-status/session.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` | Track up to 5 `{ owner, repo, number }` PRs per session from `tool_result` (`gh pr create`/`edit`), allowlisted `input` (`/pr-address-feedback <url>`), `pi.events` (`pr-status:track`), and `session_start` persistence/backfill (`ctx.sessionManager.getEntries()`). Read `origin` on every refresh (including on `main`) so `showRepo` knows the session repository. Capture `ctx` on `session_start`; adding a PR resets `retryMs` and triggers `refresh(ctx)` immediately (or sets `rerunRequested` if `inFlight` so `finally` runs one more refresh). Order output as feature-branch PR first (when on a feature branch), then tracked PRs in insertion order, deduplicated by `owner/repo#number`. Prune tracked PRs on refresh: drop `CLOSED` immediately and `MERGED` after 24 hours past `mergedAt` (using injectable `now`), persisting the updated list via `pi.appendEntry`. Support `/pr-status clear`. Poll with per-PR staleness on partial failure, login token reuse within a refresh cycle, bounded 120s polling, and exponential backoff. Update existing `pr-status.test.mjs` doubles/assertions where needed. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` |
| Stage runner event bridge | `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` | Emit `pi.events?.emit("pr-status:track", { url })` when `/arp-review` starts with `prUrl` (after the `active`/`hasUI` guard) and inside both `run` and `runArpReview` `onEvent` callbacks when `event.type === "message"` starts with `Published ` and the first token passes `parsePullRequestUrl`. Guard `pi.events?.emit` so minimal test doubles that omit `events` keep working. | `node --experimental-strip-types --test dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` |
| Repo test, typecheck, and smoke suites | `dot_pi/agent/package.json` (unchanged) | Verify TypeScript types, all unit and integration tests, and Pi extension loading. | `npm test`, `npm run typecheck`, `npm run test:all` in `dot_pi/agent/` |

### Key Decisions
- **Track at most five session PRs:** Matteo typically creates 1–2 PRs per session (confirmed by session `01a20e46-1f69-70aa-84b9-23470cff9866`, which created PRs in two repos). Evict the oldest tracked PR on overflow and keep the five most recent on restore. The current feature-branch PR does not count against the tracked cap. Render it first, followed by tracked PRs in insertion order, deduplicated by `owner/repo#number`. The footer can show six PR lines when the branch PR differs from all five tracked PRs. *Rejected alternative:* single line showing only the most recently touched PR; its benefit was fixed 3-line height, but it hides the first PR in a two-PR session.
- **Prefix cross-repo PRs as `repo#N`, keep same-repo PRs as `#N`:** When a session opened in `resource-quotas-manager` also creates `ddoghq/k8s-platform-resources#31949`, showing `k8s-platform-resources#31949` distinguishes it immediately while keeping `#564` compact for the session's primary repository. `pr-status/index.ts` reads `origin` on every refresh (even on `main`) so it knows the session repository. *Rejected alternative:* always prefix `owner/repo#N`; its benefit was uniformity, but it wastes horizontal space on titles in the common same-repo case.
- **Narrow `bash` filter for `gh pr create` and `gh pr edit`:** Only extract PR URLs from successful `bash` tool results whose command invokes `gh pr create` or `gh pr edit` (anywhere in a compound command such as `cd <worktree> && gh pr create ...`), taking the first valid URL validated by `parsePullRequestUrl` from stdout (ignoring duplicate URLs in trailing `gh event listen` hints). `gh-as` is excluded because it only supports `pr view`, `pr list`, and `api`; `gh pr ready`/`reopen`/`merge`/`close` are excluded because they do not print a PR URL on stdout (follow-up if needed: parse `--repo` and PR number from command arguments). *Rejected alternative:* match any GitHub PR URL in any tool output; its benefit was catching read-only inspections, but it pollutes the footer whenever the agent reads docs, issues, or unrelated PRs.
- **Allowlisted `input` capture (`/pr-address-feedback` only):** `pi.on("input", ...)` tracks a PR URL only when `event.text` invokes `/pr-address-feedback` with a valid GitHub PR URL argument (including comment/discussion links whose pathname matches `/owner/repo/pull/N`). Read-only prompt templates such as `/pr-validate`, `/systematic-review`, `/simplify`, and `/learn` do not track PRs. Extension commands (`/arp-review`, `/stage-runner`, `/pr-status`) execute before `input` handlers in Pi (`agent-session.js:1713`) and use `pi.events` instead.
- **PR-state pruning (`CLOSED` immediately, `MERGED` after 24 hours or `/pr-status clear`):** On refresh, a tracked PR whose GraphQL state is `CLOSED` is removed immediately; a tracked PR whose state is `MERGED` is kept for 24 hours after `mergedAt` (so the user sees the `[merged]` transition) and then removed automatically, or earlier via `/pr-status clear`. Pruning persists the updated list via `pi.appendEntry("pr-status", { prs })` so `/reload` does not resurrect pruned PRs. *Rejected alternatives:* (1) retaining merged/closed PRs forever until manual removal; (2) coupling removal to worktree deletion, which would require tracking worktree paths across repos and maintaining fallback rules whenever a worktree is unknown.
- **Session persistence via `pi.appendEntry("pr-status", { prs })` + `getEntries()` backfill:** Reconstructing from `ctx.sessionManager.getEntries()` in file order matches `session-tags.ts` (avoiding `getBranch()` dropping custom entries after a user message forks). When a `pr-status` custom entry exists, the latest one is authoritative so `/pr-status clear` and automatic prunes persist across `/reload`. When none exists yet, backfill scans session `gh pr create` / `gh pr edit` `toolCall`/`toolResult` pairs so `/reload` in pre-existing sessions immediately shows their PRs. *Known limit:* pre-rollout `stage-runner` runs are not backfilled because `stage-runner` emits `Published <url>` via transient `onEvent` notifications rather than `stage-runner-progress` entries; post-rollout runs are persisted directly when `pr-status` receives `pr-status:track`.
- **Minimal `/pr-status clear` command only:** Defer manual pin (`/pr-status <url>`), remove (`/pr-status remove ...`), and refresh subcommands until live use shows a need.
- **Per-PR partial failure isolation:** When polling multiple PRs, a failure on PR A marks only PR A `stale` (if it has a last-known line) while PR B still updates normally; backoff applies when any PR fails.

### Implementation Constraints
- Edit only chezmoi source files under `dot_pi/agent/`; never edit rendered targets under `$HOME` during implementation.
- Keep `pr-status` read-only with respect to GitHub and Git state; no GitHub mutations, no `git fetch`, no `gh auth switch`.
- Keep subprocess timeouts bounded at 10,000 ms, poll interval at 120,000 ms, backoff ceiling at 600,000 ms, merged retention at 86,400,000 ms (24 hours), and max tracked PRs at 5.
- Reuse `_shared/github.ts` (`parsePullRequestUrl`, `parseGitHubOwnerRepo`, `routedGhEnv`, `selectGitHubLogin`, `scrubbedGhEnv`) without duplicating URL parsing or token routing.
- Unset `PI_STAGE_RUNNER_CHILD` only if needed when running existing Rex/stage-runner tests, matching `plans/pi-pr-statusline/plan.md`.
- Preserve headless/non-TUI skip behavior (`!ctx.hasUI || ctx.mode !== "tui"`).

### Security and Observability Requirements
- Never leak `GH_TOKEN`, subprocess stderr, or raw GraphQL response bodies into the footer, notifications, or persisted session entries.
- On `work` profile, route every PR query through `routedGhEnv(pr.owner, "work", ...)` and verify `data.viewer.login.toLowerCase() === selectGitHubLogin(pr.owner)`; never fall back to ambient `GH_TOKEN` / `GITHUB_TOKEN`.
- Strip ANSI/OSC/C0/C1 control sequences from PR titles and validate OSC 8 URLs with `parsePullRequestUrl` (strict `https://github.com/<owner>/<repo>/pull/<number>`, no credentials/port/extra path/control bytes).
- Validate `pi.events` `"pr-status:track"` payloads defensively (`data` is a non-null object with a string `url` that passes `parsePullRequestUrl`); silently ignore malformed or invalid payloads.
- Validate persisted `pr-status` custom entry payloads defensively on load; ignore malformed entries instead of throwing.
- Emit concise user-facing feedback via `ctx.ui.notify` for `/pr-status clear` and invalid `/pr-status` arguments.

### Failure Modes to Handle
- **Single PR query fails while another succeeds:** Keep the healthy PR's fresh line, append ` stale` to the failed PR's last-known left segment (or omit if never loaded), and schedule exponential backoff retry.
- **PR added while a refresh is `inFlight` or during backoff:** Reset `retryMs = 0` and set `rerunRequested = true` so `finally` immediately schedules one more `refresh(ctx)` without dropping the new PR.
- **Deleted/inaccessible PR (`pullRequest: null` or GraphQL error):** Do not crash the extension; omit the unavailable PR or mark stale on transient error.
- **Duplicate PR from feature branch + session tracking:** Deduplicate by `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}` so the PR renders once.
- **Session with >5 PRs:** Evict the oldest tracked PR when adding a 6th unique PR (and keep the 5 most recent on restore).
- **Session reload after `/pr-status clear` or automatic prune:** Because both write the updated `{ prs }` via `pi.appendEntry`, `session_start` sees an authoritative `pr-status` entry and does not re-backfill cleared or pruned PRs.
- **Invalid `pr-status:track` event payload:** Ignore silently without throwing or altering tracked PRs.
- **Missing `pi.events`, `pi.registerCommand`, `pi.appendEntry`, or `sessionManager.getEntries` in minimal test doubles:** Guard optional calls cleanly so existing unit tests do not break.

### Rollout and Rollback
- **Owner:** Matteo.
- **Rollout:** From the feature worktree, preview explicit targets with `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/statusline.ts ~/.pi/agent/extensions/pr-status/github.ts ~/.pi/agent/extensions/pr-status/index.ts ~/.pi/agent/extensions/stage-runner/index.ts` (plus any new file under `pr-status/`), apply the same explicit targets with `chezmoi --source "$PWD" apply ...`, then run `/reload` in active Pi sessions (including `01a20e46-1f69-70aa-84b9-23470cff9866`) to verify live rendering.
- **Rollback:** Revert the commits on the feature branch (or revert the merge commit on `main`), run `chezmoi apply` for the same explicit targets, and `/reload`. No GitHub state is modified; any persisted `pr-status` custom entries in session JSONL files are ignored by older versions of the extension.

### Test Strategy
- **Highest deterministic supported interfaces:**
  - `statusline.test.mjs` (`contextFooter` seam) for multi-line footer rendering and OSC 8 truncation.
  - `pr-status/pr-status.test.mjs` (`queryPrByNumber`, `queryPrStatus`, and `createPrStatusExtension` DI seam with injectable `run`, `setTimer`, `profile`, and `now`) for GraphQL query/formatting, auth routing, token caching, `tool_result`/`input`/`pi.events` capture, immediate refresh / in-flight rerun, `session_start` persistence & backfill, dedup, cap, PR-state pruning, partial failure, and `/pr-status clear`.
  - `stage-runner/_index.test.ts` for `pr-status:track` event emission on `/arp-review` (after guard) and `onEvent` `Published <url>` messages.
- **Boundaries mocked:** `gh` / `git` subprocess runner (`run`), timers (`setTimer`), clock (`now`), profile (`profile`), and Pi `ExtensionAPI`/`ExtensionContext` objects.
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
`pr-status/github.ts` SHALL query a PR by `{ owner, repo, number }` with work-profile token routing and viewer verification, reuse cached auth environments per login within a refresh cycle, return structured `{ key, line, state, mergedAt }` from both `queryPrByNumber` and `queryPrStatus`, and prefix the link text with `<repo>#<number>` when the PR repository differs from the session repository.

#### Scenario: Cross-repo PR in work profile routes auth and prefixes repository name
- GIVEN `profile` is `"work"` and the session repository is `ddoghq/resource-quotas-manager`
- WHEN `queryPrByNumber` queries `ddoghq/k8s-platform-resources#31949` and `ddoghq/resource-quotas-manager#564` with a shared `tokenCache`
- THEN `gh auth token --user matteo-ruina_ddog` runs once, `#31949` returns `line` `[open] <osc8>k8s-platform-resources#31949 <title></osc8>\t...`, and `#564` returns `line` `[open] <osc8>#564 <title></osc8>\t...`.

#### Scenario: Viewer login mismatch or missing token fails closed
- GIVEN `profile` is `"work"` and `gh auth token` returns `null` or GraphQL returns a different `viewer.login`
- WHEN `queryPrByNumber` runs
- THEN it rejects with `Error("Cannot read PR status")`, does not fall back to ambient `GH_TOKEN`, and leaks no token or stderr.

### Requirement: Live capture, polling, and PR-state pruning of session PRs on `main`
`pr-status/index.ts` SHALL track PRs created or edited in `bash` `tool_result` outputs (`gh pr create` / `gh pr edit`, including compound commands), passed to `/pr-address-feedback <url>` in `input`, or emitted via `pi.events` (`pr-status:track`), even when `ctx.cwd` is on `main`; refresh immediately on add (including when a refresh is in flight); poll all tracked PRs (up to 5, deduplicated); and prune `CLOSED` PRs immediately and `MERGED` PRs 24 hours after `mergedAt`.

#### Scenario: Compound `gh pr create` in a worktree while `ctx.cwd` is on `main`
- GIVEN Pi started on `main` in `ddoghq/resource-quotas-manager` with no tracked PRs
- WHEN two `bash` `tool_result` events succeed for `cd ... && gh pr create ...` commands whose stdout starts with `https://github.com/ddoghq/k8s-platform-resources/pull/31949` and `https://github.com/ddoghq/resource-quotas-manager/pull/564` (followed by `gh event listen` hints repeating the URL)
- THEN `pr-status` persists both PRs once each, polls both via `queryPrByNumber`, and publishes a two-line `"pr-status"` value with `k8s-platform-resources#31949` and `#564`.

#### Scenario: Read-only commands, failed commands, and non-allowlisted inputs are ignored
- GIVEN Pi started on `main` with no tracked PRs
- WHEN a `bash` `tool_result` runs `gh pr view` or `cat README.md` containing a PR URL, OR a `gh pr create` tool result has `isError: true`, OR `input` receives `/pr-validate https://github.com/ddoghq/demo/pull/1`
- THEN `pr-status` does not track the PR and publishes no footer line.

#### Scenario: PR added during an in-flight refresh triggers a follow-up refresh
- GIVEN a refresh is currently `inFlight`
- WHEN a `gh pr create` `tool_result` adds a new PR before the in-flight refresh completes
- THEN `pr-status` runs one follow-up refresh immediately after the first finishes and displays the new PR without waiting for the 120s poll timer.

#### Scenario: A distinct feature-branch PR does not count against the tracked cap
- GIVEN the current feature branch has a PR and the session already tracks five other PRs
- WHEN the session tracks another distinct PR and refreshes
- THEN the oldest tracked PR is evicted, and the footer shows six PR lines: the branch PR first, followed by the five remaining tracked PRs in insertion order.

#### Scenario: Partial failure marks only the failed PR stale
- GIVEN two tracked PRs both have last-known rendered lines
- WHEN a refresh succeeds for PR 2 and fails for PR 1
- THEN PR 1 renders with ` stale` on its left segment, PR 2 renders fresh without `stale`, and exponential backoff schedules the next refresh.

#### Scenario: Closed PRs drop immediately and merged PRs drop after 24 hours
- GIVEN two tracked PRs where PR 1 transitions to `CLOSED` and PR 2 is `MERGED` with `mergedAt` 23 hours ago
- WHEN a refresh runs at T, and another refresh runs at T + 2 hours
- THEN PR 1 is removed and persisted on the first refresh, PR 2 remains visible at T with `[merged]`, and PR 2 is removed and persisted at T + 2 hours.

### Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status clear`
`pr-status/index.ts` SHALL restore persisted PRs on `session_start` from `ctx.sessionManager.getEntries()`, backfill from prior session `gh pr create` / `gh pr edit` `toolCall`/`toolResult` pairs when no `pr-status` entry exists, validate and accept `pr-status:track` events from `stage-runner/index.ts`, and support `/pr-status clear`.

#### Scenario: Reloading a pre-existing session backfills created PRs
- GIVEN a session has no `"pr-status"` custom entry, but `getEntries()` contains successful `gh pr create` `toolCall`/`toolResult` pairs for `#31949` and `#564`
- WHEN `session_start` runs on `main`
- THEN `pr-status` extracts both PRs in order and polls them immediately.

#### Scenario: Clearing tracked PRs persists across reload
- GIVEN a session tracked `#564` and the user runs `/pr-status clear`
- WHEN `session_start` runs again after `/reload`
- THEN `pr-status` reads the authoritative `{ prs: [] }` entry, does not re-backfill `#564`, and clears the footer status.

#### Scenario: Invalid `pr-status:track` event payload or invalid `/pr-status` argument is rejected safely
- GIVEN an active session
- WHEN `pi.events` emits `"pr-status:track"` with `{ url: "https://github.com/ddoghq/demo/issues/1" }` or non-object data, OR the user runs `/pr-status unknown`
- THEN the invalid event is ignored silently, the invalid command notifies an error via `ctx.ui.notify`, and the tracked PR list remains unchanged.

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

### Task 2: Add `queryPrByNumber` with cross-repo prefix, `mergedAt`, and per-login token caching
**Delivers:** `pr-status/github.ts` queries PRs directly by `{ owner, repo, number }` with auth routing, token reuse across PRs, `repo#N` labeling for cross-repo PRs, and structured `{ key, line, state, mergedAt }` results from both `queryPrByNumber` and `queryPrStatus`.
**Blocked by:** None
**Traces to:** Requirement: Direct PR-by-number GraphQL query with cross-repo labeling
**Files:** `dot_pi/agent/exact_extensions/pr-status/github.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for `queryPrByNumber`: work-profile auth routing + `tokenCache` reuse across two PRs, viewer mismatch fail-closed, cross-repo `repo#N` prefix vs same-repo `#N`, `state` and `mergedAt` fields, missing PR (`pullRequest: null`), and control-char / unsafe URL handling; update existing `queryPrStatus` assertions to expect `{ key, line, state, mergedAt }`.
- [ ] Implement `queryPrByNumber` (sharing GraphQL selection fields including `mergedAt` and PR formatting with `queryPrStatus`) in `dot_pi/agent/exact_extensions/pr-status/github.ts`, returning `{ key, line, state, mergedAt } | undefined` from both functions.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): add PR-by-number GraphQL query and cross-repo label`.

### Task 3: Track, poll, and prune session PRs live from `tool_result` and `input`
**Delivers:** `pr-status/index.ts` captures PRs live from `bash` `gh pr create` / `gh pr edit` results and `/pr-address-feedback <url>` inputs, reads `origin` on every refresh for cross-repo labeling on `main`, triggers immediate refreshes (including when `inFlight`), deduplicates with feature-branch PRs in deterministic order, enforces the 5-PR cap, prunes `CLOSED` PRs immediately and `MERGED` PRs after 24 hours, and isolates per-PR partial failures.
**Blocked by:** Task 1 and Task 2
**Traces to:** Requirement: Live capture, polling, and PR-state pruning of session PRs on `main`
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing lifecycle tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for: two compound `cd ... && gh pr create` tool results on `main` (with `gh event listen` hints) producing two lines with `repo#N` vs `#N`; `input` `/pr-address-feedback <url>` capture; negative cases (`gh pr view`, `isError: true`, invalid URL, `/pr-validate <url>`); PR added while `inFlight` triggering an immediate follow-up refresh and resetting `retryMs`; deduplication and ordering (branch PR first, then tracked PRs in insertion order); 5-PR tracked cap evicting the oldest tracked PR and allowing six lines with a distinct feature-branch PR; PR-state pruning (`CLOSED` dropped immediately, `MERGED` kept within 24h and dropped after 24h via injectable `now`); and per-PR partial failure marking only the failed PR `stale`. Update existing `pr-status.test.mjs` session test doubles/expectations for the new `queryPrStatus` shape and `origin` lookup.
- [ ] Update `dot_pi/agent/exact_extensions/pr-status/index.ts` to register `tool_result` and `input` handlers, capture `ctx` on `session_start`, read `origin` on every refresh, maintain the bounded deduplicated tracked PR list, trigger immediate refresh (`rerunRequested` when `inFlight`, reset `retryMs`), poll branch + tracked PRs with a shared per-refresh `tokenCache`, prune `CLOSED` / expired `MERGED` tracked PRs, and publish `\n`-joined lines.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): track, poll, and prune session PRs on main branch`.

### Slice 2: Session persistence, `/reload` backfill, `stage-runner` hook, `/pr-status clear`, and verification

### Task 4: Add session persistence, `session_start` backfill, `pi.events` listener, and `/pr-status clear`
**Delivers:** Tracked PRs (and prunes/clears) survive `/reload` via `pi.appendEntry`, pre-existing sessions backfill `gh pr create` / `gh pr edit` PRs from `ctx.sessionManager.getEntries()`, `pr-status` validates and handles `pi.events` `"pr-status:track"`, and `/pr-status clear` clears tracked PRs.
**Blocked by:** Task 3
**Traces to:** Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status clear`
**Files:** `dot_pi/agent/exact_extensions/pr-status/index.ts`, `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs` for: `pi.appendEntry("pr-status", { prs })` persistence on add and on PR-state prune; `session_start` backfill from `getEntries()` (`gh pr create` / `gh pr edit` `toolCall`/`toolResult` pairs); authoritative empty `{ prs: [] }` preventing re-backfill after `/pr-status clear`; malformed persisted entry resilience; `pi.events` `"pr-status:track"` valid URL handling (triggering immediate refresh via stored `ctx`) and invalid payload silent rejection; and `/pr-status clear` plus invalid argument notification.
- [ ] Implement persistence, `getEntries()` backfill, `pi.events.on("pr-status:track", ...)` subscription (with `parsePullRequestUrl` validation and cleanup on `session_shutdown`), and `pi.registerCommand("pr-status", ...)` (`clear` only) in `dot_pi/agent/exact_extensions/pr-status/index.ts` (extracting pure entry-parsing helpers to `dot_pi/agent/exact_extensions/pr-status/session.ts` if it keeps `index.ts` concise). Guard optional `pi.events` / `pi.registerCommand` / `pi.appendEntry` / `ctx.sessionManager?.getEntries` for minimal test doubles.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/pr-status/pr-status.test.mjs`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): persist session PRs, backfill on reload, and add /pr-status clear`.

### Task 5: Emit `pr-status:track` from `stage-runner/index.ts`
**Delivers:** `/stage-runner` and `/arp-review` publish PR URLs to `pr-status` over `pi.events`.
**Blocked by:** Task 4
**Traces to:** Requirement: Session persistence, `/reload` backfill, `stage-runner` hook, and `/pr-status clear`
**Files:** `dot_pi/agent/exact_extensions/stage-runner/index.ts`, `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`

- [ ] Add failing tests in `dot_pi/agent/exact_extensions/stage-runner/_index.test.ts` verifying that `pi.events.emit("pr-status:track", { url })` is called when `/arp-review <pr-url>` passes its `active`/`hasUI` guard (and not when rejected) and when a `Published <pr-url> at <sha>` `RunnerEvent` `{ type: "message" }` arrives on `onEvent` (extracted helper or `onEvent` handler test).
- [ ] Emit `pi.events?.emit("pr-status:track", { url })` in `dot_pi/agent/exact_extensions/stage-runner/index.ts` after the `active`/`hasUI` guard when `/arp-review` receives `prUrl`, and inside both `run` and `runArpReview` `onEvent` callbacks when `event.type === "message"` starts with `Published ` and its first token passes `parsePullRequestUrl`.
- [ ] Run `node --experimental-strip-types --test dot_pi/agent/exact_extensions/stage-runner/_index.test.ts`; expect all tests to pass.
- [ ] Refactor only after green, then rerun the test command.
- [ ] Commit with `feat(pi): emit pr-status:track events from stage-runner`.

### Task 6: Check documentation and future-agent guidance
**Delivers:** Confirm whether `AGENTS.md` or extension READMEs need updates for the new `pr-status` session tracking and `/pr-status clear` command, and apply minimal updates if warranted.
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
- **Live `/pr-status clear` and reload check:** In a live session on `main`, Matteo runs `/pr-status clear`, then `/reload`. **Owner:** Matteo. **Trigger:** After live backfill check. **Expected evidence:** The PR lines disappear and do not reappear after `/reload`. **Gates:** Merging to `main`.

## Learning candidates
- 2026-11-25: `stage-runner/index.ts` `progress()` is only used by `runDesign`; plan (`run`) and ARP (`runArpReview`) publications emit `Published <url> at <sha>` through `onEvent` `{ type: "message" }` callbacks which call `ctx.ui.notify` and are not persisted to `stage-runner-progress` entries — evidence: `dot_pi/agent/exact_extensions/stage-runner/index.ts:194-197,271-278` and `dot_pi/agent/exact_extensions/stage-runner/_runner.ts:776`.
