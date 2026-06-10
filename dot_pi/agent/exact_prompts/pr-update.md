---
description: Update an existing PR description after code or review-feedback changes, syncing the branch by merging upstream (no-rebase-once-open)
argument-hint: "[context]"
---

# PR Update

Arguments: $ARGUMENTS

Update the current branch's existing GitHub PR description after addressing feedback or changing implementation details.

This workflow uses git-machete with a **no-rebase-once-open** stance: once a PR is open, its branch is **never** rebased, squashed, or force-pushed. Upstream changes are **merged** in, and review feedback lands as **new commits**. This preserves review history and keeps commit-anchored comments and "changes since last review" working. Read the `git-machete` skill before performing any branch, stack, or PR operations.

Because the branch is not rewritten, the reviewer guide is a **Files-changed reading-order narrative**, not a list of commit links.

Assume this command may be run multiple times on the same PR. Make the update idempotent: preserve useful existing content, replace stale generated sections instead of appending duplicates, and keep only one `## Lessons learned` section.

Do not create a new PR.
Do not rebase, squash, or force-push a branch that has an open PR. Do not use `--force` or `--force-with-lease` on it.
Do not post `@codex review` unless the user explicitly asks.
Propose a PR title change when the existing title no longer reflects the final PR scope.
Ask before changing the PR title unless `$ARGUMENTS` explicitly requests a title update.
If the branch has unrelated uncommitted feedback fixes, commit them as new commits and push downstream with `git machete traverse -y --push --return-to=here` before updating the description.

## Phase 1: Gather PR and branch context

Run:

```fish
gh pr view --json number,title,body,baseRefName,url
```

Set the base branch from `.baseRefName`.

Then gather:

```fish
git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
```

Also inspect recent commits and changed files enough to understand the current final state of the PR.

If `$ARGUMENTS` is non-empty, treat it as user-provided context about what changed or what reviewer feedback was addressed.

## Phase 2: Understand the existing PR body

Read the existing PR body.

Identify:
- what is still accurate
- what is stale
- whether the existing PR title still reflects the final PR scope
- what changed since the PR was created or last updated
- what reviewer feedback appears to have been addressed
- what tests were added or rerun

Preserve the existing PR structure when possible.

Because this command may run repeatedly:
- Do not append a second copy of any section.
- Replace existing generated sections in place.
- Keep hand-written details that are still accurate.
- Remove outdated review-response bullets instead of accumulating a historical changelog.
- If the existing `## Changes since last review` section exists, replace it with `## Lessons learned` when there is useful reviewer context to share; otherwise remove it.
- If the existing `## Lessons learned` section is stale, replace it with the latest meaningful lessons.

## Phase 3: Sync the branch (merge upstream, never rebase)

The PR is open, so its branch must not be rewritten. Do **not** rebase, squash, reset to merge base, or force-push.

Land any work as **new commits**:
- Review feedback and follow-up changes are committed normally on top of the branch.
- Upstream (`$base`) changes are **merged** into the branch, not rebased onto.

If the repo uses git-machete (the open-PR branch should carry the `update=merge` annotation set at create time), sync and push with:

```fish
git machete traverse -yW                       # merges $base into open-PR branches, rebases the rest
git machete traverse -y --push --return-to=here
```

If git-machete is not set up, merge upstream by hand and push without force:

```fish
git merge origin/$base
git push
```

If the branch's position in the stack changed (a parent merged or moved), retarget the PR instead of rewriting history:

```fish
git machete github retarget-pr
```

Resolve merge conflicts in place; do not rebase to avoid them. Do not create a `backup/` branch — nothing is being rewritten.

## Phase 4: Draft the updated PR title and body

If the existing PR title is stale, propose a new title that reflects the final PR scope. Keep the existing title if it is still accurate.

Use this body structure unless the existing PR body uses a clearly intentional different structure:

```markdown
## What

One sentence describing the current final state of the PR.

## Why

Two to four sentences explaining why this change exists.

## Reviewer guide

> Review in the **Files changed** tab, in this order. Comment there so your comments stay attached to the PR. Avoid commenting on individual commits.

> For a stacked PR, also note this branch's place in the stack (⬆ parent PR / ⬇ child PR) so reviewers can follow the narrative across PRs.

| # | Read | Why now | What to look for |
|---|------|---------|------------------|
| 1 | `file1.go`, `file2.go` | establishes the core types | specific things to verify or scrutinize |

## Lessons learned

- ...

## Tests

- ...
```

Only include `## Lessons learned` if the PR scope grew beyond the original plan, review found an interesting failure mode, agentic/self-review materially changed the implementation, or the user provided context in `$ARGUMENTS`.

The `## Lessons learned` section should explain reviewer-relevant insights, not provide a historical changelog. Use it for scope changes, surprising real-world failure modes, validation discoveries, or tradeoffs worth sharing with reviewers.

Keep the description concise. Avoid duplicating commit messages.

## Phase 5: Apply the update

Write the proposed body to a temporary file.

Then run:

```fish
gh pr edit <number> --body-file <temp-file>
```

If the user approved a title change or `$ARGUMENTS` explicitly requested one, include the new title:

```fish
gh pr edit <number> --title "<new title>" --body-file <temp-file>
```

## Phase 6: Report

Print:
- PR URL
- whether upstream was merged into the branch and whether downstream branches were updated/pushed
- whether the PR was retargeted
- whether the PR title was changed, proposed but not changed, or left unchanged
- sections changed
- whether `Lessons learned` was added, updated, removed, or left unchanged
- any assumptions made
