---
name: home-assistant-mcp
description: Drive the personal ha-mcp server through mcp-cli. Use only after loading the home-assistant router skill, or when that skill routes a Home Assistant task to live MCP access.
---
# Home Assistant MCP
This skill documents the `mcp-cli` mechanics for the personal `ha-mcp` server. For every Home Assistant task, load the `home-assistant` router skill first. The router owns safety tiers, confirmation, verification, rollback, and whether live MCP access is appropriate.

## Configuration
- Server name: `ha-mcp`
- Config file: `~/.config/mcp/mcp_servers.json`
- Transport: `type: remote` with `url: ${HA_MCP_URL}`. The server runs in-process inside Home Assistant as the `ha_mcp_tools` HACS component (`homeassistant-ai/ha-mcp-integration`), not as a local process.
- Credential: the connect URL is the only credential. It comes from 1Password (`op://Private/Home Assistant/mcp_url`) through the fish `HA_MCP_URL` export, rendered by chezmoi.

Never print, log, persist, or include the connect URL in prompts, files, command output, examples, or summaries. `mcp-cli info ha-mcp` prints the URL, so redirect that output.

## Discovery
Run discovery before choosing tools. Do not assume exact tool names; upstream ha-mcp exposes many tools and may rename them.

```bash
mcp-cli info ha-mcp
mcp-cli info ha-mcp <tool>
```

Use the discovery output to identify read-only tools for inventory, areas, devices, entities, state, history, logbook, config checks, or service/schema inspection.

## Read-only calls
Prefer Tier 0 read-only calls unless the `home-assistant` router skill has routed to a confirmed mutation. For simple JSON arguments:

```bash
mcp-cli call ha-mcp <discovered-read-tool> '{"example":"value"}'
```

For complex JSON, use stdin or a heredoc so the command remains readable and shell-safe:

```bash
mcp-cli call ha-mcp <discovered-read-tool> <<'JSON'
{
  "example": "value"
}
JSON
```

Summarize household-private data carefully. Entity names, states, presence, camera, lock, alarm, and device inventory are private.

## Mutations
Do not call mutating ha-mcp tools directly from this skill. Defer all mutation safety to the `home-assistant` router skill and its tiers.

Before any mutation, the router must have produced the confirmation checklist and received the required explicit confirmation. Then use the tool schema from `mcp-cli info ha-mcp <tool>`, call exactly the confirmed action, read back the result, and report the verification and rollback status.

## Best-practices acknowledgment key
ha-mcp's strict best-practices gate rejects its write tools unless the call carries a `BestPracticeKey`. The gated tools are `ha_config_set_automation`, `ha_config_set_script`, `ha_config_set_scene`, `ha_config_set_helper`, `ha_config_set_dashboard`, and `ha_config_set_yaml`.

1. Read the guide and its `Acknowledgment key:` line:
   ```bash
   mcp-cli call ha-mcp ha_get_skill_guide '{"skill":"home-assistant-best-practices","file":"SKILL.md"}'
   ```
2. Pass the value on the write call as `BestPracticeKey`.

The key rotates hourly, and the server honors the previous hour as a grace window. The in-process server is long-lived, so the key stays the same across one-shot `mcp-cli` calls within the hour. A rejected write returns `BPS_ACKNOWLEDGMENT_REQUIRED`; read the guide again and retry. Each write tool takes its object under a `config` parameter.
