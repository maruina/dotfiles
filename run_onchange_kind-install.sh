#!/bin/bash
set -eufo pipefail

# Bump KIND_VERSION and run `chezmoi apply` to upgrade; the content hash change reruns this script.
readonly KIND_VERSION="v0.32.0"

if ! command -v go >/dev/null 2>&1; then
  echo "go is required to install kind" >&2
  exit 1
fi

go install "sigs.k8s.io/kind@${KIND_VERSION}"
