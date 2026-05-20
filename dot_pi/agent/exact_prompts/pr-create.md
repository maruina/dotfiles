---
description: Create a PR with structured description (What/Why/Reviewer guide/Tests) and per-topic commits
argument-hint: [--base <branch>] [context]
---

# PR Create

Arguments: $ARGUMENTS

Interpret `--base <branch>` as the base branch. If the user does not pass `--base`, use `main`.
Treat all other arguments as task context, not as a branch name.

You are a meticulous technical writer who also knows the codebase deeply. Before writing a single word, load the rewrite principles — they govern every sentence you produce.

## Phase 0: Load writing principles

Load the `rewrite` skill now. Use its principles as a style guide for everything you write in this command. Do not output anything yet.

## Phase 1: Gather context

Run in parallel:

```fish
set args $ARGUMENTS
set base main
for i in (seq (count $args))
    if test "$args[$i]" = "--base"
        set next (math $i + 1)
        set base $args[$next]
    end
end

git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
gh pr view --json title,body,number 2>/dev/null; or echo "no PR yet"
```

Also read any `CLAUDE.md` or `AGENTS.md` in the repo root and in the packages being changed — they may define required PR structure or context.

## Phase 2: Understand what changed

For each changed file group (implementation, tests, config, generated):

- Read the full diff for each non-generated file.
- Identify the smallest independent review topics by reviewer concern, not by incident, user request, shared symptom, implementation session, or current commit shape.
- A topic is one independently reviewable code concern. If two changes live in different subsystems, have different failure modes, or require different reviewer questions, they are separate topics even if they fix the same incident.
- Examples: "API server error classification", "AWS resource idempotency", "Temporal activity timeout", "CRD API field", "webhook logic", "reconciler update", "generated code".
- Do not collapse separate topics under broad labels like "cleanup hardening", "decommission reliability", or "bug fix".
- Do not collapse separate topics just because they were implemented in one session or one commit.
- Before finalizing topics, run this sanity check for each topic:
  - Does this topic touch one subsystem or mechanism?
  - Would a reviewer validate it with one focused question?
  - Could this topic be reverted independently without reverting unrelated behavior?
- If any answer is "no", split the topic.
- For each topic, note:
  - topic name
  - files
  - why the topic exists
  - whether the topic needs its own commit
- Note any linked tickets, existing issues, or related PRs mentioned in commit messages.

## Phase 3: Group commits by topic

Create one commit per logical review topic before creating or updating the PR.

A topic is a change set that a reviewer can evaluate independently. Define topics by mechanism and reviewer question, not by shared incident or broad goal. Examples:
- API/schema change
- API server error classification
- controller or workflow behavior
- cloud-provider implementation
- cloud resource idempotency
- Temporal activity timeout
- generated code
- tests
- documentation

Rules:
- Do not leave all changes in one commit if they span multiple topics.
- Do not preserve fixup, formatting-only, or review-iteration commits.
- Do not include unrelated untracked files.
- Keep generated files in the same commit as the source file that generated them, unless the generated output is large enough to deserve its own clearly named commit.
- If there is only one topic, create one commit.
- If there are multiple topics, create one commit per topic in review order.

Before rewriting commits, print the proposed commit plan:

| # | Topic | Files | Commit message |
|---|-------|-------|----------------|
| 1 | ... | ... | ... |

Then ask:

> Should I rewrite the branch into this one-commit-per-topic structure before creating the PR?

If yes, rebase following this pattern:
1. `git branch backup/(git branch --show-current)-pre-rebase` (safety net)
2. `set base (git merge-base HEAD origin/main)`
3. `git reset --soft $base && git reset HEAD` (unstage all, working tree intact)
4. For each topic in logical review order:
   - `git add <topic-files>`
   - `git commit -m "<commit message>"`
5. Verify:
   - `git status --short` has no tracked changes
   - `git diff backup/(git branch --show-current)-pre-rebase..HEAD` contains only intentional changes
6. `git push --force-with-lease origin (git branch --show-current)`

If no:
- Keep the current commit structure.
- In the PR body, group the reviewer guide by topic, not by commit.

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

- Use one row per logical topic, not one row per commit.
- Topic name: short noun phrase (e.g. "CRD API", "Webhook", "Reconciler")
- Commit: 8-char SHA as clickable link to GitHub commit URL
- If one commit contains multiple topics and the user declined rebasing, include multiple rows that link to the same commit.
- If commits do not map cleanly to topics, use `mixed commits` in the Commit column and explain the topic boundaries in **What to look for per commit**.
- Files: only the most important files, not the full list

## Phase 7: Create the PR

If a PR already exists, stop and tell the user to run `/pr-update` instead. Do not update existing PRs from this command.

Create the PR:

```fish
gh pr create --title "<type>(<scope>): <subject>" --body "..."
```

Title format: `[TICKET] type(scope): subject` where type is `feat`, `fix`, `refactor`, or `docs`. Omit the ticket prefix if there is no linked ticket.

## Phase 8: Trigger Codex review

After creating the PR, always comment on the PR to trigger Codex review:

```fish
gh pr comment <number-or-url> --body "@codex review"
```

## Phase 9: Report

Print:
- PR URL
- Whether the `@codex review` comment was posted
- The reviewer guide table as a compact summary
- Any rebasing that was done and the backup branch name if applicable
