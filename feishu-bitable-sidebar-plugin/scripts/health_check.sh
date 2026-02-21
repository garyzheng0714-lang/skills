#!/usr/bin/env bash
set -euo pipefail

WEB_PORT="${1:-5173}"
API_PORT="${2:-3000}"

fail=0

echo "[check] web: http://localhost:${WEB_PORT}"
if curl -fsS --max-time 3 "http://localhost:${WEB_PORT}" >/dev/null; then
  echo "[ok] web reachable"
else
  echo "[fail] web not reachable on port ${WEB_PORT}"
  fail=1
fi

echo "[check] api: http://localhost:${API_PORT}/api/health"
if curl -fsS --max-time 3 "http://localhost:${API_PORT}/api/health" >/dev/null; then
  echo "[ok] api health reachable"
else
  echo "[fail] api health not reachable on port ${API_PORT}"
  fail=1
fi

echo "[check] listeners"
(lsof -iTCP:"${WEB_PORT}" -sTCP:LISTEN -n -P || true) | sed 's/^/[lsof] /'
(lsof -iTCP:"${API_PORT}" -sTCP:LISTEN -n -P || true) | sed 's/^/[lsof] /'

if [[ "$fail" -ne 0 ]]; then
  echo ""
  echo "[hint] Start dev services first (example: npm run dev)."
  echo "[hint] If plugin still cannot open, verify Feishu custom plugin URL matches current port."
  exit 1
fi

echo "[done] all health checks passed"
