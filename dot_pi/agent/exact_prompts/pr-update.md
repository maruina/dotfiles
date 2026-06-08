---
description: Update an existing PR description and optionally rewrite PR commits after code or review-feedback changes
argument-hint: "[context]"
---

# PR Update

Arguments: $ARGUMENTS

Update the current branch's existing GitHub PR description and, when useful, its commit structure. This is for refreshing an already-created PR after addressing feedback or changing implementation details.

Assume this command may be run multiple times on the same PR. Make the update idempotent: preserve useful existing content, replace stale generated sections instead of appending duplicates, and keep only one `## Lessons learned` section.

Do not create a new PR.
You may rewrite commits, squash commits, and force-push with `--force-with-lease` when the user asks or when the current commit structure is stale or hard to review.
Ask before rewriting commits unless `$ARGUMENTS` explicitly requests commit rewriting, squashing, or force-pushing.
Do not use plain `--force`.
Do not post `@codex review` unless the user explicitly asks.
Do not change the PR title unless the user explicitly asks.

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

## Phase 3: Update commit structure if needed

Compare the current commits with the final PR scope and reviewer-guide topics.

If commits are stale, tangled, too granular, or no longer match the review topics, propose a rewrite plan. Prefer one commit per review topic. If the PR is small or the user explicitly asks to squash, use a single commit.

When proposing a rewrite, show:

```markdown
| # | Topic | Files | Commit message |
|---|-------|-------|----------------|
| 1 | ... | ... | ... |
```

Ask the user before rewriting unless `$ARGUMENTS` explicitly requests commit rewriting, squashing, or force-pushing.

If rewriting commits:
1. Ensure the working tree is clean, or clearly separate uncommitted changes that must be included.
2. Create a backup branch named `backup/<current-branch>-pre-pr-update`.
3. Reset softly to the merge base with `origin/$base`.
4. Create the planned commit or commits in review order.
5. Verify the working tree is clean.
6. Verify the final diff against `origin/$base` still contains only intentional PR changes.
7. Push with `git push --force-with-lease`.

After rewriting, collect the new commit SHAs before drafting the reviewer guide.

## Phase 4: Draft the updated PR body

Use this structure unless the existing PR body uses a clearly intentional different structure:

```markdown
## What

One sentence describing the current final state of the PR.

## Why

Two to four sentences explaining why this change exists.

## Reviewer guide

| # | Topic | Commit | Files |
|---|-------|--------|-------|
| 1 | <topic name> | [short-sha](full-github-url) | `file1.go`, `file2.go` |

**What to look for per commit:**
- **<Topic>** — specific things to verify or scrutinize

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

## Phase 6: Report

Print:
- PR URL
- whether commits were rewritten, squashed, or left unchanged
- whether the branch was force-pushed
- sections changed
- whether `Lessons learned` was added, updated, removed, or left unchanged
- any assumptions made
