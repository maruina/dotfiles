#!/bin/bash
# Get the state of a Home Assistant entity
# Usage: ha-get-state.sh <entity_id>
# Example: ha-get-state.sh light.kitchen

set -euo pipefail

if [ -z "${HOME_ASSISTANT_URL:-}" ] || [ -z "${HOME_ASSISTANT_TOKEN:-}" ]; then
  echo "Error: HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set" >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <entity_id>" >&2
  echo "Example: $0 light.kitchen" >&2
  exit 1
fi

ENTITY_ID="$1"

curl -s -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOME_ASSISTANT_URL/api/states/$ENTITY_ID" | jq .
