---
description: Run a one-shot Codex code review against local git state
argument-hint: "[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]"
---
# Codex Review

Raw arguments: `$ARGUMENTS`

Run a one-shot Codex code review against the local git state.

## Rules

- This is review-only.
- Do not edit files.
- Do not fix findings.
- Preserve the user's arguments exactly when invoking Codex.
- Do not add extra review instructions or rewrite the user's intent.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.

## Helper resolution
Resolve `codex-companion.mjs` once before invoking Codex. Use the official OpenAI checkout instead of the old Claude marketplace plugin copy:

```bash
CODEX_COMPANION="$HOME/go/src/github.com/openai/codex-plugin-cc/plugins/codex/scripts/codex-companion.mjs"
if [ ! -f "$CODEX_COMPANION" ]; then
  echo "codex-companion.mjs not found at $CODEX_COMPANION" >&2
  echo "Clone or update the official OpenAI Codex plugin checkout first:" >&2
  echo "  git clone https://github.com/openai/codex-plugin-cc.git $HOME/go/src/github.com/openai/codex-plugin-cc" >&2
  exit 1
fi
printf '%s
' "$CODEX_COMPANION"
```

## Execution

Run:

```bash
node "$CODEX_COMPANION" review $ARGUMENTS
```

Return Codex's output without applying changes.
