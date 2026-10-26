#!/bin/bash
set -eufo pipefail

# Runs on every `chezmoi apply` and installs kind only when a newer stable release exists.
readonly LATEST_URL="https://proxy.golang.org/sigs.k8s.io/kind/@latest"

if ! command -v go >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "kind: 'go' and 'jq' are required to check for updates; skipping" >&2
  exit 0
fi

latest="$(curl -fsS --max-time 10 "${LATEST_URL}" | jq -r .Version)" || {
  echo "kind: cannot reach the module proxy; skipping update" >&2
  exit 0
}

if [[ ! "${latest}" =~ ^v[0-9] ]]; then
  echo "kind: unexpected latest version '${latest}'; skipping update" >&2
  exit 0
fi

installed=""
if command -v kind >/dev/null 2>&1; then
  installed="$(kind version | awk '{print $2}')" || installed=""
fi

if [[ "${installed#v}" == "${latest#v}" ]]; then
  exit 0
fi

echo "kind: installing ${latest} (current: ${installed:-none})"
go install "sigs.k8s.io/kind@${latest}"
