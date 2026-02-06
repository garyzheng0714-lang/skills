#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 <local_path> <remote_path> [host_alias]"
  echo "Default host_alias: aliyun-prod"
  echo "Example: $0 ./app.tar.gz /tmp/app.tar.gz aliyun-prod"
  exit 0
fi

if [[ "$#" -lt 2 || "$#" -gt 3 ]]; then
  echo "Usage: $0 <local_path> <remote_path> [host_alias]" >&2
  exit 1
fi

local_path="$1"
remote_path="$2"
host="${3:-aliyun-prod}"

exec scp -r "$local_path" "${host}:${remote_path}"
