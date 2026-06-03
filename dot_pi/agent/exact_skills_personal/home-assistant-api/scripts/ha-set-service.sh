#!/bin/bash
# Call a Home Assistant service
# Usage: ha-set-service.sh <domain> <service> [json_data]
# Example: ha-set-service.sh light turn_on '{"entity_id": "light.kitchen", "brightness": 200}'

set -euo pipefail

if [ -z "${HOME_ASSISTANT_URL:-}" ] || [ -z "${HOME_ASSISTANT_TOKEN:-}" ]; then
  echo "Error: HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set" >&2
  exit 1
fi

if [ $# -lt 2 ]; then
  echo "Usage: $0 <domain> <service> [json_data]" >&2
  echo "Example: $0 light turn_on '{\"entity_id\": \"light.kitchen\"}'" >&2
  exit 1
fi

DOMAIN="$1"
SERVICE="$2"
DATA="${3:-{}}"

curl -s -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$DATA" \
  "$HOME_ASSISTANT_URL/api/services/$DOMAIN/$SERVICE" | jq .
