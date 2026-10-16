#!/usr/bin/env python3
"""Validate the skill: frontmatter, relative links, and accidental secrets."""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r"\]\(([^)\s]+)\)")
SECRET_PATTERNS = {
    "anycross callback": re.compile(r"anycross/trigger/callback/[A-Za-z0-9_\-+/=]{20,}"),
    "tenant code": re.compile(r"/sso/F[A-Z0-9]{10}\b"),
    "app id": re.compile(r"\bac[0-9a-f]{32}\b"),
    "union id": re.compile(r"\bon_[0-9a-f]{32}\b"),
    "feishu app id": re.compile(r"\bcli_[0-9a-z]{16}\b"),
    "bearer token": re.compile(r"\b(t|u)-[A-Za-z0-9_\-.]{30,}"),
    "github token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    "ipv4": re.compile(r"\b(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}\b"),
}
IP_ALLOWED_FILES = {"platform-anycross-public-ips.md", "updates-ip.md"}


def check_frontmatter(errors):
    text = (ROOT / "SKILL.md").read_text()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append("SKILL.md: missing frontmatter")
        return
    fields = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)
    if fields.get("name", "").strip() != "feishu-anycross":
        errors.append("SKILL.md: name must be feishu-anycross")
    desc = fields.get("description", "").strip()
    if not desc or len(desc) > 1024:
        errors.append(f"SKILL.md: description length {len(desc)} not in 1..1024")


def check_links(md, errors):
    for target in LINK.findall(md.read_text()):
        if re.match(r"^[a-z]+:", target) or target.startswith("#"):
            continue
        path = unquote(target.split("#", 1)[0])
        if path and not (md.parent / path).exists():
            errors.append(f"{md.relative_to(ROOT)}: broken link {target}")


def check_secrets(md, errors):
    text = md.read_text()
    for label, pattern in SECRET_PATTERNS.items():
        if label == "ipv4" and md.name in IP_ALLOWED_FILES:
            continue
        for hit in pattern.findall(text):
            errors.append(f"{md.relative_to(ROOT)}: possible {label}: {hit}")


def main():
    errors = []
    check_frontmatter(errors)
    files = [p for p in ROOT.rglob("*.md") if ".git" not in p.parts]
    for md in files:
        check_links(md, errors)
        check_secrets(md, errors)
    for e in errors:
        print(e)
    print(f"checked {len(files)} files, {len(errors)} problems")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
