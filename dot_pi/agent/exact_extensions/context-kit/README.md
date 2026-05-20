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

On every Pi turn, `context-kit` rewrites the system prompt to apply local context policy:

1. Removes ignored context files using `.pi/agentsignore`.
2. Adds local personal siblings such as `AGENTS.local.md` and `CLAUDE.local.md`.
3. Discovers nested instruction files when the agent touches files below the current working directory.
4. Adds matching Claude/Cursor rule files based on frontmatter globs.
5. Removes ignored skills using `.pi/skillignore`.

Nested context discovery happens when tools touch files through `read`, `write`, or `edit`. Discovered context is injected on the next user turn, not mid-turn.

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

If the agent touches `service/foo/main.go`, then on the next turn `context-kit` can inject:

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

## Future improvements

These were discussed but intentionally not implemented during initial adoption.

### Add `/context-kit status`

Add a slash command that explains what the extension currently knows:

- discovered `AGENTS.md` / `CLAUDE.md` files;
- discovered `.local.md` siblings;
- matching rule files;
- active ignore files;
- skills hidden by `.pi/skillignore`;
- recent touched paths that caused discovery.

This should be the first improvement if the extension becomes confusing. Prompt mutation is otherwise hard to debug.

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

### Add token budget safeguards

Large repos can accumulate too much context. A future limit could be controlled with:

```bash
PI_CONTEXT_KIT_MAX_BYTES=50000
```

Suggested priority order if context must be skipped:

1. Pi-loaded ancestor context already present.
2. Closest nested `AGENTS.md` / `CLAUDE.md`.
3. Closest `.local.md` sibling.
4. Repo-local path-scoped rules.
5. User-global path-scoped rules.
6. Skill filtering still runs because it reduces prompt size.

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

- Keep one-turn lag for newly discovered nested context.
- Keep rule matching scoped to explicit `paths:` / `globs:`.
- Keep `.local.md` overlays separate from `.pi/*ignore` suppression.
- Keep skill filtering surgical by exact skill path.
