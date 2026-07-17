# Dotfiles (chezmoi)
This is the chezmoi source repository. Edit files here, never rendered targets under `$HOME`.

## Rules
- Preview relevant changes with `chezmoi diff`; apply verified changes with `chezmoi apply`.
- Read secrets only through `onepasswordRead "op://vault/item/field"`; never hardcode them.
- `.tmpl` files use Go `text/template`. Gate profile-specific configuration on `.profile`.
- Write Fish for shell configuration and scripts.
- Declare Homebrew packages in `run_onchange_brew-install.sh.tmpl`; do not install them directly.
- Keep `mcp_servers.json.tmpl` profile-gated. Home Assistant configuration is personal-profile-only.

## Path terminology
`~` means `/Users/matteo.ruina`; do not treat absolute and `~`-relative spellings as separate files.

For chezmoi-managed files, distinguish the source from the rendered target. They are separate filesystem files representing one managed configuration. Edit only the source path.

## Completion
After a requested change is verified, apply the changed target, commit the source with a Conventional Commit message, and push by default.

Do not apply, commit, or push when the user requested a preview, changes are incomplete or unverified, unrelated changes exist, or the operation would be unsafe. If uncertain, stop and ask.
