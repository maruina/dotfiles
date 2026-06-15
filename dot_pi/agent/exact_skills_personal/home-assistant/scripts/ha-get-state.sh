#!/bin/bash
# Get the state of a Home Assistant entity
# Usage: ha-get-state.sh <entity_id>
# Example: ha-get-state.sh light.kitchen

set -eo pipefail

# Load environment variables from Fish config
export HOME_ASSISTANT_URL=$(fish -c 'echo $HOME_ASSISTANT_URL')
export HOME_ASSISTANT_TOKEN=$(fish -c 'echo $HOME_ASSISTANT_TOKEN')

if [ $# -lt 1 ]; then
  echo "Usage: $0 <entity_id>" >&2
  echo "Example: $0 light.kitchen" >&2
  exit 1
fi

ENTITY_ID="$1"

curl -s -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  "$HOME_ASSISTANT_URL/api/states/$ENTITY_ID" | jq .
