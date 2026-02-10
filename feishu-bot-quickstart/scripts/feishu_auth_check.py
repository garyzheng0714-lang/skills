#!/usr/bin/env python3

import getpass
import json
import os
import sys
import urllib.error
import urllib.request


TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"


def eprint(msg: str) -> None:
    print(msg, file=sys.stderr)


def read_cred(name: str, secret: bool = False) -> str:
    v = os.environ.get(name, "").strip()
    if v:
        return v
    if not sys.stdin.isatty():
        return ""
    prompt = f"{name}: "
    if secret:
        return getpass.getpass(prompt).strip()
    return input(prompt).strip()


def main() -> int:
    app_id = read_cred("FEISHU_APP_ID", secret=False)
    app_secret = read_cred("FEISHU_APP_SECRET", secret=True)

    if not app_id or not app_secret:
        eprint("ERROR: FEISHU_APP_ID / FEISHU_APP_SECRET are required (env var or interactive input).")
        eprint("Tip: export FEISHU_APP_ID=...; export FEISHU_APP_SECRET=...; then re-run.")
        return 2

    body = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode("utf-8")
    req = urllib.request.Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        eprint(f"HTTP error: {e.code}")
        eprint(e.read().decode("utf-8", errors="replace"))
        return 1
    except Exception as e:
        eprint(f"Request failed: {e}")
        return 1

    code = data.get("code")
    if code != 0:
        eprint("Auth failed.")
        eprint(json.dumps(data, ensure_ascii=False, indent=2))
        eprint("")
        eprint("Common causes:")
        eprint("- Wrong FEISHU_APP_ID/FEISHU_APP_SECRET")
        eprint("- The app is not a self-built app in the correct tenant")
        eprint("- Network / DNS issues reaching open.feishu.cn")
        return 1

    token = data.get("tenant_access_token", "")
    expire = data.get("expire", "")
    print("Auth OK.")
    if token:
        print(f"tenant_access_token: {token[:8]}... (redacted)")
    if expire != "":
        print(f"expire (seconds): {expire}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

