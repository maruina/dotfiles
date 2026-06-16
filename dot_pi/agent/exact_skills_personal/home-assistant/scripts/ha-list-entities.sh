#!/bin/bash
# List Home Assistant entities, optionally filtered by domain
# Usage: ha-list-entities.sh [domain]
# Example: ha-list-entities.sh light

set -eo pipefail

# Load environment variables from Fish config
export HOME_ASSISTANT_URL=$(fish -c 'echo $HOME_ASSISTANT_URL')
export HOME_ASSISTANT_TOKEN=$(fish -c 'echo $HOME_ASSISTANT_TOKEN')

DOMAIN="${1:-}"

if [ -n "$DOMAIN" ]; then
  curl -s -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
    -H "Content-Type: application/json" \
    "$HOME_ASSISTANT_URL/api/states" | \
    jq "[.[] | select(.entity_id | startswith(\"$DOMAIN.\"))]"
else
  curl -s -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
    -H "Content-Type: application/json" \
    "$HOME_ASSISTANT_URL/api/states" | jq .
fi
