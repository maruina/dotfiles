---
name: resolve-worktree
description: Resolve a worktree-relative file path across all git worktrees, then switch context to the owning worktree. Use when a prompt receives a path argument that may live in a different worktree than the current checkout.
---

# Resolve Worktree

Resolves `$1` — a path that may be relative to cwd, absolute, or worktree-relative (e.g. `plans/<ticket>/design.md` printed by `/brainstorm` or `/plan`) — and switches context to the owning worktree.

## When `$1` is provided

1. Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" resolve --path "$1"`. Stop on an error.
2. If exactly one match exists, use it. If several match, list their worktree roots, branches, and paths; ask which to use and wait. If none match, ask for a valid path.

Set `$RESOLVED_PATH` and `$RESOLVED_ROOT` from the chosen candidate's canonical `path` and `root`.

## When `$1` is missing and a `$GLOB` is provided by the caller

**Never search only the current checkout.** Always enumerate every worktree first.

1. Run `node "${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/scripts/lifecycle-git.mjs" resolve --glob "$GLOB"`. Stop on an error. The helper searches every worktree recursively, including nested monorepo paths, and returns each candidate's canonical path, root, branch, modification time, and first Markdown heading, sorted by modification time with current-checkout priority for similar times.
2. If exactly one candidate exists, ask the user to confirm it. If multiple candidates exist, list them and ask which to use. Stop until the user answers.
3. If none exist, stop and ask for a valid path.

Treat the chosen file as if it had been passed as `$1`.

## When `$1` is missing and no `$GLOB` is provided

Stop and ask for a valid path.

## Context switch

After resolution, all subsequent commands operate in `$RESOLVED_ROOT`:

- Use `cd $RESOLVED_ROOT` in shell commands.
- Use paths relative to `$RESOLVED_ROOT`.
- Treat the branch in `$RESOLVED_ROOT` as the working branch.

A file resolved from another worktree is not a mismatch — it is the intended target.
