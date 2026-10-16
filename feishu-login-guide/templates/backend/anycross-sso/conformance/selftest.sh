#!/usr/bin/env bash
# 改了 go/ 或 node/ 模板后跑这个：把模板装进最小项目，各跑一遍合规测试。
# 用法：bash selftest.sh [go|node]（不带参数两个都跑），结果写到 ./selftest-<语言>.json
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
tpl="$(dirname "$here")"
langs="${1:-go node}"
status=0

for lang in $langs; do
  work="$(mktemp -d "${TMPDIR:-/tmp}/sso-selftest-$lang.XXXXXX")"
  echo "== $lang：$work"
  case "$lang" in
    go)
      mkdir -p "$work/internal/auth"
      cp "$tpl/go/sso.go.template" "$work/internal/auth/sso.go"
      cp "$here/selftest/go/main.go" "$work/main.go"
      (cd "$work" && go mod init selftest >/dev/null 2>&1 \
        && go get github.com/coreos/go-oidc/v3@v3.21.0 golang.org/x/oauth2@v0.37.0 >/dev/null 2>&1 && go mod tidy >/dev/null 2>&1 \
        && go vet ./... && go build -o app .)
      start="$work/app"
      ;;
    node)
      cp "$tpl/node/sso.ts.template" "$work/sso.ts"
      cp "$here/selftest/node/server.ts" "$work/server.ts"
      (cd "$work" && npm init -y >/dev/null && npm pkg set type=module >/dev/null \
        && npm install --silent openid-client@6 express@5 >/dev/null \
        && npm install --silent -D typescript@5 @types/node@22 @types/express@5 >/dev/null \
        && npx tsc --strict --noEmit --module nodenext --moduleResolution nodenext --target es2022 --allowImportingTsExtensions --erasableSyntaxOnly --skipLibCheck sso.ts server.ts)
      start="node --experimental-strip-types --no-warnings $work/server.ts"
      ;;
  esac
  node "$here/run.mjs" --start "$start" --cwd "$work" --protected /api/me,/api/export --fresh /api/sensitive --report "$here/selftest-$lang.json" || status=1
done
exit $status
