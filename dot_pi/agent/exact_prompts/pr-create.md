---
description: Create a draft GitHub PR with a focused reviewer guide and automatic Codex review
argument-hint: "[--base <branch>] [context]"
---
# PR Create
Arguments: `$ARGUMENTS`

Create the first GitHub PR for the current branch. Use `/pr-update` when the branch already has a PR.

Read `reviewable-pr-workflow` before acting. It is the source of truth for PR bodies, history, stacks, reviewer guides, and reporting. Read `git-machete` only when using git-machete.

Creating a PR is the explicit side effect of this command. Create it as a draft, then post one `@codex review` comment after its final title and body are set. Do not post duplicate triggers.

## Phase 1: Establish PR state
Parse `--base <branch>`. All remaining arguments are task context.

If `--base` is absent, use a non-`main` git-machete parent when one exists; otherwise use `main`.

Run:

```bash
git status --short
gh pr view --json number,url,title,body 2>/dev/null || true
git log --oneline "origin/$base..HEAD"
git diff --stat "origin/$base..HEAD"
git diff --name-only "origin/$base..HEAD"
```

If `gh pr view` finds a PR, stop and direct the user to `/pr-update`.

Handle uncommitted changes before creating the PR:
- Inspect enough of the diff to determine whether it belongs in this PR.
- If the user requested a commit, or the intended commit is clear from the task context and diff, stage only those files and create a Conventional Commit.
- If intent is unclear, propose a commit message and ask. Do not create a PR until the user answers.
- Leave unrelated changes unstaged and report them.

After committing intended changes, rerun the branch-diff commands. If the branch has no diff from `origin/$base`, stop: there is nothing to open.

Read repository guidance in the root and changed package directories. Locate relevant `plans/**/design.md` and `plans/**/plan.md` artifacts.

## Phase 2: Prepare a reviewable change
Read the significant diff and, when present, the design artifact. Identify the PR's purpose, review topics, tests, and evidence. Ignore generated files unless reviewers need to inspect them.

Apply the split and commit-story guidance in `reviewable-pr-workflow`:
- If the change should be a stack, propose the stack and ask before restructuring it.
- If the change remains one PR but commits do not tell the review story, propose a one-commit-per-topic rewrite and ask before rewriting.
- After an approved rewrite, verify a clean working tree and that the final diff contains only intended changes.

## Phase 3: Push and create the draft PR
Push the branch. For a git-machete stack, use its documented push workflow; otherwise use:

```bash
git push -u origin "$(git branch --show-current)"
```

Draft a title and body using the `reviewable-pr-workflow` template. Include an optional `## Design & implementation plan` section only when matching plan artifacts exist:
- link `design.md` as the reviewer-facing design record;
- link `plan.md` as optional implementation context.

Create a draft PR. Prefer git-machete when the branch is in a stack; otherwise use `gh pr create --draft`. Capture its URL and number.

Now that the PR number exists, generate reviewer-guide links in this form and set the final body:

```text
https://github.com/<owner>/<repo>/pull/<pr-number>/changes/<full-sha>
```

For a stack, fill or refresh the shared navigation block after creating each sibling PR. Run `/pr-update` on earlier stack PRs when later siblings obtain PR numbers.

Post exactly one review trigger after the final body is set:

```bash
gh pr comment <pr-url> --body "@codex review"
```

## Report
Report per the workflow skill, plus:
- the base branch;
- whether a stack was proposed;
- the final reviewer-guide topics;
- that the Codex review trigger was posted.
