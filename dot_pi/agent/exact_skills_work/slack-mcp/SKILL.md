---
name: slack-mcp
description: Uses the native pi Slack MCP server, a local Python stdio proxy backed by Claude Code's macOS keychain token. Use when searching Slack messages, reading channels or threads, finding users/channels, or explicitly sending Slack messages.
---
# Slack MCP
Use the native pi MCP server `slack` to access Datadog Slack.

Config:
- Server: `slack` (stdio, in `~/.pi/agent/mcp.json`)
- Endpoint: `https://mcp.slack.com/mcp`
- Proxy: `~/.pi/agent/skills_work/slack-mcp/scripts/slack-mcp-proxy.py`
- Auth: macOS keychain service `Claude Code-credentials`, account `$(whoami)`
- Client ID: `1601185624273.8899143856786`

Setup and auth:
```fish
python3 ~/.pi/agent/skills_work/slack-mcp/scripts/slack-mcp-auth.py
```

Discovery:
- Use `tool_search` to find a tool by intent, for example "Slack search messages".
- Or list the server's tools with codemode `describeNamespace("mcp__slack")`.
- Call a tool by its native name: `mcp__slack__<tool>`, for example `mcp__slack__slack_search_public_and_private`, `mcp__slack__slack_read_channel`, `mcp__slack__slack_read_thread`.

Common read-only calls:
```text
mcp__slack__slack_search_public_and_private
{
  "query": "search terms",
  "limit": 10,
  "include_context": true,
  "response_format": "detailed"
}
```

```text
mcp__slack__slack_search_channels
{
  "query": "channel-name",
  "limit": 10,
  "response_format": "detailed"
}
```

```text
mcp__slack__slack_read_channel
{
  "channel_id": "CHANNEL_ID",
  "limit": 20,
  "response_format": "detailed"
}
```

```text
mcp__slack__slack_read_thread
{
  "channel_id": "CHANNEL_ID",
  "message_ts": "MESSAGE_TS",
  "limit": 50,
  "response_format": "detailed"
}
```

Write calls require explicit user approval:
```text
mcp__slack__slack_send_message_draft
{
  "channel_id": "CHANNEL_ID",
  "message": "draft text"
}
```

Rules:
- Prefer read-only tools: search, read channel, read thread, read user profile.
- Do not send, schedule, create, update, or react unless the user explicitly asks.
- Prefer `slack_send_message_draft` over `slack_send_message` when drafting is enough.
- Slack MCP uses the user's normal Slack permissions and all access may be logged.
- Do not print or persist Slack access or refresh tokens.
- If auth fails, rerun `slack-mcp-auth.py` and retry.
- `response_format` accepts only `detailed` or `concise` (default `detailed`); it does not support `markdown`.
- Messages sent through this MCP are attributed to the Claude Slack app ("sent with Claude") because the client ID belongs to Claude Code, not Datadog/Pi.