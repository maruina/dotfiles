---
name: repo-checkout
description: Resolve a GitHub repository reference to a local main checkout. Use when asked to check out a repo, clone a repo, or find where a repo lives locally, or when a GitHub repo URL has no local checkout. Locates an existing clone under the known roots, clones into the correct root when missing, and hands off branch worktree creation to the worktree convention. Main checkouts only; defer worktree discovery to the resolve-worktree skill.
---
# Repo Checkout
Resolve a repository reference such as `ORG/REPO` or a GitHub URL to a local main checkout, cloning it when no checkout exists.

Scope is main checkouts only. For existing worktrees, use the `resolve-worktree` skill instead.

## Inputs
Accept any of:
- bare repo name: `REPO`
- `ORG/REPO`
- HTTPS URL: `https://github.com/ORG/REPO` (with or without `.git`)
- SSH URL: `git@github.com:ORG/REPO.git`

Normalize to `ORG` and `REPO`. A bare name has no `ORG`; the locate procedure below reads candidate remotes to resolve the identity.

## Special case: maruina/dotfiles
`maruina/dotfiles` is the chezmoi source, checked out at `~/.local/share/chezmoi`. Resolve it there; do not clone it elsewhere. Check this mapping before the locate order.

## Locate an existing checkout
A directory that matches by name is only a candidate. The same directory name can hold a checkout of a different organization. Confirm every candidate before using it:

```bash
git -C <candidate> remote -v
```

A candidate is a match only when one of its remotes points at exactly `ORG/REPO`; `other-org/REPO` does not match, even though the repository name is the same. When a candidate is not confirmed, keep searching.

Check in order and stop at the first confirmed match:

1. Current repository: run `git remote -v` in the cwd. If a remote points at `ORG/REPO`, use the current repository.
2. `~/dd/REPO`: confirm its remote points at `ORG/REPO`.
3. `~/go/src/github.com/ORG/REPO`: confirm its remote points at `ORG/REPO`.
4. Bounded search across the known roots:
   ```bash
   find ~/dd ~/go/src ~/src -maxdepth 4 -type d -name REPO 2>/dev/null
   ```
   Confirm every result the same way.
5. If no candidate is confirmed, report that no checkout exists and clone it.

For a bare name, `ORG` is unknown, so a name match cannot confirm identity. Collect the candidates from steps 1–4, read each remote, and resolve by the repositories the remotes name:

- All candidates name the same `ORG/REPO`: use the first candidate in the order above.
- The candidates name different repositories: list each path with the `ORG/REPO` its remote names and ask which to use. Do not stop at the first name match.

Report the resolved path.

## Clone a missing repository
Clone over SSH with `git clone git@github.com:ORG/REPO <path>`.

The auto-clone boundary is exactly three orgs:

- `DataDog`, `ddoghq`, and `ddoghq-sandbox` clone into `~/dd/REPO` without asking. Create `~/dd` first when it is missing:
  ```bash
  mkdir -p ~/dd
  git clone git@github.com:ORG/REPO ~/dd/REPO
  ```
- Any other org: ask the user where to clone before running the clone. Do not guess a path.

## gh account routing
When the task calls `gh`, follow the account rule in `~/.pi/agent/AGENTS.md` (Tool Use). Use `matteo-ruina_ddog` only for `ddoghq/*` and `ddoghq-sandbox/*`; use `maruina` for everything else, including `DataDog/*`. The account affects `gh` API calls only; clones use the existing SSH agent. Never run `gh auth status --show-token`.

## Branch handoff
When a branch or PR is involved, create a worktree instead of checking out the branch in the main clone. The convention comes from `wt.fish`, which is the source of truth:

- Path: `$WORKTREES_ROOT/<repo>/<branch-slug>`.
- `<repo>` is the repository directory name (the basename of the checkout).
- `<branch-slug>` lowercases the branch name and replaces `/` with `-`.
- `$WORKTREES_ROOT` is `~/dd/.worktrees` on the work profile and `~/src/.worktrees` on the personal profile.

Create the worktree with:
```bash
mkdir -p "$WORKTREES_ROOT/REPO"
git -C <checkout> worktree add "$WORKTREES_ROOT/REPO/<branch-slug>" <branch>
```

To find an existing worktree for a branch, use the `resolve-worktree` skill.
