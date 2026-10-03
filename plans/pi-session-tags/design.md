# Session tags: tag pi sessions and retrieve them by tag

Date: 2026-10-02
Status: design, awaiting plan
Branch: `maruina/pi-session-tags`

## Summary
Pi sessions carry only a display name, so there is no way to group related sessions and rebuild context on a topic that spans many sessions over time. This design adds one personal extension, `session-tags.ts`, that stores human-assigned tags as custom entries in the session file (the documented mechanism for durable data excluded from model context), exposes a `/tag` command to set and edit them, a `/tags` command to list them, and a `deferred`-exposure tool that returns the files of sessions matching given tags. The agent uses that tool as a prefilter and then searches the returned files with `rg` and file reads. Tagging is the only new code; free-text search across sessions already works without an extension.

## Alignment brief

### Problem
Sessions are stored as JSONL files under `~/.pi/agent/sessions/<cwd-slug>/<timestamp>_<id>.jsonl`. The session header and the `session_info` entry carry no user-defined metadata besides a display name. Questions such as "what did we decide across all sessions tagged `renovate-incident`?" or "we discussed this in a session with tag `foo`" have no answer path: the session picker (`/resume`) cannot filter by user metadata, and the agent has no structured way to find a group of related sessions.

### User / audience
Matteo, personal profile only. Two consumers: Matteo interactively (tag a session, list tags, later resume a tagged session) and the agent in a future session (retrieve the file paths of sessions matching tags, then search their content).

### Goal
Human-assigned tags that are stored with the session file, survive session reload and restart, and can prefilter sessions by tag. After the prefilter, the agent reuses existing tools (`rg`, file reads) to answer questions about those sessions.

### Non-goals
- Changes to upstream pi. A `tags` field in the session header is not supported and this design does not write into the header.
- Free-text search inside the tool. `rg` over `~/.pi/agent/sessions/**/*.jsonl` already covers it; the tool returns files by tag only.
- Interactive picker that resumes a tagged session from a list. Deferred; revisit after the agent retrieval path proves useful.
- Automatic tag suggestions, tag hierarchies, cross-machine tag sync, tag-name completion in `/tag` arguments.
- Making tags visible in the `/resume` picker. That picker is pi-internal; an extension cannot extend it.

### Known facts and assumptions
Verified facts:
- Session format (pi docs, `session-format.md`): the `SessionHeader` has only `version`, `id`, `timestamp`, `cwd`, and `parentSession`. `SessionInfoEntry` (`/name`) carries only a name. A `CustomEntry` (`type: "custom"` with a `customType` string and a `data` field) is the documented mechanism for extension state that does not participate in LLM context.
- `ExtensionAPI` provides `appendEntry(customType, data)` for persistence, `registerCommand` for `/` commands, `registerTool` with `exposure: "deferred"` (callable and listed by `tool_search`, not declared to the model), and `ctx.ui.input(title, placeholder)` for a text dialog. Command handlers receive session-replacement operations; `session_start` handlers receive the session manager.
- State must be reconstructed from `ctx.sessionManager.getBranch()` during `session_start` because abandoned branches represent alternate histories (pi docs, `extensions.md` § State).
- Sessions are machine-local files; scanning about 1k files with `rg` measured at 0.3s on the work laptop.
- The existing personal extensions (`cost-optimization.ts`, `user-context.ts`, and others) are chezmoi-managed under `dot_pi/agent/exact_extensions/`, and some have a colocated `.test.mjs` file.

Assumptions:
- Tag vocabulary stays free-form; no controlled list is needed at personal scale.
- Sessions are machine-local; no sync requirement exists.

### Skills loaded and used

| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `learning-opportunities` | `prompt-required` | brainstorm coaching contract | question framing, one-question turns, pause discipline |
| `learning-lookup` | `prompt-required` | advisory guidance before design decisions | checked `Datadog/Learnings.md` for pi-extension and session-metadata terms; no matching sections, so no learning guidance was applied |
| `write` | `agent-selected` | design doc is a prose artifact | clarity rules applied while drafting this spec |

## Context reviewed
- Pi docs: `extensions.md`, `session-format.md`, `sessions.md`, `sdk.md`, `slash-commands.md`.
- `@earendil-works/pi-coding-agent` type declarations: `ExtensionAPI` (`registerCommand`, `registerTool`, `appendEntry`, `session_start`), `RegisteredCommand`, `ExtensionUIContext` (`input` dialog).
- `dot_pi/agent/exact_extensions/cost-optimization.ts` and `user-context.ts` as the local style reference for single-file personal extensions.
- `plans/ha-mcp-component/design.md` as the format reference for this document.

## Current behavior
- `/name` or `pi.setSessionName()` sets a display name shown in `/resume` instead of the first message. No other user-defined session metadata exists.
- `/resume` searches, renames, deletes, shows paths, sorts, and filters to named sessions. It has no tag or metadata filtering and cannot be extended by an extension.
- The agent can run `rg` and read files under `~/.pi/agent/sessions/` today, so free-text search across sessions works without changes. What does not exist is a structured, durable grouping key.

## Design overview
One file, `dot_pi/agent/exact_extensions/session-tags.ts`, with no npm dependencies, following the existing single-file extension pattern.

### Storage: custom entry
Tags are stored as a custom entry appended with `pi.appendEntry("pi.session-tags", { tags: string[] })`. The `customType` prefix `pi.` follows the existing convention (`pi.virtual-model-state`). Custom entries are part of the session tree, so a tag entry follows the active branch, and forks and branches inherit or drop it according to tree position.

On `session_start`, the extension reconstructs the current tags from `ctx.sessionManager.getBranch()`: take the last `pi.session-tags` entry on the branch, if any. An edit appends a new entry; the latest entry on the branch wins. No entry with an empty `tags` array means the session has no tags (an empty array clears the set rather than meaning "keep previous").

Deliberate simplification for the cross-session scan: when the tool or `/tags` reads other session files, it takes the last `pi.session-tags` entry in file order, not the entry on each session's active branch. Reconstructing the active branch of every scanned session would require walking each tree from its stored leaf. At 1k files this is disproportionate for a personal tool; the visible effect is that a tag set on a branch the session later abandoned can appear in scan results. Upgrade path: reconstruct per-session active branches if this ever causes wrong results.

### `/tag` command
- `/tag cla,controllers` replaces the session's tag set with the parsed comma-separated list. Trim whitespace, drop empty items, deduplicate, lowercase. Reject invalid characters by keeping the simple rule: tags match `[a-z0-9][a-z0-9-]*`.
- `/tag` with no arguments opens `ctx.ui.input("Session tags", current.join(", "))` so the current set is editable in place. Submitting an empty string clears the tags.
- Both paths append a `pi.session-tags` entry and show a notification with the stored set. A no-change resubmission appends no entry.

### `/tags` command
Scans the session directory once and prints each tag with its session count and, per session, the file's name (latest `session_info` entry, else the first user message), date, and path. Plain text output; no picker, no session switching.

### Search tool
`registerTool` with `exposure: "deferred"` and name `search_sessions_by_tags`. Parameters: `tags: string[]` (required, non-empty; a session matches when it carries all of the given tags). The tool:
1. Reads every `*.jsonl` under the session directory (from `ctx.sessionManager.getSessionDir()`, so a custom `sessionDir` setting is respected).
2. For each file, takes the last `pi.session-tags` entry in file order, plus the latest `session_info` name and the header `cwd` and timestamp.
3. Returns sessions matching all requested tags, newest first, as `structuredContent` with an `outputSchema`: `{ file, name, date, cwd, tags }[]`, truncated at 50 sessions with a `truncated` flag. The model-facing `content` is a compact text table of the same rows.

The agent then runs `rg` and file reads against the returned paths. That division is the point of the design: the tool answers "which sessions", the existing tools answer "what is in them".

## Smallest user-feedback slice
The first slice is the complete extension above: `/tag`, `/tags`, and the `deferred` search tool.

What the user sees: `/tag cla,controllers` stores tags; `/tag` edits them in a dialog; `/tags` lists tag to sessions; in a fresh session the question "what did we decide in sessions tagged cla?" resolves end to end.

What the user learns: whether tag-then-agent-retrieval answers cross-session questions in practice, and whether the free-form vocabulary holds up or wants completion and curation.

Why no smaller slice produces this feedback: `/tag` alone produces tags nothing can query; the search tool is where the stated goal lives or dies.

Deliberately deferred: the interactive resume-by-tag picker (session replacement from a matching-session list), tag-name completion via `getArgumentCompletions`, per-session active-branch reconstruction in the scan, and tag statistics over time.

Success criteria:
- Tag a session, restart pi, and `/tag` shows the same tags (branch reconstruction works).
- In a fresh session, ask the agent "what did we decide in sessions tagged X?"; the agent finds the tool via `tool_search`, receives the prefiltered files, and answers from their content with `rg` and reads.
- `/tags` output matches the tags stored by the search tool for the same files.

Validation:
- `session-tags.test.mjs` colocated with the extension, following the `cost-optimization.test.mjs` pattern: tag parsing (split, trim, dedupe, lowercase, invalid characters), match semantics (all tags required), scan behavior over fixture JSONL files (latest entry wins, empty array clears, files without tag entries are skipped), and truncation at 50 sessions.
- Manual round-trip: tag, restart, verify; agent query from a second session.

## Alternatives considered
- Sidecar index file (`~/.pi/agent/session-tags.json`, session id to tags). Genuine merit: one file to scan, no per-session parsing, and the scan cost does not grow with session count. Rejected because it drifts: pi deletes and forks session files without notifying extensions, so the index accumulates stale entries, and tags would live outside the artifact they describe. Custom entries keep storage and lifecycle tied to the session file.
- Tags embedded in the session name (`/name "tags:cla,controllers - refactor"`). Genuine merit: zero new code and immediate visibility in `/resume`. Rejected because it overloads a display field, breaks the moment a session is renamed, and is not queryable without the same scanning code the extension needs anyway.
- Upstream pi change adding a `tags` field to the session header. Genuine merit: every pi consumer could read tags natively, and `/resume` could filter by them. Rejected because it requires an upstream contribution with design review, and the extension path delivers the same value locally without coupling personal workflow to upstream release cycles.
- An MCP server exposing tag search instead of an in-process tool. Genuine merit: the search would be reusable outside pi. Rejected because it adds a process, an `mcp.json` entry, and startup coupling for a query that runs in-process in well under a second.

## Risks and mitigations
- Scan reads every session file on each call. At the measured scale (1k files, 0.3s with `rg`; full parse will be slower but the same order) each call costs on the order of a few seconds at most. Mitigation: the scan streams and parses line-filtered (`type` check before full parse), runs only on explicit tool or command use, and returns bounded output. If session count grows by an order of magnitude, build a session-start-warmed index; that is the named upgrade path.
- A tag entry on an abandoned branch can surface in scan results (see the deliberate simplification above). Accept for a personal tool; wrong prefilter results are visible as unexpected files in the returned list.
- JSON parse failure on a corrupt or concurrently written session file. Mitigation: per-file try/catch; a file that fails to parse is skipped, and the tool reports the skipped count in `details` rather than failing the whole scan.
- Tool name collision with a future upstream tool. Mitigation: the name `search_sessions_by_tags` is specific; if a collision appears, rename in one place.

## Operability
- Single file, no dependencies, no background processes, no timers. Nothing starts at factory time; the scan runs only on command or tool use.
- Failure modes are visible: notifications for command results, tool errors for scan failures, and skipped-file counts in tool details.
- Ownership: this dotfiles repository. Rollback is `git revert` of the extension file and, if desired, `chezmoi apply`.

## Rollout and rollback
- Apply with `chezmoi apply` after merge; the extension file appears at `~/.pi/agent/extensions/session-tags.ts` and loads on the next pi start. Test before merge by loading directly: `pi --extension ~/.pi/agent/extensions/session-tags.ts`.
- Rollback: remove the file (or revert the commit and `chezmoi apply`) and restart pi. Stored tag entries remain inert in session files and are harmless: unknown `customType` entries are ignored.

## Security and data handling
- The tool returns session file paths and names, not session content, so retrieval itself does not copy conversation data into context. The agent reads the returned files with existing permissions; session files can contain secrets, and reading them into a new session has the same exposure as `/resume` plus manual copy. The tool adds no new read scope beyond what `bash`/`read` already have.
- Tags are user-typed short strings; the parser rejects characters outside `[a-z0-9-]` after lowercasing, which also keeps them safe for shell use in later `rg` invocations.

## Testing strategy
- Unit tests in `session-tags.test.mjs` (node test runner, colocated like the other extensions): parsing, match semantics, scan fixtures, truncation, corrupt-file skip. These cover the pure functions; the command and tool handlers stay thin wrappers around them.
- Manual validation per the success criteria: persistence across restart and the agent round-trip from a second session.

## Open questions
- None blocking. The `/tag` argument syntax (comma-separated replace-set, dialog for editing) is a strawman the plan stage can adjust without changing storage or retrieval.

## Self-review
- The chosen direction has one named downside: the cross-session scan uses file-order latest tag entries, so a tag set on an abandoned branch can appear in results. It is recorded as a deliberate simplification with an upgrade path, and its failure mode is visible (unexpected file in the returned list).
- Each rejected alternative names a genuine merit (index scan cost, zero code, native visibility, external reuse).
- The smallest slice includes the search tool, so user feedback tests the actual goal rather than the easy half.
- Deferred items have revisit triggers rather than being merged into the slice.
- One earlier framing was corrected during the session: free-text search was initially in scope for the tool; the user settled it as tag prefilter plus manual `rg`, which removed a feature from the design.
