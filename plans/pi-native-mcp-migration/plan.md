# Pi Native MCP Migration Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mcp-cli with pi ≥0.99.2 native MCP servers for Datadog (prod/staging), Slack, and Home Assistant, managed declaratively by chezmoi.
**Smallest user-feedback slice:** Work-profile servers connect natively: `pi mcp list` shows `datadog-prod`, `datadog-staging`, and `slack` connected.
**Out of Scope:** Per-tool `toolExposure` overrides (follow-up tuning); OAuth-based servers and `settings.json` changes; Home Assistant server-side (ha-mcp integration) changes; the IT-managed trajectory extension itself (its stale `mcp.json` entry is removed once; tracked separately).
**Architecture:** A new `run_onchange` script registers servers with `pi mcp add`/`pi mcp remove`, profile-gated by template rendering, so foreign `mcp.json` entries survive `chezmoi apply`. Skills and the `cost-optimization` extension switch from `mcp-cli` invocations to native `mcp__<server>__<tool>` access. All mcp-cli installation, config, and shell plumbing is removed.
**Tech Stack:** pi 0.99.2 native MCP, chezmoi templates and `run_onchange` scripts, fish, `dd-auth`, 1Password CLI (`op`), npm test suites.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | /plan requires it | Selected `chezmoi` and `learning-lookup`; later `script-best-practices` (new `run_onchange_*.sh` file) and `write` (plan prose). No Go/Terraform files; the TypeScript edit is removal-only inside an existing file with existing tests. |
| `learning-lookup` | prompt-required | Advisory lookup before decisions | Ran against `Datadog/Learnings.md` with terms `mcp`, `mcp-cli`, `pi agent`, `dd-auth`, `model context protocol`: 0 of 14 sections matched. No material guidance to apply. |
| `chezmoi` | skill-loader | All edits are chezmoi source files | Source/target rules, prefixes, `run_onchange` content hashing, profile gating, `--source` worktree trap, completion workflow |
| `script-best-practices` | skill-loader | Plan creates `run_onchange_pi-mcp-servers.sh.tmpl` | Bash shape (`set -eufo pipefail`, constants, quoting, `op read` substitution with preserved exit code) applied to the pinned script snippet |
| `write` | skill-loader | The plan is a prose artifact | Concise, evidence-backed prose; imperative requirements |
| `feature-worktree` | prompt-required | /plan durable-plan contract | Created `maruina/pi-native-mcp-migration` worktree at `~/.worktrees/dotfiles-pi-native-mcp-migration` from `origin/main` |

### Execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Resolve the supplied plan path | Confirmed the plan and feature branch belong to this worktree. |
| `skill-loader` | prompt-required | Required at execution start | Selected applicable source, shell, and prose guidance before editing. |
| `feature-worktree` | prompt-required | Required before file changes | Confirmed the existing feature worktree was the correct write location. |
| `chezmoi` | skill-loader | The change adds a chezmoi run script | Used source-only editing and `--source` commands; identified the need to limit apply to scripts. |
| `script-best-practices` | skill-loader | The change adds a Bash run script | Matched the repository's script style and checked rendered Bash syntax. |
| `write` | skill-loader | The plan ledger and execution notes changed | Kept status and deviation notes concise and evidence-based. |
| `learning-candidates` | skill-loader | The plan's full-apply assumption did not match observed diff behavior | Recorded the lifecycle-plan target surprise and the filtered apply evidence. |
| `reviewable-pr-workflow` | prompt-required | Required before preparing the completed slice for PR review | Applied the stack-split check; this slice is one registration-script change plus its ledger, with no independent subsystem to split. |

#### Task 2 validation follow-up
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Resolve the supplied plan path | Confirmed the plan belongs to this feature worktree. |
| `skill-loader` | prompt-required | Required at execution start | Selected applicable worktree, chezmoi, shell, and prose guidance. |
| `feature-worktree` | prompt-required | Required before repository work | Confirmed the existing feature worktree was the correct location. |
| `chezmoi` | skill-loader | The task validates a chezmoi-managed run script | Confirmed the registration was already applied; made no target-side changes. |
| `script-best-practices` | skill-loader | The task validates a run script | Compared the existing script with the planned shape; no code changes were needed. |
| `write` | skill-loader | The execution ledger was updated | Recorded the validation gap and outcome concisely. |
| `reviewable-pr-workflow` | prompt-required | Required before PR handoff | Checked the slice for stack splitting and found an existing draft PR. |

#### Slice 2 execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Resolve the supplied plan path | Confirmed the plan and feature branch belong to the worktree before editing. |
| `skill-loader` | prompt-required | Required at execution start | Selected the applicable prose and chezmoi guidance; found no shell, Go, or Terraform trigger in Slice 2. |
| `chezmoi` | skill-loader | Edits are chezmoi source files | Edited source only and prepared a targeted apply of the changed work-profile skill targets. |
| `write` | skill-loader | All Slice 2 edits are agent-facing prose | Kept headings, rules, and examples concise; preserved safety rules while replacing mcp-cli mechanics. |
| `reviewable-pr-workflow` | prompt-required | Required before preparing the completed slice for PR review | Applied the stack-split check; Slice 2 is one cohesive skills rewrite plus its ledger. |

#### Slice 3 execution
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `resolve-worktree` | prompt-required | Resolve the supplied plan path | Confirmed the plan belongs to this feature worktree. |
| `skill-loader` | prompt-required | Required at execution start | Selected applicable chezmoi, shell script, and prose guidance. |
| `feature-worktree` | prompt-required | Required before repository work | Confirmed the existing feature worktree was the correct location. |
| `chezmoi` | skill-loader | Source removal and target cleanup | Removed source templates and obsolete rendered targets (`~/.config/mcp`, `mcp.fish`). |
| `script-best-practices` | skill-loader | Deleted shell files and fish config | Removed `mcp-cli-install.sh.tmpl`, `mcp.fish`, and `HA_MCP_URL` export from `private_config.fish.tmpl`. |
| `write` | skill-loader | The execution ledger was updated | Kept status and verification results concise and evidence-based. |
| `reviewable-pr-workflow` | prompt-required | Required before preparing completed slice | Applied stack-split check; Slice 3 is one removal commit plus ledger. |

## Validated mechanisms (discovery evidence)

| Requirement | Mechanism | Evidence (validated live) | Validation command |
|---|---|---|---|
| Datadog prod/staging auth at work | `!command` headers wrapping `dd-auth`; pi resolves them at connect time | Temp server connected with 34 tools using `!dd-auth --domain app.datadoghq.com -- printenv DD_API_KEY` headers | `pi mcp list` |
| Slack stdio server | `command`/`args` with `~/` path expansion | Temp server connected with 10 tools via the existing keychain proxy | `pi mcp list` |
| Home Assistant remote URL | Literal URL written at apply time via `op read` | pi does **not** substitute `${ENV}` in the `url` field (entry skipped as invalid); `pi mcp add` rejects it upfront | `pi mcp list` on personal profile |
| Foreign `mcp.json` entries survive | `pi mcp add`/`remove` merge, never rewrite the whole file | The IT-managed `trajectory` entry survived add and remove cycles | entry intact after apply |

## Implementation Contract

### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Server registration | `run_onchange_pi-mcp-servers.sh.tmpl` (new) | Register/remove native MCP servers per profile via `pi mcp add`/`remove`; chmod 600 `mcp.json` | `pi mcp list` per profile |
| Datadog skill | `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md` | Guide agents to `mcp__datadog-{prod,staging}__*` tools; keep prod/staging routing, telemetry, and safety rules | `npm run test:skills:profiles` |
| Slack skill | `dot_pi/agent/exact_skills_work/slack-mcp/SKILL.md`, `…/scripts/executable_slack-mcp-proxy.py` (docstring only) | Guide agents to `mcp__slack__*` tools; keep keychain auth and write-approval rules | `npm run test:skills:profiles` |
| Home Assistant skills | `dot_pi/agent/exact_skills_personal/exact_home-assistant/SKILL.md` and `references/`, `…/exact_home-assistant-mcp/SKILL.md` | Route live access through `mcp__ha-mcp__*` tools; keep safety tiers, confirmation protocol, BestPracticeKey flow, URL secrecy | `npm run test:skills:profiles` |
| Extension | `dot_pi/agent/exact_extensions/cost-optimization.ts`, `cost-optimization.test.mjs` | Remove `mcps_list`/`mcps_describe`/`mcps_call`, `runMcpCli`, `mcpIdentifier`, and the fake-`mcp-cli` test; keep read-blocking, bash, and cost tracking | `npm run test:unit` |
| mcp-cli removal | `run_onchange_mcp-cli-install.sh.tmpl`, `dot_config/mcp/` (2 templates), `dot_config/private_fish/conf.d/mcp.fish`, `HA_MCP_URL` line in `dot_config/private_fish/private_config.fish.tmpl` | Delete all mcp-cli sources, rendered targets, and binaries | `command -v mcp-cli` fails; grep clean |
| Docs | `AGENTS.md` (repo root), `dot_pi/agent/exact_skills/chezmoi/SKILL.md` (source-layout listing) | Describe the native setup; drop mcp-cli guidance | manual review |

### Key Decisions
1. **`run_onchange` script over a full-file `mcp.json` template.** A template would be reverted by `chezmoi apply`, clobbering the IT-managed `trajectory` entry and every `/mcp`-made exposure or enabled toggle (pi writes those back into `mcp.json`). `pi mcp add` merges per entry, proven to preserve foreign content. Cost: exposure toggles for the managed servers reset when the script reruns — only when its rendered content changes.
2. **`!dd-auth` header commands for Datadog.** Work shells export no Datadog keys (the 1Password-backed `DD_API_KEY`/`DD_APP_KEY` exports are personal-profile-only); `dd-auth --domain` is the only per-org mechanism. Keys resolve at connect time and never touch disk. Same URL for both servers; the domain selects org 2 prod (`app.datadoghq.com`) or org 197728 staging (`ddstaging.datadoghq.com`), matching the current skill.
3. **Home Assistant URL baked at apply time.** pi does not substitute environment variables in `url`, so `${HA_MCP_URL}` cannot work. The script resolves the connect URL with `op read 'op://Private/Home Assistant/mcp_url'` and passes a literal URL to `pi mcp add`. `mcp.json` becomes mode 0600 because it then contains a credential. The `HA_MCP_URL` fish export is removed with its consumer.
4. **`deferred` exposure for all servers.** Tools reach the model through `tool_search`, then are callable directly as `mcp__<server>__<tool>`. Datadog (34 tools per server) and ha-mcp are too large for `direct`; Slack stays uniform at 10 tools with sends never pre-declared. Per-tool `toolExposure` is deliberate follow-up tuning.
5. **Trajectory entry removed once.** The entry references a missing binary and makes `pi mcp list` exit 1 today. Remove it with `pi mcp remove trajectory`; the IT installer can re-add it. Tracked separately (user decision 2025-10-02).

### Implementation Constraints
- pi 0.99.2 is installed and verified (`pi --version`).
- Match the repo script style: `#!/bin/bash`, `set -eufo pipefail`, same as `run_onchange_mcp-cli-install.sh.tmpl`.
- Run every `chezmoi` command from the feature worktree with `--source "$PWD"`; the default source is the base checkout on `main` (AGENTS.md rule).
- The `exact_` directory trap: `chezmoi diff <target-dir>` can return empty while files differ. Diff or apply explicit target file paths.
- Skills must keep valid YAML frontmatter (`name`, `description`); `validate-skills.mjs` enforces it.
- Personal-profile files (`exact_skills_personal/`, the personal fish block) do not render on this work-profile machine; `.chezmoiignore` excludes them. Validate them with `npm run test:skills:profiles`, not by rendering.
- Before `/verify`, run `npm ci --ignore-scripts` in `dot_pi/agent/` and keep dependencies until `npm test` and `npm run test:all` pass (AGENTS.md rule).
- Stop conditions: `pi mcp list` fails after the script applied for reasons other than the known trajectory entry; `op read` cannot reach the `Private` vault from this machine (record a gap for the personal branch and continue — do not switch the machine profile).
- Secrets only via 1Password (`op`); never hardcode. No Go or Terraform files are touched, so their skills do not apply.

### Security Requirements
- The Home Assistant connect URL is the only HA credential. It may exist in `~/.pi/agent/mcp.json` (mode 0600) and nowhere else: not in fish env, not in chezmoi source, not in rendered scripts, prompts, transcripts, or command output. `pi mcp list` prints server URLs, so the ha skills keep the existing caution about redirecting or not echoing that output.
- Datadog keys: `mcp.json` stores the `!dd-auth … printenv` command strings, not key values. pi resolves them in memory at connect time.
- Slack tokens stay in the macOS keychain, managed by the existing proxy; nothing changes.
- The run script contains only 1Password references (`op://…`), never values.

### Observability Requirements
- Failed connections are reported by pi once at session startup, in `/mcp` (with stderr tails), and by `pi mcp list` (exit 1). Server log notifications append to `~/.pi/agent/mcp.log`. No new monitoring is required for single-user tooling.

### Failure Modes to Handle
| Failure | Behavior | Verification |
|---|---|---|
| dd-auth SSO expires | Datadog servers fail to connect; visible in `/mcp` and `pi mcp list` with the dd-auth error; no partial data risk (calls fail closed) | break auth in a test shell and read the `/mcp` error |
| 1Password locked during personal-profile apply | `op read` fails; `set -e` aborts the script; `chezmoi apply` reports the error; rerun after unlock (idempotent) | run the script with `op` signed out; expect nonzero exit and no partial removal |
| Slack keychain token expires | Proxy prints its re-auth message; existing flow: rerun `slack-mcp-auth.py` | documented in the rewritten skill; unchanged |
| Home Assistant offline | Server shows disconnected and reconnects on the next call | `pi mcp list` while away |
| IT re-adds a `trajectory` entry while its binary is missing | `pi mcp list` exits 1 with an ENOENT detail for that entry only; managed servers still connect and report independently | documented in AGENTS.md |

### Rollout and Rollback
- **Rollout:** `chezmoi apply` on each machine (single user, two profiles). The script is idempotent; servers appear for the running profile.
- **Rollback:** `git revert` the merge, `chezmoi apply` (restores `dot_config/mcp/`, `mcp.fish`, and the mcp-cli installer, which reinstalls the binary), then remove the native entries pi does not manage from source: `pi mcp remove datadog-prod`, `pi mcp remove datadog-staging`, `pi mcp remove slack`, `pi mcp remove ha-mcp` as applicable, and `pi mcp remove trajectory` only if it was re-added meanwhile. Re-render fish config (`chezmoi apply ~/.config/fish`) to restore `HA_MCP_URL`.
- **Owner:** Matteo Ruina.

### Test Strategy
| Requirement | Interface | Seam | Notes |
|---|---|---|---|
| R1 server registration | `pi mcp list` | existing pi CLI | deterministic per profile; staging domain included |
| R2 org routing | live Datadog query | manual session check | staging query must return staging org data |
| R3 deferred exposure | `tool_search` in a session | manual session check | tools load on demand and then call directly |
| R4 skills guidance | skill-driven session | manual session check | one Datadog and one Slack query driven by the rewritten skills |
| R5 mcp-cli removal | `command -v mcp-cli`, `grep -rn` | shell | both binaries (`~/.local/bin`, bun global) and all source references |
| R6 extension cleanup | `npm run test:unit` | existing test suite | `mcps_*` test removed with the tools |
| R7 secret handling | `ls -l ~/.pi/agent/mcp.json`, `grep HA_MCP_URL` | shell | 0600; URL absent from fish env |
| R8 suites green | `npm test` in `dot_pi/agent` | existing suite | includes skills validation for both profiles |

## Requirements and acceptance criteria

### Requirement: Native servers per profile
The system SHALL register work-profile servers `datadog-prod`, `datadog-staging`, and `slack`, and personal-profile server `ha-mcp`, in `~/.pi/agent/mcp.json`, without touching unrelated entries.
- **Scenario: work profile apply**
  - GIVEN a work-profile machine with pi 0.99.2 and `dd-auth` authenticated
  - WHEN `chezmoi apply` runs and then `pi mcp list` runs
  - THEN all three work servers report `connected` and `pi mcp list` exits 0 (after the one-time `trajectory` removal)
- **Scenario: profile switch**
  - GIVEN the script has run for one profile
  - WHEN `chezmoi apply` runs under the other profile (script content hash changes)
  - THEN the previous profile's servers are removed and the new profile's servers are connected

### Requirement: Datadog org routing
The `datadog-prod` server SHALL query org 2 production and the `datadog-staging` server SHALL query org 197728 staging, with keys resolved by `dd-auth` at connect time.
- **Scenario: staging query**
  - GIVEN both Datadog servers connected in a pi session
  - WHEN a staging cluster log query runs through `mcp__datadog-staging__search_datadog_logs`
  - THEN it returns staging-org data, not production data

### Requirement: Deferred tool exposure
All managed servers SHALL use `deferred` exposure with a `description`, so tools are reachable through `tool_search` and then callable directly.
- **Scenario: on-demand loading**
  - GIVEN a pi session with the work servers connected
  - WHEN the model runs `tool_search` for a Datadog log tool
  - THEN `mcp__datadog-prod__search_datadog_logs` is declared and a direct call succeeds

### Requirement: Skills guide native access
The Datadog, Slack, and Home Assistant skills SHALL instruct agents to use native `mcp__<server>__<tool>` tools and SHALL keep their existing safety rules.
- **Scenario: skill-driven Slack search**
  - GIVEN the rewritten `slack-mcp` skill loaded in a work session
  - WHEN the user asks to find a Slack thread
  - THEN the agent discovers and calls the read tools without `mcp-cli`, and does not send without explicit approval

### Requirement: mcp-cli fully removed
The system SHALL leave no mcp-cli binary, config, installer, or shell integration after migration.
- **Scenario: removal check**
  - GIVEN all slices are applied
  - WHEN `command -v mcp-cli` runs and `grep -rn "mcp-cli"` runs over the source (excluding `plans/` and `.git/`)
  - THEN the command fails and the grep returns nothing

### Requirement: Extension tools removed
The `cost-optimization` extension SHALL NOT register `mcps_list`, `mcps_describe`, or `mcps_call`.
- **Scenario: suite green**
  - GIVEN the extension edit is applied
  - WHEN `npm run test:unit` runs in `dot_pi/agent`
  - THEN all tests pass and no test references `mcp-cli`

### Requirement: Home Assistant secret handling
The HA connect URL SHALL exist only in 1Password and in `~/.pi/agent/mcp.json` (mode 0600).
- **Scenario: perms and env**
  - GIVEN the personal profile is applied
  - WHEN `ls -l ~/.pi/agent/mcp.json` and `grep -r HA_MCP_URL ~/.config/fish` run
  - THEN the mode is `-rw-------` and the grep finds nothing

## Slice 1: Native server registration

Delivers: all managed servers connected through pi native MCP; `pi mcp list` clean per profile.

### Task 1: Create the registration script
**Status:** Complete.
**Delivers:** `run_onchange_pi-mcp-servers.sh.tmpl` registers the servers for both profiles.
**Blocked by:** None
**Traces to:** Requirement "Native servers per profile"
**Files:** `run_onchange_pi-mcp-servers.sh.tmpl` (new, repo root)

- [x] Create the script with this pinned shape (validated during discovery):
```bash
#!/bin/bash
set -eufo pipefail

# Register pi native MCP servers (pi >= 0.99.2) in ~/.pi/agent/mcp.json.
# pi mcp add is add-or-replace and preserves unrelated entries, such as the
# IT-managed trajectory server. Removals keep the other profile's servers
# out of mcp.json after a profile switch.
{{ if eq .profile "work" }}
readonly DD_MCP_URL="https://mcp.datadoghq.com/api/unstable/mcp-server/mcp"

pi mcp remove ha-mcp >/dev/null 2>&1 || true

pi mcp add datadog-prod --url "$DD_MCP_URL" \
  --header 'DD-API-KEY=!dd-auth --domain app.datadoghq.com -- printenv DD_API_KEY' \
  --header 'DD-APPLICATION-KEY=!dd-auth --domain app.datadoghq.com -- printenv DD_APP_KEY' \
  --exposure deferred \
  --description 'Query Datadog production org 2 (app.datadoghq.com): metrics, logs, traces, monitors, dashboards, incidents, notebooks.'

pi mcp add datadog-staging --url "$DD_MCP_URL" \
  --header 'DD-API-KEY=!dd-auth --domain ddstaging.datadoghq.com -- printenv DD_API_KEY' \
  --header 'DD-APPLICATION-KEY=!dd-auth --domain ddstaging.datadoghq.com -- printenv DD_APP_KEY' \
  --exposure deferred \
  --description 'Query Datadog staging org 197728 (ddstaging.datadoghq.com) for staging clusters and datacenters.'

pi mcp add slack \
  --exposure deferred \
  --description 'Search and read Datadog Slack channels, threads, and users. Send only on explicit request.' \
  -- python3 '~/.pi/agent/skills_work/slack-mcp/scripts/slack-mcp-proxy.py'
{{ else }}
pi mcp remove datadog-prod >/dev/null 2>&1 || true
pi mcp remove datadog-staging >/dev/null 2>&1 || true
pi mcp remove slack >/dev/null 2>&1 || true

# The connect URL is the only Home Assistant credential; resolve it from
# 1Password at apply time so it never lives in fish env or chezmoi source.
ha_url="$(op read 'op://Private/Home Assistant/mcp_url')"

pi mcp add ha-mcp \
  --url "$ha_url" \
  --exposure deferred \
  --description 'Home Assistant inventory, state, history, and confirmed control. Routed by the home-assistant skill tiers.'
{{ end }}

# mcp.json can contain the Home Assistant connect URL; keep it user-readable only.
chmod 600 "$HOME/.pi/agent/mcp.json"
```
- [x] Use non-trimming template delimiters in the script (`{{ if }}`, not `{{- if }}`): bash is whitespace-tolerant, and trimming delimiters would merge the comment lines with the following command.
- [x] Verify `pi mcp add` accepts the `--exposure` and `--description` flags in this order with `pi mcp add --help` (the discovery test used headers and `--url` only).
- [x] Commit with `feat(pi): register native MCP servers via run_onchange script`.

### Task 2: Apply and validate the work branch
**Status:** Complete.
**Delivers:** Work servers connected natively; stale `trajectory` entry removed.
**Blocked by:** 1
**Traces to:** Requirements "Native servers per profile", "Datadog org routing"
**Files:** none (runtime validation)

- [x] From the worktree, run `pi mcp remove trajectory` (user decision: remove for now, revisit separately).
- [x] Run `chezmoi --source "$PWD" apply`; the new script is the only change, so its first rendered content hash runs it. Confirm the registration commands execute. Execution used `--include=scripts` because a full apply would also create plan files under `$HOME`.
- [x] Run `pi mcp list`; expect `datadog-prod`, `datadog-staging`, `slack` all `connected` and exit 0. On retry, `dd-auth --domain ddstaging.datadoghq.com -- true` exited 0, and `pi mcp list` showed all three servers connected (34 tools each for Datadog); `mcp.json` has mode `0600`.

**Execution note:** The first `pi mcp list` failed for staging during `dd-auth` header resolution. A later safe auth probe and retry succeeded without configuration changes.
- [x] Optional mechanism check attempted for the personal branch. `op read` could not access the `Private` vault; no temporary server was added. Recorded as a validation gap; continued per plan.
- [x] No registration fixes were needed; no fix commit was required.

**Execution note:** Re-ran `pi mcp list`; all three work servers reported connected. The optional personal-profile check could not proceed because the `Private` vault was unavailable to `op read`; this did not change `mcp.json`.

## Slice 2: Skills migration

Delivers: skills guide agents through native tools; `npm run test:skills:profiles` green.

### Task 3: Rewrite the datadog-mcp skill
**Status:** Complete.
**Delivers:** `datadog-mcp` skill drives `mcp__datadog-prod__*` and `mcp__datadog-staging__*` tools.
**Blocked by:** 1
**Traces to:** Requirements "Skills guide native access", "Datadog org routing"
**Files:** `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md`

- [x] Update the frontmatter description (drop "through mcp-cli and dd-auth").
- [x] Replace the Config section: servers live in `~/.pi/agent/mcp.json` (pi native); auth is resolved by pi at connect time through the `dd-auth` header commands; no `dd-auth` wrapper is needed per call.
- [x] Replace Discovery: `tool_search` for tool discovery, or codemode `describeNamespace("mcp__datadog-prod")` for tool names; keep the prod/staging selection rules by cluster/datacenter name verbatim.
- [x] Rewrite the example calls as native tool invocations (`mcp__datadog-prod__search_datadog_logs` with `query`/`from`/`to`/`max_tokens`/`telemetry: {"dd_mcp_source":"pi"}`); keep the staging examples with `mcp__datadog-staging__*`.
- [x] Keep the Rules section (read-only preference, narrow windows, `max_tokens`, telemetry, never print keys); drop mcp-cli quoting advice that no longer applies.
- [x] Commit with `refactor(pi): point datadog-mcp skill at native MCP tools`.

### Task 4: Rewrite the slack-mcp skill
**Status:** Complete.
**Delivers:** `slack-mcp` skill drives `mcp__slack__*` tools.
**Blocked by:** 1
**Traces to:** Requirement "Skills guide native access"
**Files:** `dot_pi/agent/exact_skills_work/slack-mcp/SKILL.md`, `dot_pi/agent/exact_skills_work/slack-mcp/scripts/executable_slack-mcp-proxy.py`

- [x] Update the frontmatter description (drop "through mcp-cli").
- [x] Replace the Config section: server `slack` is a stdio server in `~/.pi/agent/mcp.json`; keep the proxy path, keychain auth, client ID, and the auth script instructions; drop the `SLACK_MCP_CONFIG` indirection (single config file now).
- [x] Replace Discovery with `tool_search` / `describeNamespace("mcp__slack")` and native tool names (`mcp__slack__slack_search_public_and_private`, `slack_read_channel`, `slack_read_thread`).
- [x] Rewrite the read and write examples as native tool calls; keep every rule (write approval, draft preference, `response_format` values, attribution note, token secrecy, re-auth flow).
- [x] In the proxy script docstring, replace the stale `~/.config/mcp/mcp.json` usage example with `~/.pi/agent/mcp.json` (one line).
- [x] Commit with `refactor(pi): point slack-mcp skill at native MCP tools`.

### Task 5: Rewrite the Home Assistant skills
**Status:** Complete.
**Delivers:** HA router and mechanics skills drive `mcp__ha-mcp__*` tools.
**Blocked by:** 1
**Traces to:** Requirement "Skills guide native access"
**Files:** `dot_pi/agent/exact_skills_personal/exact_home-assistant/SKILL.md`, `…/exact_home-assistant/references/core-concepts.md`, `…/exact_home-assistant/references/safety-and-routing.md`, `…/exact_home-assistant-mcp/SKILL.md`

- [x] Router skill: replace the `mcp-cli info ha-mcp` routing step with native discovery (`tool_search`); keep the safety tiers, confirmation protocol, verification and rollback, token/URL secrecy, and "stop if MCP unavailable".
- [x] Mechanics skill (`home-assistant-mcp`): update Configuration (server `ha-mcp` in `~/.pi/agent/mcp.json`, URL resolved from 1Password at apply time, never print it; `pi mcp list` prints URLs, so keep the redirect caution), Discovery (`tool_search` / `describeNamespace`), read calls (`mcp__ha-mcp__<tool>` with JSON args; the heredoc advice no longer applies), mutations (schema from discovery output; keep the router gating), and the BestPracticeKey flow (`mcp__ha-mcp__ha_get_skill_guide`, hourly rotation, `BPS_ACKNOWLEDGMENT_REQUIRED` retry, `config` parameter) with unchanged semantics.
- [x] Update the two `references/` files where they mention mcp-cli.
- [x] Commit with `refactor(pi): point home-assistant skills at native MCP tools`.

### Task 6: Validate skills
**Status:** Complete.
**Delivers:** Both profiles' skills pass validation.
**Blocked by:** 3, 4, 5
**Traces to:** Requirement "Skills guide native access"
**Files:** none (test run)

- [x] Run `cd dot_pi/agent && npm run test:skills:profiles`; expect success for `work` and `personal`. Result: `Validated 44 skill(s) for work profile` and `Validated 44 skill(s) for personal profile`, both exit 0.

## Slice 3: mcp-cli removal

Delivers: no mcp-cli binary, config, installer, or shell integration remains.

### Task 7: Delete mcp-cli sources and targets
**Status:** Complete.
**Delivers:** All mcp-cli plumbing removed from source and machine.
**Blocked by:** 2
**Traces to:** Requirement "mcp-cli fully removed"
**Files:** `run_onchange_mcp-cli-install.sh.tmpl` (delete), `dot_config/mcp/mcp_servers.json.tmpl` (delete), `dot_config/mcp/slack_mcp_servers.json.tmpl` (delete), `dot_config/private_fish/conf.d/mcp.fish` (delete), `dot_config/private_fish/private_config.fish.tmpl` (remove the `HA_MCP_URL` export and its comment)

- [x] Delete the four source files and the `dot_config/mcp/` directory.
- [x] Remove the `HA_MCP_URL` export (with its comment) from the personal block of `private_config.fish.tmpl`; its consumer is gone and the URL now resolves at apply time.
- [x] Remove rendered targets that source deletion leaves behind: `rm ~/.config/mcp/mcp_servers.json ~/.config/mcp/slack_mcp_servers.json && rmdir ~/.config/mcp` and `rm ~/.config/fish/conf.d/mcp.fish`.
- [x] Remove the binaries: `rm ~/.local/bin/mcp-cli` and `bun remove --global mcp-cli` (clears `~/.bun/bin/mcp-cli` and the bun global package entry).
- [x] Commit with `chore(pi): remove mcp-cli install, config, and env plumbing`.

### Task 8: Verify no residual references
**Status:** Complete.
**Delivers:** Source tree is mcp-cli-free.
**Blocked by:** 7
**Traces to:** Requirement "mcp-cli fully removed"
**Files:** none (verification)

- [x] Run `command -v mcp-cli`; expect failure. Exited nonzero (`mcp-cli not found`).
- [x] Run `grep -rn "mcp-cli" . --exclude-dir=plans --exclude-dir=.git`; matches only in `dot_pi/agent/exact_extensions/` (to be removed in Task 9) and root `AGENTS.md` (to be updated in Task 10).
- [x] Run `grep -rn "HA_MCP_URL\|MCP_NO_DAEMON\|MCP_STRICT_ENV" . --exclude-dir=plans --exclude-dir=.git`; 0 matches.

## Slice 4: Extension cleanup and documentation

Delivers: dead tools removed, guidance accurate, full suite green.

### Task 9: Remove mcps_* tools from the cost-optimization extension
**Delivers:** Extension no longer spawns mcp-cli; tests updated.
**Blocked by:** None (independent of Slices 1–3; ordered here so Task 10 verifies the final state)
**Traces to:** Requirement "Extension tools removed"
**Files:** `dot_pi/agent/exact_extensions/cost-optimization.ts`, `dot_pi/agent/exact_extensions/cost-optimization.test.mjs`

- [ ] Remove the `mcps_list`, `mcps_describe`, and `mcps_call` registrations, the `runMcpCli` helper, `mcpIdentifier`, and the now-unused `MCP_MAX_BYTES` constant (verify no other use).
- [ ] Remove the `limits MCP call output to 6KiB` test (it builds a fake `mcp-cli` binary); keep all other tests.
- [ ] Run `cd dot_pi/agent && npm run test:unit`; expect success. Run `npx tsc --noEmit` if the repo has a typecheck path, otherwise rely on the test suite.
- [ ] Commit with `refactor(pi): drop mcps_* tools from cost-optimization extension`.

### Task 10: Update guidance documents
**Delivers:** AGENTS.md and the chezmoi skill describe the native setup.
**Blocked by:** 9 (the repo-wide grep check needs the extension edit landed)
**Traces to:** Requirement "mcp-cli fully removed" (guidance half)
**Files:** `AGENTS.md` (repo root), `dot_pi/agent/exact_skills/chezmoi/SKILL.md`

- [ ] Replace the "Pi MCP and Home Assistant" section in `AGENTS.md` with:
```md
## Pi MCP
- Pi connects to MCP servers natively from `~/.pi/agent/mcp.json`. Tool names follow `mcp__<server>__<tool>`; all managed servers use `deferred` exposure, so load tools with `tool_search` before calling them.
- `run_onchange_pi-mcp-servers.sh.tmpl` registers servers through `pi mcp add`/`pi mcp remove`, profile-gated. Do not hand-edit these entries; `/mcp` exposure or enabled toggles are reverted when the script reruns.
- Work profile: `datadog-prod` and `datadog-staging` (keys injected at connect time by `!dd-auth` header commands) and `slack` (stdio proxy reading the macOS keychain). Personal profile: `ha-mcp`; the connect URL resolves from 1Password at apply time, so `mcp.json` is mode 0600. Home Assistant capability is personal-profile-only.
- Validate with `pi mcp list`. The IT-managed `trajectory` entry is not managed by this script; if its installer re-adds it, leave it alone (tracked separately).
```
- [ ] In the chezmoi skill, update the source-layout listing: remove `dot_config/mcp/`, add `run_onchange_pi-mcp-servers.sh.tmpl` beside `run_onchange_brew-install.sh.tmpl`.
- [ ] Leave `dot_pi/agent/AGENTS.md` unchanged; it contains no MCP guidance (verified by grep during planning).
- [ ] Re-run the Task 8 greps; expect zero matches repo-wide (excluding `plans/` and `.git/`).
- [ ] Commit with `docs: update MCP guidance for native pi MCP`.

## Final verification
**Blocked by:** 1–10
- [ ] Run `cd dot_pi/agent && npm ci --ignore-scripts && npm test && npm run test:all`; expect success. Remove `dot_pi/agent/node_modules` afterwards (AGENTS.md rule: dependencies are disposable).
- [ ] Run `pi mcp list`; expect only managed servers, all connected, exit 0.
- [ ] Start an interactive pi session in a work context: run `/mcp` (all servers connected), load a Datadog tool with `tool_search`, and answer one real question through `mcp__datadog-prod__search_datadog_logs` or a Slack search through `mcp__slack__*`. Confirm no `mcps_*` tools remain declared.
- [ ] Feature-level acceptance (only the completed feature satisfies it): a skill-driven Datadog staging query returns org 197728 data end-to-end without mcp-cli.

## Documentation impact
Covered by Task 10: repo `AGENTS.md`, the `chezmoi` skill layout. Skill rewrites in Slice 2 are themselves documentation. The pi upstream docs (`docs/mcp.md` in the pi installation) are the reference; no upstream contribution is needed. `dot_pi/agent/AGENTS.md` needs no change (verified: no MCP content).

## Learning candidates
- 2026-10-01: `chezmoi diff` includes lifecycle plan files as target files, so a full apply would copy the plan under `$HOME`; `chezmoi apply --include=scripts --dry-run --verbose` isolates the intended run script. Evidence: dry-run output listed only `pi-mcp-servers.sh`.
