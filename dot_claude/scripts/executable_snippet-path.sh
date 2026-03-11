#!/usr/bin/env bash
# snippet-path.sh - Output the absolute path and vault-relative path for this week's snippet
#
# Usage: bash snippet-path.sh
# Output (two lines):
#   /absolute/path/to/Week of DD-MM-YYYY.md
#   Datadog/Snippets/Week of DD-MM-YYYY
set -euo pipefail

CONFIG_FILE="$HOME/.claude/obsidian.config"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Error: Missing $CONFIG_FILE" >&2
  exit 1
fi

VAULT_PATH=""
SNIPPETS_DIR=""

while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  case "$key" in
    vault_path)   VAULT_PATH="${value/#\~/$HOME}" ;;
    snippets_dir) SNIPPETS_DIR="$value" ;;
  esac
done < "$CONFIG_FILE"

if [ -z "$VAULT_PATH" ] || [ -z "$SNIPPETS_DIR" ]; then
  echo "Error: vault_path and snippets_dir must be set in $CONFIG_FILE" >&2
  exit 1
fi

if [ "$(date +%u)" = "1" ]; then
  MONDAY=$(date "+%d-%m-%Y")
else
  MONDAY=$(date -d "last monday" "+%d-%m-%Y" 2>/dev/null || date -v-monday -j "+%d-%m-%Y" 2>/dev/null || date "+%d-%m-%Y")
fi

WEEK_NAME="Week of $MONDAY"
echo "$VAULT_PATH/$SNIPPETS_DIR/$WEEK_NAME.md"
echo "$SNIPPETS_DIR/$WEEK_NAME"
