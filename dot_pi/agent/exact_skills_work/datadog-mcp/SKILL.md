---
name: datadog-mcp
description: Uses native pi MCP servers for Datadog to query Datadog metrics, logs, traces, monitors, dashboards, services, incidents, and notebooks. Use when the user asks to inspect Datadog data, especially for cluster, datacenter, service, or Kubernetes investigations.
---
# Datadog MCP
Use the native pi MCP servers `datadog-prod` and `datadog-staging` to access Datadog.

Config:
- `datadog-prod` and `datadog-staging` are registered by the work-only `exact_extensions/datadog-mcp-auth/` extension, not in `~/.pi/agent/mcp.json`.
- The extension fetches keys in the background after pi starts. The servers appear in `/mcp` when authentication and connection complete; use it to check their status. No per-call `dd-auth` wrapper is needed.
- MCP URL: `https://mcp.datadoghq.com/api/unstable/mcp-server/mcp`
- Prod server: `datadog-prod`
- Staging server: `datadog-staging`

Auth and routing:
- Prod org 2: keys from `dd-auth --domain app.datadoghq.com`.
- Staging org 197728 ddstaging: keys from `dd-auth --domain ddstaging.datadoghq.com`.
- The MCP URL is the same for prod and staging; the extension fetches credentials for each Datadog domain.

Choose prod vs staging from the cluster/datacenter name:
- Use staging for cluster/datacenter names containing staging indicators, especially:
  - `*.staging.dog`
  - `*.ddbuild.staging.dog`
  - `stormeagle.us1.staging.dog`
- Use prod for production cluster/datacenter names, especially:
  - `*.prod.dog`
  - `*.ddbuild.io`
  - `app.datadoghq.com` links
- If the environment is ambiguous, ask before querying.

Discovery:
- Use `tool_search` to find a tool by intent, for example "Datadog log query".
- Or list a server's tools with codemode `describeNamespace("mcp__datadog-prod")` or `describeNamespace("mcp__datadog-staging")`.
- Call a tool by its native name: `mcp__datadog-prod__<tool>` or `mcp__datadog-staging__<tool>`.

Common prod calls:
```text
mcp__datadog-prod__search_datadog_logs
{
  "query": "service:my-service",
  "from": "now-15m",
  "to": "now",
  "max_tokens": 4000,
  "telemetry": {"dd_mcp_source": "pi"}
}
```

```text
mcp__datadog-prod__get_datadog_metric
{
  "queries": [{"name": "query1", "data_source": "metrics", "query": "avg:system.cpu.user{*}"}],
  "from": "now-15m",
  "to": "now",
  "max_tokens": 4000,
  "telemetry": {"dd_mcp_source": "pi"}
}
```

Common staging calls:
```text
mcp__datadog-staging__search_datadog_logs
{
  "query": "kube_cluster_name:stormeagle.us1.staging.dog",
  "from": "now-15m",
  "to": "now",
  "max_tokens": 4000,
  "telemetry": {"dd_mcp_source": "pi"}
}
```

```text
mcp__datadog-staging__search_datadog_metrics
{
  "tag_filter": "kube_cluster_name:stormeagle.us1.staging.dog",
  "max_tokens": 4000,
  "telemetry": {"dd_mcp_source": "pi"}
}
```

Rules:
- Prefer read-only tools.
- Do not create or edit notebooks or dashboards unless explicitly asked.
- Use narrow time windows first, usually `now-15m` to `now` or the user-provided incident window.
- Include `max_tokens` on search/aggregate calls.
- Include telemetry: `{"dd_mcp_source": "pi"}`.
- Never print or persist `DD_API_KEY` or `DD_APP_KEY`.