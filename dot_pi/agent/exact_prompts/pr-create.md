---
description: Create a new GitHub PR with a structured description and reviewer guide
argument-hint: "[--base <branch>] [context]"
---

# PR Create

Arguments: $ARGUMENTS

Create a new GitHub PR for the current branch.

Use this command only for initial PR creation. If a PR already exists for this branch, stop and tell the user to run `/pr-update` instead.

Interpret `--base <branch>` as the base branch. If the user does not pass `--base`, use `main`. Interpret `--draft` as creating the PR in draft mode. Treat all other arguments as task context.

Do not update an existing PR.
Do not post duplicate review-trigger comments.

## Phase 1: Gather context

Parse arguments and set `base` and `draft`.

Run:

```fish
git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
gh pr view --json number,url,title,body 2>/dev/null; or echo "no PR yet"
```

Also read any `CLAUDE.md` or `AGENTS.md` files in the repository root and in changed package directories.

Also check for plan artifacts created by the `/brainstorm` → `/plan` → `/execute` workflow:

```fish
find plans -maxdepth 2 \( -name "design.md" -o -name "plan.md" \) 2>/dev/null
```

If found, note the paths for use in Phase 2 and Phase 6.

If `gh pr view` finds an existing PR, stop and tell the user to run `/pr-update`.

## Phase 2: Understand the changes

Inspect the changed files and diffs enough to explain the PR accurately.

If `plans/*/design.md` was found in Phase 1, read it before inspecting diffs. It is the authoritative record of goals, alternatives considered, risks, and key decisions for this work.

For each meaningful change, identify:
- the review topic
- the files involved
- why the change exists
- what a reviewer should verify
- what tests cover it
- any lessons worth sharing with reviewers: scope that grew beyond the original plan, interesting failure modes found during self or agentic review, surprising validation results, or non-obvious tradeoffs

Use narrow review topics. A topic should map to one subsystem, mechanism, or reviewer question. Split broad topics like "cleanup", "hardening", or "bug fix" into smaller reviewable topics when needed.

Ignore generated files unless they are important to review. Mention generated files only when they matter.

## Phase 3: Check commit structure

Compare the current commits with the review topics.

If the branch has multiple tangled commits that do not match the review topics, propose a one-commit-per-topic plan:

```markdown
| # | Topic | Files | Commit message |
|---|-------|-------|----------------|
| 1 | ... | ... | ... |
```

Ask the user before rewriting commits:

> Should I rewrite the branch into this one-commit-per-topic structure before creating the PR?

If the user agrees:
1. Create a backup branch named `backup/<current-branch>-pre-rebase`.
2. Reset softly to the merge base with `origin/$base`.
3. Create one commit per topic in review order.
4. Verify the working tree is clean.
5. Verify the diff from the backup branch contains only intentional changes.
6. Push with `--force-with-lease`.

If the user declines, keep the current commit structure and make the reviewer guide topic-based anyway.

## Phase 4: Push the branch

Push the current branch if needed:

```fish
git push -u origin (git branch --show-current)
```

## Phase 5: Collect commit links

Run:

```fish
set repo (gh repo view --json nameWithOwner -q .nameWithOwner)
git log --format="%H %s" origin/$base..HEAD
```

For each commit, build a link:

```text
https://github.com/$repo/commit/$sha
```

## Phase 6: Draft the PR title and body

Use this title format:

```text
[TICKET] type(scope): subject
```

Omit `[TICKET]` if there is no linked ticket. Use one of these types unless another type is clearly better:
- `feat`
- `fix`
- `refactor`
- `docs`
- `test`
- `chore`

Draft the PR body with this structure:

```markdown
## What

One sentence describing the final state of the PR.

## Why

Two to four sentences explaining why this change exists. Include relevant tickets, incidents, issues, or reviewer context. Write this so someone can understand the motivation months later.

## Design & implementation plan

> Include this section only when plan artifacts exist under `plans/`. Omit it otherwise.

- **[`plans/<feature>/design.md`](<github-url>)** — Human-reviewable design spec. Covers goals, alternatives considered, risks, and key decisions. Reviewers should read this.
- **[`plans/<feature>/plan.md`](<github-url>)** — Agent execution plan used to implement this PR. Covers task sequencing and step-level decisions. Optional to review.

## Reviewer guide

| # | Topic | Commit | Files |
|---|-------|--------|-------|
| 1 | <topic name> | [short-sha](full-url) | `file1.go`, `file2.go` |

**What to look for per commit:**
- **<Topic>** - specific things to verify or scrutinize

## Lessons learned

- Optional. Include only if scope grew beyond the original plan, review found an interesting failure mode, agentic/self-review materially changed the implementation, or there is a tradeoff worth sharing with reviewers.
- Explain reviewer-relevant insights, not a historical changelog.

## Tests

- Test command or scenario covered.
- If no tests were added or run, explain why.
```

Omit `## Lessons learned` when there is nothing meaningful to share. Keep the body concise and specific. Do not duplicate commit messages.

## Phase 7: Create the PR

Create the PR:

```fish
gh pr create --title "<title>" --body-file <temp-file> # add --draft if draft mode was requested
```

Capture the PR URL.

## Phase 8: Trigger Codex review

After creating the PR, post one Codex review trigger comment:

```fish
gh pr comment <pr-url> --body "@codex review"
```

## Phase 9: Report

Print:
- PR URL
- whether the Codex review comment was posted
- the reviewer guide table as a compact summary
- any commit rewriting performed
- the backup branch name, if one was created
