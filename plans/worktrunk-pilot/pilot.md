# Worktrunk pilot
## Use the pilot
`git-wt` is an alternate Fish command; `wt` and `wtpr` remain available. In a fresh Fish shell, switch to a registered worktree with `git-wt switch feature`. For a new branch, fetch the base and select it explicitly:

```fish
git fetch origin main
git-wt switch --create Feature/Example --base origin/main
```

Replace `Feature/Example` with an unused branch name. `git-wt` requires `WORKTREES_ROOT`, which the profile sets in `config.fish`. The user-level `pre-start` hook also applies to direct `wt` binary invocations. Inspect project hooks before creating a worktree; `--no-hooks` disables the guidance link as well as other hooks.

Worktrunk does not select a GitHub account. Before a GitHub operation, capture the active login with `gh auth status --json hosts`. Use `matteo-ruina_ddog` for `ddoghq/*` and `ddoghq-sandbox/*`; use `maruina` for other repositories, including `DataDog/*`. Switch with `gh auth switch --hostname github.com --user` and the required login. After success or failure, switch back to the captured login and verify it with `gh auth status --json hosts`. Do not treat a PR checkout as valid until the repository and HEAD match independently collected PR metadata.

To preview Worktrunk cleanup without deleting a worktree or branch, run:

```fish
git-wt step prune --dry-run --format=json --min-age=0s
```

The `--min-age=0s` option includes young candidates in the preview. It does not make Worktrunk's integration policy equivalent to `git worktrees-gone`.

## Roll back the pilot
Use a feature worktree for the chezmoi source. Inspect the two target files for local changes before removing them. From that source worktree, convert the managed files to removal entries and preview the two targets:

```sh
mv dot_config/private_fish/conf.d/worktrunk.fish dot_config/private_fish/conf.d/remove_worktrunk.fish
mv dot_config/worktrunk/config.toml dot_config/worktrunk/remove_config.toml
chezmoi --source "$PWD" apply --dry-run --verbose "$HOME/.config/fish/conf.d/worktrunk.fish" "$HOME/.config/worktrunk/config.toml"
```

If the preview contains only the intended removals, apply those targets:

```sh
chezmoi --source "$PWD" apply "$HOME/.config/fish/conf.d/worktrunk.fish" "$HOME/.config/worktrunk/config.toml"
```

Remove the `brew "worktrunk"` declaration from the source if other machines must not install the pilot. Do not run the installer to uninstall the binary; an inert installed binary can remain. Start a fresh Fish shell after rollback. A scratch-source and scratch-destination test confirmed that the removal entries delete the two pilot files and leave `wt` and `wtpr` available.

## Decisions
| Legacy command | Decision | Evidence and remaining gate |
|---|---|---|
| `wt` | Retain | Existing-worktree reuse and profile path fixtures passed, but linked-worktree creation uses a different repository-name rule. Matteo must approve any cutover. |
| `wtpr` | Retain | Public same-repository and fork checks passed, but a foreign URL resolved against the current repository and a stale local branch was reused. A later wrapper must validate repository identity, compare HEAD with current PR metadata, and preserve account routing; test private access separately. |
| `git worktrees-gone` | Retain | Its gone-upstream policy removed an unmerged branch that Worktrunk did not nominate. Worktrunk nominated an integrated branch that the legacy command retained. |

The pilot does not change repository `AGENTS.md`, Pi `AGENTS.md`, or the Pi worktree skills. The legacy policy and lifecycle contracts remain authoritative. Git worktree registration remains the source for discovery. When `/pr-validate` needs a review worktree, it uses the fixed `~/dd/.worktrees/REPO/pr-PR_NUMBER-review` path and verifies HEAD against PR metadata. It creates new review worktrees with detached HEAD; `/pr-cleanup` targets that review path. No existing Worktrunk README or runbook was found that needs migration.

## Evidence
All checks used Worktrunk v0.82.0 on the work profile. The work and personal path checks used separate temporary homes; they do not prove a personal-machine install. No check pushed to a real remote or ran PR code.

### Existing worktrees and paths
Fresh Fish processes used `git-wt switch feature` and `wt feature` to enter the same registered worktree. The base branch, base HEAD, and worktree registrations stayed unchanged. With the binary absent from an isolated `PATH`, Fish started without an error and the legacy `wt` function remained available.

For each profile, a disposable repository had a stale local `main`, a fetched `origin/main`, and a linked worktree. `git-wt switch --create Feature/Example --base origin/main` created `repo/feature-example` under the profile's logical `WORKTREES_ROOT`, at the fetched SHA and without an upstream. The test also checked a symlinked root, paths with spaces or apostrophes, and a branch with multiple slashes. The synchronous `pre-start` hook linked `AGENTS.local.md` before a trusted fixture launched Pi in offline RPC mode. That check did not test model access.

Collision, dirty-worktree, missing-source, tracked-file, valid-symlink, and dangling-symlink fixtures preserved the existing state. Worktrunk uses the primary repository name when invoked from a linked worktree; legacy `wt` uses the invoking checkout's basename when it creates a worktree.

### PR checks
| Case | Invocation and observation | Result |
|---|---|---|
| Same repository | [Worktrunk #4848](https://github.com/max-sixty/worktrunk/pull/4848), `git-wt switch pr:4848 --no-hooks`: checkout HEAD matched `449d3eeb2d5430673ad3a7c144cf4a4b9eae0893`. | PASS |
| Fork | [Worktrunk #4824](https://github.com/max-sixty/worktrunk/pull/4824), `git-wt switch https://github.com/max-sixty/worktrunk/pull/4824 --no-hooks`: checkout HEAD matched `63d095f178bca093bd8028a8698f5c4f97702caa`; `branch.feat/rebase-merge-detection.pushRemote` was `git@github.com:lahma/worktrunk.git`. | PASS |
| Malformed or denied | In isolated fixtures, `pr:not-a-number` and a denied API request exited 1 without changing refs or registrations. | PASS |
| Different repository URL | A fake GitHub API and local remote accepted a URL for `other/repo` but resolved PR 1 in the current `fixture/repo` and created its worktree. | FAIL: a guard must compare the URL repository with the checkout remote. |
| Existing stale branch | A local fixture reused a branch whose HEAD differed from the fake API's PR head SHA. The independent SHA comparison rejected it. | FAIL: a guard must compare checkout HEAD with current PR metadata. |

The two live checks used separate disposable clones, disabled hooks, checked the base repository and HEAD, and verified restoration of the original GitHub login. The first fork evidence script assumed `pushRemote` was a remote name; Worktrunk set a URL instead. A corrected fresh-clone check passed. These public PRs do not prove private-repository access or Datadog account routing.

### Cleanup comparison
The candidate and baseline fixtures had equivalent commit graphs and local-only remotes. Each contained an integrated branch with a present upstream, an unmerged branch with a deleted upstream, a dirty worktree with a deleted upstream, and a locked worktree with a deleted upstream.

`git-wt step prune --dry-run --format=json --min-age=0s` reported only the integrated branch, with `reason: "same commit as"`, `target: "main"`, and `branch_deleted: true`. It left registrations, refs, and dirty contents unchanged. The JSON did not report candidates for the other three cases.

The unchanged `git worktrees-gone` removed the clean unmerged worktree and force-deleted its local branch because its upstream was gone. It kept the integrated branch because that branch's upstream existed. It skipped the dirty worktree; Git refused to remove the locked worktree, and its branch remained. These are different policies: upstream deletion does not prove integration, and integration does not prove that an upstream is gone.
