#!/usr/bin/env python3
"""
FBIF Research Scaffold — 项目初始化脚手架

用法：
    python3 scripts/init.py <brand_name> <brand_name_zh> [--output-dir <dir>]

示例：
    python3 scripts/init.py "Taifun" "Taifun" --output-dir outputs/taifun
    python3 scripts/init.py "Oatly" "噢麦力"

功能：
    1. 创建标准目录结构
    2. 从skill包复制锁定版本的模板和脚本（不允许修改）
    3. 生成 manifest.json
    4. 生成空的 source-inventory.json
    5. 输出下一步操作指引

这个脚本确保每次调研的目录结构、模板、脚本完全一致。
agent 只需要往 sources/ 目录填充内容，不允许修改 scripts/ 和 templates/。
"""
import sys
import json
import shutil
import argparse
from pathlib import Path
from datetime import datetime


def main():
    parser = argparse.ArgumentParser(description="FBIF Research 项目初始化")
    parser.add_argument("brand_name", help="品牌英文名")
    parser.add_argument("brand_name_zh", help="品牌中文名")
    parser.add_argument("--output-dir", help="输出目录（默认: outputs/<brand_slug>）")
    parser.add_argument("--company", default="", help="公司全称")
    parser.add_argument("--country", default="", help="国家")
    parser.add_argument("--category", default="", help="品类")
    parser.add_argument("--one-liner", default="", help="一句话品牌描述")
    args = parser.parse_args()

    # Resolve paths
    skill_dir = Path(__file__).parent.parent  # scripts/ -> fbif-research/
    brand_slug = args.brand_name.lower().replace(" ", "-")

    if args.output_dir:
        output_dir = Path(args.output_dir)
    else:
        output_dir = skill_dir.parent / "outputs" / brand_slug

    # ---- Create directory structure ----
    dirs = [
        output_dir / "sources",
        output_dir / "final",
        output_dir / "scripts",
        output_dir / "templates",
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)

    # ---- Copy locked scripts (overwrite to ensure consistency) ----
    scripts_src = skill_dir / "scripts"
    scripts_dst = output_dir / "scripts"
    for script in scripts_src.glob("*.py"):
        shutil.copy2(script, scripts_dst / script.name)

    # ---- Copy locked templates (overwrite to ensure consistency) ----
    templates_src = skill_dir / "templates"
    templates_dst = output_dir / "templates"
    for tmpl in templates_src.glob("*.html"):
        shutil.copy2(tmpl, templates_dst / tmpl.name)

    # ---- Generate manifest.json ----
    manifest = {
        "brand": {
            "name": args.brand_name,
            "name_zh": args.brand_name_zh,
            "company": args.company or f"{args.brand_name} GmbH",
            "country": args.country or "Unknown",
            "core_category": args.category or "Food & Beverage",
        },
        "one_liner": args.one_liner or f"{args.brand_name_zh}品牌深度调研",
        "date": datetime.now().strftime("%Y.%m"),
        "download_url": "#",
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

    # ---- Generate empty source-inventory.json ----
    inventory_path = output_dir / "source-inventory.json"
    if not inventory_path.exists():
        inventory_path.write_text(json.dumps({"sources": []}, ensure_ascii=False, indent=2))

    # ---- Copy oss-config.json if exists in skill dir ----
    oss_config_src = skill_dir.parent / "outputs" / "oss-config.json"
    if not oss_config_src.exists():
        # Try from any existing project
        for existing in (skill_dir.parent / "outputs").glob("*/oss-config.json"):
            oss_config_src = existing
            break
    if oss_config_src.exists():
        shutil.copy2(oss_config_src, output_dir / "oss-config.json")

    # ---- Check dependencies ----
    deps_ok = True
    dep_notes = []

    # oss2
    try:
        import oss2
        dep_notes.append("oss2: ✓")
    except ImportError:
        dep_notes.append("oss2: ✗ (run: pip install oss2)")
        deps_ok = False

    # requests (for built-in Jina fallback)
    try:
        import requests
        dep_notes.append("requests: ✓")
    except ImportError:
        dep_notes.append("requests: ✗ (run: pip install requests)")
        deps_ok = False

    # x-reader (optional, enhances fetching)
    try:
        from x_reader.reader import UniversalReader
        dep_notes.append("x-reader: ✓ (微信/YouTube/B站 支持)")
    except ImportError:
        dep_notes.append("x-reader: - (可选, 内置Jina够用。如需微信/视频: pip install -e /path/to/x-reader)")

    # ---- Print summary ----
    print(f"""
{'='*55}
  FBIF Research 项目初始化完成
{'='*55}

  品牌: {args.brand_name} ({args.brand_name_zh})
  目录: {output_dir}

  目录结构:
    {output_dir}/
    ├── manifest.json           ← 品牌信息（已生成）
    ├── source-inventory.json   ← 来源清单（已生成，空）
    ├── oss-config.json         ← OSS配置（{'已复制' if (output_dir / 'oss-config.json').exists() else '需手动创建'}）
    ├── sources/                ← 原文Markdown（待填充）
    ├── scripts/                ← 锁定脚本（已复制，勿修改）
    │   ├── assemble_single.py
    │   ├── deploy_oss.py
    │   ├── init.py
    │   ├── jina_fetch.py
    │   └── share.py
    ├── templates/              ← 锁定模板（已复制，勿修改）
    │   ├── single-page-template.html
    │   └── appendix-template.html
    └── final/                  ← HTML报告（组装后生成）

  依赖检查:
    {chr(10).join('    ' + d for d in dep_notes)}

  下一步:
    {'开始调研第1步（搜索发现URL）' if deps_ok else '先安装缺失的依赖，然后开始调研'}

{'='*55}
""")


if __name__ == "__main__":
    main()
