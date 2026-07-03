#!/usr/bin/env python3
"""
插入中文翻译到来源文件 — 标准化翻译位置和格式

用法：
    python3 scripts/add_translation.py <source_file> --translation-file /tmp/zh.md

    或通过stdin：
    echo "翻译内容..." | python3 scripts/add_translation.py <source_file>

    中文来源自动标记：
    python3 scripts/add_translation.py <source_file> --is-chinese

功能：
    1. 在"## 原文"前精确插入"## 中文翻译"段落
    2. 中文来源自动复制原文作为翻译内容
    3. 更新 source-inventory.json 的状态
"""
import sys
import re
import json
import argparse
from pathlib import Path


def insert_translation(filepath: Path, zh_content: str, is_chinese: bool = False):
    """在## 原文前插入## 中文翻译"""
    text = filepath.read_text(encoding="utf-8")

    # Already has translation?
    if "## 中文翻译" in text:
        print(json.dumps({"status": "skipped", "reason": "already_translated", "file": str(filepath)}))
        return

    # Find "## 原文" position
    match = re.search(r'\n(## 原文)\n', text)
    if not match:
        print(json.dumps({"status": "error", "reason": "no_original_section", "file": str(filepath)}))
        return

    if is_chinese:
        # Chinese source: copy original as translation
        orig_match = re.search(r'## 原文\n(.*)', text, re.DOTALL)
        zh_content = orig_match.group(1).strip() if orig_match else ""

    # Insert translation before "## 原文"
    insert_pos = match.start()
    translation_block = f"\n## 中文翻译\n\n{zh_content.strip()}\n\n---\n"
    new_text = text[:insert_pos] + translation_block + text[insert_pos:]

    filepath.write_text(new_text, encoding="utf-8")

    # Update inventory
    update_inventory(filepath)

    print(json.dumps({
        "status": "translated",
        "file": str(filepath),
        "zh_chars": len(zh_content),
    }, ensure_ascii=False))


def update_inventory(filepath: Path):
    """更新source-inventory.json中对应条目的状态"""
    # Walk up to find inventory
    for parent in [filepath.parent.parent, filepath.parent]:
        inv_path = parent / "source-inventory.json"
        if inv_path.exists():
            inv = json.loads(inv_path.read_text(encoding="utf-8"))
            for s in inv["sources"]:
                if s.get("id") == filepath.stem or s.get("file", "").endswith(filepath.name):
                    s["status"] = "translated"
                    s["has_translation"] = True
            inv_path.write_text(json.dumps(inv, ensure_ascii=False, indent=2))
            break


def main():
    parser = argparse.ArgumentParser(description="插入中文翻译")
    parser.add_argument("source_file", help="来源文件路径")
    parser.add_argument("--translation-file", help="翻译内容文件")
    parser.add_argument("--is-chinese", action="store_true", help="原文已是中文，无需翻译")
    args = parser.parse_args()

    filepath = Path(args.source_file)
    if not filepath.exists():
        print(json.dumps({"status": "error", "reason": "file_not_found", "file": str(filepath)}))
        sys.exit(1)

    if args.is_chinese:
        insert_translation(filepath, "", is_chinese=True)
    elif args.translation_file:
        zh = Path(args.translation_file).read_text(encoding="utf-8")
        insert_translation(filepath, zh)
    else:
        zh = sys.stdin.read()
        insert_translation(filepath, zh)


if __name__ == "__main__":
    main()
