---
name: datadog-mcp
description: Uses the Datadog Pi Plugin to query Datadog metrics, logs, traces, monitors, dashboards, services, incidents, and notebooks. Use for Datadog investigations, especially those involving clusters, datacenters, services, or Kubernetes.
---
# Datadog Plugin
Use the Datadog Pi Plugin to query Datadog from Pi.
## Connections
- The plugin package is declared in both profile settings. Use `/datadog` to sign in and save organizations.
- The work connections are production org 2 (`app.datadoghq.com`) and `ddstaging` org 197728 (`ddstaging.datadoghq.com`). Both use the US1 site. Do not configure the separate staging service that uses a custom MCP host.
- Before querying, use `ddconfig` with `action: "check"` to verify the selected organization's identity and connection. Use `ddconfig` with `action: "switch"` to select another saved organization.
- When a request clearly names a different saved organization, switch to it before querying. If the requested organization is not saved, ask the user to connect it through `/datadog`. Do not silently query the current default.
- The agent can switch only among saved connections. Sign-in and adding organizations are user-controlled through `/datadog`.
- Results from different organizations can remain in the same conversation context. Use separate Pi sessions when those results must stay isolated.
- Plugin connections are stored under `~/.pi/agent/datadog/` and are shared across profiles for the same OS user. Configure personal credentials only on the personal machine.
## Routing
Choose the organization from the cluster or datacenter name:
- Use `ddstaging` for names with staging indicators, especially `*.staging.dog`, `*.ddbuild.staging.dog`, and `stormeagle.us1.staging.dog`.
- Use production for production names, especially `*.prod.dog`, `*.ddbuild.io`, and `app.datadoghq.com` links.
- If the environment is unclear, ask before querying.
## Tool use
- Use the `datadog` tool for read-only queries. Use `tool_search` to discover available operations when needed.
- Use `ddtoolsets` to manage toolsets for the selected organization. Use `/datadog toolsets` to configure them interactively.
- Prefer read-only tools. Do not create or edit notebooks or dashboards unless the user explicitly asks.
- Start with a narrow time window, usually `now-15m` to `now`, or use the incident window provided by the user.
- Include `max_tokens` on search or aggregate calls when the operation supports it.
- Include telemetry `{"dd_mcp_source":"pi"}` when the operation supports it.
