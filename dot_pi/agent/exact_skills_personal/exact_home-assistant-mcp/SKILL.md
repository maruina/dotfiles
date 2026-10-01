---
name: home-assistant-mcp
description: Drive the personal ha-mcp server through native pi MCP tools. Use only after loading the home-assistant router skill, or when that skill routes a Home Assistant task to live MCP access.
---
# Home Assistant MCP
This skill documents the native pi MCP mechanics for the personal `ha-mcp` server. For every Home Assistant task, load the `home-assistant` router skill first. The router owns safety tiers, confirmation, verification, rollback, and whether live MCP access is appropriate.

## Configuration
- Server name: `ha-mcp`
- Config file: `~/.pi/agent/mcp.json`
- Transport: remote HTTP. The server runs in-process inside Home Assistant as the `ha_mcp_tools` HACS component (`homeassistant-ai/ha-mcp-integration`), not as a local process.
- Credential: the connect URL is the only credential. The registration script resolves it from 1Password (`op://Private/Home Assistant/mcp_url`) at apply time, so it is stored only in `~/.pi/agent/mcp.json` (mode 0600) and is not available as an environment variable.

Never print, log, persist, or include the connect URL in prompts, files, command output, examples, or summaries. `pi mcp list` prints server URLs, so redirect that output.

## Discovery
Run discovery before choosing tools. Do not assume exact tool names; upstream ha-mcp exposes many tools and may rename them.

- Use `tool_search` to find a tool by intent.
- Or list the server's tools with codemode `describeNamespace("mcp__ha-mcp")`.
- Read the tool schema from the discovery output before calling the tool.

Use the discovery output to identify read-only tools for inventory, areas, devices, entities, state, history, logbook, config checks, or service/schema inspection.

## Read-only calls
Prefer Tier 0 read-only calls unless the `home-assistant` router skill has routed to a confirmed mutation. Call a tool by its native name with JSON arguments:

```text
mcp__ha-mcp__<discovered-read-tool>
{ "example": "value" }
```

Summarize household-private data carefully. Entity names, states, presence, camera, lock, alarm, and device inventory are private.

## Mutations
Do not call mutating ha-mcp tools directly from this skill. Defer all mutation safety to the `home-assistant` router skill and its tiers.

Before any mutation, the router must have produced the confirmation checklist and received the required explicit confirmation. Then use the tool schema from discovery, call exactly the confirmed action, read back the result, and report the verification and rollback status.

## Best-practices acknowledgment key
ha-mcp's strict best-practices gate rejects its write tools unless the call carries a `BestPracticeKey`. The gated tools are `ha_config_set_automation`, `ha_config_set_script`, `ha_config_set_scene`, `ha_config_set_helper`, `ha_config_set_dashboard`, and `ha_config_set_yaml`.

1. Read the guide and its `Acknowledgment key:` line:
   ```text
   mcp__ha-mcp__ha_get_skill_guide
   { "skill": "home-assistant-best-practices", "file": "SKILL.md" }
   ```
2. Pass the value on the write call as `BestPracticeKey`.

The key rotates hourly, and the server honors the previous hour as a grace window. The server is long-lived, so the key stays the same across calls within the hour. A rejected write returns `BPS_ACKNOWLEDGMENT_REQUIRED`; read the guide again and retry. Each write tool takes its object under a `config` parameter.