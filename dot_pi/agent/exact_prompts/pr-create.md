---
description: Create a new GitHub PR with a structured description and reviewer guide
argument-hint: "[--base <branch>] [context]"
---

# PR Create

Arguments: $ARGUMENTS

Create a new GitHub PR for the current branch.

Use this command only for initial PR creation. If a PR already exists for this branch, stop and tell the user to run `/pr-update` instead.

Interpret `--base <branch>` as the base branch. If the user does not pass `--base`, detect it automatically: if the branch has a git-machete parent that is not `main` (i.e. it is a stacked branch), use that parent as `base`; otherwise use `main`. Run `git machete show parent 2>/dev/null` to detect the parent. Treat all other arguments as task context.

This workflow uses git-machete with a **no-rebase-once-open** stance: once a PR is open, its branch is never rebased — upstream changes are merged in. Read the `git-machete` skill before performing any stack, branch, or PR operations here. PRs are opened as **draft by default** and annotated for merge-based updates.

Goal of every PR you create: make it a **joy to review**. Prefer small, single-purpose PRs; when a change is large, split it into a stack and give reviewers a narrative reading order.

Do not update an existing PR.
Do not post duplicate review-trigger comments.
Do not rebase a branch that already has an open PR.

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

## Phase 3: Decide whether to split into a stack

Decide whether this should be **one PR** or a **stack of smaller stacked PRs**. A large PR is hard to review; splitting it is usually the single biggest improvement to reviewability.

Evaluate against this heuristic. These are defaults to reason from, not hard gates — state which signals tripped and let the user override.

Propose a split if **any strong signal** trips, or if **two or more soft signals** trip.

**Strong signals (any one → propose split):**
- The change touches 2+ distinct subsystems or concerns that could ship and be reviewed independently.
- The change is large enough that a reviewer cannot hold it in their head in one sitting: roughly >400 net lines of non-generated, non-test code, or >~15 non-generated files.

**Soft signals (two or more → propose split):**
- The reviewer guide would need more than 5 topics.
- Commits already fall into clearly independent groups.
- The branch mixes a refactor, a new feature, and a behavior change together.

If a split is warranted, propose a stack plan, one branch per reviewable step in dependency order:

```markdown
| # | Branch (maruina/...) | Step / concern | Files |
|---|----------------------|----------------|-------|
| 1 | ... | ... | ... |
```

Then ask:

> This change looks large enough to split. Should I split it into this stack of PRs?

If the user agrees, follow the **Splitting one big branch into a stack** procedure in the `git-machete` skill, then create PRs bottom-up (this command handles the bottom branch; rerun it per branch as each becomes ready). If the user declines, continue as a single PR but make the reviewer guide a strong file-order narrative anyway.

If no split is needed, compare the current commits with the review topics. If the branch has tangled commits that do not match the topics **and the branch has no open PR yet**, you may propose a one-commit-per-topic rewrite:

```markdown
| # | Topic | Files | Commit message |
|---|-------|-------|----------------|
| 1 | ... | ... | ... |
```

Ask before rewriting. If the user agrees:
1. Create a backup branch named `backup/<current-branch>-pre-rebase`.
2. Reset softly to the merge base with `origin/$base`.
3. Create one commit per topic in review order.
4. Verify the working tree is clean and the diff from the backup branch contains only intentional changes.
5. Push with `--force-with-lease`.

This rewrite is only acceptable **before** the PR exists. Never do it on a branch with an open PR.

## Phase 4: Push the branch

Push the current branch and any downstream stacked branches:

```fish
git machete traverse -y --push --return-to=here
```

If the repo does not use git-machete yet, fall back to a plain push:

```fish
git push -u origin (git branch --show-current)
```

## Phase 5: Plan the review narrative and collect commits

The reviewer guide is a **commit-ordered narrative**: one row per commit, in the order a reviewer should read them so the change tells a story (foundational types first, then the mechanisms that use them, then wiring/config/docs last). This assumes commits are already one-per-topic (Phase 3); if not, fix that first.

Each row links to the commit **inside the PR review flow** so that comments made there are first-class PR review comments (anchored to the PR diff), not commit-scoped comments:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

**Never** link the bare `https://github.com/<owner>/<repo>/commit/<sha>` form. Comments on that surface are commit comments: they do not appear in the PR review and orphan when history changes.

The `/pull/<pr-number>/changes/<sha>` URL needs the PR number, which does not exist until Phase 7. So in this phase only collect the commit SHAs and draft the narrative order; fill in the links in Phase 8 after the PR is created.

```fish
set repo (gh repo view --json nameWithOwner -q .nameWithOwner)
git log --reverse --format="%H %s" origin/$base..HEAD
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

### Stacked-PR navigation block (required for any PR in a stack)

If this PR is part of a stack (the branch targets another `maruina/...` branch rather than `main`, or a stack plan was created in Phase 3), the body **must begin** with a stack-navigation blockquote, before `## What`. Single PRs that target `main` directly and have no children omit it.

Format (a blockquote; no ASCII tree — keep it scannable):

```markdown
> 📦 **Stacked PR <pos> of <total>** — part of [<TICKET>](<jira-url>)<optional: ` (<short epic/feature note>)`>
>
> - PR <pos1>: <label> — #<pr1>
> - PR <pos2>: 👉 **<label> (this PR)** — #<pr2>
> - PR <pos3>: <label> — #<pr3>
```

Rules for the block:
- One bullet per PR in the stack, in dependency order (bottom → top).
- Mark the current PR with `👉 **<label> (this PR)**`; all others are plain `<label>`.
- Reference every PR by its `#<number>` so GitHub renders clickable, bidirectional links. Link the ticket with a Markdown link.
- Use a short `<pos>` per branch (e.g. `1`, `2a`, `2b`, `3`) and a one-line `<label>` describing that PR's scope.
- Do **not** include an ASCII dependency tree — the bullet list is the whole block.
- Separate the block from the body with a `---` line.
- A PR number does not exist until it is created (Phase 7). On first creation, write the block with the known siblings and fill in this PR's own `#<number>` in Phase 8; update sibling numbers as later stack PRs are opened.

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

> Read the commits in this order. Open each via its link below and comment there — those are first-class PR review comments. Do **not** open commits via the `/commit/<sha>` URL; comments there do not show up in the PR.

> The stack-navigation block at the top of the body already shows this PR's place in the stack; do not duplicate that here.

| # | Commit | Files | What to look for |
|---|--------|-------|------------------|
| 1 | [short-sha](https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>) | `file1.go`, `file2.go` | specific things to verify or scrutinize |

## Lessons learned

- Optional. Include only if scope grew beyond the original plan, review found an interesting failure mode, agentic/self-review materially changed the implementation, or there is a tradeoff worth sharing with reviewers.
- Explain reviewer-relevant insights, not a historical changelog.

## Tests

- Test command or scenario covered.
- If no tests were added or run, explain why.
```

Omit `## Lessons learned` when there is nothing meaningful to share. Keep the body concise and specific. Do not duplicate commit messages.

## Phase 7: Create the PR

Create the PR as a **draft** and annotate the branch with `rebase=no` so future traverses do not automatically rebase it (no-rebase-once-open):

```fish
git machete github create-pr --draft --title="<drafted title>" && git machete anno (git machete anno) rebase=no
```

Then update the title if it was not accepted by `create-pr` (some versions ignore `--title`):

```fish
gh pr edit <pr-number> --title "<drafted title>"
```

If the repo does not use git-machete, fall back to:

```fish
gh pr create --draft --title "<title>" --body-file <temp-file>
```

If a stack plan was created in Phase 3, this command opens the PR for the current (bottom) branch only; the user reruns `/pr-create` per branch as each step becomes ready for review.

Capture the PR URL and PR number.

## Phase 8: Finalize reviewer-guide links and write the body

Now that the PR number exists, build each reviewer-guide row link as:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

Fill these into the reviewer-guide table from Phase 6. If a stacked-PR navigation block was added, also fill in this PR's own `#<number>` (and mark it `👉 ... (this PR)`). Write the completed body to a temp file, and set it on the PR:

```fish
gh pr edit <pr-number> --body-file <temp-file>
```

When later stack PRs are created, rerun `/pr-update` on the earlier PRs (or edit their bodies) so every PR's navigation block lists the now-known sibling `#<number>`s.

## Phase 9: Trigger Codex review

After creating the PR, post one Codex review trigger comment:

```fish
gh pr comment <pr-url> --body "@codex review"
```

## Phase 10: Report

Print:
- PR URL
- whether the Codex review comment was posted
- the reviewer guide table as a compact summary
- any commit rewriting performed
- the backup branch name, if one was created
