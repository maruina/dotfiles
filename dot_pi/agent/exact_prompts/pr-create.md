---
description: Create a new GitHub PR with a structured description and reviewer guide
argument-hint: "[--base <branch>] [context]"
---

# PR Create

Arguments: $ARGUMENTS

Create a new GitHub PR for the current branch.

Use this command only for initial PR creation. If a PR already exists for this branch, stop and tell the user to run `/pr-update` instead.

Read the `reviewable-pr-workflow` skill before creating the PR. It is the source of truth for reviewer joy, commit story, stacked PRs, evidence links, and safe rewriting. Read the `git-machete` skill before using git-machete commands.

Interpret `--base <branch>` as the base branch. If the user does not pass `--base`, detect it automatically: if the branch has a git-machete parent that is not `main` (i.e. it is a stacked branch), use that parent as `base`; otherwise use `main`. Run `git machete show parent 2>/dev/null` to detect the parent. Treat all other arguments as task context.

Goal of every PR you create: make review easy, fast, and confidence-building. Reviewers should have everything they need in the PR: motivation, scope, reading order, tests, evidence links, and the right context. Prefer small, single-purpose PRs. Split large changes into stacked PRs.

This command runs before human review starts, so reshape commits when it improves first-review quality. Do not update an existing PR. Do not post duplicate review-trigger comments.

## Phase 1: Gather context

Parse arguments and set `base` and `draft`.

Run:

```fish
git status --short
git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
gh pr view --json number,url,title,body 2>/dev/null; or echo "no PR yet"
```

If `gh pr view` finds an existing PR, stop and tell the user to run `/pr-update`.

If the working tree has uncommitted changes, handle them before deciding whether the branch has a PR diff:
- Inspect the uncommitted diff enough to determine whether it belongs in this PR.
- If the user already asked to commit, or the intended commit is obvious from the current task context and diff, stage only the intended files and create a Conventional Commit.
- If the intended commit is not obvious, ask whether to commit the uncommitted changes and propose a commit message. Do not continue to PR creation until the user answers.
- Do not stage or commit unrelated local changes. If unrelated changes are present, mention them and leave them unstaged.

After committing intended changes, rerun:

```fish
git log --oneline origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-only origin/$base..HEAD
```

If `git log origin/$base..HEAD` and `git diff origin/$base..HEAD` are still empty after handling uncommitted changes, stop and explain that GitHub has no branch diff to open.

Also read any `CLAUDE.md` or `AGENTS.md` files in the repository root and in changed package directories.

Check for plan artifacts created by the `/brainstorm` → `/plan` → `/execute` workflow:

```fish
find . \( -path '*/plans/*/design.md' -o -path '*/plans/*/plan.md' \) 2>/dev/null
```

This recursive search finds plan artifacts nested under monorepo package paths (e.g. `domains/compute/apps/<app>/plans/<ticket>/`), not only repository-root `plans/`.

If found, note the paths for Phase 2 and Phase 6.

## Phase 2: Understand the changes

Inspect the changed files and diffs enough to explain the PR accurately.

If a `**/plans/*/design.md` spec was found in Phase 1, read it before inspecting diffs. It is the authoritative record of goals, alternatives considered, risks, and key decisions for this work.

For each meaningful change, identify:
- the review topic
- the files involved
- why the change exists
- what a reviewer should verify
- what tests cover it
- what evidence supports it: logs, metrics, traces, dashboards, queries, CI links, docs, tickets, incidents, screenshots, or other artifacts
- any lessons worth sharing with reviewers: scope that grew beyond the original plan, interesting failure modes found during self or agentic review, surprising validation results, or non-obvious tradeoffs

For each claim the PR makes, identify what evidence supports it. Prefer evidence that reviewers can open or rerun.

Use narrow review topics. A topic should map to one subsystem, mechanism, or reviewer question. Split broad topics like "cleanup", "hardening", or "bug fix" into smaller reviewable topics when needed.

Ignore generated files unless they are important to review. Mention generated files only when they matter.

## Phase 3: Decide whether to split into a stack

Decide whether this should be one PR or a stack of smaller PRs. A large PR is hard to review; splitting it is usually the biggest improvement to reviewability.

Evaluate against this heuristic. These are defaults to reason from, not hard gates. State which signals tripped and let the user override.

Propose a split if any strong signal trips, or if two or more soft signals trip.

Strong signals:
- The change touches 2+ distinct subsystems or concerns that could ship and be reviewed independently.
- The change is large enough that a reviewer cannot hold it in their head in one sitting: roughly more than 400 net lines of non-generated, non-test code, or more than about 15 non-generated files.

Soft signals:
- The reviewer guide would need more than five topics.
- Commits already fall into independent groups.
- The branch mixes a refactor, a feature, and a behavior change.

If a split is warranted, propose a stack plan, one branch per reviewable step in dependency order:

```markdown
| # | Branch (maruina/...) | Step / concern | Files |
|---|----------------------|----------------|-------|
| 1 | ... | ... | ... |
```

Then ask:

> This change looks large enough to split. Should I split it into this stack of PRs?

If the user agrees, follow the splitting procedure in the `git-machete` skill. Create PRs bottom-up. This command handles the current branch; rerun it per branch as each step becomes ready. If the user declines, continue as a single PR and make the reviewer guide strong enough to compensate.

If no split is needed, compare the current commits with the review topics. If the branch has tangled commits, propose a one-commit-per-topic rewrite:

```markdown
| # | Topic | Files | Commit message |
|---|-------|-------|----------------|
| 1 | ... | ... | ... |
```

Ask before rewriting. If the user agrees:
1. Reset softly to the merge base with `origin/$base`.
2. Create one commit per topic in review order.
3. Verify the working tree is clean.
4. Verify the final diff contains only intentional changes.
5. Push with `--force-with-lease` if the branch already exists on the remote.

Do not create a backup branch by default. Create one only if the rewrite is risky enough to need a recovery point.

## Phase 4: Push the branch

Push the current branch and any downstream stacked branches:

```fish
git machete traverse -y --push --return-to=here
```

If the repo does not use git-machete, fall back to a plain push:

```fish
git push -u origin (git branch --show-current)
```

## Phase 5: Plan the review narrative and collect commits

The reviewer guide is a commit-ordered narrative: one row per commit, in the order a reviewer should read them so the change tells a story. This assumes commits are already one-per-topic. If they are not, fix that before creating the PR.

Each row links to the commit inside the PR review flow so comments there are first-class PR review comments, not commit-scoped comments:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

Never link the bare `https://github.com/<owner>/<repo>/commit/<sha>` form. Comments on that surface are commit comments: they do not appear in the PR review and orphan when history changes.

The `/pull/<pr-number>/changes/<sha>` URL needs the PR number, which does not exist until Phase 7. In this phase, collect the commit SHAs and draft the narrative order. Fill in the links in Phase 8 after the PR is created.

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

### Stacked-PR navigation block

If this PR is part of a stack, the body must begin with a stack-navigation blockquote before `## What`. Single PRs that target `main` directly and have no children omit it.

Format:

```markdown
> 📦 **Stacked PR <pos> of <total>** — part of [<TICKET>](<jira-url>)<optional: ` (<short epic/feature note>)`>
>
> - PR <pos1>: <label> — #<pr1>
> - PR <pos2>: 👉 **<label> (this PR)** — #<pr2>
> - PR <pos3>: <label> — #<pr3>

---
```

Rules:
- One bullet per PR in dependency order, bottom to top.
- Mark the current PR with `👉 **<label> (this PR)**`; all others are plain `<label>`.
- Reference every PR by `#<number>` so GitHub renders links.
- Link the ticket when known.
- Use a short position and one-line label for each PR.
- Do not include an ASCII dependency tree.
- A PR number does not exist until Phase 7. On first creation, write known siblings and fill in this PR's own `#<number>` in Phase 8.

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

## Evidence

- Optional. Include links to logs, metrics, dashboards, traces, queries, docs, tickets, incidents, screenshots, or other artifacts that help reviewers verify the change or understand the context.

## Tests

- Test command or scenario covered.
- If no tests were added or run, explain why.
```

Omit `## Lessons learned` and `## Evidence` when they add no reviewer value. Keep the body concise and specific. Do not duplicate commit messages.

## Phase 7: Create the PR

Create the PR as a draft:

```fish
git machete github create-pr --draft --title="<drafted title>"
```

Then update the title if `create-pr` did not set it:

```fish
gh pr edit <pr-number> --title "<drafted title>"
```

If the repo does not use git-machete, fall back to:

```fish
gh pr create --draft --title "<title>" --body-file <temp-file>
```

If a stack plan was created in Phase 3, this command opens the PR for the current branch only. Rerun `/pr-create` per branch as each step becomes ready for review.

Capture the PR URL and PR number.

## Phase 8: Finalize reviewer-guide links and write the body

Now that the PR number exists, build each reviewer-guide row link as:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

Fill these into the reviewer-guide table from Phase 6. If a stacked-PR navigation block was added, also fill in this PR's own `#<number>` and mark it `👉 ... (this PR)`. Write the completed body to a temp file, and set it on the PR:

```fish
gh pr edit <pr-number> --body-file <temp-file>
```

When later stack PRs are created, rerun `/pr-update` on earlier PRs so every PR's navigation block lists the now-known sibling PR numbers.

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
- evidence links added or intentionally omitted
- any commit rewriting performed
- whether stacked descendants were pushed
- assumptions and tradeoffs
