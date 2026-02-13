#!/usr/bin/env python3
"""
Validate feishu component contracts JSON structure.

Usage:
  python3 scripts/validate_component_contracts.py assets/templates/component-contracts.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REQUIRED_COMPONENTS = {
    "Button",
    "Input",
    "Table",
    "Dialog",
    "Navigation",
    "Card",
    "List",
    "Pagination",
    "Loading",
    "Tooltip",
    "Chart",
}

REQUIRED_KEYS_PER_COMPONENT = {"description", "props"}


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")
    sys.exit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("expected one argument: path to component contracts json")

    path = Path(sys.argv[1])
    if not path.exists():
        fail(f"file not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid json: {exc}")

    if not isinstance(data, dict):
        fail("root must be a json object")

    components = data.get("components")
    if not isinstance(components, dict):
        fail("components must be a json object")

    missing = sorted(REQUIRED_COMPONENTS - set(components.keys()))
    if missing:
        fail(f"missing required components: {', '.join(missing)}")

    for name in sorted(REQUIRED_COMPONENTS):
        comp = components.get(name)
        if not isinstance(comp, dict):
            fail(f"component '{name}' must be an object")
        for key in REQUIRED_KEYS_PER_COMPONENT:
            if key not in comp:
                fail(f"component '{name}' missing key '{key}'")
        if not isinstance(comp.get("props"), dict) or not comp["props"]:
            fail(f"component '{name}' props must be a non-empty object")

    print("[PASS] component contracts are valid")


if __name__ == "__main__":
    main()
