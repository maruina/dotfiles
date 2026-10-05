# context-kit

`context-kit` is a Pi prompt-policy extension adopted from Mat Brown's Pi package. It controls which project instructions, rule files, and skills are visible in the system prompt for a session.

## What we adopted

The extension was copied into:

```text
~/.pi/agent/extensions/context-kit/
```

Runtime dependencies were installed in `~/.pi/agent`:

```text
ignore
minimatch
```

A minimal `~/.pi/agent/package.json` was created and set to ESM:

```json
{
  "type": "module"
}
```

This is needed for local tests and for the extension's TypeScript/ESM style.

## What it does
On every Pi turn, `context-kit` applies local context policy:

1. Removes ignored Pi-loaded context files from the system prompt using `.pi/agentsignore`.
2. Removes ignored skills from the system prompt using `.pi/skillignore`.
3. Delivers local personal siblings such as `AGENTS.local.md` and `CLAUDE.local.md` before the first model call.
4. Discovers nested instruction files when the agent touches files below the current working directory and delivers them during that tool call.
5. Delivers matching Claude/Cursor rule files based on frontmatter globs during the same tool call.

For a `read`, `edit`, or `write` call, `context-kit` sends newly applicable nested files and rules as a steer message in the same run. The UI shows a compact tree of file kinds and paths; it does not show file contents. The model receives the full contents.

Before an `edit` or `write`, `context-kit` blocks the call if any applicable file has not been confirmed in a `context` event. The reason lists the missing paths and asks the model to retry after receiving them. A successful direct `read`, `edit`, or `write` of a context-kit file counts as delivery only after its tool result appears in context. Until then, context-kit does not inject that file again, but it still blocks edits that depend on it.

Context-kit truncates a file above 24 KiB and limits each delivery batch to 96 KiB. It lists files skipped by the batch limit, and keeps them eligible for later delivery. Discovery errors fail open: context-kit warns and lets the tool call continue. An unreadable context file also produces a warning and does not block a mutation.

Delivery state is stored on the active Pi session branch and rebuilt after session restore or tree navigation. After compaction, context-kit clears its loaded paths and sends a reminder with paths only. The next applicable tool call delivers the files again. `/context-kit status` reports blocked mutation counts.

Do not run `packages/nested-context` at the same time as context-kit. Both extensions discover and inject nested instruction files.

## CLAUDE.md support added during adoption

The coworker version focused on `AGENTS.md`. We added compatibility for colleagues who use Claude Code conventions.

`walkUpForAgents()` now discovers both:

```text
AGENTS.md
CLAUDE.md
```

Ordering rules:

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

## Ignore files

All ignore files use gitignore-style patterns relative to the repository root.

### `.pi/agentsignore`

Suppresses instruction files from the prompt:

```gitignore
vendor/**/AGENTS.md
vendor/**/CLAUDE.md
legacy/service/AGENTS.md
```

This applies both to Pi-loaded ancestor context and to context discovered by this extension.

### `.pi/ruleignore`

Suppresses matching Claude/Cursor rule files:

```gitignore
.claude/rules/experimental-*.md
.cursor/rules/noisy-*.mdc
```

### `.pi/skillignore`

Suppresses skills from the `<available_skills>` section:

```gitignore
vendor/superpowers/skills/noisy-skill/SKILL.md
```

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

Rules are intentionally skipped when they do not have an explicit path/glob match. This avoids injecting broad, noisy context.

## Validation performed

After adoption, the copied context-kit tests passed:

```bash
cd ~/.pi/agent
node --experimental-strip-types --test extensions/context-kit/*.test.ts
```

Result at adoption time:

```text
51 tests passing
0 failing
```

Type checking also passed:

```bash
cd ~/.pi/agent
npx tsc --noEmit \
  --allowImportingTsExtensions \
  --module NodeNext \
  --moduleResolution NodeNext \
  --target ES2022 \
  --skipLibCheck \
  extensions/context-kit/*.ts
```

## Session observability

Run `/context-kit status` to inspect context-kit activity:

- **current session**: injected source files, their source kind, discovery mechanism, and byte size; total injected messages, source files, and bytes; files suppressed by `.pi/agentsignore` or `.pi/ruleignore`.
- **all sessions**: how many sessions are recorded, how many used context-kit, total injected messages/files/bytes, total ignored files, the top injected files ranked by how many sessions pulled them in, and a by-kind breakdown. This is the view that tells you whether the extension earns its keep.

Per-session usage is persisted to `~/.pi/agent/context-kit-usage/<sessionId>.json` (one file per session, written atomically, capped at the 1000 most recent). Historical sessions from before this store shipped are reconstructed once by the `backfill-context-kit-usage` script (see below); going forward every session gets a record automatically.

The command reports extension-local state plus the persisted aggregate. It does not list skills filtered by `.pi/skillignore`.

## Backfilling historical sessions

After upgrading to the usage store, run the one-shot migration once so `/context-kit status` reflects past sessions, not just future ones:

```bash
cd ~/.pi/agent
node --experimental-strip-types exact_scripts/backfill-context-kit-usage.mjs
```

It parses every `context-kit-discovery` message in `~/.pi/agent/sessions/` and writes one record per session into `~/.pi/agent/context-kit-usage/`. It is idempotent: re-running skips sessions that already have a record, and it never clobbers a live record (which is richer — it includes ignored files). Override the dirs with `--sessions-dir` and `--usage-dir` for testing.

## Future improvements

These were discussed but intentionally not implemented during initial adoption.

### Add debug markers behind an env var

If `PI_CONTEXT_KIT_DEBUG=1`, injected blocks could include HTML comments such as:

```markdown
<!-- context-kit: discovered via read service/foo/main.go -->
```

This would make `/dump-context` output easier to interpret. Keep it disabled by default to avoid wasting tokens.

### Add Pi-native global rules

Current global rules come from:

```text
~/.claude/rules/
```

A Pi-native source could be added:

```text
~/.pi/agent/rules/
```

This would let personal/global Pi rules avoid pretending to be Claude rules.

### Make delivery limits configurable

Context-kit truncates files above 24 KiB and caps each delivery batch at 96 KiB. A future change could make these limits configurable for large repositories. Keep a bounded default so one tool access cannot add an unbounded amount of context.

### Consider relative headings for injected files

The extension currently uses absolute paths in headings because that matches Pi's native context-block format and makes surgical insertion/removal reliable.

Relative headings would be easier to read and cheaper in tokens:

```markdown
## service/foo/AGENTS.md
```

Do not change this unless tests prove prompt anchoring still works.

### Add tests for any future behavior

If future changes are made, add tests for:

- `CLAUDE.md` fallback and ordering;
- `.pi/agent/rules` source behavior;
- ignore interactions with `.local.md` siblings;
- status-command rendering;
- token-budget priority and skipped files.

## Design choices to keep
Do not change these casually:

- Deliver newly applicable files in the same run. Block `edit` and `write` until a `context` event confirms delivery; this prevents an edit from running before the model has the applicable instructions.
- Keep delivery in custom messages instead of changing the system prompt. This preserves the prompt-cache prefix; steer timing does not alter cache behavior.
- Keep rule matching scoped to explicit `paths:` / `globs:`.
- Keep `.local.md` overlays separate from `.pi/*ignore` suppression.
- Keep skill filtering surgical by exact skill path.
- Do not run `packages/nested-context` alongside this extension.

### Cleanup candidate
Current usage data reports no use of `.pi/agentsignore`, `.pi/skillignore`, or `.pi/ruleignore`. Consider removing this support in a separate change after checking for local configurations that still depend on it.
