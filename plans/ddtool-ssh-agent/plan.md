# Isolated ddtool SSH Agent Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ddtool add signed SSH certificates to a dedicated persistent agent without changing the SSH agent used by normal SSH or Git signing.
**Smallest user-feedback slice:** Generate a staging certificate into the dedicated agent and verify that `ddssh` selects that agent for OpenSSH.
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
- Require exactly one environment argument to `ddsshgen`; reject zero or multiple arguments before invoking ddtool.
- Implement `ddssh` as an explicit Fish function that runs `ssh` with the dedicated `IdentityAgent`; do not change the default `ssh` command.
- Deploy only on the work profile. Matteo uses this configuration on macOS.

### Implementation Constraints
- Edit chezmoi source files only; do not edit rendered targets directly.
- Keep function sources in the existing Fish `exact_functions` directory.
- Use a fixed socket path at `~/.ssh/ddtool-agent.sock`; do not expose a new global environment setting.
- Do not print private key or signed-certificate material during validation.

### Security Requirements
- The dedicated socket must remain in the existing private `~/.ssh` directory and be managed by `ssh-agent`.
- Neither function may fall back to the default agent when the dedicated socket is missing.
- `ddsshgen` must reject a missing or extra environment argument before invoking ddtool.
- Do not change the 1Password agent, current agent, or Git signing configuration.

### Observability Requirements
- No metrics or telemetry are needed for a local per-user agent. The functions must report a missing socket to stderr with the required bootstrap action.

### Failure Modes to Handle
- Missing agent socket: fail before calling ddtool or ssh and show the expected socket path.
- LaunchAgent startup failure: expose through `launchctl print`; do not silently substitute another socket.
- ddtool authentication or signing failure: preserve ddtool's non-zero status and diagnostic.

### Rollout and Rollback
- Apply only the three intended targets after reviewing the targeted chezmoi diff.
- Bootstrap the LaunchAgent once in the current GUI login domain. `RunAtLoad` and `KeepAlive` provide subsequent startup and restart behavior.
- Roll back by booting out `com.matteo.ruina.ddtool-ssh-agent`, applying the reverted source, and confirming the dedicated socket is gone. Do not alter either existing agent.
- Owner: Matteo Ruina.

### Test Strategy
- First run focused render and syntax checks in their failing state, then implement and rerun them.
- Render the plist and `.chezmoiignore` against work and personal data; assert profile inclusion and exclusion.
- Run `fish -n` on both function files and `plutil -lint` on the rendered plist.
- After targeted apply, bootstrap the service and verify that the dedicated socket responds to `ssh-add -l` while the global `SSH_AUTH_SOCK` remains unchanged.
- Run `ddssh -G localhost` and assert its `identityagent` points to the dedicated socket.
- Run `ddsshgen staging` as the end-to-end check. It will request a staging certificate and add it only to the dedicated agent. Compare identity listings before and after on the default and 1Password sockets.
- No persistent automated test harness is added for this small, user-local configuration; the source templates, Fish parser, plist parser, launchd, OpenSSH, and ddtool provide direct validation surfaces.

## Tasks

### Task 1: Add the isolated work-profile agent and Fish commands
**Delivers:** A persistent dedicated socket and explicit commands for certificate generation and SSH use.
**Blocked by:** None
**Traces to:** Requirements 1–3
**Files:** `.chezmoiignore`, `Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl`, `dot_config/private_fish/exact_functions/ddsshgen.fish`, `dot_config/private_fish/exact_functions/ddssh.fish`

- [ ] Run `test -e Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl && test -e dot_config/private_fish/exact_functions/ddsshgen.fish && test -e dot_config/private_fish/exact_functions/ddssh.fish`; expect non-zero before implementation.
- [ ] Add the LaunchAgent, Fish functions, and personal-profile exclusion.
- [ ] Run `fish -n dot_config/private_fish/exact_functions/ddsshgen.fish && fish -n dot_config/private_fish/exact_functions/ddssh.fish`; expect success.
- [ ] Render the plist with `chezmoi --source "$PWD" execute-template < Library/LaunchAgents/com.matteo.ruina.ddtool-ssh-agent.plist.tmpl > /tmp/ddtool-ssh-agent.plist` and run `plutil -lint /tmp/ddtool-ssh-agent.plist`; expect valid XML.
- [ ] Render `.chezmoiignore` with work and personal data; confirm the work profile includes the targets and the personal profile excludes them.
- [ ] Confirm missing-socket behavior fails without invoking ddtool or changing global agent settings.
- [ ] Run `ddsshgen` with zero and two arguments; expect a non-zero usage error and no ddtool invocation.
- [ ] Run targeted `chezmoi --source "$PWD" diff` for the three targets; review the complete diff, apply only those targets, then bootstrap and query the LaunchAgent.
- [ ] Run `ddssh -G localhost`; expect `identityagent` to be the dedicated socket. Confirm that the normal shell `SSH_AUTH_SOCK` value is unchanged.
- [ ] Capture `ssh-add -L` output from the current and 1Password sockets, run `ddsshgen staging`, then confirm the certificate appears only in the dedicated agent and the two existing identity lists are unchanged.

### Task 2: Review documentation and future-agent guidance
**Delivers:** Confirmation that the new local workflow is documented at the right level without adding unrelated agent guidance.
**Blocked by:** Task 1
**Traces to:** Explicit documentation requirements for this work
**Files:** `AGENTS.md`, `dot_pi/agent/AGENTS.md`, Fish function descriptions and diagnostics

- [ ] Review both `AGENTS.md` files and repository documentation for instructions that need to change.
- [ ] Keep the user workflow in the Fish function descriptions and missing-socket diagnostic; add no separate page unless the repository has an existing ddtool SSH runbook.
- [ ] Record why no `AGENTS.md` change is needed, or make a narrowly scoped update if the new bootstrap procedure is durable guidance for future agents.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Commit the verified implementation and any required documentation change with `feat: add isolated ddtool SSH agent`; do not add unrelated guidance.

## Documentation impact
The function descriptions and missing-socket diagnostic cover the user workflow. The implementation task reviews both applicable `AGENTS.md` files and existing docs; no separate documentation page is planned unless an existing ddtool SSH runbook is found.
