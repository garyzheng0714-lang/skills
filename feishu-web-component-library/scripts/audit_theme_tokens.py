#!/usr/bin/env python3
"""
Audit Feishu-style theme token json.

Usage:
  python3 scripts/audit_theme_tokens.py assets/templates/theme.default.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
REQUIRED_COLOR_KEYS = {
    "brand.primary",
    "text.primary",
    "text.secondary",
    "text.disabled",
    "border.interactive",
    "bg.level1",
    "bg.level2",
    "state.info",
    "state.success",
    "state.warning",
    "state.danger",
}


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")
    sys.exit(1)


def hex_to_rgb(hex_color: str) -> tuple[float, float, float]:
    h = hex_color.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))


def srgb_to_linear(v: float) -> float:
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    r, g, b = hex_to_rgb(hex_color)
    r_l, g_l, b_l = srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)
    return 0.2126 * r_l + 0.7152 * g_l + 0.0722 * b_l


def contrast_ratio(c1: str, c2: str) -> float:
    l1 = relative_luminance(c1)
    l2 = relative_luminance(c2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def main() -> None:
    if len(sys.argv) != 2:
        fail("expected one argument: path to theme json")

    path = Path(sys.argv[1])
    if not path.exists():
        fail(f"file not found: {path}")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid json: {exc}")

    color = data.get("color")
    if not isinstance(color, dict):
        fail("theme.color must be an object")

    missing = sorted(REQUIRED_COLOR_KEYS - set(color.keys()))
    if missing:
        fail(f"missing required color keys: {', '.join(missing)}")

    for key, val in color.items():
        if key == "mask":
            continue
        if isinstance(val, str) and HEX_RE.match(val):
            continue
        fail(f"color '{key}' must be #RRGGBB")

    ratio = contrast_ratio(color["text.primary"], color["bg.level2"])
    if ratio < 4.5:
        fail(
            "contrast check failed: text.primary vs bg.level2 "
            f"ratio={ratio:.2f}, expected >=4.5"
        )

    print(f"[PASS] theme tokens valid; contrast(text.primary,bg.level2)={ratio:.2f}")


if __name__ == "__main__":
    main()
