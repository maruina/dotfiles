# Dotfiles (chezmoi)

Chezmoi source directory. Edit files here, never in `$HOME`. Preview with `chezmoi diff`; apply with `chezmoi apply`.

## Critical Rules

- **Never edit target files** (`~/.config/...`). Edit the chezmoi source.
- **Secrets via 1Password only**: `onepasswordRead "op://vault/item/field"`. Never hardcode secrets.
- **Templates** (`.tmpl`): use Go `text/template` syntax. Key variables: `.profile` (`work`|`personal`), `.email`, `.signingKey`, `.chezmoi.os`.
- **Profile conditions**: use `{{- if eq .profile "work" -}}` for work-only config (Datadog devtools, global git hooks, pyenv/rbenv). Use `personal` for personal signing keys and API config.

## File Naming

Chezmoi prefixes map source names to target files:
- `dot_` → `.`
- `private_` → `0600`
- `exact_` → remove untracked files from the target directory
- `run_onchange_` → run script when its content hash changes

## Shell

Use Fish for all scripts and functions.
- Main config: `dot_config/private_fish/private_config.fish.tmpl`
- Auto-loaded config: `dot_config/private_fish/conf.d/`
- Functions: `dot_config/private_fish/exact_functions/` (`exact_` removes stale functions)

## Packages

Declare Homebrew packages in `run_onchange_brew-install.sh.tmpl`. Do not install packages manually with `brew install`.

## CLI Usage

- **Add or update a file**: `chezmoi add <target-path>` reads from `$HOME` and writes to source with the right prefixes. Never `cp` manually.
- **Change attributes**: `chezmoi chattr +private <target-path>` marks a file as `0600` (`private_`). `chezmoi chattr +exact <target-dir>` marks a directory as exact (`exact_`).
- **Preview**: `chezmoi diff`.
- **Apply**: `chezmoi apply`.
- **Re-sync managed files**: `chezmoi re-add`.

## Completion Workflow

After making and verifying a requested chezmoi source change, apply it to the target and commit/push it by default.

Default sequence:
1. Run `chezmoi diff` for the relevant target or full source.
2. Run `chezmoi apply` for the changed target(s).
3. Commit the source changes with a Conventional Commit message.
4. Push the branch.

Do not auto-commit/push when:
- the user asks for a preview only
- the change is incomplete or unverified
- there are unrelated local changes
- applying would affect broad or unreviewed targets
- the branch or repository state makes the operation unsafe

If unsure, stop and ask.

## Key Tools

Ghostty, Starship, 1Password (secrets and SSH agent), SOPS + Age, Kubernetes (`kctx` for per-shell context isolation).

## Git Worktree

- Start from an updated `main`.
- Keep Datadog repositories under `~/dd`.
- Create Datadog worktrees under `~/dd/.worktrees/<repo-name>-<branch-slug>`.
- Use one worktree per feature branch or PR; keep the base repository checkout on `main`.
- Open the worktree directory itself in JetBrains IDEs such as GoLand.
