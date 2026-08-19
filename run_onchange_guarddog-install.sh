#!/bin/bash
set -eufo pipefail

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required to install guarddog" >&2
  exit 1
fi

uv tool install guarddog
