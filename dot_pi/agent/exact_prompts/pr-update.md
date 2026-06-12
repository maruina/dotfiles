---
description: Update an existing PR by applying review-state discipline, shaping commits when allowed, and refreshing the PR description
argument-hint: "[context]"
---

# PR Update

Arguments: $ARGUMENTS

Update the current branch's existing GitHub PR after feedback or implementation changes.

Read the `reviewable-pr-workflow` skill before updating the PR. It is the source of truth for reviewer joy, review-state discipline, commit story, stacked PRs, evidence-based review, and safe rewriting. Read the `git-machete` skill before using git-machete commands.

Use this command only for existing PRs. Do not create a new PR.

## Decision rule

Do not refuse history rewriting merely because a PR is open.

If the user asks to remove a file "from commits" or "from history", treat that as an explicit request to rewrite the PR branch. Do not convert it into a new deletion commit by default.

Default behavior:
- If no human review has started: rewrite, remove the file from the offending commit, and push with `--force-with-lease`.
- If human review has started: state the GitHub review UI tradeoff, then proceed because the user explicitly requested rewriting.
- Ask only if human review has started and the rewrite request is ambiguous.

Example:
- User: "Remove `scripts/fix_rmp_rms_subnets.py` from commits."
- Correct: rewrite the branch so the file is removed from the commit where it was introduced, then push with `--force-with-lease`.
- Incorrect: add a new commit that deletes the file just because the PR is open.

Comments from Matteo or the PR author are author instructions, not human review. Do not treat them as the start of human review, even if they are PR comments, review comments, or diff comments. They may still be explicit rewrite intent.

Assume this command may run multiple times on the same PR. Make the update idempotent: preserve useful existing content, replace stale generated sections instead of appending duplicates, and keep only one `## Lessons learned` section and one `## Evidence` section.

Do not post `@codex review` unless the user explicitly asks.
Propose a PR title change when the existing title no longer reflects the final PR scope.
Ask before changing the PR title unless `$ARGUMENTS` explicitly requests a title update.
If the branch has unrelated uncommitted changes, inspect them and commit only changes that belong in this PR. Leave unrelated changes unstaged and mention them.

## Phase 1: Gather PR, review, and branch context

Run:

```fish
gh pr view --json number,title,body,baseRefName,url,author,reviews,comments,latestReviews,reviewDecision
```

Set the base branch from `.baseRefName`.

Classify whether human review has started. Treat the PR as human-reviewed if any review, PR comment, or diff comment came from a human other than the PR author. Use the injected `GitHub Identity` as the current-user hint, but prefer fresh `gh pr view --json author,reviews,comments,latestReviews` data when available. Compare review/comment authors against `.author.login` and the current authenticated GitHub user. Comments from Matteo, the current user, or the PR author are author instructions, not human review. Bot, Codex, and agent comments do not count as human review. If uncertain, assume human review has started and do not rewrite unless the user explicitly requested it.

Then gather:

```fish
git status --short
git log --reverse --format="%H %s" origin/$base..HEAD
git diff --stat origin/$base..HEAD
git diff --name-status origin/$base..HEAD
```

Also inspect recent commits and changed files enough to understand the current final state of the PR.

If `$ARGUMENTS` is non-empty, treat it as user-provided context about what changed, what reviewer feedback was addressed, or whether the user explicitly wants history rewritten.

Do not refuse rewriting merely because the PR is open. The rewrite boundary is human review state. Treat requests like "remove <file> from commits", "remove <file> from history", "clean up the commits", "squash", "fixup", "reorder", "rewrite this PR", "force-push", or "reset for review" as explicit rewrite intent.

If human review has started and the user explicitly requested a rewrite, proceed after stating that commit SHAs may change and GitHub's "changes since last review" or commit-anchored comments may be disrupted. If human review has started and rewrite intent is ambiguous, ask before rewriting.

## Phase 2: Understand the existing PR body

Read the existing PR body.

Identify:
- what is still accurate
- what is stale
- whether the existing PR title still reflects the final PR scope
- what changed since the PR was created or last updated
- what reviewer feedback appears to have been addressed
- what tests were added or rerun
- what evidence supports the PR's claims, and what evidence is stale or missing

Preserve the existing PR structure when possible.

Because this command may run repeatedly:
- Do not append a second copy of any section.
- Replace existing generated sections in place.
- Keep hand-written details that are still accurate.
- Remove outdated review-response bullets instead of accumulating a historical changelog.
- If the existing `## Changes since last review` section exists, replace it with `## Lessons learned` when there is useful reviewer context to share; otherwise remove it.
- If the existing `## Lessons learned` section is stale, replace it with the latest meaningful lessons.
- If the existing `## Evidence` section is stale, replace it with current evidence; otherwise preserve useful evidence links.

## Phase 3: Shape or preserve the PR branch

Follow the review-state discipline from `reviewable-pr-workflow`.

Before human review has started, decide whether the current commit structure tells a coherent review story. Prefer rewriting when it improves reviewability, especially when:
- follow-up commits only fix mistakes from earlier commits
- a file was accidentally added and later removed
- pre-review feedback created noisy "fix typo", "fix lint", or "remove temp file" commits
- commits are ordered poorly for reviewers
- the reviewer guide would otherwise include useless rows

Use interactive rebase, `git commit --fixup`, `git rebase --autosquash`, `git reset`, manual recommitting, or git-machete restacking as appropriate. Push rewritten history with:

```fish
git push --force-with-lease
```

Never use plain `git push --force`.

After human review has started, preserve branch history by default. Land work as new commits and push normally:
- Review feedback and follow-up changes are committed on top of the branch.
- Upstream changes are merged into human-reviewed PR branches, not rebased onto them.

Do not use broad `git machete traverse -yW` on a human-reviewed PR branch unless you have inspected the stack and confirmed it will not rebase the reviewed branch. When upstream changes are needed, merge them into the reviewed branch explicitly and push without force:

```fish
git merge origin/$base
git push
```

For unreviewed descendants, restack after the reviewed branch is updated, then push those descendants according to the review-state rules.

If git-machete is not set up, use the same manual merge-and-push flow.

If the branch's position in the stack changed, retarget the PR:

```fish
git machete github retarget-pr
```

For stacked PRs, keep the whole stack consistent. Before rewriting any branch, inspect:

```fish
git machete status -l
```

If rewriting a branch affects descendants, restack descendants and push affected branches with `--force-with-lease`. If any affected PR has human review and the user did not explicitly request a rewrite, stop and ask.

Do not create a `backup/` branch unless a risky manual rewrite needs a recovery point.

## Phase 4: Draft the updated PR title and body

If the existing PR title is stale, propose a new title that reflects the final PR scope. Keep the existing title if it is still accurate.

The reviewer guide is a commit-ordered narrative: one row per commit in reading order. Each row links to the commit inside the PR review flow so comments there are first-class PR review comments:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

The PR number comes from Phase 1. Collect SHAs in reading order with:

```fish
git log --reverse --format="%H %s" origin/$base..HEAD
```

Never link the bare `/commit/<sha>` form. Comments there are commit-scoped and do not appear in the PR.

After any rewrite or squash, regenerate the reviewer guide from the final pushed SHAs. Do not preserve stale commit links.

Use evidence-based review. Update `## Evidence` when the implementation, validation, or reviewer concerns changed. Add links or commands for claims reviewers would otherwise need to verify manually. Omit `## Evidence` when external artifacts add no reviewer value.

### Stacked-PR navigation block

If this PR is part of a stack, the body must begin with a stack-navigation blockquote before `## What`. Build or refresh it every run. Single PRs targeting `main` with no children omit it, and stale blocks should be removed.

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
- Discover sibling PRs from the machete layout, `git machete status`, and `gh pr list`.
- Keep the block consistent across all PRs in the stack.

Use this body structure unless the existing PR body uses a clearly intentional different structure:

```markdown
## What

One sentence describing the current final state of the PR.

## Why

Two to four sentences explaining why this change exists.

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

- Test command or validation scenario.
- If no tests were added or run, explain why.
```

Only include `## Lessons learned` when there is something reviewer-relevant. Explain insights, not history.

Only include `## Evidence` when external artifacts help reviewers understand, verify, or trust the change. Prefer durable links and reproducible commands. Include query text, commands, or time windows when links alone are not enough.

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
- whether human review has started
- whether commits were rewritten, squashed, reordered, or preserved
- whether a force-push with lease was performed
- whether upstream was merged into the branch and whether downstream branches were updated/pushed
- whether the PR was retargeted
- whether the PR title was changed, proposed but not changed, or left unchanged
- sections changed
- whether reviewer-guide commit links were regenerated
- whether `Lessons learned` was added, updated, removed, or left unchanged
- whether `Evidence` was added, updated, removed, intentionally omitted, or left unchanged
- any assumptions made
