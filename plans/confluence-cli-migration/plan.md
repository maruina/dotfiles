# Confluence CLI Migration Implementation Plan

> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the deprecated `confluence-adf` Pi package and the Atlassian MCP backend, and register the `confluence-cli` Pi package (the `confluence` custom tool + `/skill:confluence-cli`) for the work profile only, per the CLI author's v1.2.0 announcement.
**Out of Scope:** ddoc skill and the fish `CONFLUENCE_EMAIL`/`CONFLUENCE_API_TOKEN` vars (they serve the separate ddoc CLI); `pr-review.md`'s "gh/Atlassian lookup" line (refers to Jira via native tools, still valid); `weekly-summary.md` and `SOURCES.md` atlassian.net URLs (human links, no MCP dependency); upstream `datadog-pi-packages` doc lag (its `confluence-cli` skill does not yet document `.cc`); opening a PR (push the branch; PR/merge is the owner's call).
**Architecture:** Not applicable — config, prompt, and guidance-line changes only; no behavior code. The `confluence-cli` Pi package is an upstream adapter that spawns the already-installed `/opt/dogbrew/bin/confluence` (v1.2.0) with `shell: false` from Pi's stable process ancestor (ADR 0001).
**Tech Stack:** chezmoi templates and `modify_` script, Go `text/template` profile gating, pi settings `.packages`, mcp-cli JSON config, fish conf.d scripts, pi agent `node --test` suites.

---

## Skills loaded and used
| Skill | Source | Why loaded | How used |
|---|---|---|---|
| `skill-loader` | prompt-required | `/plan` requires loading matching skills before recommendations | Checklist followed; identified `chezmoi` and `script-best-practices` |
| `chezmoi` | skill-loader | All changed files live under `~/.local/share/chezmoi` | Source-not-target rule, `exact_` semantics, diff → apply → commit → push, `.profile` gating pattern |
| `script-best-practices` | skill-loader | Changes touch shell/jq scripts (`modify_` template, `run_onchange_` script, fish conf.d) | Match existing style, minimal one-line edits, idempotent-rerun awareness |
| `slack-mcp` | agent-selected | User supplied a Slack thread URL as source-of-truth material | Read the v1.2.0 announcement thread read-only via `slack_read_thread` |

Advisory learning lookup: ran `Datadog/Learnings.md` through `learn-evidence.mjs learning-sections` with terms `confluence`, `pi package`, `dogbrew`, `pi extension`, `skill`; 0 of 10 sections matched, so no advisory guidance applies.

## Source of truth and confirmed decisions
- **v1.2.0 announcement** (Slack thread `C0AU45Z1FFC`, thread `1788857660.251069`, reply `1789130418.041289`, CLI author, 2026-09-11): `.cc` authoring needs no Python, virtualenvs, or the `confluence-adf` package; "If you previously installed `confluence-adf` in Pi, you can remove it".
- **dd-source roadmap** (`domains/alerting/apps/confluence/docs/roadmap.md`): "Move Confluence ADF authoring directly into the Go CLI … eliminating the Python runtime and Python packages entirely"; "Retire `packages/confluence-adf` completely". Annotation-splicing port is roadmap, not shipped in v1.2.0 (no comment commands; verified against the installed binary).
- **ADR 0001** (`packages/confluence-cli/docs/adr/0001-direct-spawn-pi-extension.md`): two separate Pi bash tool calls produced 2 1Password approval dialogs; two calls under one persistent parent produced 1. The extension also serializes sibling calls and enforces the file-oriented body contract. The CLI-on-PATH alone cannot be profile-gated; registering the package inside the work block is the work-profile guard.
- **Confirmed by user:** the package swap, and Option A (delete the atlassian MCP).
- **Accepted tradeoff (Option A):** agents lose inline-comment detection (`getConfluencePageInlineComments`) and footer-comment creation until the CLI ships annotation support. `deliberate:` revisit when updating comment-bearing pages becomes a real workflow need or when the CLI adds comment commands.

## Scope
1. Swap `confluence-adf` → `confluence-cli` in the work-profile `.packages` list.
2. Remove the atlassian MCP end to end: work skill, MCP server entry, orphan standalone config (source + rendered file), and stale comment/ guidance references; repoint `/self-evaluation` to the `confluence-cli` skill.
3. Verify: rendered config, pi reload behavior, agent test suites, and the work-profile guard.

## Implementation Contract
**Components Affected:**
| Component | Files | Responsibility | Verification |
|---|---|---|---|
| pi settings | `dot_pi/agent/modify_private_settings.json.tmpl` | Register `confluence-cli`, drop `confluence-adf`, work block only | `chezmoi diff` + `jq` on `~/.pi/agent/settings.json` |
| work skills | `dot_pi/agent/exact_skills_work/atlassian-mcp/` (delete) | Remove the MCP-driver skill | `exact_` semantics remove rendered dir on apply |
| mcp config | `dot_config/mcp/mcp_servers.json.tmpl`, `dot_config/mcp/atlassian_mcp_servers.json.tmpl` (delete) | Drop the `atlassian` server from work | `chezmoi execute-template` + `jq`; `rm` orphaned rendered file |
| prompts | `dot_pi/agent/exact_prompts/self-evaluation.md` | Read weekly notes via the `confluence-cli` skill instead of `atlassian-mcp` | `rg` sweep; prompt content |
| extensions | `dot_pi/agent/exact_extensions/user-context.ts` | Drop stale "Atlassian MCP" guidance | `npm test` in `dot_pi/agent` |
| scripts | `run_onchange_mcp-cli-install.sh.tmpl`, `dot_config/private_fish/conf.d/mcp.fish` | Keep comments accurate after removal | read-back |

**Key Decisions:**
- Register the package instead of relying on PATH-only pi usage: ADR 0001's measured approval-reuse, serialization, and file-oriented context safety; the upstream skill forbids bash for supported actions; the settings entry is the only profile-gating mechanism.
- Remove `confluence-adf` by editing the template, not `pi remove`: chezmoi owns `.packages` and would restore any manual change on next apply.
- `~/.config/mcp/atlassian_mcp_servers.json` is a non-exact target; deleting its template does not delete the rendered file, so remove it manually.
- Editing the `run_onchange_` comment changes its content hash and re-triggers the idempotent mcp-cli curl install on next apply; acceptable.

**Implementation Constraints:**
- Edit chezmoi source only, never targets in `$HOME` (chezmoi skill rule).
- Keep every confluence entry inside the `{{- if eq .profile "work" }}` block; the personal block's `.packages` stays `[pi-npm-guard, prompt-stash]`.
- Implement and apply from this worktree (`~/.worktrees/dotfiles-confluence-cli-migration`); the base checkout stays on `main`.
- Pi agent dev contract (`AGENTS.md`): run `npm ci --ignore-scripts` in `dot_pi/agent` before `/verify`; keep dependencies until `npm test` and `npm run test:all` complete, then remove them.

**Security Requirements:** No secrets are touched. Confluence credentials stay in 1Password (`Employee/confluence-cli`); the fish `CONFLUENCE_API_TOKEN` (ddoc) is untouched; no token enters any changed file. The extension's invariant — credentials exist only inside short-lived `op`/`confluence` processes — is upstream-enforced (ADR 0001).

**Observability Requirements:** None added; this is config work with no runtime events of its own. The CLI ships its own upstream adoption telemetry.

**Failure Modes to Handle:**
- `/reload` fails to load the extension (module resolution): install the missing module under `~/.pi/agent/node_modules`. Evidence: `typebox` and `@earendil-works/pi-ai` are already present, so this is a contingency, not an expectation.
- `confluence auth verify` fails: direct the user to `confluence auth setup --email matteo.ruina@datadoghq.com` and the 1Password app; not a config defect.
- `/self-evaluation` evidence gathering: the prompt's CQL (`space = "~6334a86ef568615bdc7ea4d3" AND type = blogpost`) works unchanged with `confluence page search cql`; blogpost reads via `page_get` markdown.

**Rollout and Rollback:** Single-machine config; rollout is `chezmoi apply` per task. Rollback is `git revert` of the two commits plus `chezmoi apply`, or applying from `main`. Owner: Matteo.

**Test Strategy:**
| Requirement | Interface | Seam |
|---|---|---|
| `.packages` swap | `chezmoi diff`/`apply` + `jq` on the rendered settings file | existing (modify script has no test harness; render+apply is the highest deterministic interface) |
| MCP config drops `atlassian` | `chezmoi execute-template` piped to `jq -e` | existing |
| user-context guidance line | `cd dot_pi/agent && npm test` | existing `user-context.test.mjs` (no assertion on the edited line; verified) |
| skill dir removal | `chezmoi diff` + `ls` of rendered dir | existing `exact_` semantics |
| no stale references | `rg` sweeps | new narrow greps only |
| pi integration | `/reload` + tool/skill visibility, optional live CLI calls | manual; automation impractical in a pi session |
| suites | `npm test` and `npm run test:all` in `dot_pi/agent` | existing |

### Acceptance criteria
### Requirement: Work profile registers confluence-cli, not confluence-adf
The system SHALL load only the `confluence-cli` package for the work profile.

#### Scenario: Applied settings
- GIVEN the work profile active and `chezmoi apply` completed
- WHEN `jq '.packages' ~/.pi/agent/settings.json` runs
- THEN the list contains `packages/confluence-cli` and does not contain `packages/confluence-adf`

### Requirement: Pi exposes the confluence custom tool and skill
The system SHALL expose the `confluence` custom tool and `/skill:confluence-cli` after reload.

#### Scenario: Reload
- GIVEN applied settings in an active pi session
- WHEN `/reload` runs
- THEN the `confluence` custom tool is available (starting with `auth_verify`) and `/skill:confluence-cli` is listed, while the `confluence-adf` and `atlassian-mcp` skills are gone

### Requirement: Work-profile guard
The system SHALL keep all confluence registration inside the work block.

#### Scenario: Template structure
- GIVEN `dot_pi/agent/modify_private_settings.json.tmpl` as edited
- WHEN the template's work and personal blocks are compared
- THEN the `confluence-cli` entry appears only inside the `{{- if eq .profile "work" }}` block and the personal `.packages` block has no confluence entries

### Requirement: Atlassian MCP removed
The system SHALL have no atlassian MCP server or skill on the work profile.

#### Scenario: Config and skill state
- GIVEN `chezmoi apply` completed
- WHEN the config and skill directories are inspected
- THEN `jq '.mcpServers | keys' ~/.config/mcp/mcp_servers.json` lists exactly `datadog-prod`, `datadog-staging`, `slack`; `~/.config/mcp/atlassian_mcp_servers.json` does not exist; `~/.pi/agent/skills_work/atlassian-mcp` does not exist

### Requirement: Dependents repointed with no stale references
The system SHALL route former atlassian-mcp consumers to the confluence CLI.

#### Scenario: Self-evaluation prompt
- GIVEN `/self-evaluation` with the atlassian MCP removed
- WHEN its Research section is read
- THEN it loads the `confluence-cli` skill, and its CQL still resolves weekly blogposts

#### Scenario: Reference sweep
- WHEN `rg -il 'atlassian-mcp' dot_pi/ dot_config/` runs from the repo root
- THEN it returns no matches

### Requirement: Agent test suites stay green
The system SHALL keep `dot_pi/agent` tests passing.

#### Scenario: Suites
- WHEN `cd dot_pi/agent && npm test` and `npm run test:all` run
- THEN both pass, including `user-context.test.mjs` after the guidance-line edit

### Task 1: Swap the package registration
**Delivers:** Work-profile `.packages` loads `confluence-cli` instead of `confluence-adf`, applied to the rendered settings file.
**Blocked by:** None
**Traces to:** v1.2.0 announcement ("remove `confluence-adf`"); work-profile guard instruction.
**Files:** `dot_pi/agent/modify_private_settings.json.tmpl`

- [ ] In the work block's `.packages`, replace `"../../go/src/github.com/DataDog/datadog-pi-packages/packages/confluence-adf",` with `"../../go/src/github.com/DataDog/datadog-pi-packages/packages/confluence-cli",`.
- [ ] Run `chezmoi diff ~/.pi/agent/settings.json`; expect a single `.packages` delta (ad-f line out, cli line in) and no changes to pi-owned runtime fields.
- [ ] Run `chezmoi apply ~/.pi/agent/settings.json`, then `jq '.packages' ~/.pi/agent/settings.json`; expect `confluence-cli` present, `confluence-adf` absent.
- [ ] Confirm the entry sits only inside the work `{{- if eq .profile "work" }}` block.
- [ ] Commit with `feat(pi): replace confluence-adf with the confluence-cli pi package`.

### Task 2: Remove the atlassian MCP and repoint dependents
**Delivers:** No atlassian MCP server, config file, skill, or stale reference remains; `/self-evaluation` uses the `confluence-cli` skill.
**Blocked by:** None (independent of Task 1)
**Traces to:** User-confirmed Option A; "delete the atlassian MCP".
**Files:** delete `dot_pi/agent/exact_skills_work/atlassian-mcp/` (SKILL.md, .keep); `dot_config/mcp/mcp_servers.json.tmpl`; delete `dot_config/mcp/atlassian_mcp_servers.json.tmpl`; `dot_pi/agent/exact_prompts/self-evaluation.md`; `dot_pi/agent/exact_extensions/user-context.ts`; `run_onchange_mcp-cli-install.sh.tmpl`; `dot_config/private_fish/conf.d/mcp.fish`

- [ ] Delete `dot_pi/agent/exact_skills_work/atlassian-mcp/` (git rm).
- [ ] In `dot_config/mcp/mcp_servers.json.tmpl`, remove the `atlassian` server object from the work branch; keep `datadog-prod`, `datadog-staging`, `slack`.
- [ ] Delete `dot_config/mcp/atlassian_mcp_servers.json.tmpl` (orphan; nothing references the rendered file).
- [ ] In `dot_pi/agent/exact_prompts/self-evaluation.md`, change `Load and follow the \`atlassian-mcp\` and \`write\` skills.` to `Load and follow the \`confluence-cli\` and \`write\` skills.`
- [ ] In `dot_pi/agent/exact_extensions/user-context.ts` (line ~149), change `- Prefer \`gh\` for GitHub operations and Datadog MCP/Atlassian MCP for internal Datadog data and docs.` to `- Prefer \`gh\` for GitHub operations and Datadog MCP for internal Datadog data and docs.`
- [ ] In `run_onchange_mcp-cli-install.sh.tmpl`, change `# (atlassian/slack/datadog on work, ha-mcp on personal).` to `# (slack/datadog on work, ha-mcp on personal).`
- [ ] In `dot_config/private_fish/conf.d/mcp.fish`, drop `(e.g. Atlassian)` from the `MCP_STRICT_ENV` comment so it reads `so unrelated servers still work even when Datadog keys are not loaded`.
- [ ] Validate the render: `chezmoi execute-template < dot_config/mcp/mcp_servers.json.tmpl | jq -e '.mcpServers | keys == ["datadog-prod","datadog-staging","slack"]'`; expect `true`.
- [ ] Run `chezmoi diff`; expect the skill-dir removal (via `exact_`), the config delta, and no unrelated changes. Run `chezmoi apply` for the touched targets; then `rm ~/.config/mcp/atlassian_mcp_servers.json` (non-exact target, chezmoi will not remove it).
- [ ] Verify: `ls ~/.pi/agent/skills_work/ | grep atlassian` finds nothing; `rg -il 'atlassian-mcp' dot_pi/ dot_config/` finds nothing.
- [ ] Run `cd dot_pi/agent && npm test`; expect green (user-context test has no assertion on the edited line).
- [ ] Commit with `feat(pi): remove atlassian MCP in favor of the confluence CLI`.

### Task 3: Integration verification
**Delivers:** Proof that pi loads the new backend and the old ones are gone, with suites green.
**Blocked by:** 1, 2
**Traces to:** All acceptance criteria.
**Files:** none (verification only)

- [ ] In `dot_pi/agent`: run `npm ci --ignore-scripts`, then `npm test` and `npm run test:all`; expect all green. Remove the installed dependencies afterward per the AGENTS.md contract.
- [ ] Run full `chezmoi diff`; expect only the intended deltas, then `chezmoi apply`.
- [ ] In a pi session, run `/reload`; expect the `confluence` custom tool and `/skill:confluence-cli` present, `confluence-adf` and `atlassian-mcp` skills absent.
- [ ] Optional live checks: `confluence auth verify` (may trigger a 1Password approval), then a read such as `confluence page search cql 'type = "page" AND creator = currentUser()' --limit 5`.
- [ ] Confirm the personal block of `modify_private_settings.json.tmpl` still lists only `pi-npm-guard` and `prompt-stash`.

### Task 4: Documentation, push, and cleanup
**Delivers:** Branch pushed with docs impact recorded.
**Blocked by:** 3
**Traces to:** Documentation-impact requirement for Medium plans.
**Files:** none beyond this plan (record rationale here)

- [ ] Record: `dot_pi/agent/AGENTS.md` needs no change — its "Pi MCP and Home Assistant" section stays accurate (MCP servers templated from `dot_config/mcp/`, profile-gated) and names no specific server; the repo-root `AGENTS.md` has no atlassian references. Prompts and skills carry their own routing descriptions.
- [ ] Push with `git push -u origin maruina/confluence-cli-migration`.
- [ ] Ask the owner whether to open a PR per the repo's `maruina/*` pattern or merge directly.

## Validation
Covered by the acceptance criteria and per-task commands: rendered-config `jq` checks, `chezmoi diff`/`apply` deltas, `rg` reference sweeps, `dot_pi/agent` suites, and a pi `/reload` integration check. The narrow command expected to fail before implementation: `jq -e '.packages | index("../../go/src/github.com/DataDog/datadog-pi-packages/packages/confluence-cli")' ~/.pi/agent/settings.json` (returns `null` today).
