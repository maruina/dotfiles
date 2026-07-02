---
description: Run a one-shot Codex code review against a PR URL, a worktree path, or the current checkout
argument-hint: "[<pr-url> | <worktree-path>] [--base <ref>] [--scope auto|working-tree|branch] [--wait|--background]"
---
# Codex Review

Raw arguments: `$ARGUMENTS`

Run a one-shot Codex code review. Codex's built-in reviewer only understands two native targets — the **working tree** in a directory, or a **branch diff of that directory's HEAD against a base ref**. It has no concept of a PR URL. This command adds a thin resolution layer so you can point it at a PR URL or a worktree path from your main checkout; it translates either into the native base-branch form before invoking Codex.

## Input modes

Inspect the first positional in `$ARGUMENTS` (ignore leading flags) and pick one mode:

1. **PR URL** — matches `https://github.com/<owner>/<repo>/pull/<n>` (or `<owner>/<repo>#<n>`). Review that PR's diff without disturbing your working branch: fetch it, detach-checkout its head, review against its base, then restore HEAD. See *Mode: PR URL*.
2. **Worktree / directory path** — the positional is an existing filesystem path (starts with `/`, `~`, `.`, or resolves to a directory). Review the branch checked out there against its base, using `--cwd`. Use this to review a stacked branch **before** its PR exists. See *Mode: worktree path*.
3. **No positional (flags only, or empty)** — review the current checkout (`process.cwd()`), honoring any `--base`/`--scope`. See *Mode: current checkout*.

If the first positional is neither a PR URL nor an existing path (e.g. free-form focus text), stop: `review` cannot take focus text. Direct the user to `/codex-adversarial-review`.

## Rules

- This is review-only. Do not edit files. Do not fix findings.
- The built-in `review` subcommand accepts **flags only** (`--base <ref>`, `--scope <auto|working-tree|branch>`, `--cwd <path>`, `--wait|--background`, `--json`, `--model`). Never pass a PR URL, path, or focus text as a positional to `node "$CODEX_COMPANION" review` — resolve it into flags first (per the modes above).
- Preserve the user's own flags (`--base`, `--scope`, `--wait`, `--background`, `--model`) and forward them through. A user-supplied `--base` always wins over auto-detected bases.
- For the PR-URL mode, guard against data loss: if the current worktree has **tracked** changes (`git status --porcelain --untracked-files=no` non-empty), stop and ask the user to stash/commit first — do not move HEAD. Untracked files are fine (a detached checkout preserves them). Always restore the original HEAD afterward, even on review failure.
- For **stacked** branches, review against the immediate parent, not `main`, or the diff includes the whole stack below. Detect the base in this precedence: explicit `--base` → `git machete show up` (the machete parent) → the PR's `baseRefName` (via `gh`) → the repo default branch.
- Do not add extra review instructions or rewrite the user's intent.
- If Codex reports findings, return them and stop; ask whether the user wants any findings validated or fixed in a follow-up turn.
- If the Codex helper is missing or unauthenticated, stop and tell the user how to set it up.
- Prefer `gh` for GitHub lookups; before `gh` calls that depend on org access, confirm the active account per the repo's GitHub-account guidance.

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

## Base detection helper

Several modes need the base branch for a given branch. Resolve it with this precedence (stop at the first that yields a value):

1. A user-supplied `--base` in `$ARGUMENTS`.
2. `git -C <dir> machete show up <branch>` — the machete parent. Treat “has no upstream branch” / non-zero exit as “no parent”.
3. The branch's open-PR base: `gh pr view <branch> --json baseRefName --jq .baseRefName` (empty if no PR).
4. The repo default branch: `git -C <dir> remote show origin | sed -n 's/.*HEAD branch: //p'`, or fall back to `main`.

For branch-diff reviews, prefer the remote form of the base (`origin/<base>`) so the diff is against the pushed base, not a possibly-stale local ref.

## Mode: current checkout (no positional)

Forward flags unchanged; the reviewer operates on `process.cwd()`:

```bash
node "$CODEX_COMPANION" review $ARGUMENTS
```

With no `--base`/`--scope`, auto scope reviews the working tree if dirty, else the branch diff against the detected default. For a stacked branch, pass `--base origin/<parent>` (see base detection).

## Mode: worktree path

Let `WT` be the resolved positional path. Determine the branch and base, then review that directory via `--cwd` (no checkout switching — the worktree already has the branch out):

```bash
WT=<resolved-path>
branch=$(git -C "$WT" branch --show-current)
# base = detected per "Base detection helper", expressed as origin/<base>
node "$CODEX_COMPANION" review --cwd "$WT" --base "origin/$base" --scope branch <other user flags>
```

If the worktree branch has no parent/PR/remote base yet (brand-new stack root), fall back to `--base origin/<default-branch>`. Use this mode to review a branch **before** opening its PR.

## Mode: PR URL

Parse `<owner>/<repo>` and `<n>` from the URL. Run from the current repo checkout (e.g. `~/dd/<repo>`). Guard the working tree, then fetch + detach-checkout the PR head, review against the PR base, and always restore the prior HEAD:

```bash
# 0. Refuse to move HEAD if there are tracked changes (staged or unstaged).
#    Untracked files are ignored: a detached checkout preserves them safely.
test -z "$(git status --porcelain --untracked-files=no)" || { echo 'tracked changes present; stash or commit first'; exit 1; }

# 1. Resolve PR refs.
head=$(gh pr view <n> --repo <owner>/<repo> --json headRefName --jq .headRefName)
base=$(gh pr view <n> --repo <owner>/<repo> --json baseRefName --jq .baseRefName)

# 2. Remember where to return (branch name, or the current SHA if detached).
orig=$(git symbolic-ref -q --short HEAD || git rev-parse HEAD)

# 3. Fetch and detach onto the PR head; review the PR's own diff against its base.
git fetch origin "$head" "$base"
git switch --detach "origin/$head"
node "$CODEX_COMPANION" review --base "origin/$base" --scope branch <other user flags>

# 4. Always restore HEAD.
git switch - 2>/dev/null || git switch "$orig" 2>/dev/null || git checkout "$orig"
```

Run step 4 even if the review command fails. The PR base is authoritative here (a stacked PR's base is already its parent branch), so machete detection is unnecessary in this mode.

## Examples

- `/codex-review` — review the current working tree / branch (auto scope).
- `/codex-review --base main --scope branch` — branch diff against `main`.
- `/codex-review https://github.com/DataDog/ticino/pull/632` — review PR #632's diff from your main checkout, restoring HEAD after.
- `/codex-review ~/dd/.worktrees/ticino-cmpt-4002` — review the branch in that worktree against its parent, before a PR exists.
- `/codex-review --background` — run the current-checkout review as a background job.

For a PR-URL review with **focused/adversarial** instructions, use `/codex-adversarial-review` instead.

Return Codex's output without applying changes.
