---
name: feature-worktree
description: Choose or create the feature worktree for work that writes files or commits, and resolve a GitHub PR URL to a worktree on the PR head. Use from lifecycle and PR prompts before changing files, and whenever a PR URL must map to local code without moving HEAD in the base checkout.
---
# Feature Worktree
Put all writes and commits in a feature worktree. Keep the base checkout on its default branch. Git naming and the worktree root come from `AGENTS.md`; repository guidance takes precedence.

## Choose a worktree
1. If the input path or PR resolves to a worktree, switch to that worktree and continue there.
2. If the current checkout is already the correct feature worktree, continue there.
3. If the current checkout is a base checkout on `main` or `master`, create or switch to a feature worktree before changing files, unless the user explicitly asks not to.
4. Never write or commit lifecycle artifacts such as `design.md` or `plan.md` on `main` or `master`.
5. Stop and ask if the branch, base branch, or worktree location is ambiguous.

## Create a worktree
1. Fetch the latest default branch: `git fetch origin`.
2. Name the branch `maruina/<ticket-or-feature>` per `AGENTS.md`.
3. Create the branch from the fetched default branch without upstream tracking: `git branch --no-track <branch> origin/<default-branch>`.
4. Create the parent directory if it does not exist, then add the worktree at `$WORKTREES_ROOT/<repo>/<branch-slug>`, where the slug is the lowercase branch name with `/` replaced by `-`:
   ```bash
   mkdir -p "$WORKTREES_ROOT/<repo>"
   git -C <base-checkout> worktree add "$WORKTREES_ROOT/<repo>/<branch-slug>" <branch>
   ```
   The fish `wt <branch>` function performs the same parent-directory creation and adds the worktree at exactly this layout.
5. Switch context to the new worktree before reading or changing repository files.

## PR URL to worktree
Use this procedure when a prompt receives `https://github.com/ORG/REPO/pull/NUMBER`, with or without a `#discussion_r…` or `#issuecomment-…` fragment. The calling prompt may supply a fixed worktree path and may allow a reset to the PR head for a worktree that it owns. Otherwise, never reset or discard local changes.

1. Extract `ORG`, `REPO`, and `PR_NUMBER`.
2. Select the `gh` account per `AGENTS.md`, then read `gh pr view <url> --json headRefName,baseRefName,headRepositoryOwner,isCrossRepository`. Record `headRefName` as the working branch and `baseRefName` as the default diff base. The head is on a fork when `isCrossRepository` is true.
3. Use the `repo-checkout` skill to locate or clone the main checkout of `ORG/REPO`.
4. With a caller-supplied fixed path, use a detached worktree so it does not compete with a branch worktree:
   - If a worktree exists at that path, confirm that it is for the same PR, then reuse it.
   - Otherwise, for a same-repository head, run `git fetch origin <headRefName>` and `git worktree add --detach <path> origin/<headRefName>`. For a fork head, run `git worktree add --detach <path> origin/<baseRefName>`, then `gh pr checkout <PR_NUMBER> --detach` inside the new worktree.
5. Without a fixed path, run `git worktree list --porcelain` from the main checkout and match worktrees whose branch is `refs/heads/<headRefName>`:
   - If exactly one worktree matches, switch to it and use its current state.
   - If several match, list them and ask which to use.
   - If none matches, create the parent `$WORKTREES_ROOT/<repo>` (with `mkdir -p`) when it does not exist, then create the worktree at `$WORKTREES_ROOT/<repo>/<branch-slug>`. For a same-repository head, run `git fetch origin <headRefName>`, then `git worktree add <path> <headRefName>` when the local branch exists, else `git worktree add -b <headRefName> <path> origin/<headRefName>`. For a fork head, run `git worktree add --detach <path> origin/<baseRefName>`, then `gh pr checkout <PR_NUMBER>` inside the new worktree.
6. Record the resolved path as `WORKTREE`. Use it for every later read, test, and commit.

Never run `git checkout`, `git switch`, or `gh pr checkout` in the base checkout to inspect a PR.
