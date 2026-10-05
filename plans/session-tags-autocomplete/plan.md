# Session Tags Autocomplete Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/tag <args>` fuzzy autocomplete over the tags used across all sessions, without a session scan on each keystroke.
**Smallest user-feedback slice:** Type `/tag co`, see fuzzy-ranked tags from all sessions, select one, type `,`, and get completions for the next tag.
**Out of Scope:** On-disk index or cache file; completion inside the no-argument `/tag` editor dialog; live visibility of tags that concurrent pi processes set; changes to `/tags`, `search_sessions_by_tags`, or their skipped counts; fzf integration.
**Architecture:** Session files stay the only source of truth. At the first `session_start` of a process, the extension starts one background scan that builds an in-memory tag vocabulary (tag → session count) and only JSON-parses files that contain the `"pi.session-tags"` marker. The `tag` command's `getArgumentCompletions` awaits that scan, then ranks the vocabulary with pi-tui `fuzzyFilter`.
**Tech Stack:** TypeScript pi extension (pi 1.0.0 runtime), `@earendil-works/pi-tui` `fuzzyFilter`, Node `node:test` with `--experimental-strip-types`.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | /plan start | Selected `chezmoi`; no language skill matches TypeScript extensions. |
| `chezmoi` | `skill-loader` | Files under the chezmoi source change | Source paths, extension entrypoint contract, `npm ci`/`npm test` validation, apply workflow. |
| `learning-lookup` | `prompt-required` | Before feasibility decisions | Matched "Make the durable log the source of truth; treat on-disk copies as a warm cache": keep session files as truth; any future cache must be derived and rebuildable. |
| `feature-worktree` | `prompt-required` | Durable plan needs a feature worktree | Created `maruina/session-tags-autocomplete` from `origin/main` at `~/dd/.worktrees/dotfiles/maruina-session-tags-autocomplete`. |

## Context and evidence
- Prior design `plans/pi-session-tags/design.md` deferred "tag-name completion in `/tag` arguments" (lifted by this plan at user request) and rejected a sidecar index because pi deletes and forks session files without notifying extensions (kept).
- Pi API: `registerCommand(name, { getArgumentCompletions(argumentPrefix) })` returns `AutocompleteItem[] | null` or a Promise of it (`dist/core/extensions/types.d.ts`, `RegisteredCommand`). The editor calls it on each keystroke after `/tag ` with the full argument text, without an abort signal, and discards stale results. `applyCompletion` replaces the whole argument with `item.value` and adds no trailing character.
- `fuzzyFilter(items, query, getText)` from `@earendil-works/pi-tui` returns items unchanged for an empty query and is already used in `dot_pi/agent/exact_extensions/files.ts`. The pinned devDependency `0.80.6` exports it.
- Measured on the work laptop: 1001 session files, 470 MB. List and stat: about 15 ms. Read all: 0.6–1.4 s. Files with tags: 6.
- Usage pattern (user): tags are set at the end of a session, minutes after start. The background scan finishes long before the first `/tag` completion, so the await is a no-op in practice.
- Advisory learning: see `## Skills loaded and used`. No learnings matched autocomplete or fuzzy search.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Tag vocabulary scan | `dot_pi/agent/exact_extensions/session-tags.ts` | Read every `*.jsonl` under the scan root, skip files without the marker, apply the existing last-entry rule, count sessions per tag | `npm run test:session-tags` |
| `/tag` argument completion | `dot_pi/agent/exact_extensions/session-tags.ts` | Split the argument on the last comma, exclude typed tags, rank, cap, preserve earlier text | `npm run test:session-tags` |
| Tests | `dot_pi/agent/exact_extensions/session-tags.test.mjs` | Exercise completions through the registered command via `loadExtension()` | `npm run test:session-tags` |

### Key Decisions
- No new tags file. Session files remain the source of truth; the vocabulary is in-memory and rebuilt per process. Rationale: avoids the drift that the prior design rejected; measured scan cost is bounded and off the keystroke path.
- Warm at the first `session_start` of the process, not lazily. Rationale: the user tags at session end, so the scan is always complete by then. Later `session_start` events (new, resume, fork) reuse the same scan.
- Use pi-tui `fuzzyFilter`, not fzf. Rationale: fzf needs terminal control that conflicts with the pi TUI; `fuzzyFilter` is the native inline mechanism and is already a dependency.
- `getArgumentCompletions` awaits the scan promise. Rationale: deterministic tests and correct results if the user types `/tag` right after startup.
- Preparatory refactor: split `parseSessionFile` into a read step and a text-parse step so the vocabulary scan can test the marker before parsing. Behavior of `scanSessions` stays identical.

### Implementation Constraints
- Keep the tag extraction rule identical to `scanSessions`: the last valid `pi.session-tags` entry in file order wins; an empty array clears.
- Do not change `/tags`, `search_sessions_by_tags`, `scanSessions` output, or `skipped` counting.
- Completion input contract:
  - `argumentPrefix` is everything after `/tag `. The query is the text after the last comma, trimmed and lowercased.
  - Exclude tags that `parseTags` returns for the text before the last comma.
  - Before fuzzy filtering, order the vocabulary by session count descending, then tag name ascending.
  - Return at most 20 items. Each item: `label` = tag, `description` = `N session` / `N sessions`, `value` = text up to and including the last comma, plus the token's leading whitespace, plus the tag. Example: `cla, co` → `cla, controllers`.
  - Return `null` when no item matches, and before the first `session_start` (no vocabulary yet).
- The vocabulary includes the current session's tags and is updated after a successful `/tag` (new tags added; counts need not be exact for the current process).
- The warm-up scan settles its own failure: attach a catch when the scan starts and store an empty vocabulary plus the current session's tags, so the stored promise never rejects and no `unhandledRejection` can escape (pi registers no such handler; Node's default would crash the process). Do not rely on a later await in `getArgumentCompletions` to handle the rejection.
- Add `deliberate:` comments for: tags set by concurrent pi processes appear only after restart (upgrade path: refresh the vocabulary when `/tags` runs, or a derived mtime-keyed cache); the full read on startup (upgrade path: derived on-disk cache keyed by path, mtime, and size at about 10× the current session count).
- Update the file header comment of `session-tags.ts` to describe the completion scan.
- Stop and ask if the pi runtime does not call `getArgumentCompletions` for extension commands, or if `fuzzyFilter` is not importable at runtime.

### Security Requirements
None new. The scan reads the same local session tree that `/tags` already reads. Completions show only tag names, which match `[a-z0-9][a-z0-9-]*`.

### Observability Requirements
No metrics or logs: this is a personal local extension. A failed scan must not throw into the editor; completions fall back to the current session's tags. `/tags` continues to report scan errors, which makes a broken scan visible.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| Scan root missing or unreadable | Completions return the current session's tags only; no exception | Test with a nonexistent root |
| Corrupt or untagged session file | Untagged files are not parsed; a corrupt tagged file is skipped | Test with mixed files |
| `/tag` typed before the scan finishes | Completion awaits the scan, then returns results | Covered by tests that call completions immediately after `session_start` |
| Many tags | At most 20 items returned | Test with more than 20 tags |

### Rollout and Rollback
- Rollout: `chezmoi apply ~/.pi/agent/extensions/session-tags.ts`, then start a new pi process. Owner: Matteo.
- Rollback: revert the commit and run `chezmoi apply` for the same target.

### Test Strategy
- Highest supported interface: `commands.get("tag").getArgumentCompletions(prefix)` from the existing `loadExtension()` fake, after calling the registered `session_start` handler with a fake `sessionManager` (`getSessionDir`, `usesDefaultSessionDir`, `getEntries`) that points at a `mkdtemp` session tree written with the existing `writeSession` helper.
- Boundaries to mock: the pi `ExtensionAPI` and `sessionManager` (already faked in the test file). The file system is real (temp directories).
- Narrow command expected to fail before implementation: `cd dot_pi/agent && npm run test:session-tags` (fails because `getArgumentCompletions` is undefined).

## Acceptance criteria
### Requirement: Fuzzy tag completion
The `/tag` command SHALL return fuzzy-ranked tag suggestions from all sessions for the token after the last comma.

#### Scenario: First token
- GIVEN sessions tagged `controllers` (2 sessions), `cla` (1 session), and `cost` (1 session)
- WHEN completions are requested for `co`
- THEN the items include `controllers` and `cost` with session-count descriptions, `controllers` ranks first, and `cla` is absent

#### Scenario: Empty query
- GIVEN the same sessions
- WHEN completions are requested for an empty argument
- THEN the items list all tags ordered by session count, then name

#### Scenario: Later token keeps earlier text and excludes typed tags
- GIVEN the same sessions
- WHEN completions are requested for `cla, co`
- THEN each item value starts with `cla, `, and no item is `cla`

#### Scenario: No match
- GIVEN the same sessions
- WHEN completions are requested for `zzz`
- THEN the result is `null`

#### Scenario: Result cap
- GIVEN 25 distinct tags across sessions
- WHEN completions are requested for an empty argument
- THEN 20 items are returned

### Requirement: No per-keystroke scan
The extension SHALL scan the session tree at most once per process for completions and SHALL NOT JSON-parse files that lack the `"pi.session-tags"` marker.

#### Scenario: One scan across calls and session switches
- GIVEN `session_start` fired twice and completions were requested several times
- WHEN a new tagged session file is written to the root after the first scan
- THEN its tag does not appear in completions (proves no rescan)

#### Scenario: Marker prefilter keeps the extraction rule
- GIVEN a tagged file whose last tag entry is `["b"]` after `["a"]`, an untagged file with a corrupt line, and a corrupt tagged file
- WHEN completions are requested for an empty argument
- THEN the items are exactly `b`

### Requirement: Vocabulary stays current within the process
The vocabulary SHALL include the current session's tags and tags set with `/tag` in this process.

#### Scenario: Tag added in this session
- GIVEN a scanned vocabulary without `newtag`
- WHEN `/tag newtag` succeeds
- THEN completions for `new` include `newtag`

### Requirement: Scan failure degrades safely
Completions SHALL NOT throw when the scan fails.

#### Scenario: Missing root
- GIVEN a session manager whose scan root does not exist and current entries tagged `cla`
- WHEN completions are requested for `c`
- THEN the result contains `cla` and no error is thrown

## Tasks
### Slice 1: Fuzzy `/tag` completion from a per-process vocabulary
### Task 1: Tag vocabulary and `/tag` argument completion
**Delivers:** All acceptance scenarios above.
**Blocked by:** None
**Traces to:** Requirements "Fuzzy tag completion", "No per-keystroke scan", "Vocabulary stays current within the process", "Scan failure degrades safely"
**Files:** `dot_pi/agent/exact_extensions/session-tags.ts`, `dot_pi/agent/exact_extensions/session-tags.test.mjs`

- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts`.
- [ ] Add focused failing tests for every scenario through `getArgumentCompletions`, reusing `writeSession` and `loadExtension()`.
- [ ] Run `npm run test:session-tags`; expect the new tests to fail because `getArgumentCompletions` is undefined, and existing tests to pass.
- [ ] Split `parseSessionFile` into read and text-parse steps; run `npm run test:session-tags`; expect existing tests to pass.
- [ ] Implement the vocabulary scan, the once-per-process warm-up in `session_start`, the vocabulary update in the `/tag` handler, and `getArgumentCompletions` per the input contract, with the `deliberate:` comments and the header comment update.
- [ ] Run `npm run test:session-tags`; expect all tests to pass.
- [ ] Run `lsp_diagnostics` on `dot_pi/agent/exact_extensions/session-tags.ts`; expect no new errors.
- [ ] Refactor only after green, then rerun `npm run test:session-tags`.
- [ ] Commit with `feat(pi): fuzzy autocomplete for /tag arguments`.

### Task 2: Documentation and future-agent guidance
**Delivers:** Accurate docs for the new behavior.
**Blocked by:** Task 1
**Traces to:** Plan contract documentation requirement
**Files:** `dot_pi/agent/exact_extensions/session-tags.ts` (header comment, `/tag` command description), `AGENTS.md`, `dot_pi/agent/AGENTS.md`

- [ ] Confirm the `session-tags.ts` header comment and the `/tag` command description mention argument autocomplete.
- [ ] Review `AGENTS.md` and `dot_pi/agent/AGENTS.md`. Expected result: no change, because no durable command, trap, or procedure was added (the session-tags extension is not mentioned there). Record the outcome in the commit or PR description.
- [ ] Commit any change with `docs(pi): describe /tag autocomplete`.

## Final verification
- [ ] Run `cd dot_pi/agent && npm test && npm run test:all`; expect all pass and no `[Extension issues]` in the smoke output. Then remove `dot_pi/agent/node_modules`.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/extensions/session-tags.ts`; expect only the planned changes.
- [ ] Manual check (the TUI keystroke path has no automated seam): run `chezmoi --source "$PWD" apply ~/.pi/agent/extensions/session-tags.ts`, start a new pi, type `/tag co`, and expect a suggestion list with tags from other sessions; select one, type `,`, and expect suggestions for the next tag without already-typed tags. Cleanup: press Escape and clear the input.
