---
description: Run an adversarial Codex review that challenges implementation and design choices
argument-hint: "[model]"
---
# Codex Adversarial Review
Raw arguments: `$ARGUMENTS`

Run a one-shot adversarial Codex review for PR readiness. Review the selected worktree branch against `main`. Before invoking Codex, make sure all intended review files are committed so the branch diff contains the complete PR-ready state.

Arguments are optional positional values:

1. model, default `gpt-5.5`

## Rules
- This is review-only after the optional preparation commit.
- Do not edit files except to stage and commit already-existing user changes after explicit confirmation.
- Do not fix findings.
- Treat `$ARGUMENTS` as an optional positional `model` value only; do not pass it as focus text.
- Default to model `gpt-5.5`.
- Use the `resolve-worktree` skill to select the review worktree; do not implement inline worktree discovery.
- Do not weaken the adversarial framing.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.

## Worktree selection

Use the `resolve-worktree` skill with `$GLOB = plans/*/plan.md` to select the review worktree. Set `$REVIEW_ROOT` to `$RESOLVED_ROOT`. All subsequent commands must use `cd $REVIEW_ROOT` or `git -C $REVIEW_ROOT`.

After resolution, verify the selected branch is not `main` or `master`:

```bash
git -C "$REVIEW_ROOT" branch --show-current
```

If it is, stop and explain that a branch diff against `main` would be empty. Ask the user to run from a feature worktree or create one first.

## Preparation commit
From `$REVIEW_ROOT`, inspect local changes before review:

```bash
git status --short
```

If there are staged, unstaged, or untracked changes:

1. Show the status output to the user.
2. Ask for explicit confirmation before committing. Stop until they answer.
3. If the user declines, stop and explain that `adversarial-review --base main` would miss uncommitted files.
4. If the user confirms, stage all intended local changes and commit them with a Conventional Commit message. Use the user's requested commit message if provided; otherwise choose a concise message that matches the branch work.
5. Do not include unrelated files. If unrelated local changes are present, stop and ask what to include.

After the preparation commit, verify the worktree is clean:

```bash
git status --short
```

If it is not clean, stop and ask how to handle the remaining files.

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
Run this from `$REVIEW_ROOT` after the worktree is clean:

```bash
set -- $ARGUMENTS
MODEL="${1:-gpt-5.5}"
node "$CODEX_COMPANION" adversarial-review --base main --model "$MODEL"
```

Return Codex's output without applying changes.
