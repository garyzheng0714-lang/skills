#!/usr/bin/env python3
"""
内容清洗脚本 — 去除抓取内容中的非正文噪音

用法：
    python3 scripts/clean_content.py <artifact_root>

清洗规则（确定性，不依赖AI判断）：
    1. 去掉导航面包屑（"首页 > 资讯 > 正文"）
    2. 去掉社交分享按钮（"分享到微信/微博/QQ"）
    3. 去掉Cookie/隐私横幅
    4. 去掉广告标记（"推广"、"广告"、"AD"、"sponsored"）
    5. 去掉网站通用页脚（"关于我们 | 联系我们 | 隐私政策"）
    6. 去掉微信动图/表情包URL
    7. 去掉相关文章推荐（"你可能还喜欢"、"Related Articles"）
    8. 去掉评论区内容
    9. 去掉连续空行（保留最多一个）
    10. 去掉Jina Reader插入的元数据噪音
"""
import re
import sys
import json
from pathlib import Path


# 要删除的整行模式（匹配到就删除该行）
LINE_PATTERNS = [
    # 面包屑导航
    r'^当前位置[：:]',
    r'^(首页|Home)\s*[>›»/]\s*',
    r'^\s*[>›»]\s*(资讯|新闻|文章|Article)',
    # 社交分享
    r'(分享到|Share to|Share on)\s*(微信|微博|QQ|Facebook|Twitter|LinkedIn|WhatsApp)',
    r'^(转发|收藏|点赞|喜欢|Like|Share|Bookmark)\s*$',
    r'^\s*\d+\s*(赞|喜欢|评论|收藏|转发|分享)\s*$',
    # Cookie/隐私
    r'(cookie|Cookie|COOKIE)',
    r'(Datenschutz|Privacy Policy|隐私政策|Impressum)',
    # 广告标记
    r'^\s*(推广|广告|AD|Sponsored|Anzeige|Werbung)\s*$',
    r'出海痛点很多',
    r'点击这里解决',
    r'点击(了解|查看)更多',
    # 页脚
    r'^(关于我们|联系我们|About Us|Contact)\s*\|',
    r'(版权所有|All Rights Reserved|©\s*\d{4})',
    r'^(ICP备案|京ICP|沪ICP|粤ICP)',
    # 微信/订阅
    r'(扫码关注|长按识别|微信扫一扫)',
    r'(订阅|Subscribe|Newsletter)',
    # 相关推荐
    r'^(相关文章|你可能还喜欢|Related|See Also|Weitere Artikel|Das könnte)',
    r'^(热门文章|热门推荐|Most Popular|Trending)',
    # 评论区标记
    r'^(发表评论|评论区|Comments|Leave a Reply|Kommentare)',
    r'^\d+\s*(条评论|comments)',
    # Jina Reader噪音
    r'^URL Source:',
    r'^Markdown Content:',
    r'^(Title|Published Time|Word Count):',
    # 空的markdown图片（alt为空且URL是微信动图域名）
    r'!\[\]\(https?://mmbiz\.qpic\.cn.*?tp=webp',
    r'!\[\]\(https?://mmbiz\.qpic\.cn.*?wx_fmt=gif',
    # 通用社交图标
    r'^\s*(📧|📱|🔗|👍|❤️|🎉)\s*$',
]

# 要删除的多行块（匹配到开始标记后，删除到空行或结束标记）
BLOCK_START_PATTERNS = [
    r'^#{1,3}\s*(相关文章|你可能还喜欢|Related Articles|See Also)',
    r'^#{1,3}\s*(评论|Comments|Kommentare)',
    r'^#{1,3}\s*(热门推荐|热门文章|Most Popular)',
]

# 微信动图/表情包图片URL模式（直接删除）
WECHAT_GIF_PATTERNS = [
    r'!\[.*?\]\(https?://mmbiz\.qpic\.cn/[^\)]*?wx_fmt=gif[^\)]*?\)',
    r'!\[.*?\]\(https?://mmbiz\.qpic\.cn/[^\)]*?tp=webp[^\)]*?\)',
    r'!\[Image\s*\d*\]\(https?://res\.wx\.qq\.com/[^\)]*?\)',
]


def clean_text(text: str) -> str:
    """清洗单个文件的内容"""
    lines = text.split('\n')
    cleaned = []
    skip_block = False
    prev_empty = False

    for line in lines:
        stripped = line.strip()

        # 跳过块级内容（如"相关文章"标题后的推荐列表）
        if skip_block:
            if not stripped:
                skip_block = False
                continue
            continue

        # 检查是否是块级开始
        block_match = False
        for pattern in BLOCK_START_PATTERNS:
            if re.search(pattern, stripped, re.IGNORECASE):
                skip_block = True
                block_match = True
                break
        if block_match:
            continue

        # 检查是否匹配行级删除模式
        line_match = False
        for pattern in LINE_PATTERNS:
            if re.search(pattern, stripped, re.IGNORECASE):
                line_match = True
                break
        if line_match:
            continue

        # 去掉微信动图
        for pattern in WECHAT_GIF_PATTERNS:
            line = re.sub(pattern, '', line)

        stripped = line.strip()

        # 合并连续空行
        if not stripped:
            if prev_empty:
                continue
            prev_empty = True
        else:
            prev_empty = False

        cleaned.append(line)

    # 后处理：删除连续短链接列表（导航菜单特征）
    # 检测连续5行以上都是"- [短文本](url)"或纯短链接文本的块
    final = []
    nav_buffer = []

    def is_nav_line(s):
        s = s.strip()
        if not s:
            return False
        # "- [text](url)" 且文本≤15字符
        m = re.match(r'^[-*]\s*\[(.{1,15})\]\(.+\)$', s)
        if m:
            return True
        # "- 短文本" 纯列表项且≤10字符
        m = re.match(r'^[-*]\s*(.{1,10})$', s)
        if m:
            return True
        return False

    for line in cleaned:
        if is_nav_line(line):
            nav_buffer.append(line)
        else:
            if len(nav_buffer) >= 5:
                # 连续5行以上的短链接列表 = 导航菜单，丢弃
                pass
            else:
                final.extend(nav_buffer)
            nav_buffer = []
            final.append(line)

    # 处理末尾
    if len(nav_buffer) < 5:
        final.extend(nav_buffer)

    return '\n'.join(final)


def clean_source_file(filepath: Path) -> dict:
    """清洗一个来源文件"""
    text = filepath.read_text(encoding='utf-8', errors='replace')
    original_len = len(text)

    # 分段处理：只清洗"## 中文翻译"和"## 原文"的内容
    parts = re.split(r'(## 中文翻译|## 原文)', text)
    cleaned_parts = []
    for i, part in enumerate(parts):
        if i == 0:
            # 元数据头部，不清洗
            cleaned_parts.append(part)
        elif part in ('## 中文翻译', '## 原文'):
            cleaned_parts.append(part)
        else:
            cleaned_parts.append(clean_text(part))

    cleaned_text = ''.join(cleaned_parts)
    cleaned_len = len(cleaned_text)

    if cleaned_len != original_len:
        filepath.write_text(cleaned_text, encoding='utf-8')

    return {
        'file': filepath.name,
        'original': original_len,
        'cleaned': cleaned_len,
        'removed': original_len - cleaned_len,
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/clean_content.py <artifact_root>")
        sys.exit(1)

    root = Path(sys.argv[1])
    sources_dir = root / 'sources'

    if not sources_dir.exists():
        print("ERROR: sources/ directory not found")
        sys.exit(1)

    total_removed = 0
    cleaned_count = 0
    results = []

    for f in sorted(sources_dir.glob('*.md')):
        if f.name.startswith('batch_') or f.name.startswith('search'):
            continue
        result = clean_source_file(f)
        results.append(result)
        if result['removed'] > 0:
            cleaned_count += 1
            total_removed += result['removed']
            print(f"  CLEANED: {result['file']} (-{result['removed']} chars)")

    print(f"\n{'='*50}")
    print(f"  清洗完成: {cleaned_count} 篇被清理")
    print(f"  共删除 {total_removed:,} 字符噪音内容")
    print(f"{'='*50}")

    # Save report
    report_path = root / 'clean-report.json'
    report_path.write_text(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
