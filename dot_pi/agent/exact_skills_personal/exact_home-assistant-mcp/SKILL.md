---
name: home-assistant-mcp
description: Drive the personal ha-mcp server through mcp-cli. Use only after loading the home-assistant router skill, or when that skill routes a Home Assistant task to live MCP access.
---
# Home Assistant MCP
This skill documents the `mcp-cli` mechanics for the personal `ha-mcp` server. For every Home Assistant task, load the `home-assistant` router skill first. The router owns safety tiers, confirmation, verification, rollback, and whether live MCP access is appropriate.

## Configuration
- Server name: `ha-mcp`
- Config file: `~/.config/mcp/mcp_servers.json`
- Runtime: `uvx ha-mcp@latest`
- Environment: the MCP config maps `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` to ha-mcp's expected environment names.

Never print, log, persist, or include `HOME_ASSISTANT_TOKEN` in prompts, files, command output, examples, or summaries.

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
