#!/usr/bin/env python3
"""验证调研产物完整性。全部通过才允许写回 Bitable。

用法：
    python3 validate_completion.py {artifact_root}

退出码：
    0 = 通过
    1 = 不通过（输出具体原因）
"""
import sys, json, re
from pathlib import Path

def main():
    if len(sys.argv) < 2:
        print("用法: python3 validate_completion.py <artifact_root>", file=sys.stderr)
        sys.exit(1)

    root = Path(sys.argv[1])
    errors = []
    manifest = None
    source_count = 0
    total = 0
    zh = 0

    # 1. manifest.json 存在且可解析
    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        errors.append("manifest.json 不存在")
    else:
        try:
            manifest = json.loads(manifest_path.read_text())
        except json.JSONDecodeError:
            errors.append("manifest.json 格式错误")

    # 2. source-inventory.json 存在且有内容
    inv_path = root / "source-inventory.json"
    if not inv_path.exists():
        errors.append("source-inventory.json 不存在")
    else:
        try:
            inv = json.loads(inv_path.read_text())
            source_count = len(inv) if isinstance(inv, list) else len(inv.get("sources", []))
            if source_count < 5:
                errors.append(f"来源数过少: {source_count} (最少5)")
        except json.JSONDecodeError:
            errors.append("source-inventory.json 格式错误")

    # 3. final/report.html 存在且有实质内容
    report = root / "final" / "report.html"
    if not report.exists():
        errors.append("final/report.html 不存在")
    else:
        html = report.read_text(encoding="utf-8", errors="ignore")
        # Strip script/style blocks first, then tags
        html_clean = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
        text = re.sub(r"<[^>]+>", "", html_clean)
        total = len(text.strip())
        zh = len(re.findall(r"[\u4e00-\u9fff]", text))
        if total < 10000:
            errors.append(f"报告总字数过少: {total:,} (最少10,000)")
        if zh < 3000:
            errors.append(f"中文字数过少: {zh:,} (最少3,000)")

    # 4. sources/ 目录有文件（支持 slug 命名和 src-*.md 两种格式）
    sources_dir = root / "sources"
    if sources_dir.exists():
        src_files = list(sources_dir.glob("*.md"))
        if len(src_files) < 5:
            errors.append(f"来源文件过少: {len(src_files)} (最少5)")
    else:
        errors.append("sources/ 目录不存在")

    # 5. manifest 中有 report_url（说明已部署）
    if manifest and not manifest.get("report_url"):
        errors.append("manifest.json 中缺少 report_url（未部署?）")

    # 输出结果
    if errors:
        print("❌ 验证不通过:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        # 输出统计
        stats = {"total_words": total, "zh_words": zh, "source_count": source_count}
        print(f"✓ 验证通过 | 总字数: {total:,} | 中文: {zh:,} | 来源: {source_count}")
        # 输出 JSON 供 runner 解析
        print(f"STATS:{json.dumps(stats)}")
        sys.exit(0)

if __name__ == "__main__":
    main()
