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
- **Working from a feature worktree**: pass `--source "$PWD"` to every `chezmoi` command. The default source is `~/.local/share/chezmoi` (normally on `main`), so without it `chezmoi` reads the wrong tree and ignores the worktree edits.
- **Directory targets can hide drift**: `chezmoi diff <target-dir>` and `chezmoi verify <target-dir>` may return empty output even when files under that directory differ from the source. Run them against the explicit target file path (or `chezmoi apply` the changed path and compare the target with `diff`) before trusting a clean result.

## Pi Agent Development
- `dot_pi/agent/exact_prompts/*.md` defines global slash commands. The filename defines the command; keep lifecycle behavior in these prompts rather than duplicating it in guidance.
- `dot_pi/agent/exact_extensions/*.ts` contains auto-discovered extension entrypoints, which must export a default factory. Put helpers and tests under `_shared/` or an extension subdirectory.
- The work-profile `models.json.tmpl` header `x-dd-tag-client_session_id: $PI_CLIENT_SESSION_ID` requires `exact_extensions/pi-client-session-id/`; without it, every Gateway request fails, including `pi --no-extensions` unless the extension is loaded explicitly with `-e`.
- Lifecycle templates own policy; `/implement` uses `_bridge.ts` only in fresh RPC children with a valid `PI_LIFECYCLE_CHILD_CONFIG`. Ordinary sessions must not receive bridge tools. When changing lifecycle contracts, update `dot_pi/agent/exact_scripts/lifecycle-prompts.test.mjs` and `dot_pi/agent/exact_extensions/ship-conductor/*.test.ts`; `_rpc.test.ts` must run against Pi 1.5.0 and prove approval and outcome events through the real agent loop. Do not parse prose markers as lifecycle control. Usage and recovery are documented in `dot_pi/agent/exact_extensions/ship-conductor/README.md`.
- `/implement` traps found in live runs:
  - Pi starts a turn requested with `pi.sendUserMessage` only after the current command handler returns, so the `/implement` handler starts the run in the background. Wait for a session-model turn with `agent_settled`; `ctx.waitForIdle()` can return before the queued turn starts.
  - Ctrl-C (`app.clear`) and Escape (`app.interrupt`) do not reach a running extension command; `ctx.signal` is undefined in commands. Cancellation uses the registered `ctrl+shift+x` shortcut, dialog dismissal, or `session_shutdown`.
  - The stage model sees only a tool result's text, not its `details`. State decisions and rejections in the text (who decided, what, and what to do next), and name pinned files with the exact commands to read them; low-thinking models block on ambiguous contract text.
  - A failed `lifecycle_submit_outcome` call is not a submission and must not end the stage, so the stage can correct its state and resubmit.
- Live `/implement` testing: use a disposable worktree with a committed smoke plan and a launcher that sets `PI_CODING_AGENT_DIR` to a temporary agent directory whose `prompts/` holds the candidate templates (the coordinator checks child templates against `getAgentDir()/prompts`), loads the candidate extension with `--extension`, and symlinks the other agent files. Relative local package paths in `settings.json` resolve from the agent directory, so keep them absolute (`modify_private_settings.json.tmpl`) or the temporary directory loses `pi-dd-ai-gateway` and every authenticated model. Child commits need a working signing agent; an unlocked 1Password SSH agent is required.
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

## Pi MCP
- Pi connects to MCP servers natively from `~/.pi/agent/mcp.json`. Tool names follow `mcp__<server>__<tool>`; all managed servers use `deferred` exposure, so load tools with `tool_search` before calling them.
- `run_onchange_pi-mcp-servers.sh.tmpl` registers servers through `pi mcp add`/`pi mcp remove`, profile-gated. Do not hand-edit these entries; `/mcp` exposure or enabled toggles are reverted when the script reruns.
- Datadog access uses `@datadog/pi-plugin`, declared in both profile package lists by `dot_pi/agent/modify_private_settings.json.tmpl`. Use `/datadog` to connect an organization. The `datadog` tool queries the selected organization, `ddconfig` checks or switches among saved connections, and `ddtoolsets` manages toolsets. Before a query, use `ddconfig` with `action: "check"` to confirm the organization. The agent can switch only among saved organizations; sign-in and adding connections are user-controlled through `/datadog`. Use separate Pi sessions when results from different organizations must not share conversation context. Plugin connections share `~/.pi/agent/datadog/` across profiles, so configure personal credentials only on the personal machine.
- `slack` uses a stdio proxy that reads the macOS keychain. The personal profile uses `ha-mcp`; its connect URL resolves from 1Password at apply time, so `mcp.json` is mode 0600. Home Assistant capability is personal-profile-only.
- Validate native MCP servers with `pi mcp list`. The IT-managed `trajectory` entry is not managed by this script; if its installer re-adds it, leave it alone (tracked separately).
