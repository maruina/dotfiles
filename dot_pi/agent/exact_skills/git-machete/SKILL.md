---
name: git-machete
description: "Use git-machete for stacked branch mechanics: creating, traversing, restacking, retargeting, advancing, squashing, and cleaning stacked PR branches. For PR review policy, rewrite rules, and reviewer-guide expectations, use the reviewable-pr-workflow skill first."
---
# Git Machete

Use this skill for git-machete mechanics. Use `reviewable-pr-workflow` as the source of truth for PR policy: reviewer joy, review-state discipline, when to rewrite history, safe force-pushes, PR descriptions, evidence links, and reviewer guides.

Git-machete manages branch stacks. The goal is a stack of focused PRs where each PR tells one clear part of the story.

## Branch naming

Use Matteo's standard:
- `maruina/<jira-ticket>` when a Jira ticket exists.
- `maruina/<branch-name>` otherwise.

The Confluence examples use `data.dog/...`; ignore that and use `maruina/...`.

## Setup

Install git-machete once per machine:

```fish
brew install git-machete
```

Initialize tracking in a repo if needed:

```fish
git machete discover -y
git machete status -l
```

## Core operations

| Intent | Command |
|---|---|
| New stacked branch off current | `git machete add -y maruina/<name>` |
| View the stack | `git machete status -l` |
| Commit, then update descendants | `git commit` then `git machete traverse -y --return-to=here` |
| Traverse the stack from upstream | `git machete traverse -yW` |
| Push current branch and descendants | `git machete traverse -y --push --return-to=here` |
| Interactive rebase against parent | `git machete reapply` |
| Open a draft PR | `git machete github create-pr --draft` |
| Retarget an open PR after a stack move | `git machete github retarget-pr` |
| Delete merged or untracked branches | `git machete clean` |

`traverse` walks the whole branch layout in topological order from the starting branch. It can touch branches outside the current stack. Use `-n` instead of `-y` when you want to confirm each step.

## Review-state rule

Git-machete can rebase, merge, and restack branches. Choose the operation from `reviewable-pr-workflow`:

- Before human review, prefer rebasing/restacking when it makes the PR story clearer.
- After human review starts on a PR, preserve that PR branch's history by default. Add response commits and push normally.
- Rewrite a human-reviewed PR only when the user explicitly asks. Use `git push --force-with-lease`, never plain `git push --force`.
- If rewriting a parent branch affects descendant PRs, inspect the whole stack and stop if any affected human-reviewed PR would be rewritten without explicit user approval.

A request to remove a file from commits/history, clean up commits, squash/fixup/reorder commits, rewrite a PR, force-push, or reset a PR for review is explicit rewrite intent. Follow `reviewable-pr-workflow`; do not refuse merely because the PR is open.

## Opening a PR

Create PRs as drafts:

```fish
git machete github create-pr --draft
```

Some git-machete versions ignore title/body flags. If needed, set the title and body with `gh pr edit` after creation.

Do not add blanket `rebase=no` or `update=merge` annotations by default. The correct update strategy depends on review state:
- Branches without human review may be rebased/restacked.
- Human-reviewed branches should preserve history unless the user explicitly asks to rewrite.

If a repository or branch already uses annotations, inspect them before changing behavior:

```fish
git machete anno
```

## Traversing stacks

For branches without human-reviewed PRs, `traverse -yW` is usually the easiest way to restack against upstream:

```fish
git machete traverse -yW
```

For human-reviewed PR branches, avoid rebasing by default. If upstream changes must be incorporated, merge upstream into the reviewed branch, then push normally:

```fish
git merge origin/<base>
git push
```

Then rebase or restack descendants that have not received human review.

## Rewriting a stack

Before rewriting, inspect the stack:

```fish
git machete status -l
```

When rewriting is allowed by `reviewable-pr-workflow`:

1. Rewrite the target branch into the desired review story.
2. Restack descendants onto the rewritten parent.
3. Push affected branches with `git push --force-with-lease`.
4. Update every affected PR body so stack navigation and commit tables match the final SHAs.

Do not rewrite only a parent and leave descendants based on old commits.

## Splitting one branch into a stack

Use this when a branch is too large to review well. Goal: one branch per reviewable step.

1. Squash the branch into one commit, then unstage it:
   ```fish
   git machete squash
   git reset HEAD~1
   ```
2. Build the first branch's commit:
   ```fish
   git add -p
   git stash -ukm 'For later branches'
   git commit -m 'First step changes'
   ```
3. Create the next branch and commit the next step:
   ```fish
   git machete add -y maruina/<step-2>
   git stash pop
   git add -p
   git commit -m 'Second step changes'
   ```
4. Repeat for each step. Open PRs bottom-up as each branch becomes ready.

## Moving a branch within or out of a stack

git-machete has no built-in `move` or `reorder`. Move branches by editing the layout.

1. Lock fork points for the branch being moved and its descendants:
   ```fish
   git switch maruina/<branch>
   git machete fork-point --override-to-parent
   git machete fork-point --override-to-parent maruina/<descendant>
   ```
2. Edit the layout:
   ```fish
   git machete edit
   ```
3. Restack to match the new layout:
   ```fish
   git machete update
   # or
   git machete traverse --start-from=root --return-to=here
   ```
4. Unset overrides and retarget affected PRs:
   ```fish
   git machete fork-point --unset-override
   git machete github retarget-pr
   ```

## Combining two branches

From the parent branch:

```fish
git switch maruina/feature-1-step-1
git machete advance
git machete clean
```

`advance` fast-forwards the parent to the child head, then untracks and deletes the child.

## Conflicts

git-machete keeps no in-progress state. If `traverse` hits a conflict, resolve it, continue the underlying operation, then rerun `git machete traverse -y`:

```fish
git rebase --continue
# or finish the merge
git machete traverse -y
```

## Git to git-machete cheatsheet

| Git/GitHub | git-machete |
|---|---|
| `git switch -c maruina/x` | `git machete add -y maruina/x` |
| `git pull --rebase origin main` | `git machete traverse -yW` |
| `gh pr create --draft` | `git machete github create-pr --draft` |
| `git rebase -i <base>` | `git machete reapply` |
| Push after normal commits | `git machete traverse -y --push --return-to=here` |
| Push after intentional rewrite | `git push --force-with-lease` |
