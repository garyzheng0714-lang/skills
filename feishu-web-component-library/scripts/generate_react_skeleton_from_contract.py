#!/usr/bin/env python3
"""
Generate React component skeletons from component contracts JSON.

Usage:
  python3 scripts/generate_react_skeleton_from_contract.py \
    --contracts assets/templates/component-contracts.json \
    --output /tmp/react-skeleton \
    --overwrite
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


EVENT_PROP_OVERRIDES = {
    "click": "onClick",
    "focus": "onFocus",
    "blur": "onBlur",
    "keydown": "onKeyDown",
    "keyup": "onKeyUp",
    "input": "onInput",
    "change": "onChange",
    "clear": "onClear",
    "toggle": "onToggle",
    "open": "onOpen",
    "close": "onClose",
    "confirm": "onConfirm",
    "cancel": "onCancel",
}


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    sys.exit(1)


def to_ts_literal(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        return "[" + ", ".join(to_ts_literal(v) for v in value) + "]"
    if isinstance(value, dict):
        body = ", ".join(f"{k}: {to_ts_literal(v)}" for k, v in value.items())
        return "{ " + body + " }"
    return "undefined"


def event_to_prop_name(event_name: str) -> str:
    if event_name in EVENT_PROP_OVERRIDES:
        return EVENT_PROP_OVERRIDES[event_name]
    if re.search(r"[^A-Za-z0-9]", event_name):
        chunks = [c for c in re.split(r"[^A-Za-z0-9]+", event_name) if c]
        return "on" + "".join(c[:1].upper() + c[1:] for c in chunks)
    return "on" + event_name[:1].upper() + event_name[1:]


def sanitize_component_name(raw: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9_]", "", raw)
    if not clean:
        fail(f"invalid component name: {raw!r}")
    if clean[0].isdigit():
        clean = f"Comp{clean}"
    return clean


def generate_interface_props(
    component_name: str,
    props_spec: dict[str, Any],
    events: list[str],
) -> str:
    lines: list[str] = []
    for prop_name, meta in props_spec.items():
        type_expr = "unknown"
        comment = None
        if isinstance(meta, dict):
            type_expr = str(meta.get("type", "unknown"))
            if meta.get("notes"):
                comment = str(meta["notes"])
        elif isinstance(meta, str):
            type_expr = meta
        if comment:
            lines.append(f"  /** {comment} */")
        lines.append(f"  {prop_name}?: {type_expr};")

    event_props = [event_to_prop_name(e) for e in events]
    for idx, event_prop in enumerate(event_props):
        src_event = events[idx]
        lines.append(f"  /** from contract event: {src_event} */")
        lines.append(f"  {event_prop}?: (...args: any[]) => void;")

    lines.append("  className?: string;")
    lines.append("  style?: React.CSSProperties;")
    lines.append("  children?: React.ReactNode;")
    return "\n".join(lines)


def generate_defaults(props_spec: dict[str, Any]) -> tuple[str, list[str]]:
    default_lines: list[str] = []
    prop_names: list[str] = []
    for prop_name, meta in props_spec.items():
        if isinstance(meta, dict) and "default" in meta:
            default_lines.append(f"  {prop_name}: {to_ts_literal(meta['default'])},")
            prop_names.append(prop_name)
    return "\n".join(default_lines), prop_names


def generate_component_file(
    component_name: str,
    component_spec: dict[str, Any],
) -> str:
    description = str(component_spec.get("description", "")).strip()
    props_spec = component_spec.get("props", {})
    if not isinstance(props_spec, dict):
        props_spec = {}
    events = component_spec.get("events", [])
    if not isinstance(events, list):
        events = []
    states = component_spec.get("states", [])
    if not isinstance(states, list):
        states = []

    interface_name = f"{component_name}Props"
    state_type_name = f"{component_name}State"

    interface_body = generate_interface_props(component_name, props_spec, events)
    defaults_body, _ = generate_defaults(props_spec)
    state_union = " | ".join(json.dumps(str(s), ensure_ascii=False) for s in states) or "never"
    state_list = ", ".join(json.dumps(str(s), ensure_ascii=False) for s in states)

    lines: list[str] = []
    lines.append("import React from 'react';")
    lines.append("")
    if description:
        lines.append(f"/** {description} */")
    lines.append(f"export interface {interface_name} {{")
    lines.append(interface_body)
    lines.append("}")
    lines.append("")
    lines.append(f"export type {state_type_name} = {state_union};")
    lines.append(f"export const {component_name.upper()}_STATES = [{state_list}] as const;")
    lines.append("")
    if defaults_body:
        lines.append(f"export const {component_name}Defaults = {{")
        lines.append(defaults_body)
        lines.append(f"}} as const satisfies Partial<{interface_name}>;")
    else:
        lines.append(f"export const {component_name}Defaults = {{}} as const satisfies Partial<{interface_name}>;")
    lines.append("")
    lines.append(f"export function {component_name}(props: {interface_name}) {{")
    lines.append(f"  const merged = {{ ...{component_name}Defaults, ...props }};")
    lines.append("  const { className, style, children } = merged;")
    lines.append("")
    lines.append("  return (")
    lines.append(f"    <div data-component=\"{component_name}\" className={{className}} style={{style}}>")
    lines.append(f"      {{children ?? '{component_name}'}}")
    lines.append("    </div>")
    lines.append("  );")
    lines.append("}")
    lines.append("")
    lines.append(f"export default {component_name};")
    lines.append("")
    return "\n".join(lines)


def write_index(output_dir: Path, component_names: list[str]) -> None:
    exports = [f"export * from './{name}';" for name in component_names]
    exports.append("")
    exports.append(f"export const GENERATED_COMPONENTS = {json.dumps(component_names, ensure_ascii=False)} as const;")
    exports.append("")
    (output_dir / "index.ts").write_text("\n".join(exports), encoding="utf-8")


def load_contracts(path: Path) -> dict[str, Any]:
    if not path.exists():
        fail(f"contracts file not found: {path}")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"invalid json in contracts file: {exc}")
    if not isinstance(data, dict):
        fail("contracts root must be an object")
    components = data.get("components")
    if not isinstance(components, dict) or not components:
        fail("contracts must contain non-empty 'components' object")
    return components


def parse_components_arg(raw: str | None, available: list[str]) -> list[str]:
    if not raw:
        return available
    selected = [s.strip() for s in raw.split(",") if s.strip()]
    unknown = [s for s in selected if s not in available]
    if unknown:
        fail(f"unknown components: {', '.join(unknown)}")
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--contracts", required=True, help="path to component-contracts.json")
    parser.add_argument("--output", required=True, help="directory for generated React skeletons")
    parser.add_argument(
        "--components",
        help="optional comma-separated component names to generate; default generates all",
    )
    parser.add_argument("--overwrite", action="store_true", help="overwrite existing component files")
    args = parser.parse_args()

    contracts_path = Path(args.contracts).resolve()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    components_spec = load_contracts(contracts_path)
    available_names = sorted(components_spec.keys())
    selected_names = parse_components_arg(args.components, available_names)

    generated: list[str] = []
    for raw_name in selected_names:
        safe_name = sanitize_component_name(raw_name)
        file_path = output_dir / f"{safe_name}.tsx"
        if file_path.exists() and not args.overwrite:
            print(f"[SKIP] {safe_name}.tsx already exists (use --overwrite)")
            continue
        content = generate_component_file(safe_name, components_spec[raw_name])
        file_path.write_text(content, encoding="utf-8")
        generated.append(safe_name)
        print(f"[OK] generated {file_path}")

    if generated:
        write_index(output_dir, generated)
        print(f"[OK] generated {output_dir / 'index.ts'}")
    else:
        print("[WARN] no files generated")


if __name__ == "__main__":
    main()
