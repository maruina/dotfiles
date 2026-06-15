#!/bin/bash
# Execute a Home Assistant template query
# Usage: ha-query-template.sh <template>
# Example: ha-query-template.sh "{{ states.light | selectattr('state', 'eq', 'on') | list | length }}"

set -eo pipefail

# Load environment variables from Fish config
export HOME_ASSISTANT_URL=$(fish -c 'echo $HOME_ASSISTANT_URL')
export HOME_ASSISTANT_TOKEN=$(fish -c 'echo $HOME_ASSISTANT_TOKEN')

if [ $# -lt 1 ]; then
  echo "Usage: $0 <template>" >&2
  echo "Example: $0 \"{{ states.light | selectattr('state', 'eq', 'on') | list | length }}\"" >&2
  exit 1
fi

TEMPLATE="$1"

curl -s -X POST -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"template\": \"$TEMPLATE\"}" \
  "$HOME_ASSISTANT_URL/api/template" | jq .
