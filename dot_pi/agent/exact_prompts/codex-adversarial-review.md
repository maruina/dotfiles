---
description: Run an adversarial Codex review that challenges implementation and design choices
argument-hint: "[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch] [focus ...]"
---
# Codex Adversarial Review

Raw arguments / focus: `$ARGUMENTS`

Run a one-shot adversarial Codex review against the local git state. Position it as a challenge review: question the implementation approach, design choices, tradeoffs, assumptions, and real-world failure modes.

## Rules

- This is review-only.
- Do not edit files.
- Do not fix findings.
- Preserve the user's arguments and focus text exactly when invoking Codex.
- Do not weaken the adversarial framing.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.

## Helper resolution

Resolve `codex-companion.mjs` once before invoking Codex:

```bash
CODEX_COMPANION="$HOME/.claude/plugins/marketplaces/openai-codex/plugins/codex/scripts/codex-companion.mjs"
if [ ! -f "$CODEX_COMPANION" ]; then
  CODEX_COMPANION=$(find "$HOME/.claude/plugins" -maxdepth 6 -path '*/codex/scripts/codex-companion.mjs' -type f 2>/dev/null | head -1)
fi
if [ ! -f "$CODEX_COMPANION" ]; then
  echo "codex-companion.mjs not found — install/setup the OpenAI Codex Claude plugin first:" >&2
  echo "  /plugin marketplace add openai/codex-plugin-cc" >&2
  echo "  /plugin install codex@openai-codex" >&2
  echo "  /codex:setup" >&2
  exit 1
fi
printf '%s\n' "$CODEX_COMPANION"
```

## Execution

Run:

```bash
node "$CODEX_COMPANION" adversarial-review $ARGUMENTS
```

Return Codex's output without applying changes.
