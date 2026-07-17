# Dotfiles (chezmoi)
This is the chezmoi source repository. Edit files here, never rendered targets under `$HOME`.

## Critical Rules
- **Secrets via 1Password only**: use `onepasswordRead "op://vault/item/field"`. Never hardcode secrets.
- **Templates** (`.tmpl`): use Go `text/template` syntax. Key variables: `.profile` (`work` or `personal`), `.email`, `.signingKey`, and `.chezmoi.os`.
- **Profile conditions**: use `{{- if eq .profile "work" -}}` for work-only configuration such as Datadog development tools, global Git hooks, pyenv, and rbenv. Use `personal` for personal signing keys and API configuration.

## File Naming
Chezmoi prefixes map source names to targets:
- `dot_` → `.`
- `private_` → `0600`
- `exact_` → remove target files absent from the source
- `run_onchange_` → run the script when its content changes

## Shell
Use Fish for interactive shell configuration and functions. Preserve the existing shell for chezmoi run scripts.
- Main config: `dot_config/private_fish/private_config.fish.tmpl`
- Auto-loaded config: `dot_config/private_fish/conf.d/`
- Functions: `dot_config/private_fish/exact_functions/` (`exact_` removes stale functions)

## Packages
Declare Homebrew packages in `run_onchange_brew-install.sh.tmpl`. Do not install packages directly with `brew install`.

## CLI Usage
- **Add or update a file**: `chezmoi add <target-path>` reads from `$HOME` and writes to the source with the correct prefixes. Never copy it manually.
- **Change attributes**: `chezmoi chattr +private <target-path>` marks a file as `0600`; `chezmoi chattr +exact <target-dir>` marks a directory as exact.
- **Re-sync managed files**: `chezmoi re-add`.

## Pi Agent Development
- `dot_pi/agent/exact_prompts/*.md` defines global slash commands. The filename defines the command; keep lifecycle behavior in these prompts rather than duplicating it in guidance.
- `dot_pi/agent/exact_extensions/*.ts` contains auto-discovered extension entrypoints, which must export a default factory. Put helpers and tests under `_shared/` or an extension subdirectory.
- Runtime dependencies belong under `~/.pi/agent/node_modules`. Dependencies under `dot_pi/agent/node_modules` are disposable and excluded from Git and chezmoi rendering.
- Before `/verify` for changes under `dot_pi/agent/`, run `npm ci --ignore-scripts` in that directory. Keep dependencies until `npm test` and `npm run test:all` complete, then remove them.

## Completion Workflow
After making and verifying a requested chezmoi source change, apply it to the target and commit and push it by default.

Default sequence:
1. Run `chezmoi diff` for the relevant target or full source.
2. Run `chezmoi apply` for the changed target.
3. Commit the source changes with a Conventional Commit message.
4. Push the branch.

Do not apply, commit, or push when:
- the user asks for a preview only;
- the change is incomplete or unverified;
- unrelated local changes exist;
- applying would affect broad or unreviewed targets; or
- the branch or repository state makes the operation unsafe.

If uncertain, stop and ask.

## Pi MCP and Home Assistant
Pi has no native Model Context Protocol (MCP) support. MCP servers are templated from `dot_config/mcp/` into `~/.config/mcp/mcp_servers.json` and accessed through `mcp-cli` skills. Keep `mcp_servers.json.tmpl` profile-gated with separate work and personal branches. Home Assistant capability is personal-profile-only.
