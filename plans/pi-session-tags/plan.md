# Session Tags Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store human-assigned tags as custom entries in session files and retrieve sessions by tag, through `/tag`, `/tags`, and a deferred `search_sessions_by_tags` tool.
**Smallest user-feedback slice:** The complete extension: tag a session, list tags, and answer "what did we decide in sessions tagged X?" from a fresh session, end to end.
**Out of Scope:** Interactive resume-by-tag picker; tag-name completion via `getArgumentCompletions`; per-session active-branch reconstruction during the scan; session-start-warmed scan index; tag statistics over time; changes to upstream pi; free-text search inside the tool (`rg` covers it).
**Architecture:** One single-file pi extension (`session-tags.ts`, no dependencies beyond the already-installed `typebox`) that appends `pi.session-tags` custom entries, reconstructs the current set from `sessionManager.getBranch()` on `session_start`, and scans the whole sessions tree on demand. The tool answers "which sessions"; the agent reuses `rg` and file reads for "what is in them".
**Tech Stack:** TypeScript (pi extension via jiti), TypeBox schemas, node:test with `--experimental-strip-types`, chezmoi.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | plan prompt supplies a worktree path | absolute path existed; context switched to the worktree |
| `skill-loader` | `prompt-required` | planning stage | selected the skills below |
| `learning-lookup` | `prompt-required` | advisory lookup before planning decisions | ran the lookup (`pi extension`, `session`, `typescript`); one section returned, about untrusted identity in storage paths — not applicable (tags are validated `[a-z0-9-]` strings, no untrusted path components); no learning guidance applied |
| `chezmoi` | `skill-loader` | changes under chezmoi source | `exact_` prefix semantics, `--source "$PWD"` from worktrees, `npm ci --ignore-scripts` test loop |
| `codebase-research` | `skill-loader` | pi extension area | staged discovery: API declarations in pi 0.80.6 dist, `cost-optimization.ts` test seam, live session tree facts |
| `write` | `skill-loader` | plan is a prose artifact | clarity rules applied while drafting this plan |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | `prompt-required` | `/execute` requires resolving the plan path | resolved to the owning worktree `/Users/ruio/src/.worktrees/dotfiles/pi-session-tags` |
| `feature-worktree` | `prompt-required` | execute worktree policy | confirmed the plan's branch worktree already exists and is on `maruina/pi-session-tags`, not main |
| `skill-loader` | `prompt-required` | execution skill selection | no TypeScript skill exists; the extension follows repo precedent (`cost-optimization.ts` / `user-context.ts`); loaded `chezmoi` for the source-tree apply steps |
| `chezmoi` | `skill-loader` | changes under chezmoi source + Task 4 apply | `exact_` prefix semantics (top-level `*.ts` are entrypoints, colocated `.mjs` not auto-discovered), `--source "$PWD"` diff/apply from the worktree, explicit-target diffs to avoid directory-target drift |

## Implementation Contract

**Components Affected:**

| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Extension | `dot_pi/agent/exact_extensions/session-tags.ts` (new) | Pure functions (parse, branch reconstruction, scan, match, format) plus a thin default factory registering `/tag`, `/tags`, the `session_start` handler, and the `search_sessions_by_tags` tool | `node --experimental-strip-types --test exact_extensions/session-tags.test.mjs`; manual round-trip |
| Tests | `dot_pi/agent/exact_extensions/session-tags.test.mjs` (new) | Cover parsing, match semantics, scan fixtures, truncation, corrupt-file skip, scan-root selection, and the registered tool via a mocked `ExtensionAPI` | The same focused test command |
| npm scripts | `dot_pi/agent/package.json` (modify) | Register the test file in `test:unit` and add a `test:session-tags` script (convention from `test:compute-guardrails`) | `npm test` and `npm run test:all` in `dot_pi/agent` |
| Plan | `plans/pi-session-tags/plan.md` (this file) | Task tracking and provenance | Committed with the plan message |

**Key Decisions:**

- Scan scope is the **whole sessions tree** (user-confirmed Option A): scan root is `dirname(sessionDir)` when `usesDefaultSessionDir()` is true, else `sessionDir` itself, walked recursively for `*.jsonl`. Rationale: one project's sessions live under several cwd slugs (main checkout plus worktrees), and retrieval happens from a fresh session whose cwd can differ from the tagged sessions' cwd. A per-cwd scan would miss both.
- Storage is a custom entry `pi.appendEntry("pi.session-tags", { tags: string[] })`; the `pi.` prefix follows the `pi.virtual-model-state` convention. Latest entry on the active branch wins; an entry with an empty `tags` array clears the set.
- Invalid tags are **rejected with an error notification listing them**, not silently dropped: a tag that does not match `[a-z0-9][a-z0-9-]*` after lowercasing makes the command a no-op. Silent drops would lose input invisibly.
- The scan takes the last `pi.session-tags` entry in file order, not each session's active branch (deliberate simplification from the design; upgrade path recorded there).
- The extension imports `Type` from `"typebox"` (cost-optimization precedent); `typebox@1.1.38` is a hoisted dependency in `package-lock.json`, so it resolves after `npm ci --ignore-scripts` and in `~/.pi/agent/node_modules`.

**Implementation Constraints:**

- Top-level `dot_pi/agent/exact_extensions/*.ts` files are auto-discovered entrypoints; only the extension factory lives there. The colocated test is a `.mjs` file, so it is not auto-discovered (four such colocated tests already exist).
- Reconstruct state only from `ctx.sessionManager.getBranch()` on `session_start` (fires for `startup`, `reload`, `new`, `resume`, `fork`); keep the current tag set in a module variable refreshed by that handler, never accumulated across sessions.
- Tagging before the first user message is allowed: `appendEntry` writes to in-memory entries and the tags persist when the session file is created. A session that never persists has no file, so there is nothing to find — acceptable.
- Start nothing at factory time (no timers, watchers, processes); the scan runs only inside `/tags` and the tool.
- Pin assumptions to the installed pi 0.80.6 declarations: `ctx.ui.input(title, placeholder?)` resolves to `string | undefined` (cancel → no change); command handlers receive `(args: string, ctx: ExtensionCommandContext)`; `ctx.sessionManager` is a `ReadonlySessionManager` on both command and tool contexts.
- Stop conditions: if the API surface above differs at implementation time (compile errors against the pinned declarations), stop and re-verify against `dist/core/extensions/types.d.ts` before improvising.

**Security Requirements:**
- The tool returns file paths, names, dates, and tags only — never session content; retrieval adds no read scope beyond what `bash`/`read` already have. Session files can contain secrets; the agent reading returned files has the same exposure as `/resume` plus manual copy.
- Tag validation (`[a-z0-9][a-z0-9-]*` after lowercase) keeps tags safe to interpolate into later `rg` invocations.

**Observability Requirements:**
- `/tag` and `/tags` results appear as `ctx.ui.notify` notifications; scan failures surface as tool error results; skipped-file counts appear in the tool `details`. No metrics or alerts: personal, on-demand tool.

**Failure Modes to Handle:**
- Corrupt or concurrently written session file (partial last line): per-line parse; a file with any unparseable line or missing/invalid header is skipped entirely and counted in `skipped`; the scan never fails wholesale.
- Unpersisted session (no file yet): `/tags` and the tool simply do not see it; `/tag` still works in memory.
- Empty `tags` parameter array: the TypeBox schema enforces `minItems: 1`; the handler also returns an error result if reached with an empty array.
- A tag entry on an abandoned branch surfacing in scan results: accepted deliberate simplification; visible as an unexpected file in the returned list.

**Rollout and Rollback:**
- Smallest safe rollout: targeted apply from the worktree (`chezmoi --source "$PWD" apply ~/.pi/agent/extensions ~/.pi/agent/package.json`), smoke-check with `npm run test:smoke` in `~/.pi/agent`, then restart pi. After merge, `chezmoi apply` from the main checkout reaches both profiles (`.chezmoiignore` does not gate `exact_extensions/`).
- Fastest safe rollback: revert the commit and re-apply (or remove `~/.pi/agent/extensions/session-tags.ts`), restart pi. Stored `pi.session-tags` entries remain inert: unknown `customType` entries are ignored.
- Owner: this dotfiles repository.

**Test Strategy:**

| Requirement | Interface | Seam |
|---|---|---|
| Parsing and validation | `parseTags` pure function | Direct import in `session-tags.test.mjs` |
| Branch reconstruction | `tagsFromBranch` pure function over entry arrays | Direct import |
| Scan semantics (latest wins, empty clears, untagged skipped, newest first, name fallback) | `scanSessions` over fixture JSONL trees in a temp dir | Direct import |
| Scan root selection (whole tree, custom `sessionDir`) | `resolveScanRoot` pure function | Direct import |
| Tool contract (all-tags match, `structuredContent` + `outputSchema`, 50-truncation, corrupt skip in `details`) | Registered tool `execute` against fixtures | Mocked `ExtensionAPI` with Maps (cost-optimization pattern) |
| Persistence across restart; agent retrieval via `tool_search` | Full pi process | Manual round-trip (automation impractical: requires interactive pi startup and a second session) |

The narrow command expected to fail before implementation: `node --experimental-strip-types --test exact_extensions/session-tags.test.mjs` fails with `ERR_MODULE_NOT_FOUND` for `./session-tags.ts` — not for `typebox` or a harness defect.

## Feasibility

| Requirement | Mechanism | Evidence it exists | Validation | If unavailable |
|---|---|---|---|---|
| Durable tag storage | `pi.appendEntry("pi.session-tags", { tags })` custom entries | pi 0.80.6 `dist/core/extensions/types.d.ts:1227`; `docs/session-format.md` custom entries; `pi.virtual-model-state` precedent | Fixture-file unit test + manual restart round-trip | Verified |
| Reconstruction on start | `session_start` handler + `ctx.sessionManager.getBranch()`, last entry wins | `ReadonlySessionManager.getBranch` in `dist/core/session-manager.d.ts:178`; `docs/extensions.md` § State | Mocked-branch unit test | Verified |
| `/tag`, `/tags` commands | `pi.registerCommand(name, { description, handler })` | `types.d.ts:1188`; no existing `/tag`/`/tags` collision (checked all extensions) | Handler invocation with mocked `ctx.ui` | Verified |
| Edit dialog | `ctx.ui.input(title, placeholder?) → Promise<string \| undefined>` | `types.d.ts:78` | Manual (dialog is UI) | Verified |
| Deferred search tool | `registerTool` with `exposure: "deferred"`, TypeBox `parameters`, `outputSchema`, `structuredContent` result | `types.d.ts:388,462,466,951`; `docs/extensions.md:159` (`tool_search` finds deferred tools); no `search_sessions_by_tags` collision | Unit test executing the tool; manual `tool_search` round-trip | Verified |
| Whole-tree scan | Recursive `*.jsonl` walk; root from `usesDefaultSessionDir()` / `dirname(getSessionDir())` | `dist/core/session-manager.js:773` (`getSessionDir` is per-cwd); live tree: 257 files across 13 slugs | Fixture-tree unit test | Verified |
| TypeBox import resolves | `import { Type } from "typebox"` | `typebox@1.1.38` hoisted in `dot_pi/agent/package-lock.json`; `cost-optimization.ts:6` precedent | Focused test after `npm ci --ignore-scripts` | Verified |

## Scope

### Requirement R1: Tag persistence and reconstruction
The extension SHALL store the session's tag set as a `pi.session-tags` custom entry and SHALL reconstruct the current set from the last such entry on the active branch at `session_start`.

#### Scenario: Restart round-trip
- GIVEN a session tagged with `/tag cla,controllers`
- WHEN pi restarts and the session resumes
- THEN `/tag` (no arguments) opens the dialog prefilled with `cla, controllers`

#### Scenario: Latest entry wins
- GIVEN a branch carrying two `pi.session-tags` entries (`cla`, then `cla,controllers`)
- WHEN tags are reconstructed
- THEN the current set is `["cla", "controllers"]`

### Requirement R2: Tag input parsing and validation
`/tag <comma-separated list>` SHALL replace the tag set with the parsed list: trim whitespace, deduplicate, lowercase; tags SHALL match `[a-z0-9][a-z0-9-]*`. Tags that fail validation SHALL be rejected with an error notification listing them, appending no entry. An empty submission SHALL clear the tags.

#### Scenario: Parse and normalize
- GIVEN no stored tags
- WHEN the command `/tag Cla, controllers, cla` runs
- THEN the stored set is `["cla", "controllers"]` and a notification shows it

#### Scenario: Invalid tags rejected
- GIVEN no stored tags
- WHEN the command `/tag cla, con&trollers` runs
- THEN no entry is appended and an error notification lists `con&trollers`

### Requirement R3: Interactive tag editing
`/tag` with no arguments SHALL open `ctx.ui.input("Session tags", current.join(", "))`. Cancel SHALL change nothing; an unchanged resubmission SHALL append no entry; an empty submission SHALL clear the tags.

#### Scenario: Cancel
- GIVEN the dialog opened with existing tags
- WHEN the user cancels (resolve `undefined`)
- THEN the tag set is unchanged and no entry is appended

#### Scenario: No-change resubmit
- GIVEN the dialog opened with `cla, controllers`
- WHEN the user submits `cla, controllers`
- THEN no entry is appended

### Requirement R4: Tag listing
`/tags` SHALL scan the sessions tree once and print each tag with its matching sessions (name or first-user-message fallback truncated to one line, date, path), newest first, under a header counting all scanned sessions and tagged sessions. Untagged sessions SHALL never be listed.

#### Scenario: Session carrying two tags
- GIVEN one session tagged `cla, controllers` and 213 untagged sessions
- WHEN `/tags` runs
- THEN the header reads `Tags across 214 sessions (1 tagged):` and that session appears under both `cla` and `controllers`, with name, date, and path

#### Scenario: Unnamed session fallback
- GIVEN a tagged session with no `session_info` name and first user message "how do we structure the cla controller package?"
- WHEN `/tags` runs
- THEN the listing shows `(no name) "how do we structure the cla controller package?"` truncated to one line

### Requirement R5: Cross-session search tool
The extension SHALL register `search_sessions_by_tags` (deferred exposure) taking a required non-empty `tags: string[]`; a session matches when it carries **all** given tags. Results SHALL be newest first as `structuredContent` conforming to an `outputSchema` (`{ file, name, date, cwd, tags }[]` plus a `truncated` flag), truncated at 50 sessions, with a compact text table as `content` and skipped/total counts in `details`. Files that fail to parse SHALL be skipped and counted, not fatal.

#### Scenario: All-tags match
- GIVEN sessions tagged `cla` only and `cla, controllers`
- WHEN the tool is called with `["cla", "controllers"]`
- THEN only the second session is returned, newest first

#### Scenario: Truncation and corrupt files
- GIVEN 60 matching sessions and one corrupt file in the tree
- WHEN the tool is called with the shared tag
- THEN 50 sessions are returned, `truncated` is true, and `details` reports one skipped file

### Requirement R6: Whole-tree scan scope
`/tags` and the tool SHALL scan the whole sessions tree: the parent of `sessionManager.getSessionDir()` under the default layout, or the custom `sessionDir` itself when one is configured, walked recursively.

#### Scenario: Worktree sessions visible
- GIVEN a session tagged `cla` whose file lives under a worktree cwd slug different from the asking session's slug
- WHEN the tool is called with `["cla"]`
- THEN that session's file is returned

#### Scenario: Custom sessionDir
- GIVEN `sessionDir` configured to a flat custom directory
- WHEN the scan root is resolved
- THEN the scan root is that directory itself

## Tasks

### Task 1: Red test suite
**Delivers:** A failing focused test file covering every acceptance scenario that is automatable.
**Blocked by:** None
**Traces to:** All requirements (R1–R6).
**Files:** `dot_pi/agent/exact_extensions/session-tags.test.mjs` (new)

- [x] `cd dot_pi/agent && npm ci --ignore-scripts` (repo convention; `node_modules` is gitignored and removed after the suite in Task 3).
- [x] Write `session-tags.test.mjs` with `node:test` + `assert/strict`: `parseTags` (normalize, dedupe, invalid list), `tagsFromBranch` (latest wins, empty clears, no entry), `resolveScanRoot` (default layout → parent, custom dir → itself), `scanSessions` over fixture JSONL trees in a temp dir (latest entry wins in file order, empty array clears, untagged files skipped, newest-first by header timestamp, `session_info` name and first-user-message fallback, corrupt file skipped and counted), match semantics (all tags required), truncation at 50, and the registered tool executed through a mocked `ExtensionAPI` (Maps for `registerTool`/`registerCommand`/`on`, per the `cost-optimization.test.mjs` pattern) asserting `structuredContent`, `outputSchema` presence, `content` table, and `details.skipped`.
- [x] Run `node --experimental-strip-types --test exact_extensions/session-tags.test.mjs`; expect failure with `ERR_MODULE_NOT_FOUND` for `./session-tags.ts` — not for `typebox` or a harness defect. Confirmed: `ERR_MODULE_NOT_FOUND: Cannot find module '.../exact_extensions/session-tags.ts'`; the harness and typebox resolution are fine.

### Task 2: Implement the extension
**Delivers:** `session-tags.ts` passing the focused test; tags stored, listed, and searchable.
**Blocked by:** Task 1
**Traces to:** R1–R6.
**Files:** `dot_pi/agent/exact_extensions/session-tags.ts` (new)

- [x] Implement the pure functions named by the tests (`parseTags`, `tagsFromBranch`, `resolveScanRoot`, `scanSessions`, plus match/format helpers) and the default factory: `/tag` (argument replace-set and dialog edit, no-change guard, empty-clears, invalid-tags error notification), `/tags` (listing in the design's exact output shape), `session_start` reconstruction into a module variable refreshed per event, and the `search_sessions_by_tags` tool with `Type`-built `parameters` and `outputSchema`, `exposure: "deferred"`.
- [x] Header comment documenting: the `pi.session-tags` custom entry contract, the whole-tree scan-root rule, and the deliberate file-order (not active-branch) scan simplification with its upgrade path.
- [x] Run `node --experimental-strip-types --test exact_extensions/session-tags.test.mjs`; expect all tests green. 24/24 tests pass.
- [x] Refactor only after green, then rerun the focused test. Refactor: hoisted tool parameters/outputSchema to named TypeBox constants and typed the execute handler against `Static`; reran → 24/24 still green. Deviation note: the plan pins the API surface to "installed pi 0.80.6", but the live `pi` CLI is 1.0.0 in this worktree's environment — the unit test install stays at the pinned 0.80.6 devDependency (deterministic), and I verified the live 1.0.0 dist declares every surface this extension needs (`ToolDefinition.exposure`, `outputSchema`, `AgentToolResult.structuredContent`, `SessionManager.usesDefaultSessionDir`), which the stale `^0.80.6` devDependency types do not. Implementation uses a documented `DeferredTool` cast for the tool registration and the full `SessionManager` type for the default-layout flag; `npx tsc --noEmit` against the installed devDependency is clean.

### Task 3: Register scripts, run the full suite, commit
**Delivers:** The extension wired into the repo's npm validation and committed green.
**Blocked by:** Task 2
**Traces to:** Repository conventions (`test:unit`, `test:compute-guardrails` pattern) and the design's validation section.
**Files:** `dot_pi/agent/package.json` (modify), Task 1–2 files

- [x] Add `"test:session-tags"` following the `test:compute-guardrails` script shape, and append `"$ext"/session-tags.test.mjs` to `test:unit`.
- [x] Run `npm test`; expect the whole unit suite plus prompt/skill/pi-deps validations to pass. 186 unit + 53 prompt + 45 skills + pi-deps, all green (24 session-tags tests included in unit).
- [x] Run `npm run test:all`; expect the same plus `test:smoke` to pass (no `[Extension issues]`). Smoke exit 0, no extension issues.
- [x] Remove `node_modules`: `rm -rf node_modules` (AGENTS.md convention).
- [x] Commit with `feat(pi): add session-tags extension`.

### Task 4: Targeted apply and manual round-trip
**Delivers:** End-to-end proof of the smallest user-feedback slice on the live machine.
**Blocked by:** Task 3
**Traces to:** R1 (restart persistence), R5 (agent retrieval via `tool_search`).
**Files:** none (validation only)

- [x] From the worktree root, run `chezmoi --source "$PWD" diff ~/.pi/agent/extensions ~/.pi/agent/package.json`; expect only the new extension, the new test file, and the two script changes. Run `chezmoi diff` against explicit target file paths — directory targets can hide drift (repo AGENTS.md). Diff on `session-tags.ts`, `session-tags.test.mjs`, `package.json` showed exactly the two new files and the `test:session-tags` + `test:unit` script lines.
- [x] `chezmoi --source "$PWD" apply ~/.pi/agent/extensions ~/.pi/agent/package.json`.
- [x] `cd ~/.pi/agent && npm run test:smoke`; expect exit 0 and no `[Extension issues]` (loads the applied extension). Exit 0, no `[Extension issues]`. Extra headless validation: the applied `scanSessions` parsed the real tree (258 files, 0 skipped) — the parser handles live pi session data.
- [ ] Restart pi. In any session, run `/tag cla,controllers`; expect a notification showing the stored set. Run `/tag`; expect the dialog prefilled `cla, controllers`. Restart pi again and resume the session; run `/tag`; expect the same tags (R1). Runtime fixes landed after the first manual check: (a) the fallback name is capped at 100 chars (R4 "truncated to one line"); (b) `/tag`'s dialog switched from `ctx.ui.input` to `ctx.ui.editor` — pi 1.0.0's input dialog cannot be prefilled (TUI ignores the placeholder; the runner drops any opts value, verified in the live bundle), and `editor(title, prefill)` is the declared prefill-capable dialog with the same cancel=undefined contract. Unit tests updated for `editor` (25 total); re-applied and re-smoke-passed. User confirmed the dialog prefills and `/tag` works in practice; restart-persistence recheck (R1) and the fresh-session `tool_search` query (R5) are the remaining manual items.
- [x] Run `/tags`; expect the listing shape from R4 with the tagged session present. Verified on the live tree (261 sessions, 1 tagged). Post-implementation change: the listing now shows the session id instead of the file path, because /resume's picker search matches session ids (and message text/cwd) but not file paths — the id is directly pasteable. Tool output keeps file paths for the agent. Test updated; re-applied and re-smoke-passed.
- [ ] In a fresh session, ask the agent "what did we decide in sessions tagged cla?"; expect it to find `search_sessions_by_tags` via `tool_search`, receive the prefiltered files, and answer from their content with `rg` and reads (R5). Worktree-slug sessions must be reachable (R6). Deferred tool alone is not discoverable: the design assumed agent `tool_search` discovery, but a deferred tool is invisible to the model, so the agent fell back to `rg` over the whole tree. Fix: `before_agent_start` returns a `display: false` context message (user-context.ts pattern) telling the agent tags exist and to load `search_sessions_by_tags` via `tool_search`. Test added (26 total); re-applied and re-smoke-passed.

### Task 5: Documentation check
**Delivers:** Future-agent guidance reviewed for gaps.
**Blocked by:** Task 3 (content only; independent of Task 4)
**Traces to:** Plan-stage documentation contract.
**Files:** none expected; update only if a gap is found

- [x] Review the dotfiles repo `AGENTS.md` (Pi Agent Development section) and the `chezmoi` skill: they already document the extension entrypoint rule, the `npm ci --ignore-scripts` loop, and `--source "$PWD"` worktree usage generically; the extension's header comment carries the session-tags-specific contracts (entry type, scan-root rule, scan simplification). Record any residual gap in the PR description instead of adding session-tags detail to `AGENTS.md`, which stays under 100 lines and generic.
- [x] If a review finding requires a file change, fix it and commit with `docs: record session-tags guidance`. No gap requiring a file change found; the extension's header comment plus the generic AGENTS.md rules cover the contracts.

## Validation

Focused command (worktree, `dot_pi/agent`, requires `npm ci --ignore-scripts` first):

```bash
node --experimental-strip-types --test exact_extensions/session-tags.test.mjs
```

Full suite: `npm test` then `npm run test:all`, then `rm -rf node_modules`. Feature-level acceptance that only the completed extension satisfies: the Task 4 manual round-trip (tag → restart → `/tag` shows the same set; `/tags` listing; second-session agent query answered via `tool_search` + `rg`).
