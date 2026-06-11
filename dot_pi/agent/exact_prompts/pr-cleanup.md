---
description: Clean up artifacts left by /pr-review for a completed PR
argument-hint: "<GitHub PR URL, e.g. https://github.com/DataDog/dd-source/pull/12345>"
---
# PR Cleanup

PR URL: `$ARGUMENTS`

Clean up the worktree and HTML file created by `/pr-review` for this PR.

## Phase 1: Parse

Extract from the URL:
- `REPO` (e.g. `dd-source`)
- `PR_NUMBER` (e.g. `352925`)

Derive artifact paths:

```
WORKTREE = ~/dd/.worktrees/REPO-pr-PR_NUMBER-review
HTML     = ~/dd/.worktrees/REPO-pr-PR_NUMBER-review.html
```

## Phase 2: Remove worktree

```bash
git worktree remove ~/dd/.worktrees/REPO-pr-PR_NUMBER-review --force 2>/dev/null || true
```

If the worktree does not exist, skip silently.

## Phase 3: Remove HTML file

```bash
rm -f ~/dd/.worktrees/REPO-pr-PR_NUMBER-review.html
```

## Phase 4: Confirm

Print a one-line summary of what was removed, e.g.:

> Cleaned up PR #PR_NUMBER: removed worktree `~/dd/.worktrees/REPO-pr-PR_NUMBER-review` and HTML file.

If neither artifact existed, print:

> Nothing to clean up for PR #PR_NUMBER.
