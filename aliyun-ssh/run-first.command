#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[aliyun-ssh] Running bootstrap..."
./scripts/bootstrap_aliyun_ssh.sh "$@"
echo "[aliyun-ssh] Finished."

if [[ -t 0 ]]; then
  echo
  read -r -p "Press Enter to close this window..." _
fi
