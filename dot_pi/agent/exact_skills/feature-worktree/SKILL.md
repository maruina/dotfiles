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
3. From the base checkout, run `wt switch --create <branch> --base origin/<default-branch> --no-cd --format=json --yes`. Capture the JSON result and use its `path` field as the worktree path. Check the exit status and stop on failure; inspect the result and Git state before any retry because a hook can fail after creation.
4. Worktrunk uses the configured profile root and lowercases the branch name with `/` replaced by `-`. `WORKTREES_ROOT` alone does not override this path; set `WORKTRUNK_WORKTREE_PATH` explicitly when a different root is required.
5. Confirm the base checkout remains on its original branch and HEAD, then switch context to the new worktree before reading or changing repository files.

## PR URL to worktree
Use this procedure when a prompt receives `https://github.com/ORG/REPO/pull/NUMBER`, with or without a `#discussion_r…` or `#issuecomment-…` fragment. The calling prompt may supply a fixed worktree path and may allow a reset to the PR head for a worktree that it owns. Otherwise, never reset or discard local changes.

1. Extract `ORG`, `REPO`, and `PR_NUMBER`.
2. Select the `gh` account per `AGENTS.md`, then read `gh pr view <url> --json headRefName,headRefOid,baseRefName,headRepositoryOwner,isCrossRepository`. Record `headRefName`, `headRefOid`, and `baseRefName`. The head is on a fork when `isCrossRepository` is true. Keep the selected account for subsequent GitHub commands, then restore and verify the original account after success or failure.
3. Use the `repo-checkout` skill to locate or clone the main checkout of `ORG/REPO`. Verify its remote identifies exactly `ORG/REPO`; reject a foreign repository identity before any checkout. Do not trust a Worktrunk PR shortcut as proof of identity.
4. With a caller-supplied fixed path, use a detached worktree so it does not compete with a branch worktree:
   - If a worktree exists at that path, confirm that it is for the same PR, then select it for the checks in step 6.
   - Otherwise, for a same-repository head, run `git fetch origin <headRefName>` and `git worktree add --detach <path> origin/<headRefName>`. For a fork head, run `git worktree add --detach <path> origin/<baseRefName>`, then `gh pr checkout <PR_NUMBER> --detach` inside the new worktree.
5. Without a fixed path, run `git worktree list --porcelain` from the main checkout and match worktrees whose branch is `refs/heads/<headRefName>`:
   - If exactly one worktree matches, select it for the checks in step 6.
   - If several match, list them and ask which to use.
   - If none matches, create the parent `$WORKTREES_ROOT/<repo>` (with `mkdir -p`) when it does not exist, then create the worktree at `$WORKTREES_ROOT/<repo>/<branch-slug>`. For a same-repository head, run `git fetch origin <headRefName>`, then `git worktree add <path> <headRefName>` when the local branch exists, else `git worktree add -b <headRefName> <path> origin/<headRefName>`. For a fork head, run `git worktree add --detach <path> origin/<baseRefName>`, then `gh pr checkout <PR_NUMBER>` inside the new worktree.
6. Compare the checkout's `HEAD` with the independently collected `headRefOid`. If they differ, stop before using it or executing PR code; do not reset or discard local changes. Confirm the worktree belongs to the verified base repository. Record the resolved path as `WORKTREE` only after these checks pass. Use it for every later read, test, and commit.

Never run `git checkout`, `git switch`, or `gh pr checkout` in the base checkout to inspect a PR.
