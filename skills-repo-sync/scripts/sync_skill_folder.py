#!/usr/bin/env python3
"""Sync one local skill folder into a skills git repository."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List

DEFAULT_REPO_URL = "git@github.com:garyzheng0714-lang/skills.git"
DEFAULT_BRANCH = "main"
SKIP_DIR_NAMES = {".git", "__pycache__"}
SKIP_FILE_NAMES = {".DS_Store"}
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


class SyncError(RuntimeError):
    """Raised for sync failures with user-friendly messages."""


def run_command(cmd: List[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
    )
    if check and proc.returncode != 0:
        stderr = proc.stderr.strip()
        stdout = proc.stdout.strip()
        hint = stderr or stdout or "unknown error"
        raise SyncError(f"Command failed: {' '.join(cmd)}\n{hint}")
    return proc


def normalize_path(path_text: str) -> Path:
    return Path(path_text).expanduser().resolve()


def parse_frontmatter(skill_md_path: Path) -> Dict[str, str]:
    text = skill_md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise SyncError("SKILL.md frontmatter is missing (expected leading '---').")

    end_index = None
    for idx in range(1, len(lines)):
        if lines[idx].strip() == "---":
            end_index = idx
            break

    if end_index is None:
        raise SyncError("SKILL.md frontmatter is not closed (missing second '---').")

    fm_text = "\n".join(lines[1:end_index])
    name_match = re.search(r"(?m)^name:\s*(.+?)\s*$", fm_text)
    desc_match = re.search(r"(?m)^description:\s*(.+?)\s*$", fm_text)

    def clean(value: str) -> str:
        return value.strip().strip("'").strip('"').strip()

    parsed: Dict[str, str] = {}
    if name_match:
        parsed["name"] = clean(name_match.group(1))
    if desc_match:
        parsed["description"] = clean(desc_match.group(1))
    return parsed


def validate_skill_folder(source_dir: Path, folder_name: str) -> Dict[str, List[str]]:
    errors: List[str] = []
    warnings: List[str] = []

    if not source_dir.exists():
        errors.append(f"Source directory does not exist: {source_dir}")
        return {"errors": errors, "warnings": warnings}
    if not source_dir.is_dir():
        errors.append(f"Source path is not a directory: {source_dir}")
        return {"errors": errors, "warnings": warnings}

    if not SKILL_NAME_PATTERN.match(folder_name):
        errors.append(
            "Folder name must match ^[a-z0-9][a-z0-9-]{0,63}$ "
            f"(current: {folder_name!r})."
        )

    skill_md = source_dir / "SKILL.md"
    if not skill_md.exists():
        errors.append(f"SKILL.md is required but missing in {source_dir}")
        return {"errors": errors, "warnings": warnings}

    try:
        fm = parse_frontmatter(skill_md)
    except SyncError as exc:
        errors.append(str(exc))
        return {"errors": errors, "warnings": warnings}

    if "name" not in fm or not fm["name"]:
        errors.append("SKILL.md frontmatter must contain a non-empty name field.")
    if "description" not in fm or not fm["description"]:
        errors.append("SKILL.md frontmatter must contain a non-empty description field.")

    if fm.get("name") and fm["name"] != folder_name:
        warnings.append(
            "SKILL.md name does not match folder name: "
            f"name={fm['name']!r}, folder={folder_name!r}."
        )

    return {"errors": errors, "warnings": warnings}


def ensure_repo(
    repo_path: Path,
    repo_url: str,
    branch: str,
    do_pull: bool,
) -> Dict[str, str]:
    repo_created = False
    repo_path.parent.mkdir(parents=True, exist_ok=True)

    if not (repo_path / ".git").exists():
        if repo_path.exists() and any(repo_path.iterdir()):
            raise SyncError(f"Repo path exists but is not a git repo: {repo_path}")
        run_command(["git", "clone", repo_url, str(repo_path)])
        repo_created = True

    if not (repo_path / ".git").exists():
        raise SyncError(f"Invalid git repository path: {repo_path}")

    remote_url_proc = run_command(
        ["git", "-C", str(repo_path), "config", "--get", "remote.origin.url"], check=False
    )
    current_remote = remote_url_proc.stdout.strip()
    if current_remote and current_remote != repo_url:
        raise SyncError(
            f"Repo remote mismatch at {repo_path}: expected {repo_url}, got {current_remote}"
        )

    dirty_proc = run_command(["git", "-C", str(repo_path), "status", "--porcelain"], check=False)
    if dirty_proc.stdout.strip():
        raise SyncError(
            f"Repository has uncommitted changes: {repo_path}. Commit or stash before syncing."
        )

    run_command(["git", "-C", str(repo_path), "checkout", branch])
    if do_pull:
        run_command(["git", "-C", str(repo_path), "fetch", "origin"])
        run_command(["git", "-C", str(repo_path), "pull", "--ff-only", "origin", branch])

    return {"repo_created": "yes" if repo_created else "no"}


def should_skip_path(relative_path: Path) -> bool:
    if any(part in SKIP_DIR_NAMES for part in relative_path.parts):
        return True
    if relative_path.name in SKIP_FILE_NAMES:
        return True
    if relative_path.suffix == ".pyc":
        return True
    return False


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if should_skip_path(rel):
            continue
        yield rel


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        while True:
            chunk = file_obj.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def build_manifest(root: Path) -> Dict[str, str]:
    manifest: Dict[str, str] = {}
    if not root.exists():
        return manifest
    for rel in iter_files(root):
        manifest[rel.as_posix()] = file_sha256(root / rel)
    return manifest


def compare_manifests(src: Dict[str, str], dst: Dict[str, str]) -> Dict[str, List[str]]:
    src_paths = set(src.keys())
    dst_paths = set(dst.keys())
    added = sorted(src_paths - dst_paths)
    deleted = sorted(dst_paths - src_paths)
    common = src_paths & dst_paths
    modified = sorted(path for path in common if src[path] != dst[path])
    unchanged = sorted(path for path in common if src[path] == dst[path])
    return {
        "added": added,
        "deleted": deleted,
        "modified": modified,
        "unchanged": unchanged,
    }


def copy_changed_files(source_root: Path, target_root: Path, files: Iterable[str]) -> None:
    for rel_text in files:
        rel = Path(rel_text)
        src = source_root / rel
        dst = target_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def delete_removed_files(target_root: Path, files: Iterable[str]) -> None:
    for rel_text in files:
        path = target_root / rel_text
        if path.exists():
            path.unlink()


def prune_empty_dirs(root: Path) -> None:
    dirs = sorted((path for path in root.rglob("*") if path.is_dir()), reverse=True)
    for directory in dirs:
        if directory.name in SKIP_DIR_NAMES:
            continue
        if any(directory.iterdir()):
            continue
        directory.rmdir()


def list_to_markdown_items(paths: List[str], limit: int = 100) -> str:
    if not paths:
        return "- (none)"
    items = [f"- `{item}`" for item in paths[:limit]]
    if len(paths) > limit:
        items.append(f"- ... ({len(paths) - limit} more)")
    return "\n".join(items)


def render_report_markdown(report: Dict[str, object]) -> str:
    changes = report["changes"]
    validation = report["validation"]
    git_status = report.get("git_status", "")
    warnings = validation["warnings"]
    errors = validation["errors"]

    lines = [
        "# Skill Sync Report",
        "",
        f"- Time: `{report['timestamp']}`",
        f"- Source: `{report['source']}`",
        f"- Repository: `{report['repo_path']}`",
        f"- Branch: `{report['branch']}`",
        f"- Target Skill Path: `{report['target']}`",
        f"- Mode: `{'dry-run' if report['dry_run'] else 'apply'}`",
        f"- Operation: `{report['operation']}`",
        "",
        "## Validation",
        f"- Passed: `{validation['passed']}`",
        f"- Errors: `{len(errors)}`",
        f"- Warnings: `{len(warnings)}`",
    ]

    if errors:
        lines.extend(["", "### Validation Errors", *[f"- {item}" for item in errors]])
    if warnings:
        lines.extend(["", "### Validation Warnings", *[f"- {item}" for item in warnings]])

    lines.extend(
        [
            "",
            "## Change Summary",
            f"- Added: `{len(changes['added'])}`",
            f"- Modified: `{len(changes['modified'])}`",
            f"- Deleted: `{len(changes['deleted'])}`",
            f"- Unchanged: `{len(changes['unchanged'])}`",
            "",
            "### Added Files",
            list_to_markdown_items(changes["added"]),
            "",
            "### Modified Files",
            list_to_markdown_items(changes["modified"]),
            "",
            "### Deleted Files",
            list_to_markdown_items(changes["deleted"]),
            "",
            "## Git Status (Target Path)",
            "```text",
            git_status or "(clean)",
            "```",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate and sync one skill folder into the skills git repository."
    )
    parser.add_argument("--source", required=True, help="Local skill folder path to sync.")
    parser.add_argument(
        "--repo",
        default="~/.codex/repos/skills",
        help="Local repository path (default: ~/.codex/repos/skills).",
    )
    parser.add_argument(
        "--repo-url",
        default=DEFAULT_REPO_URL,
        help=f"Repository URL used when cloning (default: {DEFAULT_REPO_URL}).",
    )
    parser.add_argument(
        "--branch",
        default=DEFAULT_BRANCH,
        help=f"Git branch to pull/update (default: {DEFAULT_BRANCH}).",
    )
    parser.add_argument(
        "--skill-name",
        default="",
        help="Override skill folder name in repository (default: source folder name).",
    )
    parser.add_argument(
        "--skills-subdir",
        default=".",
        help="Subdirectory in repo where skills are stored (default: .).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only validate and compare. Do not copy files.",
    )
    parser.add_argument(
        "--skip-pull",
        action="store_true",
        help="Skip git fetch/pull before sync.",
    )
    parser.add_argument(
        "--report",
        default="",
        help="Optional output path to write markdown report.",
    )
    parser.add_argument(
        "--json-report",
        default="",
        help="Optional output path to write JSON report.",
    )
    args = parser.parse_args()

    source_dir = normalize_path(args.source)
    repo_path = normalize_path(args.repo)
    skills_subdir = Path(args.skills_subdir)
    skill_name = args.skill_name.strip() or source_dir.name

    validation = validate_skill_folder(source_dir, skill_name)
    if validation["errors"]:
        report = {
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "source": str(source_dir),
            "repo_path": str(repo_path),
            "branch": args.branch,
            "target": str((repo_path / skills_subdir / skill_name).resolve()),
            "dry_run": bool(args.dry_run),
            "operation": "validation-failed",
            "validation": {
                "passed": False,
                "errors": validation["errors"],
                "warnings": validation["warnings"],
            },
            "changes": {"added": [], "modified": [], "deleted": [], "unchanged": []},
            "git_status": "",
        }
        text = render_report_markdown(report)
        sys.stderr.write(text)
        if args.report:
            report_path = normalize_path(args.report)
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(text, encoding="utf-8")
        if args.json_report:
            json_path = normalize_path(args.json_report)
            json_path.parent.mkdir(parents=True, exist_ok=True)
            json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return 2

    ensure_repo(
        repo_path=repo_path,
        repo_url=args.repo_url,
        branch=args.branch,
        do_pull=not args.skip_pull,
    )

    destination_root = (repo_path / skills_subdir).resolve()
    if not destination_root.exists() and not args.dry_run:
        destination_root.mkdir(parents=True, exist_ok=True)

    target_dir = destination_root / skill_name
    target_exists = target_dir.exists()

    src_manifest = build_manifest(source_dir)
    dst_manifest = build_manifest(target_dir)
    changes = compare_manifests(src_manifest, dst_manifest)

    if not target_exists:
        operation = "add"
    elif changes["added"] or changes["modified"] or changes["deleted"]:
        operation = "update"
    else:
        operation = "no-change"

    if not args.dry_run and operation == "add":
        shutil.copytree(
            source_dir,
            target_dir,
            ignore=shutil.ignore_patterns(".git", ".DS_Store", "__pycache__", "*.pyc"),
        )
    elif not args.dry_run and operation == "update":
        target_dir.mkdir(parents=True, exist_ok=True)
        copy_changed_files(source_dir, target_dir, changes["added"] + changes["modified"])
        delete_removed_files(target_dir, changes["deleted"])
        prune_empty_dirs(target_dir)

    target_rel = Path(args.skills_subdir) / skill_name if args.skills_subdir != "." else Path(skill_name)
    status_proc = run_command(
        ["git", "-C", str(repo_path), "status", "--short", "--", str(target_rel)],
        check=False,
    )

    report = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": str(source_dir),
        "repo_path": str(repo_path),
        "branch": args.branch,
        "target": str(target_dir),
        "dry_run": bool(args.dry_run),
        "operation": operation,
        "validation": {
            "passed": True,
            "errors": validation["errors"],
            "warnings": validation["warnings"],
        },
        "changes": changes,
        "git_status": status_proc.stdout.strip(),
    }

    markdown_report = render_report_markdown(report)
    sys.stdout.write(markdown_report)

    if args.report:
        report_path = normalize_path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(markdown_report, encoding="utf-8")
    if args.json_report:
        json_path = normalize_path(args.json_report)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as exc:
        sys.stderr.write(f"ERROR: {exc}\n")
        raise SystemExit(1)
