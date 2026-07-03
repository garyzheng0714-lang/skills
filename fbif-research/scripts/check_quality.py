#!/usr/bin/env python3
"""
质量检查脚本 — 检查agent的第1-4步质量检查清单

用法：
    python3 scripts/check_quality.py <artifact_root> [--step 1|2|3|4|all]

输出：JSON格式的检查报告，包含通过/不通过和具体问题。
退出码：0=全部通过，1=有问题需修复。
"""
import sys
import json
import re
import argparse
from pathlib import Path
from collections import Counter


# 每个模块的最少URL数
MIN_URLS = {
    "m1": 4, "m2": 4, "m3": 4, "m11": 12, "m4": 3,
    "comp": 3, "m5": 4, "m6": 3, "m7": 2, "m8": 20, "m9": 5,
}


def load_inventory(root: Path) -> dict:
    inv_path = root / "source-inventory.json"
    if inv_path.exists():
        return json.loads(inv_path.read_text(encoding="utf-8"))
    return {"sources": []}


def check_step1(root: Path) -> dict:
    """检查搜索覆盖"""
    inv = load_inventory(root)
    sources = inv.get("sources", [])
    issues = []

    if not sources:
        return {"pass": False, "issues": ["source-inventory.json 为空，未发现任何URL"]}

    mod_counts = Counter(s.get("module", "other") for s in sources)

    for mod, min_count in MIN_URLS.items():
        actual = mod_counts.get(mod, 0)
        if actual < min_count:
            issues.append(f"模块 {mod}: 只有 {actual} 个URL，需要 ≥{min_count}")

    # Check language coverage
    langs = set(s.get("language", "") for s in sources)
    if len(langs) < 2:
        issues.append(f"语言覆盖不足：只有 {langs}，应至少覆盖品牌母语+英文")

    return {
        "pass": len(issues) == 0,
        "total_urls": len(sources),
        "by_module": dict(mod_counts),
        "languages": list(langs),
        "issues": issues,
    }


def check_step2(root: Path) -> dict:
    """检查抓取完整性"""
    sources_dir = root / "sources"
    issues = []
    stats = {"total": 0, "good": 0, "short": 0, "failed": 0, "total_chars": 0}

    if not sources_dir.exists():
        return {"pass": False, "issues": ["sources/ 目录不存在"]}

    for f in sorted(sources_dir.glob("*.md")):
        if f.name.startswith("batch_") or f.name.startswith("search"):
            continue
        stats["total"] += 1
        text = f.read_text(encoding="utf-8", errors="replace")
        stats["total_chars"] += len(text)

        if "FETCH FAILED" in text:
            stats["failed"] += 1
            continue

        # Check original text section length
        orig_match = re.search(r'## 原文\n(.*)', text, re.DOTALL)
        orig_len = len(orig_match.group(1).strip()) if orig_match else 0

        if orig_len < 200:
            stats["short"] += 1
            url_match = re.search(r'\*\*URL\*\*:\s*(.+)', text)
            url = url_match.group(1).strip() if url_match else f.name
            issues.append(f"内容过短 ({orig_len}字符): {url}")
        else:
            stats["good"] += 1

    if stats["total"] == 0:
        issues.append("sources/ 下没有任何 .md 文件")

    return {
        "pass": len(issues) == 0,
        **stats,
        "issues": issues,
    }


def check_step3(root: Path) -> dict:
    """检查翻译质量"""
    sources_dir = root / "sources"
    issues = []
    stats = {"total": 0, "translated": 0, "missing": 0, "zh_too_short": 0}

    for f in sorted(sources_dir.glob("*.md")):
        if f.name.startswith("batch_") or f.name.startswith("search"):
            continue
        stats["total"] += 1
        text = f.read_text(encoding="utf-8", errors="replace")

        has_zh = "## 中文翻译" in text
        if not has_zh:
            stats["missing"] += 1
            issues.append(f"缺少翻译: {f.name}")
            continue

        stats["translated"] += 1

        # Check translation length vs original
        zh_match = re.search(r'## 中文翻译\n(.*?)(?=\n## 原文|\Z)', text, re.DOTALL)
        orig_match = re.search(r'## 原文\n(.*)', text, re.DOTALL)
        zh_len = len(zh_match.group(1).strip()) if zh_match else 0
        orig_len = len(orig_match.group(1).strip()) if orig_match else 0

        # Skip check if it's a Chinese source (zh copied from orig)
        if zh_len > 0 and orig_len > 0 and zh_len < orig_len * 0.3:
            if "无需翻译" not in text:
                stats["zh_too_short"] += 1
                issues.append(f"翻译过短 (zh={zh_len}, orig={orig_len}): {f.name}")

    return {
        "pass": len(issues) == 0,
        **stats,
        "issues": issues,
    }


def check_step4(root: Path) -> dict:
    """最终核验"""
    issues = []
    report = root / "final" / "report.html"

    # Check report exists
    if not report.exists():
        issues.append("final/report.html 不存在")
        return {"pass": False, "issues": issues}

    html = report.read_text(encoding="utf-8", errors="replace")
    html_size = len(html)

    # Check total size (should be substantial)
    if html_size < 100000:
        issues.append(f"HTML文件太小 ({html_size:,} bytes)，内容可能不完整")

    # Check key elements exist
    checks = {
        "ft-module-section": "模块分区",
        "source-card": "来源卡片",
        "source-content-zh": "中文内容块",
        "source-content-en": "英文内容块",
        "btn-copy-module": "复制本模块按钮",
        "langToggle": "语言切换",
        "data-title-zh": "中文标题属性",
        "toc-item-h3": "两级目录子项",
    }
    for key, label in checks.items():
        if key not in html:
            issues.append(f"缺少 {label} ({key})")

    # Count source cards
    card_count = html.count('class="source-card"')

    # Check inventory stats
    inv = load_inventory(root)
    total_chars = sum(s.get("chars", 0) for s in inv.get("sources", []))

    return {
        "pass": len(issues) == 0,
        "html_size": html_size,
        "source_cards": card_count,
        "inventory_total_chars": total_chars,
        "issues": issues,
    }


def main():
    parser = argparse.ArgumentParser(description="质量检查")
    parser.add_argument("artifact_root", help="项目根目录")
    parser.add_argument("--step", default="all", help="检查哪一步: 1/2/3/4/all")
    args = parser.parse_args()

    root = Path(args.artifact_root)
    results = {}
    all_pass = True

    step_funcs = {
        "1": ("搜索覆盖", check_step1),
        "2": ("抓取完整性", check_step2),
        "3": ("翻译质量", check_step3),
        "4": ("最终核验", check_step4),
    }

    steps = ["1", "2", "3", "4"] if args.step == "all" else [args.step]

    for step in steps:
        if step not in step_funcs:
            continue
        name, func = step_funcs[step]
        result = func(root)
        results[f"step{step}_{name}"] = result
        if not result["pass"]:
            all_pass = False

    # Print report
    print(f"\n{'='*55}")
    print(f"  质量检查报告: {root}")
    print(f"{'='*55}\n")

    for key, result in results.items():
        status = "✓ 通过" if result["pass"] else "✗ 不通过"
        print(f"  {key}: {status}")
        if result.get("issues"):
            for issue in result["issues"][:10]:
                print(f"    - {issue}")
        # Print stats (exclude 'pass' and 'issues')
        for k, v in result.items():
            if k not in ("pass", "issues"):
                print(f"    {k}: {v}")
        print()

    print(f"{'='*55}")
    print(f"  总结: {'全部通过 ✓' if all_pass else '有问题需修复 ✗'}")
    print(f"{'='*55}\n")

    # Also output JSON for programmatic use
    json_path = root / "quality-report.json"
    json_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
