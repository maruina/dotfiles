---
name: resolve-worktree
description: Resolve a worktree-relative file path across all git worktrees, then switch context to the owning worktree. Use when a prompt receives a path argument that may live in a different worktree than the current checkout.
---

# Resolve Worktree

Resolves `$1` — a path that may be relative to cwd, absolute, or worktree-relative (e.g. `plans/<ticket>/design.md` printed by `/brainstorm` or `/plan`) — and switches context to the owning worktree.

## When `$1` is provided

1. If `$1` exists relative to cwd or is an absolute path that exists, use it as-is.
2. Otherwise, run `git worktree list --porcelain` and search each worktree for a file matching `$1`.
3. If exactly one match, use it.
4. If several match, list them (worktree root, branch, path) and ask which to use. Stop until the user chooses.
5. If no match, stop and ask for a valid path.

Set `$RESOLVED_PATH` to the absolute path and `$RESOLVED_ROOT` to its git toplevel (`git -C <dir> rev-parse --show-toplevel`).

## When `$1` is missing and a `$GLOB` is provided by the caller

1. Search the current checkout and all worktrees (`git worktree list --porcelain`) for files matching `$GLOB`.
2. For each candidate, collect: full path, worktree root, branch name, last modified time, and first Markdown heading.
3. Sort by last modified time descending; current-checkout candidates first when timestamps are similar.
4. If exactly one candidate, ask the user to confirm it. Stop until they answer.
5. If multiple candidates, list them and ask which to use. Stop until the user chooses.
6. If none, stop and ask for a valid path.

Treat the chosen file as if it had been passed as `$1`.

## When `$1` is missing and no `$GLOB` is provided

Stop and ask for a valid path.

## Context switch

After resolution, all subsequent commands operate in `$RESOLVED_ROOT`:

- Use `cd $RESOLVED_ROOT` in shell commands.
- Use paths relative to `$RESOLVED_ROOT`.
- Treat the branch in `$RESOLVED_ROOT` as the working branch.

A file resolved from another worktree is not a mismatch — it is the intended target.
