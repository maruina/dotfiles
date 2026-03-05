# Dotfiles (chezmoi)

Chezmoi source directory. Edit files here, never in `$HOME`. Apply with `chezmoi apply`, preview with `chezmoi diff`.

## Critical Rules

- **Never edit target files** (`~/.config/...`). Always edit the chezmoi source.
- **Secrets via 1Password only**: `onepasswordRead "op://vault/item/field"`. Never hardcode secrets.
- **Template suffix** (`.tmpl`): Go `text/template` syntax. Key variables: `.profile` (`work`|`personal`), `.email`, `.signingKey`, `.chezmoi.os`.
- **Profile-conditional blocks**: `{{- if eq .profile "work" -}}` for work-only config (Datadog devtools, global git hooks, pyenv/rbenv). `personal` profile for personal signing keys, API config.

## File Naming

Chezmoi prefixes map to target filesystem:
- `dot_` → `.`, `private_` → `0600`, `exact_` → removes untracked files in dir, `run_onchange_` → runs script when content hash changes.

## Shell

Fish shell exclusively. All scripts and functions use Fish syntax.
- Main config: `dot_config/private_fish/private_config.fish.tmpl`
- Auto-loaded: `dot_config/private_fish/conf.d/`
- Functions: `dot_config/private_fish/exact_functions/` (`exact_` prefix — stale functions are removed)

## Packages

Homebrew packages declared in `run_onchange_brew-install.sh.tmpl`. Add new packages there, not via `brew install`.

## Key Tools

Helix (`hx`) editor, Ghostty terminal, Starship prompt, 1Password (secrets + SSH agent), SOPS + Age (encryption), Kubernetes (`kctx` for per-shell context isolation).
