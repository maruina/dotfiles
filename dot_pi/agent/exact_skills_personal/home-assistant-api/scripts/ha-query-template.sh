#!/bin/bash
# Execute a Home Assistant template query
# Usage: ha-query-template.sh <template>
# Example: ha-query-template.sh "{{ states.light | selectattr('state', 'eq', 'on') | list | length }}"

set -euo pipefail

if [ -z "${HOME_ASSISTANT_URL:-}" ] || [ -z "${HOME_ASSISTANT_TOKEN:-}" ]; then
  echo "Error: HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set" >&2
  exit 1
fi

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
