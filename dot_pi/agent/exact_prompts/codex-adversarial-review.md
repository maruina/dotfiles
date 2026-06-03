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
- If the current checkout is not the implementation worktree, discover candidate worktrees before invoking Codex.
- Do not weaken the adversarial framing.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.

## Worktree selection
First select the review worktree:

1. Run `git rev-parse --show-toplevel` and `git branch --show-current` in the current checkout.
2. If the current branch is not `main` or `master`, use the current checkout as `$REVIEW_ROOT`.
3. If the current branch is `main` or `master`, run `git worktree list --porcelain` and inspect each worktree.
4. For each worktree, collect path, branch, last modified time for `plans/*/plan.md` and `plans/*/design.md` when present, and `git status --short`.
5. Prefer worktrees with non-main branches. Sort candidates by plan/design last modified time descending, with dirty worktrees ahead when timestamps are similar.
6. If there is exactly one candidate, ask the user to confirm it and stop until they answer.
7. If there are multiple candidates, present a concise numbered list and ask which worktree to review. Stop until the user chooses.
8. If no candidate exists, ask the user to run the prompt from the implementation worktree or create one first.

After the user chooses a discovered worktree, treat it exactly as if the prompt had been run from that worktree. All subsequent commands must use `cd <review-worktree>` or `git -C <review-worktree>`.

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
