---
description: Review upstream ha-mcp for tool drift and safety changes, then propose curated local updates.
---
# Sync Home Assistant MCP
Review upstream `homeassistant-ai/ha-mcp` and recommend curated updates for the local Home Assistant skills. Do not edit files unless the user explicitly tells you to apply changes.

Home Assistant authoring guidance is vendored separately: `home-assistant-best-practices` is refreshed by `/sync-vendored-skills`. Do not review or copy upstream `homeassistant-ai/skills` here.

## Sources to inspect
- Upstream `homeassistant-ai/ha-mcp`: releases, README, changelog, and tool docs.
- Local `dot_pi/agent/exact_skills_personal/exact_home-assistant-mcp/SKILL.md`.
- Local `dot_pi/agent/exact_skills_personal/exact_home-assistant/references/`.

Record the upstream version or tag, the date, and a short summary of what changed. Note the currently running version from `mcp-cli info ha-mcp` when it is available.

## Compare and report
Highlight:
- renamed, deprecated, added, or removed `ha-mcp` tools;
- changed safety assumptions or new capabilities that affect the safety tiers;
- changed transport or install guidance (stdio, HTTP, custom component, app);
- stale or wrong local `mcp-cli` examples.

The local Home Assistant safety policy is authoritative: read-only by default, safety tiers, confirmation protocol, verification, rollback, and token/privacy rules must not be weakened.

## Privacy and secrets
Never include the Home Assistant token, bearer headers, private Home Assistant URLs, entity/state dumps, presence details, or other household-private data in output or files.

## Before editing
Ask before editing unless the user explicitly requested applying updates. If editing is approved, summarize the curated changes, preserve the local safety policy, and update only the relevant local skill or prompt files.
