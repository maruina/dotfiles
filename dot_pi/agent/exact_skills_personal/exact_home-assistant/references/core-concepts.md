# Home Assistant MCP Core Concepts
Use `ha-mcp` through the `home-assistant-mcp` skill for live Home Assistant access. Do not make direct REST calls from this skill.

## Discovery first
Discover available tools and schemas before choosing a call:

- Use `tool_search` to find a tool by intent, or codemode `describeNamespace("mcp__ha-mcp")` to list tool names.
- Call a tool by its native name: `mcp__ha-mcp__<tool>`.

Tool names and argument schemas can change upstream. Treat discovery output as the source of truth.

## Common read-only tasks
Prefer read-only tools for first-pass investigation:

- list entities, devices, areas, labels, and integrations;
- inspect current states, attributes, services, and schemas;
- read history, logbook, or configuration status;
- draft YAML or service calls without applying them.

Keep summaries privacy-aware. Entity names, states, presence, cameras, locks, alarms, and device inventory are household-private.

## Mutations
Route all mutations through the confirmation protocol in `safety-and-routing.md`. After confirmation, call exactly the discovered `ha-mcp` tool and arguments that match the approved action.

After every mutation, read back state or configuration to verify the result. If verification fails, stop and offer the recorded rollback path.

## MCP unavailable
If `ha-mcp` discovery or calls fail, stop and report the blocker. Do not fall back to direct REST calls or shell scripts.

## Secret URL handling
Never print, log, persist, or include the ha-mcp connect URL in prompts, files, command output, examples, or summaries. Never include bearer headers, tokens, private URLs, or secret material in source files, docs, prompts, command output, examples, or summaries.
