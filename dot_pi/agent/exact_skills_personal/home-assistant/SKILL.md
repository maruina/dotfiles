---
name: home-assistant
description: Personal Home Assistant safety/router skill. Routes between ha-mcp, curated docs, and REST fallback; read-only by default; requires confirmation for mutations.
---
# Home Assistant
Use this skill for personal smart-home work. Treat entity names, states, presence, cameras, locks, alarms, and device inventory as household-private.

## Routing
1. Prefer the `home-assistant-mcp` skill for live inventory, state inspection, service/schema discovery, and confirmed control through `ha-mcp`.
2. Use `references/core-concepts.md` for REST basics and `references/safety-and-routing.md` for detailed safety guidance.
3. Use `scripts/*.sh` only as a REST fallback or debugging path when MCP is unavailable or the user explicitly asks for REST.

For live MCP work, load `home-assistant-mcp`, run `mcp-cli info ha-mcp`, and discover tool names before calling anything.

## Safety tiers
- **Tier 0 — read-only, no confirmation:** list or inspect state, inventory, history, logbook, config, schemas, or draft changes without applying them.
- **Tier 1 — normal mutation, explicit confirmation required:** light, switch, climate, helper, automation, script, scene, dashboard, area, label, group, and YAML/config changes. Before acting, state the target, exact action, expected effect, rollback path, and verification step, then get explicit user confirmation.
- **Tier 2 — sensitive or broad mutation, second explicit confirmation required:** locks, alarms, cameras, presence, device trackers, restart/reload, disabling integrations or add-ons, deletions, and bulk operations. Prefer dry-run or diff first.

## Confirmation protocol
Before any Tier 1 or Tier 2 change, present this checklist and wait for the required confirmation:

- Target:
- Exact action:
- Expected effect:
- Rollback path:
- Verification step:

Do not mutate until the user confirms. For Tier 2, ask for a second explicit confirmation after restating the risk.

## Verification and rollback
After every change, read back state or configuration to verify the result. For YAML/config edits, show a diff or summary, validate config before reload or restart, apply one change at a time, and record the rollback path before applying. If verification fails, stop, report the state, and offer the recorded rollback.

Use pi transcript/history, `ha-mcp` startup output or errors, Home Assistant logbook/history, config validation results, and a read-only inventory after setup as the operational checks for troubleshooting.

## Documentation updates
When you discover durable setup facts or reusable patterns, ask before writing docs. Do not auto-write docs during incidental exploration.

## Token handling
Never print or persist `HOME_ASSISTANT_TOKEN`. Never include tokens, bearer headers, private URLs, or secrets in source files, examples, prompts, summaries, or command output.
