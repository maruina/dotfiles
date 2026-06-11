---
name: git-machete
description: Manage stacked branches and stacked PRs with git-machete using Matteo's no-rebase-once-open workflow. Use when creating or updating stacked PRs, splitting a large branch into a stack, restacking after upstream changes, moving branches in a stack, or driving git machete add/traverse/create-pr/advance/squash operations.
---
# Git Machete

Use this skill to drive [git-machete](https://git-machete.readthedocs.io/en/stable) for stacked branches and stacked PRs.

This workflow mirrors Mat Brown's opinionated workflow with one firm rule: **once a PR is open, never rebase its branch — merge upstream into it instead.** Rebasing only happens on branches that do not yet have an open PR.

## Why no-rebase-once-open

Once a PR is open, rebasing/force-pushing causes real harm:
- It rewrites commit SHAs, which **orphans review comments anchored to those SHAs** (they become "outdated" and cannot be resolved).
- It breaks GitHub's "changes since last review".
- It clutters PR history with duplicate near-identical commits.

Note on per-commit review links: a reviewer guide *can* link commits via the in-PR review surface `https://github.com/<owner>/<repo>/pull/<n>/changes/<sha>` — comments there are first-class PR review comments. The bare `https://github.com/<owner>/<repo>/commit/<sha>` surface creates commit-scoped comments that do not show up in the PR. Either way, both are anchored to a SHA, so no-rebase-once-open is what keeps them alive.

So: review feedback and upstream updates land as **new commits / merge commits** on open-PR branches, preserving the PR's review history. Branches without an open PR are still rebased, because rebasing is what keeps a stack clean.

## Branch naming

Use Matteo's standard:
- `maruina/<jira-ticket>` when a Jira ticket exists.
- `maruina/<branch-name>` otherwise.

The Confluence examples use `data.dog/...`; ignore that and use `maruina/...`.

## Setup (once per machine)

```fish
brew install git-machete
```

Initialize tracking in a repo if needed:

```fish
git machete discover -y   # infer layout from existing branches
git machete status        # view the branch tree
```

## Core daily operations

| Intent | Command |
|---|---|
| New stacked branch off current | `git machete add -y maruina/<name>` |
| View the stack | `git machete status -l` |
| Commit + update downstream | `git commit` then `git machete traverse -y --return-to=here` |
| Sync everything from upstream | `git machete traverse -yW` |
| Push current + downstream | `git machete traverse -y --push --return-to=here` |
| Interactive rebase vs parent | `git machete reapply` (only if no PR open — see rule below) |
| Open a PR (see create-pr below) | `git machete github create-pr --draft` |
| Retarget an open PR after a move | `git machete github retarget-pr` |
| Delete merged/untracked branches | `git machete clean` |

`traverse` always walks the **whole** branch layout in topological order from the starting branch — it can touch branches outside the current stack. Use `-n` instead of `-y` to confirm each branch when you don't want that.

## Opening a PR (Mat's create-pr pattern)

PRs are opened as **draft** and annotated with `rebase=no` so future traverses do not automatically rebase the open-PR branch:

```fish
git machete github create-pr --draft && git machete anno (git machete anno) rebase=no
```

`git machete anno` clobbers existing annotations, so `(git machete anno)` re-substitutes the PR mapping that `create-pr` just wrote. After this, `rebase=no` is set on the open-PR branch.

To sync an open-PR branch with its upstream, merge explicitly:

```fish
git machete traverse --merge -y --return-to=here
```

`rebase=no` prevents accidental rebasing during a broad `traverse -yW`; the `--merge` flag is the supported way to merge upstream into the branch.

Only open a PR once a branch directly targets the trunk (`main`), or as the next reviewable step in a stack that's ready for review. You can push branches freely without creating PRs.

## The ideal traverse

Given:

```text
  main
  |
  o-maruina/feature-1-step-1  PR #123  rebase=no
  | |
  | o-maruina/feature-1-step-2          (no PR → rebase)
  |
  o-maruina/feature-2                   (no PR → rebase)
```

`git machete traverse -W` should:
1. **Skip rebase** for `feature-1-step-1` (has a PR → `rebase=no`). Sync it manually with `git machete traverse --merge -y --return-to=here` when needed.
2. **Rebase** `feature-1-step-2` onto `feature-1-step-1`.
3. **Rebase** `feature-2` onto `main`.

The `rebase=no` annotation prevents machete from rebasing the open-PR branch during broad traverses. Use `--merge` explicitly to pull in upstream changes.

## Responding to review feedback (open PR)

Do **not** rebase. Commit the fix as a new commit and push downstream:

```fish
git switch maruina/feature-1-step-1
git commit                                  # new commit addressing feedback
git machete traverse -y --push --return-to=here
```

Downstream branches get rebased onto the updated parent automatically; the open-PR branch itself only ever receives new commits and upstream merges.

## Merging the first PR

Merge via the GitHub UI / merge queue as usual. Then locally:

```fish
git machete traverse -yW
git machete clean        # add -y to delete untracked branches without prompting
```

This deletes the merged branch and restacks the rest onto latest `main`. Publish and open the next PR:

```fish
git machete traverse -y --push
git machete github create-pr --draft --title="<title>" && git machete anno (git machete anno) rebase=no
```

## Splitting one big branch into a stack

Use this when a branch is too large to review well (see the `/pr-create` split heuristic). Goal: turn one branch into a stack where each branch is one reviewable step.

1. Squash the branch into a single commit, then unstage it:
   ```fish
   git machete squash
   git reset HEAD~1
   ```
2. Build the first branch's commit by staging only its hunks:
   ```fish
   git add -p                       # stage only hunks for branch 1 (new files: git add <path>)
   git stash -ukm 'For later branches'
   git commit -m 'First step changes'
   ```
3. Create the next branch and commit the rest:
   ```fish
   git machete add -y maruina/<step-2>
   git stash pop
   git add -p                       # stage only step-2 hunks; repeat stash/commit for >2 steps
   git commit -m 'Second step changes'
   ```
4. Repeat step 3 for each additional step. Then open PRs bottom-up as each step is ready.

## Moving a branch within / out of a stack

git-machete has no built-in `move`/`reorder`. Do it by hand:

1. Lock fork points for the branch being moved and all its descendants:
   ```fish
   git switch maruina/<branch>
   git machete fork-point --override-to-parent
   git machete fork-point --override-to-parent maruina/<descendant>
   ```
2. Edit the layout file to the shape you want:
   ```fish
   git machete edit
   ```
3. Restack to match (review each rebase plan):
   ```fish
   git machete update           # per moved branch, or:
   git machete traverse --start-from=root --return-to=here
   ```
4. Unset the overrides and retarget affected open PRs:
   ```fish
   git machete fork-point --unset-override
   git machete github retarget-pr   # for each branch with an open PR
   ```

## Combining two branches

From the parent branch:

```fish
git switch maruina/feature-1-step-1
git machete advance        # fast-forwards parent to child head, untracks + deletes child
git machete clean
```

## Stateless traverse / conflicts

git-machete keeps no in-progress state. If a `traverse` hits a conflict, resolve it, `git rebase --continue` (or finish the merge), then re-run `git machete traverse -y` to resume from the current branch.

## Git → machete cheatsheet

| Git/GitHub | git-machete |
|---|---|
| `git commit` | `git commit` + `git machete traverse -y --return-to=here` |
| `git switch -c maruina/x` | `git machete add -y maruina/x` |
| `git pull --rebase origin main` | `git machete traverse -yW` (touches all tracked branches) |
| `git push -f` | `git machete traverse -y --push --return-to=here` |
| `gh pr create` | `git machete github create-pr --draft` (+ `rebase=no` anno) |
| `git rebase -i main` | `git machete reapply` (only if no PR open) |
