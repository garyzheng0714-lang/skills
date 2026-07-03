#!/usr/bin/env python3
"""
保存抓取的来源文件 — 标准化文件名和格式

用法：
    python3 scripts/save_source.py <artifact_root> \
      --url "https://example.com/article" \
      --title "Article Title" \
      --type "Official" \
      --module "m1" \
      --language "de" \
      --content-file /tmp/fetched_content.md

    或通过stdin传入内容：
    echo "article content..." | python3 scripts/save_source.py <artifact_root> \
      --url "https://..." --title "..." --type "Official" --module "m1" --language "de"

功能：
    1. 标准化文件名（标题→slug，≤60字符）
    2. 写入标准格式的Markdown文件
    3. 自动更新 source-inventory.json
    4. 返回保存路径
"""
import sys
import json
import re
import argparse
import unicodedata
from pathlib import Path
from datetime import date


def slugify(title: str, max_len: int = 60) -> str:
    """将标题转为文件名slug"""
    # Normalize unicode
    title = unicodedata.normalize('NFKD', title)
    # Remove non-alphanumeric (keep CJK, letters, digits, spaces, hyphens)
    slug = re.sub(r'[^\w\s-]', '', title)
    # Replace whitespace with hyphens
    slug = re.sub(r'[\s_]+', '-', slug.strip())
    # Remove consecutive hyphens
    slug = re.sub(r'-+', '-', slug).strip('-')
    # Truncate
    if len(slug) > max_len:
        slug = slug[:max_len].rstrip('-')
    return slug or 'untitled'


def main():
    parser = argparse.ArgumentParser(description="保存来源文件")
    parser.add_argument("artifact_root", help="项目根目录")
    parser.add_argument("--url", required=True, help="原始URL")
    parser.add_argument("--title", required=True, help="文章标题")
    parser.add_argument("--type", default="Article", help="来源类型: Official/Interview/Report/Media/etc")
    parser.add_argument("--module", default="other", help="所属模块: m1/m2/m3/.../m9/comp")
    parser.add_argument("--language", default="unknown", help="语言: de/en/zh/ja/...")
    parser.add_argument("--content-file", help="内容文件路径（不传则从stdin读取）")
    args = parser.parse_args()

    root = Path(args.artifact_root)
    sources_dir = root / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)

    # Read content
    if args.content_file:
        content = Path(args.content_file).read_text(encoding="utf-8")
    else:
        content = sys.stdin.read()

    # Generate filename
    slug = slugify(args.title)
    filepath = sources_dir / f"{slug}.md"

    # Handle collision
    counter = 2
    while filepath.exists():
        filepath = sources_dir / f"{slug}-{counter}.md"
        counter += 1

    # Write standardized format
    today = date.today().isoformat()
    md_content = f"""# {args.title}

**URL**: {args.url}
**抓取时间**: {today}
**类型**: {args.type}

---

## 原文

{content.strip()}
"""
    filepath.write_text(md_content, encoding="utf-8")

    # Update source-inventory.json
    inventory_path = root / "source-inventory.json"
    if inventory_path.exists():
        inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    else:
        inventory = {"sources": []}

    # Check if URL already exists
    existing_urls = {s.get("url") for s in inventory["sources"]}
    if args.url not in existing_urls:
        inventory["sources"].append({
            "id": filepath.stem,
            "url": args.url,
            "title": args.title,
            "module": args.module,
            "language": args.language,
            "source_type": args.type,
            "file": str(filepath),
            "chars": len(md_content),
            "status": "fetched",
            "has_translation": False,
        })
        inventory_path.write_text(json.dumps(inventory, ensure_ascii=False, indent=2))

    # Output result
    print(json.dumps({
        "status": "saved",
        "file": str(filepath),
        "slug": filepath.stem,
        "chars": len(md_content),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
