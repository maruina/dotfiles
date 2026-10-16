# Isolated ddtool SSH Agent Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ddtool add signed SSH certificates to a dedicated persistent agent without changing the SSH agent used by normal SSH or Git signing.
**Smallest user-feedback slice (slice 1):** Generate a staging certificate into the dedicated agent and verify that `ddssh` selects that agent for OpenSSH. Task 1 delivers this slice; Task 2 closes out its documentation and validation.
**Out of Scope:** Changing 1Password settings, changing global `SSH_AUTH_SOCK`, adding global `IdentityAgent` rules, and automatic certificate generation for multiple environments.
**Architecture:** A work-profile macOS LaunchAgent runs `ssh-agent` on `~/.ssh/ddtool-agent.sock`. Fish functions pass that socket explicitly to ddtool and OpenSSH. Normal shell and Git agent selection stays unchanged.
**Tech Stack:** chezmoi, macOS LaunchAgent plist, Fish, OpenSSH, ddtool.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `codebase-research` | `skill-loader` | The change affects shell, SSH, and profile behavior | Mapped current config and existing Fish/chezmoi patterns before planning. |
| `chezmoi` | `skill-loader` | The source files are managed by chezmoi | Kept changes in the source and planned targeted diff and apply. |
| `script-best-practices` | `agent-selected` | The implementation adds Fish command functions | Applied guidance on explicit inputs, error handling, and argument forwarding. |
| `write` | `skill-loader` | The plan needs clear behavior and validation contracts | Used direct wording and observable outcomes. |
| `feature-worktree` | `prompt-required` | The base checkout is on `main` | Created this plan in a feature worktree from updated `origin/main`. |
| `learning-lookup` | `prompt-required` | Required during planning | Found no SSH-agent guidance; the only returned learning concerns piped chezmoi template rendering and does not apply. |
| `obsidian-cli` | `agent-selected` | Required to read the learning store | Read the learning store through the Obsidian CLI. |
| `skill-loader` | `prompt-required` | Required before planning implementation | Selected the applicable skills above. |

## Scope

### Requirement: ddtool uses only the dedicated agent
The Fish command SHALL pass `~/.ssh/ddtool-agent.sock` explicitly to `ddtool operator ssh-keygen` and SHALL fail with a clear message if the socket is unavailable.

#### Scenario: Generate a staging certificate
- GIVEN the dedicated agent is running
- WHEN the user runs `ddsshgen staging`
- THEN ddtool adds the signed certificate to the dedicated agent
- AND the current and 1Password agent identity lists do not change

#### Scenario: Agent is unavailable
- GIVEN the dedicated agent socket is absent
- WHEN the user runs `ddsshgen staging`
- THEN the command returns non-zero with an actionable message
- AND it does not fall back to the current `SSH_AUTH_SOCK`

#### Scenario: ddtool fails
- GIVEN the dedicated agent is running
- WHEN ddtool returns a non-zero status and a diagnostic
- THEN `ddsshgen` preserves that status and diagnostic
- AND the caller's `SSH_AUTH_SOCK` is unchanged

#### Scenario: Environment argument is invalid
- GIVEN the user supplies zero or more than one environment arguments
- WHEN the user runs `ddsshgen` with those arguments
- THEN the function returns non-zero with usage text
- AND it does not invoke ddtool

### Requirement: SSH can select the dedicated agent explicitly
The `ddssh` Fish command SHALL pass the dedicated socket as OpenSSH's `IdentityAgent` option without changing `SSH_AUTH_SOCK`.

#### Scenario: Resolve SSH configuration through ddssh
- GIVEN the dedicated socket path is configured
- WHEN the user runs `ddssh -G localhost`
- THEN OpenSSH reports `~/.ssh/ddtool-agent.sock` as `identityagent`
- AND the normal `ssh` command retains its existing agent selection

#### Scenario: Dedicated socket is unavailable
- GIVEN the dedicated agent socket is absent
- WHEN the user runs `ddssh localhost`
- THEN the function returns non-zero with an actionable message
- AND it does not invoke OpenSSH with the default agent

#### Scenario: SSH arguments and failure are preserved
- GIVEN the dedicated socket exists
- WHEN `ddssh` receives SSH options, a host, and remote command arguments
- THEN it forwards those arguments unchanged after the dedicated `IdentityAgent` option
- AND it preserves OpenSSH's exit status and stderr

### Requirement: Work-profile deployment
The LaunchAgent and Fish functions SHALL be excluded from the personal chezmoi profile.

#### Scenario: Render the work profile
- GIVEN chezmoi data selects the work profile on macOS
- WHEN the source is rendered
- THEN the LaunchAgent plist and both Fish functions are included

#### Scenario: Render the personal profile
- GIVEN chezmoi data selects the personal profile
- WHEN the source is rendered
- THEN the LaunchAgent plist and both Fish functions are excluded

### Requirement: Agent lifecycle and removal
The LaunchAgent SHALL supervise one foreground agent. Restarting it SHALL NOT be described as preserving loaded keys or certificates.

#### Scenario: Restart the agent normally
- GIVEN the dedicated LaunchAgent is running
- WHEN it is booted out and bootstrapped again
- THEN the dedicated socket accepts agent queries again
- AND the user must run `ddsshgen` again to load a certificate

#### Scenario: An unclean exit leaves a stale socket
- GIVEN the dedicated agent cannot bind its socket after an unclean exit
- WHEN the user follows the recovery procedure
- THEN the dedicated service is stopped and its process is confirmed absent before the stale socket is removed
- AND bootstrapping the service restores an empty agent without changing either existing agent

#### Scenario: Roll back the feature
- GIVEN the dedicated service and its plist are installed
- WHEN the rollback procedure completes
- THEN the service is unloaded and its installed plist and socket are absent
- AND both existing agents and their configuration are unchanged

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| LaunchAgent | `Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl` | Start and keep a dedicated agent alive on a fixed socket | Render and `plutil -lint`; bootstrap and query with `launchctl` |
| Fish functions | `dot_config/private_fish/exact_functions/ddsshgen.fish`, `dot_config/private_fish/exact_functions/ddssh.fish` | Select the dedicated socket for certificate generation and SSH connections | `fish -n`; `ddssh -G localhost`; staging certificate generation |
| Profile gating | `.chezmoiignore` | Exclude these targets from the personal profile | Render `.chezmoiignore` for work and personal profiles |

### Key Decisions
- Keep the 1Password and current agents unchanged. The existing signing key is visible through both, but the current work profile does not set a 1Password `IdentityAgent` rule.
- Use the explicit `ddssh` wrapper instead of guessing SSH host patterns or changing the global agent.
- Require exactly one environment argument to `ddsshgen`; reject zero or multiple arguments before invoking ddtool. Invoke `command ddtool operator ssh-keygen --env "$argv[1]" --ssh-auth-socket "$HOME/.ssh/ddtool-agent.sock"`; the installed ddtool help confirms both flags.
- Implement `ddssh` as an explicit Fish function that runs `ssh` with the dedicated `IdentityAgent`; do not change the default `ssh` command.
- Deploy only on the work profile. Matteo uses this configuration on macOS.
- Use LaunchAgent `ProgramArguments` containing `/usr/bin/ssh-agent`, `-D`, `-a`, and the absolute socket path rendered with `.chezmoi.homeDir`. Do not put a literal `~` in the plist arguments. Use `KeepAlive` with launchd's default restart throttling; do not add a polling loop or another agent process.
- Persistence means a supervised process across shell sessions, not durable keys. Normal restart creates an empty agent. Automatic stale-socket cleanup is deferred; revisit only if manual crash recovery becomes frequent.

### Implementation Constraints
- Edit chezmoi source files only; do not edit rendered targets directly.
- Keep function sources in the existing Fish `exact_functions` directory.
- Use a fixed socket path at `~/.ssh/ddtool-agent.sock`; do not expose a new global environment setting.
- Do not print private key or signed-certificate material during validation.

### Security Requirements
- The dedicated socket must remain under `~/.ssh` and be managed by `ssh-agent`. Verify that the directory is owned by the user and is not group- or world-writable, and that the socket is accessible only to its owner. Do not assume the existing directory is mode `0700` or change unrelated SSH permissions.
- Neither function may fall back to the default agent when the dedicated socket is missing.
- `ddsshgen` must reject a missing or extra environment argument before invoking ddtool.
- Do not change the 1Password agent, current agent, or Git signing configuration.

### Observability Requirements
- No metrics or telemetry are needed for a local per-user agent. The functions must report a missing socket to stderr with the required bootstrap action.

### Failure Modes to Handle
- Missing agent socket: fail before calling ddtool or ssh and show the expected socket path.
- LaunchAgent startup failure: expose through `launchctl print`; do not silently substitute another socket. A stale socket can prevent a fixed-path agent from restarting; `KeepAlive` does not repair it.
- Stale-socket recovery: boot out the dedicated service, confirm that its process is absent and no agent responds at the dedicated socket, then remove only that stale socket and bootstrap again. If ownership or process state is uncertain, stop rather than unlinking it. The functions never unlink sockets.
- ddtool authentication or signing failure: preserve ddtool's non-zero status and diagnostic.
- OpenSSH failure: preserve its exit status and stderr. A socket that exists but has no responding agent must not cause fallback; report the downstream failure and use the recovery procedure.

### Rollout and Rollback
- Apply only the three intended targets after reviewing the targeted chezmoi diff.
- Bootstrap the LaunchAgent once in the current GUI login domain. `KeepAlive` implies startup on load and provides process restart, subject to the stale-socket recovery limit above.
- Roll back by booting out `com.matteo.ruina.ddtool-ssh-agent` in that domain and confirming its process is absent. Explicitly remove only these installed files under the home directory: `Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist`, `.config/fish/functions/ddsshgen.fish`, and `.config/fish/functions/ddssh.fish`. Reverting the plist source alone does not delete its target because the directory is not `exact_`. Do not make the shared LaunchAgents directory `exact_`.
- Revert the feature source. Confirm that the service is unloaded and its installed plist, functions, and socket are absent. If the socket remains, use the stale-socket safety checks before removing it. Do not alter either existing agent or apply the whole Fish functions directory.
- Owner: Matteo Ruina.

### Test Strategy
- Before implementation, prepare one-off behavior checks in `fish --no-config` with a temporary `HOME`, explicitly sourced function files, and stub executables for ddtool and ssh. Assert that both functions loaded so an installed function cannot satisfy the checks. Run these checks before implementation and expect failure; rerun the same assertions after implementation.
- For the socket-present cases, run a temporary foreground agent at the test home's dedicated path. Record and stop only the process started by the checks, and remove their temporary files on completion or failure. Do not request certificates or modify the real agents in these checks.
- Have the stubs record argument boundaries, emit a known stderr diagnostic, and return a chosen non-zero status. Assert exact `--env` and `--ssh-auth-socket` values for ddtool, the dedicated `IdentityAgent` option and unchanged argument forwarding for ssh, preserved status and stderr, and unchanged caller `SSH_AUTH_SOCK`.
- With the test socket absent, assert that both functions return non-zero with actionable stderr and neither stub is invoked. For zero and two environment arguments, assert usage failure without invoking ddtool.
- Render the plist and `.chezmoiignore` against work and personal data. Also use `chezmoi --source "$PWD" --override-data '{"profile":"work"}' ignored` and the corresponding personal override to assert effective inclusion and exclusion of all three targets across both ignore files.
- Run `fish -n` on both function files and `plutil -lint` on the rendered plist.
- After targeted apply, bootstrap the service and verify that the dedicated socket responds to `ssh-add -l` while the global `SSH_AUTH_SOCK` remains unchanged. An empty reachable agent can return status 1; status 2 indicates that the agent cannot be contacted. Inspect both status and diagnostic rather than requiring status 0.
- Before loading a real certificate, verify normal bootout/bootstrap and controlled unclean-exit recovery on the dedicated service only. Confirm its PID and socket ownership before stopping it; never signal an existing default or 1Password agent. Verify the recovery safety checks, an empty reachable agent, and unchanged existing agents. Complete these checks before the certificate-generation check.
- Run `ddssh -G localhost` and assert its `identityagent` points to the dedicated socket.
- Run `ddsshgen staging` as the end-to-end check. It will request a staging certificate and add it only to the dedicated agent. Compare identity listings before and after on the default and 1Password sockets.
- No persistent automated test harness is added for this small, user-local configuration. Record the one-off behavior-check commands and results in the execution evidence; the parsers, launchd, OpenSSH, and ddtool provide the remaining validation surfaces.

### Assumptions and Stop Conditions
- This slice targets Matteo's macOS work profile and one dedicated agent. Do not add renewal, multi-environment automation, or host-pattern routing.
- Stop before bootstrap if another process owns the dedicated socket, socket ownership is uncertain, or permissions permit other users to access it.
- Stop before apply or cleanup if the explicit target diff includes unrelated changes. If staging authentication is unavailable, record the end-to-end check as blocked rather than claiming completion.

## Tasks

### Task 1: Add the isolated work-profile agent and Fish commands
**Delivers:** A persistent dedicated socket and explicit commands for certificate generation and SSH use.
**Blocked by:** None
**Traces to:** Slice 1; requirements 1–4, including all failure and rollback scenarios
**Files:** `.chezmoiignore`, `Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl`, `dot_config/private_fish/exact_functions/ddsshgen.fish`, `dot_config/private_fish/exact_functions/ddssh.fish`

- [ ] Prepare and run the isolated Fish behavior checks described in Test Strategy before implementation; expect failure. Include argument capture, missing-socket rejection for both functions, invalid environment argument count, downstream failure propagation, and unchanged caller `SSH_AUTH_SOCK`.
- [ ] Add the LaunchAgent, Fish functions, and personal-profile exclusion.
- [ ] Run `fish -n dot_config/private_fish/exact_functions/ddsshgen.fish && fish -n dot_config/private_fish/exact_functions/ddssh.fish`; expect success.
- [ ] Render the plist with `chezmoi --source "$PWD" execute-template < Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl > /tmp/ddtool-ssh-agent.plist` and run `plutil -lint /tmp/ddtool-ssh-agent.plist`; expect valid XML.
- [ ] Render `.chezmoiignore` with work and personal data and check effective `chezmoi ignored` results; confirm the work profile includes the targets and the personal profile excludes them.
- [ ] Rerun the same isolated Fish behavior checks; expect every assertion to pass and clean up only the test-owned agent and files.
- [ ] Run targeted `chezmoi --source "$PWD" diff` for the three targets; review the complete diff, apply only those targets, then bootstrap and query the LaunchAgent.
- [ ] Verify socket ownership and permissions, empty-agent reachability, normal restart, and controlled stale-socket recovery before loading a real certificate. Follow the process-ownership and cleanup limits in Test Strategy.
- [ ] Run `ddssh -G localhost`; expect `identityagent` to be the dedicated socket. Confirm that normal `ssh -G localhost` retains its existing selection and the normal shell `SSH_AUTH_SOCK` value is unchanged.
- [ ] Rehearse the targeted rollback before certificate generation: unload the dedicated service, explicitly remove only its installed plist and two function files, and verify that the service, plist, functions, and socket are absent. Keep the implementation source for this rehearsal, then restore only the three feature targets and bootstrap again.
- [ ] Capture identity fingerprints from the current and 1Password sockets, run `ddsshgen staging`, then confirm the certificate appears only in the dedicated agent and the two existing identity lists are unchanged. Do not print certificate material.

### Task 2: Review documentation and future-agent guidance
**Delivers:** Confirmation that the new local workflow is documented at the right level without adding unrelated agent guidance.
**Blocked by:** Task 1
**Traces to:** Slice 1 closeout; documentation, lifecycle recovery, and rollback requirements
**Files:** `AGENTS.md`, `dot_pi/agent/AGENTS.md`, Fish function descriptions and diagnostics

- [ ] Review both `AGENTS.md` files and repository documentation for instructions that need to change.
- [ ] Keep the user workflow in the Fish function descriptions and missing-socket diagnostic, including the bootstrap action and the location of the recovery procedure in this plan; add no separate page unless the repository has an existing ddtool SSH runbook. No failing runtime test applies to this documentation-only task; validate it against the behavior and lifecycle checks from Task 1.
- [ ] Record why no `AGENTS.md` change is needed, or make a narrowly scoped update if the new bootstrap procedure is durable guidance for future agents.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Commit the verified implementation and any required documentation change with `feat: add isolated ddtool SSH agent`; do not add unrelated guidance.

## Documentation impact
The function descriptions and missing-socket diagnostic cover the user workflow. The implementation task reviews both applicable `AGENTS.md` files and existing docs; no separate documentation page is planned unless an existing ddtool SSH runbook is found.
