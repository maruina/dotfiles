# Chezmoi Dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## Repository Structure

This is a chezmoi source directory. Files here are templates/sources that chezmoi applies to `$HOME`.

- `dot_config/` → `~/.config/` (XDG config)
- `dot_ssh/` → `~/.ssh/`
- `dot_gitconfig.tmpl` → `~/.gitconfig`
- `run_onchange_brew-install.sh.tmpl` — Homebrew package installer (runs on content change)
- `.chezmoi.yaml.tmpl` — chezmoi config with interactive prompts

## Chezmoi Conventions

**File prefixes** (applied by chezmoi, not literal filenames):
- `dot_` → leading `.`
- `private_` → `0600` permissions
- `exact_` → directory managed exactly (untracked files removed)
- `run_onchange_` → script runs when file hash changes

**Templates** (`.tmpl` suffix): Use Go `text/template` syntax with chezmoi functions.

**Key template variables** (defined via `promptStringOnce` in `.chezmoi.yaml.tmpl`):
- `.profile` — `work` or `personal`
- `.email`, `.signingKey`
- `.chezmoi.os`, `.chezmoi.homeDir`

**Secrets**: Retrieved at apply time via `onepasswordRead "op://vault/item/field"`. Never committed.

## Shell

Fish shell. All shell scripts and functions use Fish syntax.

- `dot_config/private_fish/private_config.fish.tmpl` — main config
- `dot_config/private_fish/conf.d/` — auto-loaded snippets
- `dot_config/private_fish/exact_functions/` — custom functions (`exact_` removes stale functions)

## Profiles

Two profiles with conditional blocks (`{{- if eq .profile "work" -}}`):
- **work** — Datadog devtools, global git hooks, pyenv/rbenv, AWS SSM proxy
- **personal** — personal signing keys, OpenRouter/Anthropic API config

## Key Tools

- **Helix** (`hx`) — editor, Catppuccin Frappe theme
- **Ghostty** — terminal
- **Starship** — prompt
- **1Password** — secrets and SSH agent
- **SOPS + Age** — encryption
- **Kubernetes** — custom `kctx` function for per-shell context isolation
- **Homebrew** — packages declared in `run_onchange_brew-install.sh.tmpl`

## Making Changes

1. Edit source files in this repo (not target files in `$HOME`).
2. Use `.tmpl` suffix and Go template syntax for conditional/dynamic content.
3. Use `private_` prefix for files containing secrets or sensitive paths.
4. Add new brew packages to `run_onchange_brew-install.sh.tmpl`.
5. Apply with `chezmoi apply` or test with `chezmoi diff`.
