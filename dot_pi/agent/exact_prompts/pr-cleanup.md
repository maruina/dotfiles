---
description: Safely remove the review worktree and optional HTML artifact for a completed PR
argument-hint: "<GitHub PR URL>"
---
# PR Cleanup
PR URL: `$ARGUMENTS`

Remove only the local artifacts created by `/pr-review` for this PR.

## Parse and locate artifacts
Require a PR URL in this form:

```text
https://github.com/ORG/REPO/pull/NUMBER
```

Extract `REPO` and `PR_NUMBER`. If the URL is missing or invalid, ask for it and stop.

```text
WORKTREE = ~/dd/.worktrees/REPO-pr-PR_NUMBER-review
HTML     = ~/dd/.worktrees/REPO-pr-PR_NUMBER-review.html
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

Remove `HTML` with `rm -f "$HTML"` when it exists.

## Report
State separately whether the worktree and HTML artifact were removed, absent, or retained because the worktree was dirty. If neither artifact existed, say:

> Nothing to clean up for PR #PR_NUMBER.
