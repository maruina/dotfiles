---
name: resolve-worktree
description: Resolve a worktree-relative file path across all git worktrees, then switch context to the owning worktree. Use when a prompt receives a path argument that may live in a different worktree than the current checkout.
---

# Resolve Worktree

Resolves a file path that may be worktree-relative (e.g. `plans/<ticket>/design.md` printed by `/brainstorm` or `/plan`) and switches command context to the owning worktree.

## Inputs

- `$PATH_ARG` — the path argument to resolve (may be relative, absolute, or worktree-relative)
- `$GLOB` — optional glob pattern to use for discovery when `$PATH_ARG` is missing (e.g. `plans/*/design.md`)

## Resolution procedure

### When `$PATH_ARG` is provided

1. If `$PATH_ARG` exists relative to the current directory, or is an absolute path that exists, use it as-is. Set `$RESOLVED_PATH` to the absolute path and `$RESOLVED_ROOT` to its owning git toplevel (`git -C <dir> rev-parse --show-toplevel`).
2. If it does not exist from the current directory and you are inside a git repository, treat it as worktree-relative. Run `git worktree list --porcelain` and search each worktree for a file matching `$PATH_ARG`.
3. If exactly one worktree contains it, set `$RESOLVED_PATH` to the full path and `$RESOLVED_ROOT` to that worktree's root.
4. If several worktrees contain it, present a concise numbered list (worktree root, branch, path) and ask which to use. Stop until the user chooses.
5. If still not found, stop and ask for a valid path.

### When `$PATH_ARG` is missing and `$GLOB` is provided

1. Search the current checkout for files matching `$GLOB`.
2. Run `git worktree list --porcelain` and search each worktree for files matching `$GLOB`.
3. For each candidate, collect: full path, worktree root, branch name (when available), last modified time, and first Markdown heading.
4. Sort by last modified time descending; put current-checkout candidates first when timestamps are similar.
5. If exactly one candidate exists, ask the user to confirm it and stop until they answer.
6. If multiple candidates exist, present a concise numbered list and ask which to use. Stop until the user chooses.
7. If no candidates exist, ask for a valid path and stop.

After the user chooses a discovered file, treat it exactly as if it had been passed as `$PATH_ARG`.

### When `$PATH_ARG` is missing and no `$GLOB` is provided

Stop and ask for a valid path.

## Context switch

After resolution, switch all subsequent commands to operate in `$RESOLVED_ROOT`:

- Use `cd $RESOLVED_ROOT` in shell commands.
- Use paths relative to `$RESOLVED_ROOT` for all file reads and writes.
- Treat the branch checked out in `$RESOLVED_ROOT` as the working branch, not the branch in the original harness directory.

A file resolved from another worktree is not a branch or context mismatch by itself — it is the intended target.
