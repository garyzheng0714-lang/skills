#!/usr/bin/env python3
"""Validate every skill in the repo: frontmatter, relative links, and leaked secrets."""
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
TEXT_SUFFIXES = {".md", ".json", ".jsonl", ".mjs", ".js", ".ts", ".tsx", ".go", ".py", ".yaml", ".yml", ".template", ".env", ".txt", ".sh"}
LINK = re.compile(r"\]\(([^)\s]+)\)")
SECRET_PATTERNS = {
    "anycross callback": re.compile(r"anycross/trigger/callback/[A-Za-z0-9_\-+/=]{20,}"),
    "secret assignment": re.compile(r"(?i)\b\w*(secret|password|passwd|token)\w*\s*[=:]\s*[\"']?(?![\"'<$({])[A-Za-z0-9_\-+/]{24,}"),
    "feishu token": re.compile(r"\b(t|u)-[A-Za-z0-9_\-.]{30,}"),
    "github token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"),
    "api key": re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}"),
    "private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "public ipv4": re.compile(r"\b(?!(?:10|127|0)\.)(?!192\.168\.)(?!172\.(?:1[6-9]|2\d|3[01])\.)(?:\d{1,3}\.){3}\d{1,3}\b"),
}
IP_ALLOWED_FILES = {"platform-anycross-public-ips.md", "updates-ip.md"}
FORBIDDEN_PATHS = ["assets/secrets", "learnings.jsonl", ".env"]


def skill_dirs():
    return sorted(p.parent for p in ROOT.glob("*/SKILL.md"))


def check_frontmatter(skill, errors):
    text = (skill / "SKILL.md").read_text()
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        errors.append(f"{skill.name}/SKILL.md: missing frontmatter")
        return
    fields = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line and not line.startswith(" "))
    if fields.get("name", "").strip() != skill.name:
        errors.append(f"{skill.name}/SKILL.md: name must equal folder name")
    if not fields.get("description", "").strip():
        errors.append(f"{skill.name}/SKILL.md: missing description")


def check_file(path, errors):
    rel = path.relative_to(ROOT)
    text = path.read_text(errors="ignore")
    if path.suffix == ".md":
        for target in LINK.findall(text):
            if re.match(r"^[a-z]+:", target) or target.startswith("#"):
                continue
            target_path = unquote(target.split("#", 1)[0])
            if target_path and not (path.parent / target_path).exists():
                errors.append(f"{rel}: broken link {target}")
    for label, pattern in SECRET_PATTERNS.items():
        if label == "public ipv4" and path.name in IP_ALLOWED_FILES:
            continue
        for m in pattern.finditer(text):
            errors.append(f"{rel}: possible {label}: {m.group(0)[:60]}")


def main():
    errors = []
    skills = skill_dirs()
    for skill in skills:
        check_frontmatter(skill, errors)
        for forbidden in FORBIDDEN_PATHS:
            if (skill / forbidden).exists():
                errors.append(f"{skill.name}/{forbidden}: must not be published")
    files = [p for p in ROOT.rglob("*") if p.is_file() and ".git" not in p.parts and (p.suffix in TEXT_SUFFIXES or p.name.endswith(".template"))]
    for path in files:
        check_file(path, errors)
    for e in errors:
        print(e)
    print(f"checked {len(skills)} skills, {len(files)} files, {len(errors)} problems")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
