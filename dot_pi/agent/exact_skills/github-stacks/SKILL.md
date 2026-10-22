---
name: github-stacks
description: "Create and manage stacked pull requests with GitHub's native stack support and GitHub CLI. Use for planning stacked PRs, creating or submitting a stack, checking stack status, and updating branches in a stack. For PR review policy and history rewrites, use the reviewable-pr-workflow skill first."
---
# GitHub Stacks
Use GitHub's native stacked pull request support for stacked PR workflows. GitHub provides stack management in its UI; the `gh stack` commands come from GitHub's `gh-stack` CLI extension. Install the extension once per machine:

```bash
gh extension install github/gh-stack
```

Use `reviewable-pr-workflow` for PR policy: review-state discipline, history rewrites, safe pushes, and PR descriptions.

GitHub stacks connect pull requests whose base branches form a chain. The bottom PR targets the repository's default branch; each higher PR targets the branch below it. GitHub displays the stack and its PR status. Native stack support is in public preview and may not be enabled in every repository.

## Create a stack
Use Matteo's branch names:
- `maruina/<jira-ticket>` when a Jira ticket exists.
- `maruina/<branch-name>` otherwise.

Create the first branch and register it as the stack root:

```bash
git switch main
gh stack init maruina/<first-step>
```

Commit the first step, then create each dependent branch with `gh stack add`:

```bash
git add -p
git commit -m 'First step'
gh stack add maruina/<second-step>
```

Repeat `gh stack add` for later branches, committing each step before adding the next branch. Submit the stack when it is ready:

```bash
gh stack submit
```

`gh stack submit` pushes the branches and creates pull requests with the correct base relationships. Review the command output and confirm the stack in GitHub before reporting success.

## Inspect and update a stack

| Intent | Command |
|---|---|
| Show stack branches and PRs | `gh stack status` |
| Add the next branch | `gh stack add maruina/<name>` |
| Push branches and create or update PRs | `gh stack submit` |

Make changes with Git and submit them with `gh stack submit`. Follow GitHub's stack status and management guidance when rebasing, syncing, merging, or removing branches; inspect the full affected stack before rewriting a branch.

For PRs that already form a base-branch chain, use GitHub's convert-to-stack option when it appears in the UI. Confirm the stack in the PR page or with `gh stack status`.

## Review-state rule
Choose history operations from `reviewable-pr-workflow`:

- Before human review, rebase or restack when it improves the PR story.
- After human review starts, preserve that PR branch's history by default. Add response commits and push normally.
- Rewrite a human-reviewed PR only when the user explicitly asks. Use `git push --force-with-lease`, never plain `git push --force`.
- Before rewriting a parent, inspect every descendant PR. Stop if the change would rewrite a human-reviewed descendant without explicit user approval.

## Availability and limits
GitHub's native stacked PR support is in public preview. Stacks require PRs in the same repository; cross-fork stacks are not supported. If `gh stack` or the GitHub stack UI is unavailable, check GitHub's stacked PR documentation and repository availability. Keep the PR base-branch chain intact and create or update PRs with `gh pr`; do not switch to git-machete unless the user requests it.

- [About stacked pull requests](https://docs.github.com/en/pull-requests/get-started/about-stacked-prs)
- [Create stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-stacked-pull-requests)
- [Manage stacked pull requests](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/managing-stacked-pull-requests)
