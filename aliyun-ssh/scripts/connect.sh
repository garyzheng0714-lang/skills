#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [host_alias]"
  echo "Default host_alias: aliyun-prod"
  exit 0
fi

host="${1:-aliyun-prod}"
exec ssh "$host"
