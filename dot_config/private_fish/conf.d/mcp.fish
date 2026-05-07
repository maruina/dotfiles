# mcp-cli 0.3.0 introduced a connection daemon that parses socket responses one
# chunk at a time. Large responses (Confluence pages, tool lists) arrive split
# across multiple chunks, causing JSON parse failures ("Invalid response from
# daemon"). Disable the daemon so every call uses a fresh direct connection.
set -gx MCP_NO_DAEMON 1

# mcp_servers.json references ${DD_API_KEY} and ${DD_APP_KEY} for the Datadog
# MCP servers. When those vars are unset, mcp-cli exits with an error instead
# of a warning. Set strict mode to false so unrelated servers (e.g. Atlassian)
# still work even when Datadog keys are not loaded in the current shell.
set -gx MCP_STRICT_ENV false
