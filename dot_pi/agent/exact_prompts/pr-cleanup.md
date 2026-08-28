---
description: Safely remove the review worktree for a completed PR
argument-hint: "<GitHub PR URL>"
---
# PR Cleanup
PR URL: `$ARGUMENTS`

Remove only the local review worktree created by `/pr-review` for this PR.

## Parse and locate worktree
Require a PR URL in this form:

```text
https://github.com/ORG/REPO/pull/NUMBER
```

Extract `REPO` and `PR_NUMBER`. If the URL is missing or invalid, ask for it and stop.

```text
WORKTREE = ~/dd/.worktrees/REPO/pr-PR_NUMBER-review
```

## Remove safely
If `WORKTREE` does not exist, report it as absent. Otherwise:
1. Verify that it is a Git worktree with `git -C "$WORKTREE" rev-parse --is-inside-work-tree`. If that fails, do not remove it.
2. Check for uncommitted changes with `git -C "$WORKTREE" status --short`.
3. If it is dirty, do not remove it. Report the path and ask for explicit confirmation to discard its changes.
4. If it is clean, remove it without `--force`:

```bash
git worktree remove "$WORKTREE"
```

## Report
State whether the worktree was removed, absent, or retained because it was dirty. If it was absent, say:

> Nothing to clean up for PR #PR_NUMBER.
