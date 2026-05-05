---
description: Create a PR with structured description (What/Why/Reviewer guide/Tests) and per-topic commits
argument-hint: [base branch, defaults to main]
---

# PR Create

Base branch: $ARGUMENTS (default: main)

You are a meticulous technical writer who also knows the codebase deeply. Before writing a single word, load the rewrite principles — they govern every sentence you produce.

## Phase 0: Load writing principles

Load the `rewrite` skill now. Use its principles as a style guide for everything you write in this command. Do not output anything yet.

## Phase 1: Gather context

Run in parallel:

```fish
set base (test -n "$ARGUMENTS" && echo "$ARGUMENTS" || echo "main")
git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
gh pr view --json title,body,number 2>/dev/null; or echo "no PR yet"
```

Also read any `CLAUDE.md` or `AGENTS.md` in the repo root and in the packages being changed — they may define required PR structure or context.

## Phase 2: Understand what changed

For each changed file group (implementation, tests, config, generated):

- Read the full diff for each non-generated file.
- Identify the logical topics — a topic is a self-contained concern a reviewer can evaluate independently (e.g. "CRD API field", "webhook logic", "reconciler update").
- Note any linked tickets, existing issues, or related PRs mentioned in commit messages.

## Phase 3: Group commits by topic

Determine whether the current commits are already organized by topic (one logical concern per commit) or are tangled (many small fix/review iterations mixed together).

**If tangled** (more than ~5 commits mixing topics), ask:

> The branch has N commits mixing multiple topics. Should I rebase them into one commit per topic before creating the PR? This makes the reviewer guide more useful.

If yes, rebase following this pattern:
1. `git branch backup/(git branch --show-current)-pre-rebase` (safety net)
2. `set base (git merge-base HEAD origin/main)`
3. `git reset --soft $base && git reset HEAD` (unstage all, working tree intact)
4. For each topic in logical review order: `git add <topic-files> && git commit -m "..."`
5. Verify: `git status` clean, `git diff backup/...(branch)-pre-rebase..HEAD` shows only intentional changes.
6. `git push --force-with-lease origin (git branch --show-current)`

**If already organized**, proceed to Phase 4 without rebasing.

## Phase 4: Push if needed

```fish
git push -u origin (git branch --show-current)
```

## Phase 5: Collect commit SHAs and links

```fish
set repo (gh repo view --json nameWithOwner -q .nameWithOwner)
git log --format="%H %s" origin/$base..HEAD
```

For each commit, build a GitHub URL: `https://github.com/$repo/commit/$SHA`

## Phase 6: Draft the PR description

Write the description guided by the rewrite principles loaded in Phase 0. Apply them actively — not as a post-pass.

### Structure

```
## What

One sentence. The artifact and the action: what was built or changed.

## Why

Two to four sentences. The problem this solves. Why now. Links to tickets, incidents, or issues.
Write as if returning to this code in 9 months with no context — the reader must understand why
this change exists, not just what it does.

## Reviewer guide

<table — see below>

**What to look for per commit:**
- **<Topic>** — specific things to verify or scrutinize

## Tests

Bullet list. What tests were added, what scenarios they cover, and — if no tests — why they
weren't needed or where coverage already exists.
```

### Reviewer guide table

| # | Topic | Commit | Files |
|---|-------|--------|-------|
| 1 | <topic name> | [short-sha](full-github-url) | `file1.go`, `file2.go` |

- Topic name: short noun phrase (e.g. "CRD API", "Webhook", "Reconciler")
- Commit: 8-char SHA as clickable link to GitHub commit URL
- Files: only the most important files, not the full list

## Phase 7: Create or update the PR

If no PR exists:

```fish
gh pr create --title "<type>(<scope>): <subject>" --body "..."
```

If PR already exists (detected in Phase 1):

```fish
gh pr edit <number> --body "..."
```

Title format: `[TICKET] type(scope): subject` where type is `feat`, `fix`, `refactor`, or `docs`. Omit the ticket prefix if there is no linked ticket.

## Phase 8: Trigger Codex review

After creating the PR, always comment on the PR to trigger Codex review:

```fish
gh pr comment <number-or-url> --body "@codex review"
```

If the PR already existed and Phase 7 only updated it, do not post a duplicate Codex review comment unless the user explicitly asks.

## Phase 9: Report

Print:
- PR URL
- Whether the `@codex review` comment was posted
- The reviewer guide table as a compact summary
- Any rebasing that was done and the backup branch name if applicable
