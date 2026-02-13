#!/usr/bin/env python3
"""
Simulate i18n text expansion for UI copy checks.

Usage:
  python3 scripts/simulate_i18n_expansion.py "Create" --locale de-DE
"""

from __future__ import annotations

import argparse

FACTORS = {
    "en-US": 1.0,
    "de-DE": 1.35,
    "fr-FR": 1.3,
    "ru-RU": 1.25,
    "es-ES": 1.25,
    "th-TH": 1.2,
    "vi-VN": 1.2,
    "ar-AE": 1.3,
}


def expand_text(text: str, factor: float) -> str:
    if factor <= 1.0:
        return text
    target_len = int(len(text) * factor)
    if target_len <= len(text):
        return text
    pad = " ".join([text] * ((target_len // max(len(text), 1)) + 1))
    return pad[:target_len]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("text")
    parser.add_argument("--locale", default="de-DE")
    args = parser.parse_args()

    factor = FACTORS.get(args.locale, 1.3)
    expanded = expand_text(args.text, factor)
    print(expanded)
    print(f"[info] locale={args.locale} factor={factor} original={len(args.text)} expanded={len(expanded)}")


if __name__ == "__main__":
    main()
