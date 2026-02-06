#!/usr/bin/env python3
"""Preflight checks for Aliyun deploy workflow robustness."""

from __future__ import annotations

import argparse
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate deploy workflow guardrails")
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument(
        "--workflow-path",
        default=".github/workflows/deploy-aliyun.yml",
        help="Workflow file path relative to repo root",
    )
    return parser.parse_args()


def check(content: str, label: str, needle: str, failures: list[str]) -> None:
    if needle in content:
        print(f"[PASS] {label}")
    else:
        print(f"[FAIL] {label}")
        failures.append(label)


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    workflow_path = repo_root / args.workflow_path

    if not workflow_path.exists():
        print(f"[FAIL] workflow file not found: {workflow_path}")
        return 1

    content = workflow_path.read_text(encoding="utf-8")
    failures: list[str] = []

    check(content, "Trigger on main", "branches:\n      - main", failures)
    check(content, "Concurrency guard", "concurrency:", failures)
    check(content, "Has SSH validation step", "name: Validate SSH Key", failures)
    check(content, "Private key syntax check", "ssh-keygen -y -f ~/.ssh/id_aliyun", failures)
    check(content, "Host key policy", "StrictHostKeyChecking=accept-new", failures)
    check(content, "Has upload step", "name: Upload Release To Server", failures)
    check(content, "Uses scp upload", "scp \\", failures)
    check(content, "Has deploy step", "name: Deploy On Server", failures)
    check(content, "Release symlink", "ln -sfn", failures)
    check(content, "PM2 process start", "pm2 start", failures)
    check(content, "Health checks", "curl -fsS", failures)
    check(content, "Has cleanup step", "name: Cleanup", failures)
    check(content, "Cleanup always runs", "if: always()", failures)

    if "__" in content:
        print("[FAIL] Found unresolved placeholder tokens (__...__)")
        failures.append("Unresolved placeholders")
    else:
        print("[PASS] No unresolved placeholders")

    # This workflow intentionally includes the marker string for key block extraction.
    # Do not fail on this marker alone.
    if "BEGIN OPENSSH PRIVATE KEY" in content:
        print("[PASS] Key marker string present (expected for validation logic)")
    else:
        print("[PASS] Key marker string absent")

    if failures:
        print("\nPreflight result: FAILED")
        print("Fix items:")
        for item in failures:
            print(f"- {item}")
        return 1

    print("\nPreflight result: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
