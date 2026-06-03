#!/bin/bash
# List Home Assistant entities, optionally filtered by domain
# Usage: ha-list-entities.sh [domain]
# Example: ha-list-entities.sh light

set -euo pipefail

if [ -z "${HOME_ASSISTANT_URL:-}" ] || [ -z "${HOME_ASSISTANT_TOKEN:-}" ]; then
  echo "Error: HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set" >&2
  exit 1
fi

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
