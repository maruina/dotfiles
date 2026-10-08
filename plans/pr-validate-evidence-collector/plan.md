# `/pr-validate` GitHub Evidence Collector Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Collect GitHub PR evidence with one deterministic, read-only Node.js command and make `/pr-validate` use its output.
**Smallest user-feedback slice:** Running `collect.mjs <URL>` outputs a single versioned, normalized `evidence.json` envelope with GitHub metadata, diff, comments, review threads, and checks, with explicit source statuses.
**Out of Scope:** Datadog, Atlas, or DDCI-specific MCP queries; marketplace discovery; source-code analysis; verdict selection; report rendering changes; GitHub writes; model or thinking-level changes; per-group monitor queries; replying in existing comment threads; flagging resolved threads whose code did not change.
**Architecture:** A Node.js ESM collector invokes the `gh` CLI for GitHub-only sources and prints one versioned JSON envelope to stdout. `/pr-validate` redirects that output to its existing scratch `evidence.json`; the prompt continues to gather external evidence and analyze the PR. The collector leaves authentication selection and report generation unchanged.
**Tech Stack:** Node.js ESM, standard-library `node:child_process`, `node:test`, GitHub CLI (`gh`), chezmoi.
---
## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | The `/plan` workflow requires skill selection and provenance. | Selected repository, CLI, and writing guidance for the proposed files and plan. |
| `resolve-worktree` | `prompt-required` | No design path was supplied; the prompt requires searching worktrees for one. | Searched all worktrees and found no matching design. |
| `learning-lookup` | `prompt-required` | The prompt requires advisory learning lookup before planning decisions. | Searched for PR review, evidence collector, deterministic evidence, and shell-script learnings; no sections matched. |
| `codebase-research` | `skill-loader` | The collector changes an existing review flow. | Traced the prompt evidence contract, PR #105 deferral, package test commands, and available `gh` interfaces. |
| `chezmoi` | `skill-loader` | The proposed prompt, script, tests, and package file are in the chezmoi source. | Applied source-only and explicit-target constraints to the file mapping and rollout. |
| `cli-best-practices` | `skill-loader` | The collector is a new CLI. | Kept JSON as the CLI output, used noninteractive commands, and defined observable partial-source failures. |
| `write` | `skill-loader` | The plan is a prose artifact. | Used its clarity, evidence, and scope guidance. |
| `humanizer` | `skill-loader` | The plan is a prose artifact. | Kept the plan direct and specific. |
| `feature-worktree` | `prompt-required` | A durable plan must be written outside the base checkout. | Created this feature worktree from the fetched `origin/main`. |
### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | The input is an absolute plan path in a worktree. | Resolved the plan's owning worktree and branch before reading repository files. |
| `feature-worktree` | `prompt-required` | Execution must continue in the plan's worktree. | Confirmed the intended feature branch is active and clean. |
| `skill-loader` | `prompt-required` | `/execute` requires execution-stage skill selection and provenance. | Selected and recorded skills for the CLI, chezmoi source, tests, and plan ledger. |
| `codebase-research` | `skill-loader` | The collector crosses a CLI and GitHub evidence boundary. | Traced the prompt's evidence contract, current package patterns, and GitHub CLI pagination behavior. |
| `chezmoi` | `skill-loader` | Implementation files are in chezmoi source paths. | Kept edits in source paths and will apply only the planned explicit targets. |
| `cli-best-practices` | `skill-loader` | The collector is a new JSON CLI. | Applied stdout/stderr separation, input validation, help, and stable source failure guidance. |
| `write` | `skill-loader` | The execution ledger is a prose artifact. | Kept execution notes and provenance concise and factual. |
| `humanizer` | `skill-loader` | The execution ledger is prose. | Kept the ledger direct and free of unsupported claims. |
| `reviewable-pr-workflow` | `prompt-required` | Execution requires a stack-split check before PR creation. | Loaded the stack-split signals and will apply them to the completed slice. |
## Source and repository evidence
- The request authorizes planning the deterministic collector deferred in PR #105.
- `plans/pr-validate-clarity/plan.md` names `collect.mjs` and records the original deferral trigger: repeat GitHub thread queries or token-cache rewrites above 150k in later benchmark runs.
- `dot_pi/agent/exact_prompts/pr-validate.md` Phase 2 defines the existing evidence set: PR metadata, full diff, inline and top-level comments, review bodies, review-thread resolution and outdated state, CI checks, and one scratch `evidence.json`. It also requires the prompt to report unavailable sources and treat PR content as untrusted.
- `dot_pi/agent/package.json` uses Node.js ESM, `node:test`, and focused npm test scripts. `dot_pi/agent/exact_scripts/pr-validate-report/render.test.mjs` shows the nearby executable-CLI test pattern.
- `gh` 2.102.0 supports `gh pr view --json`, `gh pr diff`, `gh pr checks --json`, paginated REST with `gh api --paginate`, and paginated GraphQL. `gh pr checks` returns code 8 when checks are pending; preserve the pending state as data.
- Repository instructions route `gh` identity by organization. The prompt must select and restore the required account; the collector must not change global authentication state.
- The advisory learning lookup returned no matching sections. No applicable ADR was found.
## Feasibility
| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| PR metadata and changed files | `gh pr view <URL> --json` with the fields required by Phase 2 | `gh pr view --help` lists `title`, `body`, `author`, `state`, base/head refs and OIDs, labels, additions, deletions, files, and URL | Fake `gh` CLI fixture plus a read-only smoke run on PR #105 | Record the source error in the envelope and continue with other available sources. |
| Full PR diff | `gh pr diff <URL>` with chunked buffer collection (or explicit 50 MiB `maxBuffer`) | The existing prompt requires the full diff; `gh pr diff --help` confirms the command accepts PR URLs; large diffs exceed Node's default 1 MiB buffer | Fake `gh` output fixture with large diff; smoke output contains the returned diff | Record a source gap; do not mark the diff complete. |
| Inline comments, top-level comments, review bodies | Paginated read-only REST endpoints through `gh api --paginate` | `gh api --help` documents pagination; the existing prompt names all three categories and their required author, URL, path, line, and thread fields | Fixtures include multiple pages and source records; smoke output records available fields | Record a source gap for the affected collection. |
| Review thread resolution and outdated state | Paginated `gh api graphql` query for `reviewThreads` and the comment identifiers needed to join thread state to REST records | `gh api --help` documents GraphQL pagination; the prompt requires `reviewThreads` and unknown state when unavailable | Fixtures cover resolved, unresolved, outdated, and unavailable states | Mark thread state unknown and record the failed query; do not infer it. |
| CI checks | `gh pr checks <URL> --json bucket,completedAt,description,event,link,name,startedAt,state,workflow` | `gh pr checks --help` lists JSON fields and documents exit code 8 for pending checks; `gh` requires explicit field arguments | Fixtures cover completed checks and exit code 8 with pending JSON output | Preserve pending data; record other source failures without suppressing other evidence. |
| Scratch evidence file | Redirect collector JSON stdout to the existing scratch `evidence.json` under `umask 077` | The prompt allows this file and already reads it in slices | Prompt test pins the scratch path and collector invocation; live smoke inspects the file | Stop before writing outside the permitted scratch directory. |
## Implementation Contract
**Components Affected:**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Collector CLI | `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs` | Parse a GitHub PR URL, run a fixed set of read-only `gh` calls, normalize records, and emit a versioned JSON envelope | `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` |
| Collector tests | `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` | Exercise the public CLI with a fake `gh` executable and fixtures; test source failures without network access | `npm run test:pr-validate-collector` |
| Package test wiring | `dot_pi/agent/package.json` | Add the focused collector test to `npm test` | `npm test` |
| Review prompt and prompt tests | `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` | Invoke the collector once and use its evidence file for GitHub sources; keep context-dependent external queries in the prompt | `npm run test:prompts` |
**Key Decisions:**
- Collect GitHub sources only. Keep Datadog, Atlas, and DDCI-specific MCP queries in the review flow because they depend on findings and external context.
- Use the installed `gh` CLI rather than raw HTTP or a new API dependency. Keep calls read-only and noninteractive.
- The collector prints JSON to stdout. The prompt runs `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/pr-validate-report/collect.mjs" "$PR_URL"` and redirects stdout to its one scratch `evidence.json` under a restrictive umask. The script itself writes no files.
- Add `schemaVersion: 1` and source-status fields so the prompt can distinguish complete evidence from unavailable sources. Keep the collector schema separate from the renderer's report input schema.
- Run a fixed set of independent GitHub queries concurrently. Paginate list endpoints to completion. Do not retry failed requests or silently truncate results.
- A valid invocation emits an envelope even when individual sources fail; set `collection.status` to `partial` and mark each affected source unavailable. Exit zero when the envelope is produced; the JSON status reports source gaps. Invalid input fails before any `gh` call. The review can then report coverage gaps as the existing prompt requires.
- Keep the active `gh` identity under prompt/repository guidance. The collector never switches accounts or refreshes credentials.
**Implementation Constraints:**
- Accept canonical GitHub PR URLs with an optional trailing slash, query, or fragment. Extract and validate owner, repository, and a positive PR number, then construct the canonical URL passed to `gh`. Reject other hosts and path shapes before invoking `gh`.
- Keep the existing read-only HARD-GATE in `pr-validate.md`. The collector must not call GitHub mutation endpoints, execute PR-supplied text, or inspect a review worktree.
- Normalize only evidence fields needed by the prompt: PR metadata and diff; comment/review author login and API author type; URL; path and line when present; body for adjudication; and thread resolved/outdated state or `unknown`.
- Keep comment bodies in the scratch evidence file for review comparison. Do not render them in the report or chat summary.
- Limit concurrent child processes to the fixed GitHub source set. Collect child process stdout chunks via `spawn` or configure an explicit 50 MiB `maxBuffer` on `execFile` to avoid stdio buffer exhaustion on large diffs. A single PR's evidence size grows with its diff and comment history; do not add a second cache or silently drop records to reduce size.
- If tests fail on unchanged `origin/main`, stop and report before implementation. Install test dependencies with `npm ci --ignore-scripts` before verification and remove disposable `node_modules` after the required tests finish.
**Security Requirements:**
- Treat the PR URL, title, body, diff, comments, and API error text as untrusted data. Validate the URL before using parsed owner, repository, or number in CLI arguments; pass each argument separately without a shell.
- Run only read-only `gh` operations. Do not print credentials, include environment secrets in error output, switch auth state, or write evidence outside the permitted scratch directory.
- Set `umask 077` and mode `0700` on the scratch directory before redirecting evidence. Do not include comment bodies in the rendered report.
**Observability Requirements:**
- No runtime telemetry applies to this local one-shot command. Observable collection status belongs in the JSON envelope: each source is `complete` or `unavailable`, and thread state is `unknown` when GraphQL evidence is missing.
- Diagnostics go to stderr; the JSON evidence envelope goes to stdout. Report only stable source names and error codes, not raw `gh` stderr or API error bodies. A valid collection with source gaps remains machine-readable.
**Failure Modes to Handle:**
| Failure | Expected behavior | Verification |
|---|---|---|
| Invalid or unsupported PR URL | Exit nonzero before invoking `gh`; write no JSON evidence | Fake `gh` records no invocation |
| One GitHub source fails | Emit the other available evidence and mark that source unavailable with a safe diagnostic | Fake `gh` exits nonzero for one source |
| GraphQL thread query fails | Keep comments; mark thread state `unknown` and record the source gap | GraphQL fixture failure case |
| CI checks are pending | Preserve check data as pending even when `gh` exits 8 | Fake `gh` returns pending JSON and code 8 |
| All GitHub sources fail for a valid URL | Emit a valid envelope with all source states unavailable so the prompt can report the coverage gap | Fake `gh` fails each command |
| GitHub API pages contain multiple records | Include every page in source order and do not duplicate records | Multi-page fake `gh` fixtures |
| Collector command is absent or authentication is unavailable | Emit per-source failure status; do not refresh credentials or change identity | Fake `gh` command failure and live smoke failure path |
**Rollout and Rollback:**
- Apply only these explicit target files with `chezmoi --source "$PWD" apply`: `~/.pi/agent/prompts/pr-validate.md`, `~/.pi/agent/scripts/lifecycle-prompts.test.mjs`, `~/.pi/agent/scripts/pr-validate-report/collect.mjs`, `~/.pi/agent/scripts/pr-validate-report/collect.test.mjs`, and `~/.pi/agent/package.json`.
- Run one read-only `/pr-validate` review and confirm that the scratch evidence file contains the required GitHub sources and the prompt does not query those sources again.
- Roll back by reverting the implementation commits and applying the same five explicit target files. Owner: Matteo Ruina.
**Test Strategy:**
- Collector CLI contract → invoke the public Node CLI with a fake `gh` placed first in `PATH`; assert output JSON, normalized fields, pagination, source statuses, exit codes, and no writes beyond stdout.
- GitHub system boundary → fake the `gh` process, not internal collector functions. Fixtures cover metadata, diff, REST comments/reviews, GraphQL thread state, CI checks, pending status, and command failures.
- Prompt integration → extend existing `lifecycle-prompts.test.mjs` markers to require one collector invocation before worktree creation, use its `headRefOid` in Phase 1 and its `evidence.json` in review, and remove all duplicate GitHub evidence queries; assert external-query rules remain.
- Live smoke → use the correctly routed GitHub account for `https://github.com/maruina/dotfiles/pull/105`, capture stdout only in the permitted scratch file, and inspect the envelope. Restore the prior account after the smoke run.
- Focused pre-implementation command: `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`; the new tests must fail before `collect.mjs` exists, then pass after implementation. Invalid URL cases exit nonzero; valid partial envelopes exit zero with `collection.status: "partial"`.
- Focused commands: `npm run --prefix dot_pi/agent test:pr-validate-collector`, `npm run --prefix dot_pi/agent test:prompts`, and `npm run --prefix dot_pi/agent test:pr-validate-report`.
- Package verification: `npm ci --ignore-scripts`, `npm test`, and `npm run test:all` from `dot_pi/agent`; remove `dot_pi/agent/node_modules` after both full test commands complete.
## Acceptance criteria
### Requirement: The collector emits one normalized GitHub evidence envelope
The collector SHALL accept a valid GitHub PR URL and emit versioned JSON containing the PR metadata, full diff, inline comments, top-level comments, review bodies, review-thread states, and CI checks. It SHALL use only read-only `gh` commands.
#### Scenario: A PR has available GitHub evidence
- GIVEN fixture responses for each GitHub source, including multiple pages of comments
- WHEN `node dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs https://github.com/example-org/example-repo/pull/42` runs
- THEN stdout contains one `schemaVersion: 1` JSON envelope with every fixture record and normalized required fields
- AND the fake `gh` observes only read-only calls
- **Traces to:** Slice 1, Task 1
### Requirement: Unavailable GitHub evidence remains explicit
The collector SHALL represent source failures and pending checks without treating missing evidence as complete.
#### Scenario: A thread source fails and checks are pending
- GIVEN REST comment fixtures, a failed GraphQL thread query, and pending check JSON with exit code 8
- WHEN the collector runs
- THEN it includes the comments, marks thread state unknown with a source gap, and preserves checks as pending
- **Traces to:** Slice 1, Task 1
#### Scenario: All sources fail for a valid PR URL
- GIVEN a valid URL and a fake `gh` that fails every source command
- WHEN the collector runs
- THEN stdout contains a valid envelope with each source marked unavailable
- AND stderr contains no credential values
- **Traces to:** Slice 1, Task 1
#### Scenario: An invalid PR URL is rejected
- GIVEN an invalid URL
- WHEN the collector runs
- THEN it exits nonzero before invoking `gh` and emits no evidence JSON
- **Traces to:** Slice 1, Task 1
### Requirement: `/pr-validate` uses the collector for GitHub sources
The prompt SHALL invoke the collector once after verifying the base repository and before preparing the review worktree. It SHALL use the collected `headRefOid` in Phase 1 and read the scratch `evidence.json` for GitHub metadata, diff, comments, review threads, and checks. It SHALL make no separate GitHub evidence queries and SHALL continue to collect external evidence when review context requires it.
#### Scenario: The review uses one GitHub collection
- GIVEN the `/pr-validate` prompt tests
- WHEN `npm run test:prompts` runs
- THEN markers confirm one collector invocation before worktree creation, use of its `headRefOid`, the evidence file path, no duplicate GitHub evidence queries, and retention of external-query guidance
- **Traces to:** Slice 2, Task 2
## Proposed vertical slices
### Slice 1: GitHub evidence collector
Delivers: A standalone CLI emits one versioned, normalized GitHub evidence envelope, including explicit source gaps.
#### Task 1: Add the read-only evidence collector
**Delivers:** A tested Node.js CLI collects the prompt's GitHub evidence set with `gh` and represents partial source failures explicitly.
**Blocked by:** None
**Traces to:** Requirements "The collector emits one normalized GitHub evidence envelope" and "Unavailable GitHub evidence remains explicit".
**Files:** `dot_pi/agent/exact_scripts/pr-validate-report/collect.mjs`, `dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs`, `dot_pi/agent/package.json`.
- [x] Add focused fake-`gh` tests for valid input variants, normalized successful sources, pagination, pending checks (exit code 8), one-source failures, all-source failures, large diff buffer handling, CLI `--help`, and invalid URLs; run `node --test dot_pi/agent/exact_scripts/pr-validate-report/collect.test.mjs` and confirm the tests fail before implementation.
- [x] Implement the smallest CLI using standard-library process APIs with stream/buffer safety for large outputs; emit one JSON envelope to stdout and diagnostics to stderr.
- [x] Add `test:pr-validate-collector` to `dot_pi/agent/package.json` and include it in `npm test`.
- [x] Run `npm run --prefix dot_pi/agent test:pr-validate-collector`; all 10 collector cases pass.
- [x] Refactor only after green, then rerun the focused collector tests. No refactor was needed; the final focused run passed.
Execution note: The initial fake-`gh` call log used concurrent read-modify-write updates and raced. The fixture now appends each invocation atomically, and all 10 tests pass. GitHub GraphQL exposes thread `isOutdated` and comment `outdated` at different levels; the query uses each field at its documented level. The collector marks review-thread evidence unavailable when nested comment pagination would otherwise truncate records. Applied the three explicit chezmoi targets and confirmed each target matches the source. A post-commit `git diff --check` found an extra blank line at the end of `collect.test.mjs`; removed it before updating the draft PR.
- [x] Commit with `feat(pi): add deterministic PR evidence collector`.
### Slice 2: Use collected evidence in the review
Delivers: `/pr-validate` reads one GitHub evidence file and keeps external evidence collection in the prompt.
#### Task 2: Replace repeated GitHub collection with one collector invocation
**Delivers:** The review prompt creates the evidence file from one collector run and does not repeat those GitHub queries during analysis.
**Blocked by:** Task 1
**Traces to:** Requirement "/pr-validate uses the collector for GitHub sources".
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs`.
- [ ] Add prompt markers for collector invocation before worktree creation, `headRefOid` reuse, handling of missing `headRefOid`, redirected evidence path, absence of duplicate GitHub evidence queries, and retained external-query instructions; run `npm run --prefix dot_pi/agent test:prompts` and confirm the new markers fail.
- [ ] Update Phase 1 and Phase 2 to run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/pr-validate-report/collect.mjs" "$PR_URL"` once after base-repository verification and before worktree creation, extract `headRefOid` (halting with a coverage gap if missing), create/use the permitted scratch directory with mode `0700` and `umask 077`, and read the evidence in slices. Remove separate GitHub evidence queries while preserving account routing and external queries.
- [ ] Run `npm run --prefix dot_pi/agent test:prompts`; expect all prompt markers to pass.
- [ ] Run a read-only collector smoke test against PR #105 under the `maruina` GitHub account, then restore the previous active account. Inspect metadata, diff, comments, threads, checks, and source statuses in the scratch envelope.
- [ ] Run `npm run --prefix dot_pi/agent test:pr-validate-collector` and `npm run --prefix dot_pi/agent test:pr-validate-report`; expect both to pass.
- [ ] Commit with `feat(pi): use evidence collector in /pr-validate`.
#### Task 3: Check documentation and future-agent guidance
**Delivers:** User-facing prompt instructions and agent guidance describe the collector's current contract.
**Blocked by:** Task 2
**Traces to:** Medium-plan documentation and future-agent guidance requirement.
**Files:** `dot_pi/agent/exact_prompts/pr-validate.md`, `AGENTS.md` (check only), `dot_pi/agent/AGENTS.md` (check only).
- [ ] Check both `AGENTS.md` files for durable collector workflow, auth-routing, or testing guidance (a non-code inspection task; automated failing test not practical). Update only if they contain a relevant durable command or trap; otherwise record why no change is needed.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Commit documentation changes only if this task makes a change, using a Conventional Commit message.
### Final verification
- [ ] Run `npm ci --ignore-scripts` in `dot_pi/agent` before package verification.
- [ ] Run `npm run test:pr-validate-collector`, `npm run test:prompts`, and `npm run test:pr-validate-report`; expect all focused suites to pass.
- [ ] Run `npm test` and `npm run test:all`; expect both to pass, then remove disposable `dot_pi/agent/node_modules`.
- [ ] Run a read-only collector smoke test against PR #105 using the correct GitHub account, inspect the single scratch evidence file, and restore the original account.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Confirm the feature-level criteria: the evidence envelope contains the available required GitHub sources with explicit gaps, and `/pr-validate` uses that file for Phase 1 metadata and later review without repeating GitHub evidence queries.
## Documentation impact
The prompt and collector `--help` document the workflow and CLI contract. Check `AGENTS.md` and `dot_pi/agent/AGENTS.md` for durable auth-routing, command, or testing guidance; update them only if the collector adds a reusable rule. Do not change renderer documentation.
## Learning candidates
None.