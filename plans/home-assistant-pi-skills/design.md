# Home Assistant pi skills design

## Status
Approved on 2026-06-15.

## Goals
- Make pi on Matteo's personal laptop useful for Home Assistant setup and troubleshooting with cheap/non-frontier models.
- Keep Home Assistant capabilities personal-profile-only in chezmoi.
- Replace runtime dependency on the upstream `homeassistant-ai/skills` checkout with curated, chezmoi-managed local skills.
- Add a personal-profile-only `ha-mcp` integration for structured live Home Assistant access.
- Preserve safety for physical-world and household-private operations by making read-only inspection the default and requiring explicit confirmation for mutations.
- Add a prompt-template workflow to periodically review upstream `homeassistant-ai/skills` and `homeassistant-ai/ha-mcp` and curate relevant updates into local skills/docs.

## Non-goals
- Do not implement broad autonomous Home Assistant management.
- Do not mirror upstream Home Assistant skills verbatim.
- Do not make Home Assistant capabilities available in the work profile.
- Do not commit Home Assistant tokens, URLs that should remain private, or other secrets.
- Do not optimize for large Home Assistant installations in the first iteration.
- Do not add metrics, alerting, or a service-level operational footprint for a small personal setup.

## Context reviewed
- `AGENTS.md`: chezmoi source repo rules, personal/work profile templates, and secret handling expectations.
- `dot_pi/agent/AGENTS.md`: simplicity, surgical changes, explicit assumptions, and design-before-code posture.
- `dot_pi/agent/modify_private_settings.json.tmpl`: personal profile currently loads Obsidian skills, upstream Home Assistant skills from `/Users/ruio/src/github.com/homeassistant-ai/skills/skills/`, and local personal skills from `dot_pi/agent/exact_skills_personal`.
- `dot_pi/agent/exact_skills_personal/home-assistant-api/SKILL.md`: local REST API orchestration skill; currently large, duplicates generic REST guidance, lacks `ha-mcp` routing, and references missing resource files.
- `dot_pi/agent/exact_skills_personal/home-assistant-api/references/core-concepts.md`: existing REST authentication and endpoint basics.
- `dot_pi/agent/exact_skills_personal/home-assistant-api/scripts/*.sh`: REST helper scripts for state queries, service calls, entity listing, templates, and Fish-env wrapping.
- Upstream `https://github.com/homeassistant-ai/skills`: source for Home Assistant best-practice guidance such as automation patterns, helper selection, native constructs over templates, dashboard guidance, YAML-only integration guidance, and safe refactoring.
- Upstream `https://github.com/homeassistant-ai/ha-mcp`: source for a broad Home Assistant MCP server with read, control, and management capabilities.

### Unavailable or skipped sources
- The actual Home Assistant instance was not inspected. The user sized it as small: under 100 entities, a few automations, and no locks/alarms/cameras controlled by Home Assistant.
- Exact `ha-mcp` installation and configuration syntax was not locked in during design. The implementation plan must inspect current upstream docs before editing settings.
- No local upstream clone contents were deeply audited. The design treats upstream repos as reference sources and requires the sync prompt to record upstream URL, commit/date, and source method when used.

## Current behavior
The personal pi settings load upstream Home Assistant skills directly from an unmanaged local checkout. This makes runtime behavior dependent on a path outside chezmoi and allows upstream guidance to drift independently from this dotfiles repo.

The local `home-assistant-api` skill provides REST API instructions and helper-script examples, but it references several missing files: `state-management.md`, `service-reference.md`, `entity-types.md`, `templates.md`, `system-config.md`, and `examples.md`. That makes it brittle for cheap models because the skill routes the model to context that is not present.

The local skill also does not distinguish read-only discovery, normal mutations, and sensitive/broad mutations. It does not describe `ha-mcp`, confirmation requirements, or when durable Home Assistant knowledge should be recorded for future iterations.

## Assumption ledger
| Assumption | Evidence | Impact if wrong | Validation path |
|---|---|---|---|
| Home Assistant support must remain personal-only | User requirement and existing `.profile == "personal"` gating | Work profile could gain private/home-control capabilities | Verify rendered settings for work and personal profiles |
| Setup scale is small | User chose small scale | Overly simple safety/operability could be insufficient | Run read-only inventory after implementation; revisit if entity count or sensitive domains grow |
| Cheap/non-frontier models need concise procedural guardrails more than large references | User goal and current skill has missing references | Model may make unsafe or confused tool choices | Test cheap model against read-only and confirmed-mutation tasks |
| `ha-mcp` is acceptable as a personal dependency | User chose to include it | Design would overreach if dependency is unwanted | Plan must choose exact install/config path and keep rollback simple |
| YAML/config edits should be allowed only after confirmation | User chose confirmed config edits | Too strict if frequent edits are desired; too loose if sensitive config appears | Encode in skill policy; revisit after first few uses |
| Upstream Home Assistant skills should not be loaded at runtime | User approved removing upstream runtime dependency | Local skills may miss useful upstream guidance | Add sync prompt to periodically curate upstream changes |

## Design overview
Build a self-contained personal Home Assistant pi capability:

1. Remove direct runtime loading of `/Users/ruio/src/github.com/homeassistant-ai/skills/skills/` from personal pi settings after local replacement guidance exists.
2. Keep Home Assistant guidance in chezmoi-managed local personal skills under `dot_pi/agent/exact_skills_personal`.
3. Add personal-profile-only `ha-mcp` configuration for structured live Home Assistant access.
4. Reframe the local Home Assistant skill as the authoritative safety/router layer: start read-only, choose between `ha-mcp`, curated docs, and REST fallback, require confirmation for mutations, and verify after changes.
5. Add a `sync-home-assistant-skills` prompt template that reviews upstream repositories and curates relevant changes into local skills/docs instead of mirroring upstream wholesale.

## Components, boundaries, and interfaces

### Chezmoi personal settings
`dot_pi/agent/modify_private_settings.json.tmpl` remains the boundary between personal and work profiles.

Personal profile should include:
- local personal Home Assistant skills from `{{ .chezmoi.sourceDir }}/dot_pi/agent/exact_skills_personal`;
- the `ha-mcp` MCP server configuration, using environment variables or 1Password-backed template values;
- no direct runtime dependency on `/Users/ruio/src/github.com/homeassistant-ai/skills/skills/` once local replacement skills exist.

Work profile should not include Home Assistant skills, MCP servers, token configuration, or paths.

### Local Home Assistant skills
The local skills should be concise and deterministic. The preferred shape is one top-level Home Assistant skill with optional local reference files, rather than many overlapping skills.

The top-level skill should cover:
- task routing: upstream-derived best practices, live state via `ha-mcp`, REST scripts as fallback;
- safety tiers;
- confirmation protocol;
- verification and rollback protocol;
- documentation-update guidance for durable facts and reusable patterns.

The current `home-assistant-api` content should be either renamed/reframed or reduced so it no longer points to missing references. REST helper scripts remain useful as fallback/debug tools, not the primary interface.

### `ha-mcp`
`ha-mcp` is the structured tool interface to Home Assistant. It should be configured only for the personal profile.

The implementation plan must inspect the current `ha-mcp` documentation and select the simplest reproducible install path. Prefer an install mode that is inspectable and rollback-friendly. Avoid committed secrets and avoid opaque automatic upgrades where practical.

`ha-mcp` should support:
- read-only inventory and state inspection;
- confirmed service calls;
- confirmed creation/update of automations, scripts, scenes, helpers, dashboards, and YAML/config files when required.

### Sync prompt template
Add `dot_pi/agent/exact_prompts/sync-home-assistant-skills.md`.

The prompt should instruct an agent to:
- inspect upstream `homeassistant-ai/skills` and `homeassistant-ai/ha-mcp`;
- compare upstream guidance/tooling with local `dot_pi/agent/exact_skills_personal/home-assistant*` content;
- highlight useful changes, stale local guidance, duplicated content, changed safety assumptions, and renamed/deprecated MCP tools;
- preserve local safety policy as authoritative;
- avoid wholesale mirroring;
- ask before editing unless the user explicitly asks it to apply changes;
- record upstream URL, commit/date, source method, and summary of curated updates.

## Safety policy

### Tier 0: read-only, no confirmation needed
Allowed by default:
- list entities, devices, areas, services, helpers, automations, scripts, scenes, and dashboards;
- inspect states and attributes;
- read relevant config snippets when available;
- generate recommendations or draft changes without applying them.

### Tier 1: normal mutation, explicit confirmation required
Allowed only after the model states the target, exact action, expected effect, rollback path, and verification step, then receives user confirmation:
- light/switch/climate changes;
- creating or updating helpers, automations, scripts, scenes, dashboards, areas, labels, or groups;
- YAML/config file edits.

### Tier 2: sensitive or broad mutation, stronger confirmation required
Requires a second explicit confirmation and should prefer dry-run/diff-style review when possible:
- locks, alarms, cameras, privacy-affecting entities, presence, and device trackers;
- Home Assistant restart/reload;
- disabling integrations or add-ons;
- deleting automations, scripts, scenes, helpers, dashboards, backups, or config;
- bulk operations across many entities.

Tier 2 is unlikely in the current small setup, but the policy should exist so the skill remains safe if the setup grows.

## Documentation-update behavior
When the model discovers durable setup-specific facts or creates reusable patterns, it should ask whether to update relevant docs. Examples include:
- entity naming conventions;
- area/device inventory summaries;
- known-safe service-call examples;
- recurring troubleshooting steps;
- automation design patterns;
- dashboard conventions;
- rollback instructions for changes it made.

The model should not automatically write docs during incidental exploration unless the user asks or confirms. The goal is to reduce repeated rediscovery for future cheap-model sessions without creating noisy or stale documentation.

## Alternatives considered

### Keep upstream Home Assistant skills loaded at runtime
This preserves upstream guidance with no local curation work, but it is not reproducible from chezmoi alone, depends on an unmanaged local checkout, can drift unexpectedly, and may duplicate or conflict with local safety policy. Rejected for steady state.

### Skills/docs only, no `ha-mcp`
This is safer and simpler, but cheap models would still need to compose REST calls, parse responses, and infer Home Assistant tool shape from prose. It does not meet the goal as well as a structured MCP interface. Rejected.

### Enable all `ha-mcp` capabilities freely
This is powerful but unsafe for cheap models. Home Assistant controls physical devices and household-private data. Unconfirmed writes, broad deletes, or config edits are not acceptable. Rejected.

### Mirror upstream skills locally verbatim
This makes the setup reproducible but imports upstream sprawl, duplicates content, and increases prompt load. The local skills should curate upstream guidance for Matteo's workflow. Rejected.

## Pre-mortem risks and mitigations
| Risk | Mitigation |
|---|---|
| Cheap model changes the wrong device or config | Read-only default, explicit confirmation for every mutation, target/action/effect/rollback/verify checklist |
| Model weakens safety during upstream sync | Sync prompt states local safety policy is authoritative and rejects wholesale mirroring |
| Token leaks into repo or transcripts | Use 1Password/env vars; never write token values to files, examples, or prompts |
| Work profile gets Home Assistant access | Keep all settings behind personal profile gating; verify rendered work settings |
| Upstream `ha-mcp` changes tool names or behavior | Sync prompt records upstream version/date and flags renamed/deprecated tools |
| Local skills become stale | Add sync prompt and documentation-update guidance |
| YAML/config edit breaks Home Assistant | Require diff/summary, confirmation, config validation when available, one change at a time, rollback path before apply |
| Helper scripts remain brittle | Treat scripts as fallback; plan can improve them later only if needed and verified |

## Operability
This is a small personal setup, so the design does not require service dashboards or alerts.

Operational checks should use:
- pi transcript/history for what the agent attempted;
- `ha-mcp` startup output and errors;
- Home Assistant logbook/history for device actions;
- Home Assistant config validation before reload/restart when config was edited;
- read-only inventory after setup to confirm entity count and sensitive domains.

The agent should stop on unexpected state, failed validation, missing entity, ambiguous target, or tool errors that could have partially applied a change.

## Rollout
1. Implement local curated Home Assistant skill updates.
2. Add the sync prompt template.
3. Remove the upstream Home Assistant skills path from personal runtime settings after local guidance exists.
4. Add personal-only `ha-mcp` configuration using the selected install method and secret handling.
5. Run chezmoi diff/render checks.
6. Apply only the relevant personal targets after review.
7. Smoke test read-only Home Assistant access.
8. Optionally test one low-risk confirmed mutation only after explicit user approval.

## Rollback
- Disable or remove the personal `ha-mcp` settings entry and re-apply chezmoi.
- Revert the Home Assistant skill changes if they confuse model behavior.
- Re-add the upstream skill path temporarily only if local guidance is insufficient and the user accepts the drift tradeoff.
- Revoke and recreate the Home Assistant token if there is any evidence of exposure.
- Undo Home Assistant config edits using the recorded rollback path or Home Assistant backups.

## Security and data handling
- Home Assistant tokens are secrets and must never be committed.
- Prefer 1Password-backed chezmoi templates or environment variables for URL/token configuration.
- Treat entity names, states, presence, and device inventory as household-private data.
- Do not include secrets in prompt templates, example commands, shell history, or docs.
- Avoid enabling broad/destructive `ha-mcp` capabilities without explicit reason and safety text.
- For YAML/config writes, require confirmation and validation before reload/restart.

## Testing strategy
- Verify `chezmoi diff` for changed targets.
- Verify rendered work profile does not contain Home Assistant skill paths, MCP server config, URL, or token references.
- Verify rendered personal profile contains local Home Assistant skills and `ha-mcp` config.
- Verify no committed files contain Home Assistant tokens.
- Verify pi discovers local Home Assistant skills.
- Verify `ha-mcp` starts successfully.
- Verify read-only entity/state query works.
- Inspect skill text to confirm read-only default and confirmation requirements are present.
- Optional: perform one explicitly approved low-risk mutation and verify rollback.

## Decision records
- Decision: remove direct upstream Home Assistant skills from runtime personal settings after local curated guidance exists. Rationale: reproducibility and cheap-model determinism are more important than automatic upstream loading.
- Decision: use `ha-mcp` for live Home Assistant access. Rationale: structured tools reduce cheap-model reasoning burden compared with REST-only workflows.
- Decision: allow YAML/config edits only after explicit confirmation. Rationale: Home Assistant setup work benefits from config edits, but silent mutations are unsafe.
- Decision: add an upstream sync prompt template. Rationale: upstream guidance remains useful as an editorial source, but local skills should curate rather than mirror it.
- Decision: keep first iteration sized for a small personal setup. Rationale: user reported under 100 entities, few automations, and no locks/alarms/cameras controlled by Home Assistant.
