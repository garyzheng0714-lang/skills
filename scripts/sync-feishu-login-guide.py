#!/usr/bin/env python3
"""Copy the local feishu-login-guide into this repo without secrets, then redact private details.

Usage: python3 scripts/sync-feishu-login-guide.py [source_dir]
Default source: ~/.claude/skills/feishu-login-guide
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else Path.home() / ".claude/skills/feishu-login-guide"
DEST = ROOT / "feishu-login-guide"
EXCLUDES = ["assets/secrets", "learnings.jsonl", ".DS_Store", "node_modules"]

PUBLIC_IP = re.compile(
    r"\b(?!(?:10|127|0)\.)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)"
    r"(?!192\.0\.2\.|198\.51\.100\.|203\.0\.113\.)(?:\d{1,3}\.){3}\d{1,3}\b"
)
REDACTIONS = [
    (re.compile(r"`MAXuPOl[^`]*`（实际值看 `assets/secrets/feishu-app-credentials.md`）"), "实际值（只在 `assets/secrets/feishu-app-credentials.md` 里）"),
    (re.compile(r"（目前 <服务器 IP，问管理员>）"), "（具体 IP 问集成平台管理员）"),
    (re.compile(r"在 <服务器 IP，问管理员> 的 `/etc/[\w.-]+\.env`"), "在服务器的环境文件里（找管理员要）"),
    (re.compile(r"`/etc/[\w.-]+\.env`"), "服务器上的环境文件（路径问管理员）"),
]


def redact(text):
    text = PUBLIC_IP.sub("<服务器 IP，问管理员>", text)
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def main():
    if not (SOURCE / "SKILL.md").exists():
        sys.exit(f"no SKILL.md in {SOURCE}")
    cmd = ["rsync", "-a", "--delete", *[f"--exclude={e}" for e in EXCLUDES], f"{SOURCE}/", f"{DEST}/"]
    subprocess.run(cmd, check=True)
    changed = []
    for path in DEST.rglob("*.md"):
        text = path.read_text()
        new = redact(text)
        if new != text:
            path.write_text(new)
            changed.append(str(path.relative_to(ROOT)))
    print(f"synced {SOURCE} -> {DEST.relative_to(ROOT)}")
    for c in changed:
        print(f"redacted {c}")


if __name__ == "__main__":
    main()
