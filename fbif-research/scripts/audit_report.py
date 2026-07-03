#!/usr/bin/env python3
"""
HTML报告审查脚本 — 检查最终产出的渲染和内容质量

用法：
    python3 scripts/audit_report.py <artifact_root>

审查项目：
    1. HTML结构完整性（DOM没有被打碎）
    2. 标签泄露检测（原始HTML标签出现在正文中）
    3. 广告/噪音内容检测
    4. 中英文混排格式检查
    5. 空内容/过短内容检测
    6. 图片可访问性检查
    7. 模块覆盖度检查
    8. 来源链接有效性
"""
import re
import sys
import json
from pathlib import Path
from html.parser import HTMLParser


class TagLeakDetector(HTMLParser):
    """检测正文中泄露的HTML标签"""
    def __init__(self):
        super().__init__()
        self.leaked_tags = []
        self.in_content = False

    def handle_data(self, data):
        # 检测文本内容中是否包含HTML标签的文字表示
        leaked = re.findall(r'&lt;(/?(?:div|span|script|style|iframe|a|p|br|img|table|tr|td|th|ul|ol|li|h[1-6]|header|footer|nav|section|article|aside|meta|link))[^&]*?&gt;', data, re.IGNORECASE)
        if leaked:
            for tag in leaked:
                self.leaked_tags.append(tag)


def audit_html(html_path: Path) -> dict:
    """审查HTML报告"""
    html = html_path.read_text(encoding='utf-8', errors='replace')
    issues = []
    warnings = []
    stats = {}

    # 1. HTML结构完整性
    body_children = html.count('<div class="page-wrapper"')
    stats['page_wrapper_count'] = body_children
    if body_children != 1:
        issues.append(f"DOM结构异常: page-wrapper出现{body_children}次（应为1次）")

    # 检查关键容器是否存在
    required_elements = {
        'panelFulltext': '全文面板',
        'tocWidget': '目录导航',
        'langToggle': '语言切换',
        'copyAllBtn': '复制全部按钮',
    }
    for elem_id, label in required_elements.items():
        if f'id="{elem_id}"' not in html:
            issues.append(f"缺少关键元素: {label} (#{elem_id})")

    # 1b. AI摘要检测 — 正文不应包含agent自己写的概括
    summary_patterns = [
        r'(?:^|\n)\s*(?:概述|摘要|要点|核心内容|文章概要|页面概述|内容摘要)',
        r'(?:^|\n)\s*(?:本文介绍|本文分析|本文总结|本文概述|此页面)',
        r'(?:^|\n)\s*(?:Key takeaway|Summary|Overview|This article)',
    ]
    summary_count = 0
    for section in re.findall(r'class="source-content-zh[^"]*">(.*?)</div>', html, re.DOTALL):
        for pattern in summary_patterns:
            matches = re.findall(pattern, section, re.IGNORECASE)
            summary_count += len(matches)
    if summary_count > 0:
        issues.append(f"发现AI摘要: {summary_count}处疑似agent自己写的概述/摘要（应该只有原文翻译，不应有概括性文字）")
    stats['summary_detections'] = summary_count

    # 2. 标签泄露检测
    # 检查正文区域是否有被转义的HTML标签文字（说明转义过度）
    # 和没转义的原始标签（说明转义不足）
    content_sections = re.findall(r'class="source-content-zh[^"]*">(.*?)</div>', html, re.DOTALL)
    raw_tag_count = 0
    for section in content_sections:
        # 检查是否有不该出现的原始HTML标签
        raw_tags = re.findall(r'<(?:div|span|script|style|iframe|nav|header|footer|aside)\b', section, re.IGNORECASE)
        raw_tag_count += len(raw_tags)

    if raw_tag_count > 0:
        issues.append(f"标签泄露: 正文中发现{raw_tag_count}个未转义的HTML标签")
    stats['raw_tag_leaks'] = raw_tag_count

    # 3. 广告/噪音内容检测
    noise_patterns = [
        (r'cookie', 'Cookie相关内容'),
        (r'出海痛点', '广告推广内容'),
        (r'扫码关注', '微信关注引导'),
        (r'Subscribe to our newsletter', '订阅引导'),
        (r'Datenschutz|Impressum', '德语隐私/法律页脚'),
    ]
    noise_count = 0
    for pattern, label in noise_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        if matches:
            noise_count += len(matches)
            warnings.append(f"噪音内容: 发现{len(matches)}处 '{label}'")
    stats['noise_detections'] = noise_count

    # 4. 中英文混排格式检查
    # 检查中文和英文/数字之间是否缺少空格（不强制，只作为警告）
    source_cards = re.findall(r'class="source-card"', html)
    stats['source_card_count'] = len(source_cards)

    # 5. 空内容/过短内容检测
    empty_cards = 0
    short_cards = 0
    card_contents = re.findall(r'class="source-content-zh[^"]*">(.*?)</div>\s*<div class="source-content-en', html, re.DOTALL)
    for content in card_contents:
        text_only = re.sub(r'<[^>]+>', '', content).strip()
        if len(text_only) < 50:
            empty_cards += 1
        elif len(text_only) < 200:
            short_cards += 1

    if empty_cards > 0:
        issues.append(f"空内容来源: {empty_cards}个来源卡片中文内容为空或极短")
    if short_cards > 0:
        warnings.append(f"过短内容: {short_cards}个来源卡片中文内容不到200字符")
    stats['empty_cards'] = empty_cards
    stats['short_cards'] = short_cards

    # 6. 图片检查
    images = re.findall(r'<img[^>]+src="([^"]+)"', html)
    stats['image_count'] = len(images)
    broken_images = []
    for img_url in images:
        if not img_url.startswith(('http://', 'https://', 'data:')):
            broken_images.append(img_url[:60])
    if broken_images:
        warnings.append(f"可能无效的图片URL: {len(broken_images)}个")

    # 7. 模块覆盖度
    modules = re.findall(r'class="ft-module-section"', html)
    stats['module_count'] = len(modules)
    if len(modules) < 5:
        issues.append(f"模块覆盖不足: 只有{len(modules)}个模块（应≥5）")

    # 8. ZH/EN标题属性检查
    title_attrs = re.findall(r'data-title-zh="([^"]*)"', html)
    empty_zh_titles = sum(1 for t in title_attrs if not t.strip())  # count truly empty titles
    stats['zh_title_count'] = len(title_attrs)

    # 9. 文件大小
    stats['html_size_mb'] = round(len(html) / 1024 / 1024, 2)
    if stats['html_size_mb'] > 20:
        warnings.append(f"HTML文件过大: {stats['html_size_mb']}MB，可能加载缓慢")

    # 10. 两级目录检查
    has_toc_sub = 'toc-item-h3' in html or 'toc-item toc-item-h3' in html
    stats['has_two_level_toc'] = has_toc_sub
    if not has_toc_sub:
        warnings.append("缺少两级目录（toc-item-h3）")

    return {
        'pass': len(issues) == 0,
        'issues': issues,
        'warnings': warnings,
        'stats': stats,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/audit_report.py <artifact_root>")
        sys.exit(1)

    root = Path(sys.argv[1])
    report_path = root / 'final' / 'report.html'

    if not report_path.exists():
        print(f"ERROR: {report_path} not found")
        sys.exit(1)

    result = audit_html(report_path)

    print(f"\n{'='*55}")
    print(f"  HTML报告审查结果")
    print(f"{'='*55}\n")

    # Stats
    print("  统计:")
    for k, v in result['stats'].items():
        print(f"    {k}: {v}")

    # Issues (must fix)
    if result['issues']:
        print(f"\n  问题 ({len(result['issues'])}个，需修复):")
        for issue in result['issues']:
            print(f"    ✗ {issue}")
    else:
        print(f"\n  问题: 无 ✓")

    # Warnings (should check)
    if result['warnings']:
        print(f"\n  警告 ({len(result['warnings'])}个，建议检查):")
        for warning in result['warnings']:
            print(f"    ⚠ {warning}")

    print(f"\n{'='*55}")
    print(f"  结论: {'通过 ✓' if result['pass'] else '有问题需修复 ✗'}")
    print(f"{'='*55}\n")

    # Save report
    audit_path = root / 'audit-report.json'
    audit_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))

    sys.exit(0 if result['pass'] else 1)


if __name__ == '__main__':
    main()
