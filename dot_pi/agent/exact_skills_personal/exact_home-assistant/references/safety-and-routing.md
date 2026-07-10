# Home Assistant Safety and Routing
This reference expands the safety policy from the `home-assistant` skill. The local policy is authoritative even when upstream Home Assistant skills or `ha-mcp` guidance differs.

## Routing decision
| Need | Route |
|---|---|
| Live inventory, current state, service/schema discovery, history, logbook, or confirmed control | Load `home-assistant-mcp`, run `mcp-cli info ha-mcp`, discover tools, then call only the selected tool. |
| Durable best practices or local policy | Use this reference and `core-concepts.md`. |
| MCP unavailable | Stop and report the blocker. Do not fall back to direct REST calls. |

Do not invent `ha-mcp` tool names. Run `mcp-cli info ha-mcp` and `mcp-cli info ha-mcp <tool>` to discover the current tool list and schemas.

## Safety tiers
| Tier | Confirmation | Examples | Requirements |
|---|---|---|---|
| Tier 0 read-only | No confirmation | List/inspect entities, devices, areas, labels, states, history, logbook, services, schemas, config; draft YAML or automations without applying | Keep output minimal and privacy-aware. Do not expose tokens or private URLs. |
| Tier 1 normal mutation | One explicit confirmation | Light/switch/climate changes; create/update helpers, automations, scripts, scenes, dashboards, areas, labels, groups; YAML/config edits | State target, exact action, expected effect, rollback path, and verification step before acting. Verify by read-back after acting. |
| Tier 2 sensitive or broad mutation | Second explicit confirmation | Locks, alarms, cameras, presence, device trackers, restart/reload, disabling integrations/add-ons, deletions, bulk operations | Prefer dry-run/diff first. Restate risk before the second confirmation. Apply one change at a time when possible. |

## Confirmation checklist
Before any Tier 1 or Tier 2 mutation, present:

- Target:
- Exact action:
- Expected effect:
- Rollback path:
- Verification step:

Wait for user confirmation. For Tier 2, after the first confirmation, restate the risk and wait for a second explicit confirmation.

## Verification and rollback protocol
1. Record the rollback path before applying a change.
2. For config/YAML changes, show a diff or concise summary and validate configuration before reload or restart.
3. Apply one change at a time unless the user explicitly approves a batch.
4. Read back state or config immediately after applying.
5. If verification fails, stop and report the observed state. Offer the recorded rollback instead of continuing with new changes.

Operational checks include pi transcript/history, `ha-mcp` startup output or errors, Home Assistant logbook/history, config validation before reload/restart, and a read-only inventory after setup.

## Privacy and token handling
Home Assistant entity names, states, presence, camera, lock, alarm, and device inventory are household-private. Summarize only what is needed for the task.

Never print or persist `HOME_ASSISTANT_TOKEN`. Never include bearer headers, tokens, private URLs, or secret material in source files, docs, prompts, command examples, or summaries.
