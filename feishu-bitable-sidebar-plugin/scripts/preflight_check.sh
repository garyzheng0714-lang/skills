#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"

warn=0

check_file() {
  local f="$1"
  if [[ ! -f "$ROOT/$f" ]]; then
    echo "[warn] missing file: $f"
    warn=1
  else
    echo "[ok] found: $f"
  fi
}

contains() {
  local pattern="$1"
  local file="$2"
  if rg -n "$pattern" "$ROOT/$file" >/dev/null 2>&1; then
    echo "[ok] $file matches: $pattern"
  else
    echo "[warn] $file missing expected pattern: $pattern"
    warn=1
  fi
}

echo "[info] project root: $ROOT"
check_file "package.json"
check_file "vite.config.ts"

if [[ -f "$ROOT/package.json" ]]; then
  contains '"@lark-base-open/js-sdk"' "package.json"
  contains '"dev"' "package.json"
fi

if [[ -f "$ROOT/vite.config.ts" ]]; then
  contains "base:\\s*['\"]\\./['\"]" "vite.config.ts"
fi

if rg -n "BrowserRouter|createBrowserRouter" "$ROOT/src" >/dev/null 2>&1; then
  echo "[warn] history route pattern detected in src/ (prefer hash/no-router for sidebar plugin)"
  warn=1
else
  echo "[ok] no history router pattern detected"
fi

if rg -n "basekit\\.addField|field shortcut|字段捷径" "$ROOT/src" >/dev/null 2>&1; then
  echo "[warn] field-shortcut pattern detected; confirm this project is sidebar plugin"
  warn=1
else
  echo "[ok] no field-shortcut pattern detected"
fi

if rg -n "const\\s*\\{\\s*getSelectedRecordIdList\\s*\\}" "$ROOT/src" >/dev/null 2>&1; then
  echo "[warn] possible unbound SDK method usage detected for getSelectedRecordIdList"
  warn=1
else
  echo "[ok] no obvious unbound getSelectedRecordIdList pattern"
fi

if [[ "$warn" -ne 0 ]]; then
  echo "[done] preflight completed with warnings"
  exit 1
fi

echo "[done] preflight passed"
