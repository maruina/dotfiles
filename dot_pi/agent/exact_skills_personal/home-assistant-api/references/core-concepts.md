# Home Assistant API Core Concepts

## Authentication

Home Assistant uses bearer token authentication. All API requests require:

```bash
-H "Authorization: Bearer YOUR_TOKEN"
-H "Content-Type: application/json"
```

### Creating a Long-Lived Access Token

1. Go to your Home Assistant instance
2. Click your **Profile** (bottom left)
3. Scroll to **Long-Lived Access Tokens**
4. Click **Create Token**
5. Give it a name (e.g., "pi-agent")
6. Copy the token immediately (it won't be shown again)

Store this token securely. For pi, use environment variables set via chezmoi and 1Password.

## HTTP Methods

| Method | Use Case | Example |
|--------|----------|---------|
| GET | Retrieve data | Get entity state, list services |
| POST | Create/trigger actions | Call service, fire event |
| DELETE | Remove data | Delete entity state |

## Base URL Structure

All API endpoints follow this pattern:
```
{HOME_ASSISTANT_URL}/api/{endpoint}
```

Examples:
- States: `$HOME_ASSISTANT_URL/api/states`
- Services: `$HOME_ASSISTANT_URL/api/services`
- Config: `$HOME_ASSISTANT_URL/api/config`

## Error Handling

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 400 | Bad Request | Check JSON syntax, required fields |
| 401 | Unauthorized | Verify token is valid |
| 403 | Forbidden | Check permissions |
| 404 | Not Found | Verify entity_id or endpoint |
| 500 | Internal Error | Check HA logs, restart if needed |

### Retry Strategy

For transient errors (500, 503), implement exponential backoff:

```bash
#!/bin/bash
max_retries=3
retry_count=0

while [ $retry_count -lt $max_retries ]; do
  response=$(curl -s -w "%{http_code}" \
    -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
    "$HOME_ASSISTANT_URL/api/states/light.kitchen")
  
  http_code=${response: -3}
  
  if [ "$http_code" = "200" ]; then
    echo "${response%???}"
    exit 0
  elif [[ "$http_code" =~ ^5 ]]; then
    retry_count=$((retry_count + 1))
    sleep $((2 ** retry_count))
  else
    echo "Error: $http_code"
    exit 1
  fi
done

echo "Max retries exceeded"
exit 1
```

## Security Best Practices

1. **Never hardcode tokens** - Use environment variables or secret managers
2. **Use HTTPS** - Always connect via HTTPS in production
3. **Limit token scope** - Create separate tokens for different purposes
4. **Rotate tokens** - Regenerate periodically or if compromised
5. **Audit access** - Check Profile → Active Sessions for suspicious activity

## Testing Connectivity

```bash
# Test basic connectivity
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  "$HOME_ASSISTANT_URL/api/"

# Expected response: {"message": "API running."}
```

## Next Steps

After understanding authentication and basics:
- Query states: See `state-management.md`
- Control devices: See `service-reference.md`
- Advanced queries: See `templates.md`
