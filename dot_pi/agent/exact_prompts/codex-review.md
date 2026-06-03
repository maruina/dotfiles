---
description: Run the official Codex code review against local git state
argument-hint: "[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]"
---
# Codex Review
Raw arguments: `$ARGUMENTS`

Run a Codex code review through the official Codex plugin runtime.

## Rules
- This is review-only.
- Do not edit files.
- Do not fix findings.
- Preserve the user's arguments exactly when invoking Codex.
- Do not add extra review instructions or rewrite the user's intent.
- Return Codex's output verbatim.
- If the Codex helper is missing or unauthenticated, stop and tell the user to run `/codex-setup`.

## Helper resolution
Resolve `codex-companion.mjs` from `CLAUDE_PLUGIN_ROOT` first, falling back to the local checkout path:

```bash
CODEX_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/go/src/github.com/openai/codex-plugin-cc/plugins/codex}"
CODEX_COMPANION="$CODEX_PLUGIN_ROOT/scripts/codex-companion.mjs"
if [ ! -f "$CODEX_COMPANION" ]; then
  echo "codex-companion.mjs not found at $CODEX_COMPANION" >&2
  echo "Set CLAUDE_PLUGIN_ROOT to the official Codex plugin root or reinstall the local plugin package." >&2
  exit 1
fi
```

## Execution
Run:

```bash
node "$CODEX_COMPANION" review $ARGUMENTS
```

Return Codex's output without applying changes.
