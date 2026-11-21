# context-kit
`context-kit` is a Pi prompt-policy extension adopted from Mat Brown's Pi package. It discovers and delivers local instruction siblings, nested instruction files, and path-scoped rule files as conversation messages so the cached system-prompt prefix stays unchanged.

## What we adopted
The extension lives in:

```text
~/.pi/agent/extensions/context-kit/
```

Runtime dependency in `~/.pi/agent/package.json`:

```text
minimatch
```

`~/.pi/agent/package.json` sets `"type": "module"` for local tests and TypeScript/ESM execution.

## What it does
On every Pi turn, `context-kit` delivers applicable project context as custom messages without modifying the system prompt:

1. Delivers local personal siblings (`AGENTS.local.md` and `CLAUDE.local.md`) of Pi-loaded context files before the first model call.
2. Discovers nested instruction files (`AGENTS.md`, `CLAUDE.md`, and their `.local.md` siblings) when the agent touches files below the current working directory and delivers them during that tool call.
3. Delivers matching Claude/Cursor rule files based on frontmatter globs during the same tool call.

For a `read`, `edit`, or `write` call, `context-kit` sends newly applicable nested files and rules as a steer message in the same run. The UI shows a compact tree of file kinds and paths; it does not show file contents. The model receives the full contents.

Before an `edit` or `write`, `context-kit` blocks the call if any applicable file has not been confirmed in a `context` event. The reason lists the missing paths and asks the model to retry after receiving them. A successful direct `read`, `edit`, or `write` of a context-kit file counts as delivery only after its tool result appears in context. Until then, context-kit does not inject that file again, but it still blocks edits that depend on it.

Context-kit truncates a file above 24 KiB and limits each delivery batch to 96 KiB. It lists files skipped by the batch limit, and keeps them eligible for later delivery. Discovery errors fail open: context-kit warns and lets the tool call continue. An unreadable context file also produces a warning and does not block a mutation.

Delivery state is stored on the active Pi session branch and rebuilt after session restore or tree navigation. After compaction, context-kit clears its loaded paths and sends a reminder with paths only. The next applicable tool call delivers the files again. `/context-kit status` reports injected files and blocked mutation counts.

Do not run `packages/nested-context` at the same time as context-kit. Both extensions discover and inject nested instruction files.

## CLAUDE.md support
`walkUpForAgents()` discovers both `AGENTS.md` and `CLAUDE.md`:

- shallowest-first, matching Pi's general-to-specific context ordering;
- within the same directory, `AGENTS.md` comes before `CLAUDE.md`.

Local sibling support works for both:

```text
AGENTS.md  -> AGENTS.local.md
CLAUDE.md  -> CLAUDE.local.md
```

Example:

```text
repo/
  AGENTS.md
  service/
    CLAUDE.md
    CLAUDE.local.md
    foo/
      AGENTS.md
```

When the agent touches `service/foo/main.go`, context-kit delivers these files during that tool call:

```text
service/CLAUDE.md
service/CLAUDE.local.md
service/foo/AGENTS.md
```

`repo/AGENTS.md` is not rediscovered by this extension because Pi already handles cwd and ancestor context files.

## Rule-file support
The extension supports path-scoped rules from:

```text
<repo>/.claude/rules/*.md
<repo>/.cursor/rules/*.md or *.mdc
~/.claude/rules/*.md
```

Claude rules use `paths:` frontmatter:

```yaml
---
paths:
  - "services/foo/**"
---
```

Cursor rules use `globs:` frontmatter:

```yaml
---
globs: "services/foo/**"
---
```

Rules are skipped when they do not have an explicit path/glob match to avoid injecting broad, noisy context.

## Validation
From `dot_pi/agent` (or `~/.pi/agent`):

```bash
npm test
npm run typecheck
```

## Session observability
Run `/context-kit status` to inspect context-kit activity:

- **current session**: injected message/file/byte totals, blocked mutation count, and each injected source file with its kind, discovery mechanism, and byte size.
- **all sessions**: recorded session count, how many sessions used context-kit, total injected messages/files/bytes, the top five injected files ranked by session count, and a by-kind breakdown.

Per-session usage is persisted automatically to `~/.pi/agent/context-kit-usage/<sessionId>.json` (one file per session, written atomically, capped at the 1000 most recent).

## Design choices to keep
Do not change these casually:

- Deliver newly applicable files in the same run. Block `edit` and `write` until a `context` event confirms delivery; this prevents an edit from running before the model has the applicable instructions.
- Keep delivery in custom messages instead of changing the system prompt. This preserves the prompt-cache prefix; steer timing does not alter cache behavior.
- Keep rule matching scoped to explicit `paths:` / `globs:`.
- Do not run `packages/nested-context` alongside this extension.
