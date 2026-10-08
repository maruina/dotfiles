# Datadog Pi Plugin Migration Implementation Plan
> Steps use checkbox (`- [ ]`) syntax for tracking.
**Goal:** Replace the work-only `dd-auth` wrapper extension with the Datadog Pi Plugin in both work and personal profiles while preserving access to the production and `ddstaging` organizations.
**Smallest user-feedback slice:** Use the plugin in a work Pi session to query both organizations and have the agent switch to the requested organization before the legacy wrapper is removed.
**Out of Scope:** Personal account sign-in on this work machine; the separate staging service that uses a custom MCP host; upstream plugin changes; changes to Slack, Home Assistant, or other Pi packages.
**Architecture:** The chezmoi settings modifier will declare the unpinned `npm:@datadog/pi-plugin` source in both profile package lists. Pi will install the missing package and the plugin will manage saved Datadog connections and session selection. After work-profile checks pass, remove the `dd-auth` extension and keep the MCP cleanup commands so old server entries are removed on apply.
**Tech Stack:** Pi 1.0.4 package manager; `@datadog/pi-plugin` 0.7.20; chezmoi templates; Pi OAuth; TypeScript tests; shell.
---
## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | `prompt-required` | Required at the start of planning | Selected repository, chezmoi, shell, research, and writing guidance. |
| `resolve-worktree` | `prompt-required` | No design path was supplied | Searched all worktrees; after you confirmed there was no prior design, used the request as the source. |
| `learning-lookup` | `prompt-required` | Required before planning decisions | Searched `Datadog/Learnings.md`; one Kubernetes remote-auth section matched but did not apply. |
| `obsidian-cli` | `agent-selected` | Needed to perform the advisory lookup | Used Obsidian CLI and the learning evidence helper. |
| `codebase-research` | `skill-loader` | This is a cross-profile authentication migration | Traced current settings, extension, cleanup script, tests, documentation, Pi package loading, and plugin connection behavior. |
| `chezmoi` | `skill-loader` | All source changes are chezmoi-managed | Identified the profile templates, source exclusions, and target-safe validation path. |
| `script-best-practices` | `skill-loader` | The MCP cleanup script is a shell template | Kept the existing script as the mechanism for removing stale MCP entries. |
| `repo-checkout` | `user-requested` | You asked to inspect the plugin repository locally | Cloned `datadog-labs/pi-plugin` to `~/dd/pi-plugin` and read its setup and authentication behavior. |
| `slack-mcp` | `user-requested` | You asked me to read an internal Slack thread | Read the full thread and used its release and organization-switching details. |
| `write` | `skill-loader` | The plan is a durable prose artifact | Kept the plan direct and tied to source evidence. |
| `humanizer` | `skill-loader` | The plan is a durable prose artifact | Removed unsupported claims and templated wording. |
| `feature-worktree` | `prompt-required` | Durable plans must not be written on `main` | Created this plan in a feature worktree from updated `origin/main`. |

## Source of truth and confirmed decisions
- You confirmed that no prior design exists and approved the alignment brief, including both work organizations as migration requirements.
- The cloned [plugin repository](https://github.com/datadog-labs/pi-plugin) is at `f9eb29b` (release `0.7.20`); `npm view @datadog/pi-plugin@latest version` returned `0.7.20`.
- The [plugin README](https://github.com/datadog-labs/pi-plugin#getting-started) uses `pi install npm:@datadog/pi-plugin`. This plan declares that same unpinned source in the managed settings template because chezmoi owns the package list. Pi 1.0.4's package manager installs a missing declared npm package when it resolves configured package sources. The package can be updated later with `pi update --extensions`.
- The [Slack thread](https://dd.slack.com/archives/C0AU45Z1FFC/p1790621912565169) says the plugin supports multiple organizations and that `ddconfig` can switch the session to another saved organization. It distinguishes the `ddstaging` organization on US1 from a separate staging service that uses a custom MCP host. The current wrapper uses `dd-auth --domain ddstaging.datadoghq.com`, so this migration tests the `ddstaging` organization on US1.
- The plugin uses OAuth by default and stores credential files with owner-only permissions under `~/.pi/agent/datadog/`. That store is per OS user, not per chezmoi profile. The personal account will be configured on the personal laptop, as requested.
- Keep the current wrapper until plugin access and organization switching pass for both work organizations. If either check fails, stop before removing the wrapper.
- Existing plans `plans/datadog-mcp-async-auth/plan.md` and `plans/pi-native-mcp-migration/plan.md` document implementation history. They do not define this migration.

## Advisory learning lookup
`Datadog/Learnings.md` returned one matching section, “Separate remote API connectivity, authentication, and authorization.” It concerns Kubernetes API access and has no applicable guidance for this plugin migration. No material learning was applied.

## Implementation Contract
### Components Affected
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| Profile package declarations | `dot_pi/agent/modify_private_settings.json.tmpl` | Declare the plugin in both work and personal package lists | Render the modifier for each profile and inspect `.packages` with `jq` |
| Legacy auth extension | `dot_pi/agent/exact_extensions/datadog-mcp-auth/` | Remove the old `dd-auth` runner, registration logic, and tests after plugin validation | LSP reference check before deletion; `npm run test:unit`; fresh Pi session |
| Test selection | `dot_pi/agent/package.json` | Remove the deleted extension's test glob | `npm test` |
| Personal source exclusion | `.chezmoiignore` | Remove the exclusion for the deleted extension | Render work and personal ignore lists |
| Saved MCP cleanup | `run_onchange_pi-mcp-servers.sh.tmpl` | Retain removal of `datadog-prod` and `datadog-staging` in both profile branches and clarify its migration-cleanup purpose so the script reruns | Render both branches; `bash -n`; inspect server names in `mcp.json` without printing URLs |
| Agent guidance | `AGENTS.md`, `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md` | Describe plugin setup, safe organization selection, and `ddconfig` use | `npm run test:skills:profiles`; manual work-session check |
| Unchanged local guidance | `dot_pi/agent/AGENTS.md` | No MCP or Datadog guidance exists there | Record no change after checking the file |

### Key Decisions
- **Use the unpinned npm source from upstream Getting Started.** It resolves the latest published package on first installation; package updates remain an explicit Pi update operation. Do not pin `0.7.20` or add an independent version-management mechanism.
- **Use one US1 site with two saved organizations.** The current work connections are production and `ddstaging` organizations. Use `/datadog` to add both, then verify the plugin's agent-driven `ddconfig` switch. Do not configure the separate staging service's custom MCP host.
- **Keep the old wrapper through integration testing.** Test the plugin before removing `datadog-mcp-auth`, as requested. Cleanup of the old path is blocked until both org checks pass.
- **Keep `pi mcp remove` cleanup commands in both profile branches.** They remove stale static `mcp.json` entries after the migration and do not register Datadog servers.
- **Configure package availability, not personal credentials.** The personal profile will receive the plugin package declaration. Personal OAuth setup remains for the personal laptop.

### Implementation Constraints
- Edit chezmoi source files only. Do not edit rendered targets directly.
- Use `chezmoi --source "$PWD"` for commands from the feature worktree.
- Do not replace `.packages` with a full settings-file template; preserve the modifier's existing profile behavior and unrelated runtime settings.
- Do not remove the `pi mcp remove datadog-prod` or `pi mcp remove datadog-staging` commands. Change the cleanup script only enough to clarify the cleanup intent and cause `run_onchange` to execute on apply.
- Do not configure or sign in to a personal Datadog account on this work machine.
- Pi profile package declarations share the same per-user plugin state directory. They do not isolate credentials. Keep the user's separate-laptop setup for personal credentials.
- Before deleting the exported extension code, run the TypeScript reference check. The initial LSP attempt failed because the checkout lacked a TypeScript installation; run `npm ci --ignore-scripts` first.
- Stop before removing the wrapper if the plugin cannot connect to either work organization, reports the wrong organization identity, or cannot switch the session as requested.

### Security Requirements
- OAuth credentials MUST remain in the plugin-managed `~/.pi/agent/datadog/` directory with `0700` directories and `0600` credential files. Check metadata only; do not print file contents.
- Datadog credentials MUST NOT be added to chezmoi source, `mcp.json`, prompts, test fixtures, or logs.
- Confirm the selected organization with `ddconfig` before a read-only query. Plugin results from different organizations can remain in the same conversation context. Use separate Pi sessions when that context must remain isolated.
- Custom MCP domains require explicit confirmation in the plugin. This plan does not use a custom domain for the `ddstaging` US1 organization.

### Observability Requirements
No service-level metrics, alerts, or runbooks apply to this single-user Pi configuration. Use the plugin's `ddconfig` tool with `action: "status"` or `action: "check"`, tool results, Pi `/mcp` view, and non-secret configuration checks to observe setup and failures.

### Failure Modes to Handle
| Failure | Expected behavior | Verification |
|---|---|---|
| npm access or package installation fails | Keep the wrapper; report the Pi package error and retry after access is restored | `pi list`, then start a fresh Pi session |
| OAuth callback is canceled or unavailable | Do not remove the wrapper; retry sign-in from `/datadog` after resolving the callback issue | Complete `/datadog` sign-in and invoke the `ddconfig` tool with `action: "check"` |
| Production or `ddstaging` access fails | Keep the wrapper and stop the migration cleanup | Verify each saved connection and its organization identity by invoking the `ddconfig` tool with `action: "check"` |
| Plugin identifies the wrong organization | Do not issue the query and do not remove the wrapper | The `ddconfig` tool with `action: "status"` or `action: "check"` must show the intended org before the read-only tool call |
| Agent does not switch to the requested saved org | Keep the wrapper and stop; do not silently use the selected default | Ask for a request targeting the other org, then inspect `ddconfig` selection and returned org identity |
| Stale static MCP entry remains | Run the updated `run_onchange` script; preserve unrelated entries | Inspect only `.mcpServers` keys in `mcp.json` and `/mcp`; do not print the full config because it may contain the Home Assistant URL |
| Personal profile is applied on the work laptop | Package may be present, but no personal account is configured | Verify rendered profile settings only; do not start personal OAuth here |

### Rollout and Rollback
- **Rollout:** First apply the work settings change and start Pi so the declared package installs. Complete the two-org read-only and switching checks while the wrapper remains. Then apply the wrapper removal and MCP cleanup on the work profile. Validate the personal profile render; apply and configure it later on the personal laptop.
- **Rollback:** Revert the source commits and apply the restored work configuration. The wrapper returns and registers its dynamic servers. Static Datadog MCP entries remain removed; the cleanup commands are intentionally retained. Do not delete OAuth state during rollback. Manage saved connections through `/datadog` if needed.
- **Owner:** Matteo Ruina.

### Test Strategy
| Requirement or scenario | Highest supported interface | Seam and boundaries | Expected evidence |
|---|---|---|---|
| Plugin appears in both profiles | Rendered settings modifier plus `jq` | Existing template interface; no new test seam | Each profile has exactly one `npm:@datadog/pi-plugin` package source |
| Plugin installs and loads | Pi package manager and `pi list` | Real npm package resolution; do not mock | Package appears and plugin commands/tools load in a fresh session |
| Production and `ddstaging` work | `/datadog`, the `ddconfig` tool with `action: "check"`, and one read-only `datadog` request per org | Real OAuth and Datadog MCP server; this is the required manual integration check | Both checks report the intended org identity and both read-only requests succeed |
| Agent switches saved org | Interactive Pi session with `ddconfig` and `datadog` | Real agent tool selection; no deterministic unit seam exists for model choice | A request for the other org selects its saved profile before querying; the `ddconfig` tool with `action: "check"` confirms it |
| Old auth path is removed | `npm run test:unit`, source search, fresh Pi session | Existing test suite; LSP references before deletion | No extension test glob or profile exclusion remains; old runtime server names do not appear |
| Old `mcp.json` entries are cleaned | Rendered `run_onchange` script, then key-only JSON check | Existing script and Pi CLI; unrelated entries are preserved | Both profiles remove old names; no Datadog server names remain in `.mcpServers` |
| Credential storage is private | File and directory metadata after OAuth | Real plugin store; inspect permissions only | Directories are `0700`; credential files are `0600`; no credential values are printed |
| Documentation and profile rules remain valid | `npm run test:skills:profiles` and manual review | Existing skill validator | Both profiles validate and guidance matches plugin behavior |

The narrow pre-change check is the rendered profile assertion below. It MUST fail before implementation because neither current profile declares the package:

```bash
set -eu
for profile in work personal; do
  tmp=$(mktemp)
  trap 'rm -f "$tmp"' EXIT
  chezmoi --source "$PWD" --override-data "{\"profile\":\"$profile\"}" execute-template < dot_pi/agent/modify_private_settings.json.tmpl > "$tmp"
  printf '{}' | sh "$tmp" | jq -e '.packages | map(select(. == "npm:@datadog/pi-plugin")) | length == 1' >/dev/null
  rm "$tmp"
  trap - EXIT
done
```

## Acceptance Criteria
### Requirement: The plugin is available in both profiles
The managed settings SHALL declare `npm:@datadog/pi-plugin` exactly once in both work and personal profile package lists.

#### Scenario: Work settings render
- GIVEN the work profile settings modifier
- WHEN the modifier runs with an empty JSON input
- THEN `.packages` contains exactly one `npm:@datadog/pi-plugin` entry

#### Scenario: Personal settings render
- GIVEN the personal profile settings modifier
- WHEN the modifier runs with an empty JSON input
- THEN `.packages` contains exactly one `npm:@datadog/pi-plugin` entry
- AND no personal Datadog OAuth sign-in occurs on the work machine

### Requirement: Work production and `ddstaging` access is preserved
The plugin SHALL connect to both saved US1 organizations and verify the selected organization's identity before a query.

#### Scenario: Read-only query in each organization
- GIVEN production and `ddstaging` connections are saved through `/datadog`
- WHEN the `ddconfig` tool runs with `action: "check"` and one read-only `datadog` request runs against each selected connection
- THEN each check reports the intended organization and each request succeeds

### Requirement: The agent selects the requested organization
The agent SHALL switch to a saved organization with `ddconfig` when a user request clearly targets a different configured organization.

#### Scenario: Switch from production to `ddstaging`
- GIVEN the current session selects production and both orgs are saved
- WHEN the user asks for a read-only query against `ddstaging`
- THEN the agent switches to the saved `ddstaging` profile before the query
- AND the `ddconfig` tool with `action: "check"` confirms the selected identity is `ddstaging`

#### Scenario: Switch back to production
- GIVEN the current session selects `ddstaging`
- WHEN the user asks for a read-only query against production
- THEN the agent switches to the saved production profile before the query
- AND the `ddconfig` tool with `action: "check"` confirms the selected identity is production

### Requirement: Legacy auth and saved entries are removed only after plugin validation
The system SHALL remove the `datadog-mcp-auth` extension only after both work organizations and agent-driven switching pass. The MCP cleanup script SHALL remove old static Datadog entries in both profile branches.

#### Scenario: Migration passes
- GIVEN both org checks and both switching scenarios pass
- WHEN the wrapper removal is applied and a fresh Pi session starts
- THEN the old dynamic server names are absent from `/mcp`
- AND the plugin's Datadog tools remain available
- AND `datadog-prod` and `datadog-staging` are absent from the `.mcpServers` keys

#### Scenario: Plugin validation fails
- GIVEN either work organization or agent switching fails
- WHEN the migration reaches the cleanup gate
- THEN the wrapper remains installed and no cleanup slice is applied

### Requirement: OAuth credentials remain private
The plugin SHALL store credentials only in its user-owned state directory with owner-only permissions, and credentials SHALL NOT appear in repository source, `mcp.json`, or logs.

#### Scenario: Work OAuth setup
- GIVEN a work organization was connected through `/datadog`
- WHEN credential storage permissions and repository/config references are checked
- THEN state directories use mode `0700`, credential files use mode `0600`, and no credential value is printed or found in source/config/log output

### Requirement: Datadog guidance describes the plugin
Root agent guidance and the work Datadog skill SHALL describe plugin setup, org selection, and agent switching without referring to the deleted wrapper as the active integration.

#### Scenario: Both profile skill sets validate
- GIVEN the documentation changes
- WHEN `npm run test:skills:profiles` runs
- THEN work and personal skill validation succeeds

## Tasks
### Slice 1: Install and validate the plugin while the wrapper remains
This slice delivers a usable plugin path before removing the existing Datadog integration.

### Task 1: Declare the plugin in both profile settings and validate work access
**Delivers:** Both profiles declare the plugin, and the work session verifies its prod/`ddstaging` access and agent-driven switching while the wrapper remains installed.
**Blocked by:** None
**Traces to:** Goal; Requirements “The plugin is available in both profiles,” “Work production and `ddstaging` access is preserved,” and “The agent selects the requested organization”
**Files:** `dot_pi/agent/modify_private_settings.json.tmpl`

- [ ] Run the profile render assertion in the test strategy; expect it to fail for both profiles because the package source is absent.
- [ ] Add `npm:@datadog/pi-plugin` once to the work and personal `.packages` arrays. Keep all existing package entries and profile-specific settings.
- [ ] Render the settings modifier for both profiles and assert that each `.packages` array contains the new source exactly once.
- [ ] Run `chezmoi --source "$PWD" diff ~/.pi/agent/settings.json`; review the targeted change before applying.
- [ ] Apply only the work settings target with `chezmoi --source "$PWD" apply ~/.pi/agent/settings.json`; do not change the active chezmoi profile.
- [ ] Start a fresh work Pi session. Confirm the package is configured with `pi list` and the plugin loads its `/datadog` command. Use `/datadog` to save the production and `ddstaging` organizations on US1. Use the `ddconfig` tool with `action: "check"` and one read-only query per organization to verify the selected org identities and tool access.
- [ ] In the same session, ask for a read-only request targeting the other org. Confirm the agent uses `ddconfig` to switch before calling `datadog`; verify the selected identity with the `ddconfig` tool using `action: "check"`. Keep the `dd-auth` wrapper intact if any check fails.
- [ ] Check plugin credential directory/file modes without printing their contents. Record the observed `0700`/`0600` modes.
- [ ] Commit with `feat(pi): install Datadog plugin in both profiles`.

### Slice 2: Retire the wrapper after successful integration checks
This slice removes duplicate auth and cleans saved MCP state only after Slice 1 passes.

### Task 2: Remove legacy auth and clean old Datadog MCP entries
**Delivers:** The wrapper no longer loads, tests no longer reference it, and apply removes any saved static Datadog entries.
**Blocked by:** Task 1 passing for both work orgs and switching
**Traces to:** Requirement “Legacy auth and saved entries are removed only after plugin validation”
**Files:** `dot_pi/agent/exact_extensions/datadog-mcp-auth/`, `dot_pi/agent/package.json`, `.chezmoiignore`, `run_onchange_pi-mcp-servers.sh.tmpl`

- Reason a failing test is not practical: Task 2 is pure deletion and configuration cleanup of legacy components. Existing unit tests and configuration pass before deletion; the task verifies that tests continue to pass after deletion and that rendered template scripts pass `bash -n` and output assertions.
- [ ] Run `npm ci --ignore-scripts` in `dot_pi/agent` so the TypeScript language server can load.
- [ ] Run `lsp_find_references` for `registerDatadogMcpAuth` in `_core.ts` and the default-exported `datadogMcpAuthExtension` in `index.ts` before deleting the directory. Also text-search the extension path because Pi discovers default factories automatically. Resolve any references not covered by the following files.
- [ ] Remove `dot_pi/agent/exact_extensions/datadog-mcp-auth/` and its `"$ext"/datadog-mcp-auth/*.test.ts` entry from `dot_pi/agent/package.json`.
- [ ] Remove `.pi/agent/extensions/datadog-mcp-auth` from the personal block in `.chezmoiignore`; the source no longer exists.
- [ ] Clarify the legacy Datadog cleanup intent in `run_onchange_pi-mcp-servers.sh.tmpl` so its content change reruns the script. Keep both `pi mcp remove datadog-prod` and `pi mcp remove datadog-staging` commands in both profile branches; do not modify other server registrations.
- [ ] Render the script for `work` and `personal`; confirm both outputs remove the old Datadog names and preserve their other server commands. Run `bash -n` on each rendered script.
- [ ] Run `cd dot_pi/agent && npm run test:unit`; expect all remaining unit tests to pass.
- [ ] Apply the work extension removal and updated script through chezmoi: run `chezmoi --source "$PWD" apply ~/.pi/agent/extensions` to prune the legacy extension directory via `exact_`, and `chezmoi --source "$PWD" apply --include scripts` to execute the updated cleanup script. Restart Pi. Check `/mcp` and only the `.mcpServers` keys in `~/.pi/agent/mcp.json`; confirm no old Datadog server names remain. Do not print the full config because it may contain the Home Assistant URL.
- [ ] Commit with `refactor(pi): remove legacy Datadog auth extension`.

### Task 3: Update guidance and complete feature-level verification
**Delivers:** Agent guidance uses the plugin and all automated, profile, and work-session checks pass after cleanup.
**Blocked by:** Task 2
**Traces to:** Requirement “Datadog guidance describes the plugin”; all feature-level requirements
**Files:** `AGENTS.md`, `dot_pi/agent/exact_skills_work/datadog-mcp/SKILL.md`

- Reason a failing test is not practical: Task 3 updates prose documentation and agent skills. Documentation changes are verified through the profile skill validation linter (`npm run test:skills:profiles`), full test suite pass (`npm test && npm run test:all`), and negative search across source for obsolete references.
- [ ] Update the root `AGENTS.md` Pi MCP section to state that the Datadog plugin is declared in both profile settings; describe `/datadog`, `datadog`, `ddconfig`, and `ddtoolsets`; explain that the agent can switch only among saved orgs; retain Slack, Home Assistant, and trajectory guidance.
- [ ] Rewrite the work `datadog-mcp` skill for the plugin. Keep the production/`ddstaging` routing rules and read-only requirements. Explain that `ddconfig` selects a saved org, confirm org identity before queries, and use separate Pi sessions when results from different orgs must not share conversation context.
- [ ] Review `dot_pi/agent/AGENTS.md` and record that no change is needed because it contains no Datadog or MCP guidance.
- [ ] Run `npm run test:skills:profiles`; expect both profiles to validate.
- [ ] Run `cd dot_pi/agent && npm test && npm run test:all`; expect all suites to pass. Remove `dot_pi/agent/node_modules` after the suites pass, per repository guidance.
- [ ] Render both settings profiles and both cleanup-script branches again. Confirm plugin appears exactly once in each package list, both branches remove old Datadog server names, and neither profile contains the deleted extension path.
- [ ] Search tracked source outside `plans/` for stale references to `datadog-mcp-auth` and old native tool names. Allow the deliberate `pi mcp remove` cleanup commands and historical plan files.
- [ ] Review `chezmoi --source "$PWD" diff` for only the intended target. Apply the changed work skill to its target with `chezmoi --source "$PWD" apply ~/.pi/agent/skills_work/datadog-mcp/SKILL.md`; root `AGENTS.md` is excluded by `.chezmoiignore` and is tracked as an in-repo source change only. Do not apply the personal profile on this work machine.
- [ ] Repeat the two-org read-only and agent-switch checks in a fresh work Pi session after removing the wrapper. Verify the production and `ddstaging` identities with the `ddconfig` tool using `action: "check"` before their queries.
- [ ] Commit with `docs(pi): document Datadog plugin access`.

## Final verification
- [ ] Feature-level acceptance: work and personal settings declare the package; work production and `ddstaging` requests succeed; the agent switches to the requested saved org; the wrapper and old entries are absent; no personal OAuth was configured on the work machine.
- [ ] Confirm that rollback remains possible by reverting the source commits and applying the restored work configuration. Do not delete OAuth state as part of rollback.

## Documentation and future-agent guidance
Task 3 updates root `AGENTS.md` and the work Datadog skill. `dot_pi/agent/AGENTS.md` requires no change because it has no Datadog or MCP instructions. The Pi plugin README remains the upstream setup reference; no upstream documentation change is required.
