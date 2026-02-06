#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: $0 [host_alias] <command> [args...]"
  echo "Default host_alias: aliyun-prod"
  echo "Example: $0 aliyun-prod systemctl status nginx"
  exit 0
fi

host="aliyun-prod"
if [[ "$#" -gt 0 ]]; then
  host="$1"
  shift
fi

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 [host_alias] <command> [args...]" >&2
  exit 1
fi

exec ssh "$host" -- "$@"
