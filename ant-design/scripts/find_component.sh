#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  find_component.sh <ant-design-repo-root> <component-or-keyword>

Examples:
  find_component.sh /tmp/ant-design button
  find_component.sh /path/to/ant-design picker
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "$#" -lt 2 ]; then
  usage
  exit 1
fi

repo_root="$1"
keyword_raw="$2"
keyword="$(printf '%s' "$keyword_raw" | tr '[:upper:]' '[:lower:]')"
components_dir="$repo_root/components"

if [ ! -d "$components_dir" ]; then
  echo "Error: components directory not found: $components_dir" >&2
  exit 1
fi

matches=()
while IFS= read -r dir; do
  base="$(basename "$dir")"
  lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
  case "$base" in
    __tests__|_util) continue ;;
  esac
  if [[ "$lower" == *"$keyword"* ]]; then
    matches+=("$dir")
  fi
done < <(find "$components_dir" -mindepth 1 -maxdepth 1 -type d | sort)

if [ "${#matches[@]}" -eq 0 ]; then
  echo "No components matched keyword: $keyword_raw"
  exit 2
fi

echo "Matched components (${#matches[@]}):"
for dir in "${matches[@]}"; do
  name="$(basename "$dir")"
  rel="components/$name"

  demo_count=0
  test_count=0
  if [ -d "$dir/demo" ]; then
    demo_count="$(find "$dir/demo" -maxdepth 1 -type f -name '*.tsx' | wc -l | tr -d ' ')"
  fi
  if [ -d "$dir/__tests__" ]; then
    test_count="$(find "$dir/__tests__" -type f | wc -l | tr -d ' ')"
  fi

  echo
  echo "- $name"
  [ -f "$dir/index.tsx" ] && echo "  entry: $rel/index.tsx"
  [ -f "$dir/index.en-US.md" ] && echo "  docs_en: $rel/index.en-US.md"
  [ -f "$dir/index.zh-CN.md" ] && echo "  docs_zh: $rel/index.zh-CN.md"
  [ -d "$dir/style" ] && echo "  styles: $rel/style/"
  [ -d "$dir/demo" ] && echo "  demos: $demo_count files in $rel/demo/"
  [ -d "$dir/__tests__" ] && echo "  tests: $test_count files in $rel/__tests__/"
done
