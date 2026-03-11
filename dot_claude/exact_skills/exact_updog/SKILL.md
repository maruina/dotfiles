---
name: updog
description: >
  Use when the user asks if a service/website is down, experiencing outages, or having issues.
  Trigger phrases: "is X down", "is X up", "check X status", "X outage", "X down?", "status of X".
  Checks real-time outage data from Updog by Datadog.
disable-model-invocation: false
allowed-tools: Bash(curl *), Bash(echo *)
---

# Updog - Service Outage Checker

Check if a cloud service is currently experiencing an outage using real-time data from [Updog by Datadog](https://updog.ai).

## Arguments

`$ARGUMENTS` - The service/provider name to check (e.g., "anthropic", "openai", "github", "aws")

## Instructions

Run the following command, replacing `QUERY` with the user's `$ARGUMENTS` converted to lowercase. The jq filter does a case-insensitive match against both `provider_name` and `display_name`:

```bash
curl -s "https://updog.ai/data/third-party-outages.json" | jq --arg q "QUERY" '
  .data.attributes.provider_data
  | map(select(
      (.provider_name | ascii_downcase | contains($q))
      or (.display_name | ascii_downcase | contains($q))
    ))
  | group_by(.provider_name)
  | map({
      provider: .[0].provider_name,
      display_name: .[0].display_name,
      status_url: .[0].status_url,
      services: map({
        name: (.display_name // .provider_name),
        service: (.provider_service // null),
        ongoing_outages: [.outages[] | select(.status == "resolved" | not)],
        recent_resolved: [.outages[] | select(.status == "resolved")] | sort_by(.end) | reverse | .[0:3]
      })
    })
'
```

## Interpreting results

- If the result is an empty array `[]`, the provider was not found. Tell the user the service is not tracked by Updog and list the available providers by running:
  ```bash
  curl -s "https://updog.ai/data/third-party-outages.json" | jq '[.data.attributes.provider_data | group_by(.provider_name) | .[] | .[0] | {name: .provider_name, display: .display_name}]'
  ```

- If `ongoing_outages` is non-empty for any service, the provider is **currently experiencing an outage**. Report:
  - Which services are affected
  - When the outage started (convert the epoch ms timestamp to human-readable)
  - Link to the provider's status page (`status_url`)
  - Link to the Updog page: `https://updog.ai/s/<provider_name>`

- If `ongoing_outages` is empty for all services, the provider is **operational**. Report:
  - The service appears to be up
  - If there are `recent_resolved` outages, briefly mention the most recent one and when it was resolved (convert epoch ms to human-readable)
  - Link to the Updog page: `https://updog.ai/s/<provider_name>`

## Output format

Keep the response concise. Example:

**OpenAI is currently operational.**
Last outage resolved on Jan 15, 2025 at 3:45 PM UTC.
[Updog](https://updog.ai/s/openai) | [Status Page](https://status.openai.com/)
