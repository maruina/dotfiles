#!/bin/bash
# Call a Home Assistant service
# Usage: ha-set-service.sh <domain> <service> [json_data]
# Example: ha-set-service.sh light turn_on '{"entity_id": "light.kitchen", "brightness": 200}'

set -eo pipefail

# Load environment variables from Fish config
export HOME_ASSISTANT_URL=$(fish -c 'echo $HOME_ASSISTANT_URL')
export HOME_ASSISTANT_TOKEN=$(fish -c 'echo $HOME_ASSISTANT_TOKEN')

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
