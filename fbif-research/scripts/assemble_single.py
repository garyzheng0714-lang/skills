#!/usr/bin/env python3
"""
FBIF Research — Single-page HTML assembler
Version: v6.0

Usage:
    python assemble_single.py <artifact_root>

Output:
    {artifact_root}/final/report.html

Description:
    Reads all modules/*.md and sources/src-*.md files, assembles them into
    a single HTML page using templates/single-page-template.html.
    Embeds source file contents as JSON for interactive source reference modals.
    Generates dual-column fulltext view (Chinese translation + original).
"""

import base64
import json
import re
import sys
from collections import OrderedDict
from html import escape
from pathlib import Path
from urllib.parse import urlparse

# ========================
# Module definitions (order = display order)
# ========================
MODULES = [
    {"id": "m1",   "file": "m1_official.md",   "tag": "M1",   "title": "核心官方资料",       "phase": 1},
    {"id": "m2",   "file": "m2_history.md",     "tag": "M2",   "title": "品牌历史",           "phase": 1},
    {"id": "m3",   "file": "m3_data.md",        "tag": "M3",   "title": "关键数据与年报",     "phase": 1},
    {"id": "m11",  "file": "m11_founders.md",   "tag": "M11",  "title": "创始人与关键人物",   "phase": 2},
    {"id": "m4",   "file": "m4_category.md",    "tag": "M4",   "title": "品类背景",           "phase": 3},
    {"id": "comp", "file": "comp.md",           "tag": "COMP", "title": "竞争格局",           "phase": 3},
    {"id": "m5",   "file": "m5_4p.md",          "tag": "M5",   "title": "品牌4P",             "phase": 3},
    {"id": "m6",   "file": "m6_packaging.md",   "tag": "M6",   "title": "包装设计",           "phase": 3},
    {"id": "m7",   "file": "m7_consumer.md",    "tag": "M7",   "title": "消费者评价",         "phase": 3},
    {"id": "m8",   "file": "m8_interviews.md",  "tag": "M8",   "title": "深度访谈与深度文章", "phase": 4},
    {"id": "m9",   "file": "m9_latest.md",      "tag": "M9",   "title": "最新高层动态",       "phase": 5},
]

PHASE_NAMES = {
    1: "Phase 1",
    2: "Phase 2",
    3: "Phase 3",
    4: "Phase 4",
    5: "Phase 5",
}


# ========================
# Source file reader
# ========================
def build_sources_json(sources_dir: Path) -> dict:
    """Read all sources/*.md files and build a dict mapping source IDs
    to their metadata and content.

    Returns:
        dict: { "source-id": { "title": "...", "url": "...", "content": "..." }, ... }
    """
    sources = {}

    if not sources_dir.exists():
        print(f"  WARN: Sources directory not found: {sources_dir}")
        return sources

    src_files = sorted(sources_dir.glob("*.md"))
    print(f"\n  Reading {len(src_files)} source files from {sources_dir}")

    for src_path in src_files:
        try:
            content = src_path.read_text(encoding="utf-8")
        except Exception as e:
            print(f"  WARN: Failed to read {src_path.name}: {e}")
            continue

        # Extract source ID from filename (e.g. src-0001.md -> src-0001)
        src_id = src_path.stem  # "src-0001"

        # Extract title from first # heading
        title = src_id  # default fallback
        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        if title_match:
            title = title_match.group(1).strip()

        # Extract URL from **URL**: line
        url = ""
        url_match = re.search(r'\*\*URL\*\*\s*[:：]\s*(.+?)$', content, re.MULTILINE)
        if url_match:
            url = url_match.group(1).strip()

        # Reorder content: put Chinese translation first if it exists
        # Look for "## Chinese Translation" or "## 中文翻译" section
        zh_section = ""
        orig_section = ""
        zh_match = re.search(
            r'(##\s*(?:Chinese Translation|中文翻译)[^\n]*\n)(.*?)(?=\n##\s|\Z)',
            content, re.DOTALL | re.IGNORECASE
        )
        orig_match = re.search(
            r'(##\s*(?:Original Full Text|Original Full Text \(German\))[^\n]*\n)(.*?)(?=\n##\s|\Z)',
            content, re.DOTALL | re.IGNORECASE
        )
        if zh_match and orig_match:
            zh_text = zh_match.group(2).strip()
            orig_text = orig_match.group(2).strip()
            # Only reorder if Chinese section has real content (not just placeholder)
            if len(zh_text) > 100 and "pending" not in zh_text.lower():
                reordered = f"## 中文翻译\n\n{zh_text}\n\n---\n\n## 原文\n\n{orig_text}"
                # Keep header info (everything before first ##)
                header_match = re.match(r'(.*?)(?=\n##\s)', content, re.DOTALL)
                header = header_match.group(1).strip() if header_match else ""
                content = f"{header}\n\n{reordered}" if header else reordered

        sources[src_id] = {
            "title": title,
            "url": url,
            "content": content,
        }

    print(f"  Loaded {len(sources)} source files")
    return sources


# ========================
# Markdown to HTML converter
# ========================
def md_to_html(md_text: str) -> str:
    """Simple Markdown to HTML converter.

    Handles:
    - ## / ### headings -> sec-h / subsec-h
    - **bold** -> <strong>
    - [link](url) -> <a>
    - > blockquote -> <blockquote>
    - | table | -> <table>
    - Empty lines -> <p> breaks
    - Source lines (starting with source/来源) -> src-line
    - Source references 【来源：src-XXXX】 -> clickable src-ref links
    - Unordered lists (- item) -> <ul><li>
    - Ordered lists (1. item) -> <ol><li>
    - Images ![alt](url) -> <img>
    """
    lines = md_text.split("\n")
    html_parts = []
    in_table = False
    in_blockquote = False
    in_ul = False
    in_ol = False
    paragraph_buffer = []

    def flush_paragraph():
        nonlocal paragraph_buffer
        if paragraph_buffer:
            text = "\n".join(paragraph_buffer).strip()
            if text:
                text = process_inline(text)
                html_parts.append(f'<p>{text}</p>')
            paragraph_buffer = []

    def close_list():
        nonlocal in_ul, in_ol
        if in_ul:
            html_parts.append('</ul>')
            in_ul = False
        if in_ol:
            html_parts.append('</ol>')
            in_ol = False

    def process_inline(text):
        # First: escape any raw HTML tags in the source content to prevent DOM breakage
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")

        # Images — strip entirely (text-only report, no broken images)
        text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', '', text)
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # Links — validate URL protocol
        def _safe_link(m):
            label, url = m.group(1), m.group(2)
            if re.match(r'^\s*(javascript|data|vbscript):', url, re.IGNORECASE):
                return label
            return f'<a href="{url}" target="_blank" rel="noopener noreferrer">{label}</a>'
        text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', _safe_link, text)
        # Inline code
        text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
        # Source references: 【来源：src-XXXX, Title】 or 【来源：src-XXXX】
        text = convert_source_refs(text)
        return text

    for line in lines:
        stripped = line.strip()

        # Empty line: end paragraph/blockquote/table/list
        if not stripped:
            if in_blockquote:
                html_parts.append('</blockquote>')
                in_blockquote = False
            if in_table:
                html_parts.append('</tbody></table>')
                in_table = False
            close_list()
            flush_paragraph()
            continue

        # ## Heading
        if stripped.startswith("## ") and not stripped.startswith("### "):
            flush_paragraph()
            close_list()
            if in_table:
                html_parts.append('</tbody></table>')
                in_table = False
            title = process_inline(stripped[3:].strip())
            anchor = re.sub(r'[^a-zA-Z0-9\u4e00-\u9fff]', '-', stripped[3:].strip())[:40]
            html_parts.append(f'<h3 class="sec-h" id="{anchor}">{title}</h3>')
            continue

        if stripped.startswith("### "):
            flush_paragraph()
            close_list()
            if in_table:
                html_parts.append('</tbody></table>')
                in_table = False
            title = process_inline(stripped[4:].strip())
            html_parts.append(f'<h4 class="subsec-h">{title}</h4>')
            continue

        # # Top-level heading (usually module name, skip since in template)
        if stripped.startswith("# ") and not stripped.startswith("## "):
            continue

        # > Blockquote
        if stripped.startswith("> "):
            flush_paragraph()
            close_list()
            if not in_blockquote:
                html_parts.append('<blockquote>')
                in_blockquote = True
            html_parts.append(process_inline(stripped[2:]))
            continue
        elif in_blockquote:
            html_parts.append('</blockquote>')
            in_blockquote = False

        # Source line (standalone)
        if re.match(r'^(来源[：:]|Source:|出处[：:])', stripped):
            flush_paragraph()
            close_list()
            html_parts.append(f'<div class="src-line">{process_inline(stripped)}</div>')
            continue

        # Standalone source reference block: 【来源：...】
        if re.match(r'^【来源[：:]', stripped):
            flush_paragraph()
            close_list()
            html_parts.append(f'<div class="src-line">{process_inline(stripped)}</div>')
            continue

        # Table
        if stripped.startswith("|"):
            flush_paragraph()
            close_list()
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            # Separator row (|---|---|)
            if all(re.match(r'^[-:]+$', c) for c in cells):
                continue
            if not in_table:
                in_table = True
                html_parts.append('<table><thead><tr>')
                for c in cells:
                    html_parts.append(f'<th>{process_inline(c)}</th>')
                html_parts.append('</tr></thead><tbody>')
            else:
                html_parts.append('<tr>')
                for c in cells:
                    html_parts.append(f'<td>{process_inline(c)}</td>')
                html_parts.append('</tr>')
            continue
        elif in_table:
            html_parts.append('</tbody></table>')
            in_table = False

        # Unordered list (- item)
        ul_match = re.match(r'^[-*]\s+(.+)$', stripped)
        if ul_match:
            flush_paragraph()
            if in_ol:
                html_parts.append('</ol>')
                in_ol = False
            if not in_ul:
                html_parts.append('<ul>')
                in_ul = True
            html_parts.append(f'<li>{process_inline(ul_match.group(1))}</li>')
            continue

        # Ordered list (1. item)
        ol_match = re.match(r'^\d+\.\s+(.+)$', stripped)
        if ol_match:
            flush_paragraph()
            if in_ul:
                html_parts.append('</ul>')
                in_ul = False
            if not in_ol:
                html_parts.append('<ol>')
                in_ol = True
            html_parts.append(f'<li>{process_inline(ol_match.group(1))}</li>')
            continue

        # Close list if we hit non-list content
        if in_ul or in_ol:
            close_list()

        # Normal text
        paragraph_buffer.append(stripped)

    # Finalize
    if in_blockquote:
        html_parts.append('</blockquote>')
    if in_table:
        html_parts.append('</tbody></table>')
    close_list()
    flush_paragraph()

    return "\n".join(html_parts)


# Global footnote counter (reset per assembly run)
_footnote_counter = 0
_footnote_map = {}  # src_id -> footnote number


def convert_source_refs(text: str) -> str:
    """Convert source references to academic-style superscript footnotes.

    Patterns handled:
    - 【来源：src-0007, Title】 -> superscript N with hover tooltip
    - 【来源：src-0001；src-0002】 -> superscript N.M
    - 【来源：src-0007】 -> superscript N

    Each reference becomes:
    <sup class="src-ref" data-src="src-XXXX" title="Source Title">N</sup>
    """
    global _footnote_counter, _footnote_map

    def get_footnote_num(src_id):
        global _footnote_counter
        if src_id not in _footnote_map:
            _footnote_counter += 1
            _footnote_map[src_id] = _footnote_counter
        return _footnote_map[src_id]

    def replace_source_block(match):
        inner = match.group(1)
        parts = re.split(r'[；;]', inner)
        sups = []
        for part in parts:
            part = part.strip()
            src_match = re.match(r'(src-\d+)\s*(?:,\s*(.+))?', part)
            if src_match:
                src_id = src_match.group(1)
                title = src_match.group(2) or src_id
                num = get_footnote_num(src_id)
                sups.append(
                    f'<sup class="src-ref" data-src="{src_id}" '
                    f'title="{escape(title)}">{num}</sup>'
                )
        if sups:
            return '<span class="src-refs">' + ''.join(sups) + '</span>'
        return match.group(0)

    text = re.sub(r'【来源[：:](.+?)】', replace_source_block, text)
    return text


def reset_footnotes():
    """Reset footnote counter for a new assembly run."""
    global _footnote_counter, _footnote_map
    _footnote_counter = 0
    _footnote_map = {}


# ========================
# Utility functions
# ========================
def count_words(text: str):
    """Returns (total_chars, chinese_chars)."""
    clean = re.sub(r'<[^>]+>', '', text) if '<' in text else text
    total = len(clean.strip())
    zh = len(re.findall(r'[\u4e00-\u9fff]', clean))
    return total, zh


def format_word_count(words: int) -> str:
    """Format word count as X.Xk."""
    if words >= 1000:
        return f"{words / 1000:.1f}k"
    return str(words)


def extract_plain_text(md_text: str, max_chars: int = 100) -> str:
    """Extract first ~max_chars of plain text from markdown for preview tooltip."""
    # Remove markdown headings
    text = re.sub(r'^#+\s+', '', md_text, flags=re.MULTILINE)
    # Remove markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', text)
    # Remove table/blockquote markers
    text = re.sub(r'^\s*[>|]', '', text, flags=re.MULTILINE)
    # Remove source references
    text = re.sub(r'【来源[：:].+?】', '', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Truncate
    if len(text) > max_chars:
        text = text[:max_chars].rstrip() + "..."
    return text


def extract_domain(url: str) -> str:
    """Extract the domain from a URL for display."""
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split("/")[0]
        # Remove www. prefix
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return ""


def build_all_modules_html(modules_data: list) -> str:
    """Generate all module sections stacked vertically.

    Each module is wrapped in:
    <section id="module-{id}" class="module-section" data-preview="{first 100 chars}">
    """
    parts = []
    for m in modules_data:
        preview = escape(m.get("preview", ""), quote=True)
        wc = format_word_count(m["words"])

        parts.append(f'<section id="module-{m["id"]}" class="module-section" data-preview="{preview}">')
        parts.append('  <div class="module-header">')
        parts.append(f'    <span class="module-tag">{escape(m["tag"])}</span>')
        parts.append(f'    <span class="module-wc">{m["words"]:,} chars ({wc})</span>')
        parts.append(f'    <h2 class="module-title">{escape(m["title"])}</h2>')
        parts.append('  </div>')
        parts.append(f'  <div class="module-content">')
        parts.append(f'    {m["html_content"]}')
        parts.append(f'  </div>')
        parts.append('</section>')

    return "\n\n".join(parts)


def build_nav_items_html(modules_data: list) -> str:
    """Generate the sidebar navigation items HTML."""
    parts = []
    for m in modules_data:
        tag = escape(m["tag"])
        title = escape(m["title"])
        mid = m["id"]
        parts.append(
            f'<a href="#module-{mid}">'
            f'<span class="nav-tag">{tag}</span>{title}</a>'
        )
    # Always add appendix link
    parts.append('<a href="#module-appendix"><span class="nav-tag">REF</span>附录</a>')
    return "\n".join(parts)


def build_appendix_html(src_inv_path: Path, sources_json: dict) -> tuple:
    """Build appendix table HTML and return (html, source_count).

    Tries source-inventory.json first, falls back to sources_json data.
    """
    sources_list = []

    # Try reading the inventory file first
    if src_inv_path.exists():
        try:
            src_inv = json.loads(src_inv_path.read_text(encoding="utf-8"))
            sources_list = src_inv if isinstance(src_inv, list) else src_inv.get("sources", [])
        except Exception as e:
            print(f"  WARN: Failed to read source inventory: {e}")

    # If no inventory file, build from sources_json
    if not sources_list and sources_json:
        for src_id in sorted(sources_json.keys()):
            data = sources_json[src_id]
            sources_list.append({
                "id": src_id,
                "title": data.get("title", src_id),
                "url": data.get("url", ""),
                "platform": "--",
                "date": "--",
                "author": "--",
                "summary": "",
            })

    if not sources_list:
        return '<p style="color:var(--text-tertiary)">暂无来源数据。</p>', 0

    rows = []
    rows.append('<table class="appendix-table">')
    rows.append('<thead><tr>')
    rows.append('<th>编号</th><th>来源标题</th><th>原文链接</th>')
    rows.append('</tr></thead>')
    rows.append('<tbody>')

    for i, src in enumerate(sources_list, 1):
        src_id = src.get("id", f"src-{i:04d}")
        title = escape(src.get("title", src_id))
        url = src.get("url", "")
        link_html = (
            f'<a href="{escape(url)}" target="_blank" '
            f'style="color:var(--brand);word-break:break-all;font-size:12px">'
            f'{escape(url[:60])}{"..." if len(url) > 60 else ""}</a>'
        ) if url else "—"
        rows.append(
            f'<tr><td style="white-space:nowrap">'
            f'<sup class="src-ref" data-src="{escape(src_id)}" '
            f'title="{title}" style="cursor:pointer">{i}</sup></td>'
            f'<td>{title}</td>'
            f'<td>{link_html}</td></tr>'
        )

    rows.append('</tbody></table>')
    return "\n".join(rows), len(sources_list)


# ========================
# Fulltext HTML builder (NEW)
# ========================
def _split_zh_orig(content: str) -> tuple:
    """Split a source file's content into Chinese translation and original text.

    Looks for "## 中文翻译" / "## Chinese Translation" and
    "## 原文" / "## Original Full Text" sections.

    Returns:
        (zh_markdown, orig_markdown) — either may be empty string
    """
    zh_text = ""
    orig_text = ""

    # Try matching Chinese translation section (stops at "## 原文" or "## Original")
    zh_match = re.search(
        r'##\s*(?:Chinese Translation|中文翻译)[^\n]*\n(.*?)(?=\n##\s*(?:原文|Original)|\Z)',
        content, re.DOTALL | re.IGNORECASE
    )
    if zh_match:
        zh_text = zh_match.group(1).strip()

    # Try matching original text section (takes EVERYTHING after "## 原文" to end of file)
    orig_match = re.search(
        r'##\s*(?:Original Full Text|Original Full Text \(German\)|原文)[^\n]*\n(.*)',
        content, re.DOTALL | re.IGNORECASE
    )
    if orig_match:
        orig_text = orig_match.group(1).strip()

    # v10.0: If zh_text is just "无需翻译" placeholder, use orig_text as zh
    # (Chinese-language sources should show original text in ZH mode)
    if zh_text and ("无需翻译" in zh_text or len(zh_text) < 50) and orig_text:
        zh_text = orig_text

    return zh_text, orig_text


def _md_to_html_with_pcopy(md_text: str) -> str:
    """Convert markdown to HTML, adding per-paragraph copy buttons.

    Uses the main md_to_html converter but injects small copy icons into
    each <p> tag for the fulltext view.
    """
    if not md_text.strip():
        return '<p style="color:var(--text-tertiary)">暂无内容。</p>'

    html = md_to_html(md_text)

    # Inject copy icon into every <p> tag
    html = re.sub(
        r'<p>(.*?)</p>',
        r'<p>\1<span class="p-copy" title="复制此段">&#x2398;</span></p>',
        html,
        flags=re.DOTALL
    )

    return html


def build_fulltext_html(sources_json: dict, src_inv_path: Path = None) -> str:
    """Build the fulltext tab HTML v8.0 — single-column, language-switchable.

    Groups sources by module assignment. Each module becomes a section with:
    - Module header: tag, title, source count, character count, copy button
    - Source cards: single-column with ZH/EN content layers

    The language toggle in the template switches which content layer is visible.
    """
    if not sources_json:
        return '<p style="color:var(--text-tertiary)">暂无来源全文数据。</p>'

    # Try to load source inventory for module grouping
    module_map = {}  # src_id -> module info
    if src_inv_path and src_inv_path.exists():
        try:
            inv = json.loads(src_inv_path.read_text(encoding="utf-8"))
            inv_list = inv if isinstance(inv, list) else inv.get("sources", [])
            for item in inv_list:
                sid = item.get("id", "")
                if sid:
                    module_map[sid] = {
                        "module": item.get("module", ""),
                        "module_title": item.get("module_title", ""),
                    }
        except Exception as e:
            print(f"  WARN: Could not read source inventory for grouping: {e}")

    MODULE_TITLES = {
        "m1": "核心官方资料",
        "m2": "品牌历史",
        "m3": "关键数据与年报",
        "m11": "创始人与关键人物",
        "m4": "品类背景",
        "comp": "竞争格局",
        "m5": "品牌4P",
        "m6": "包装设计",
        "m7": "消费者评价",
        "m8": "深度访谈与深度文章",
        "m9": "最新高层动态",
    }

    MODULE_TAGS = {
        "m1": "M1", "m2": "M2", "m3": "M3", "m11": "M11",
        "m4": "M4", "comp": "COMP", "m5": "M5", "m6": "M6",
        "m7": "M7", "m8": "M8", "m9": "M9", "other": "OTHER",
    }

    # Build groups
    grouped = {}
    sorted_ids = sorted(sources_json.keys())
    for src_id in sorted_ids:
        mod = module_map.get(src_id, {}).get("module", "other")
        if mod not in grouped:
            grouped[mod] = []
        grouped[mod].append(src_id)

    module_parts = []
    total_cards = 0

    # Output in module order
    module_order = ["m1", "m2", "m3", "m11", "m4", "comp", "m5", "m6", "m7", "m8", "m9", "other"]
    for mod_key in module_order:
        if mod_key not in grouped:
            continue

        mod_title = MODULE_TITLES.get(mod_key, "其他来源")
        mod_tag = MODULE_TAGS.get(mod_key, mod_key.upper())
        mod_sources = grouped[mod_key]
        source_count = len(mod_sources)

        # Calculate total chars for this module
        mod_total_chars = 0
        card_htmls = []

        for src_id in mod_sources:
            src = sources_json[src_id]
            content = src.get("content", "")
            title = src.get("title", src_id)
            url = src.get("url", "")

            domain = extract_domain(url)
            total_chars, _ = count_words(content)
            mod_total_chars += total_chars

            # Split into Chinese and original sections
            zh_md, orig_md = _split_zh_orig(content)

            has_split = bool(zh_md) or bool(orig_md)
            has_translation = bool(zh_md)
            badges_html = ""

            if not has_split:
                # No zh/orig split found — use cleaned content for both
                clean_content = content
                clean_content = re.sub(r'^#\s+.+$', '', clean_content, flags=re.MULTILINE)
                clean_content = re.sub(r'^\*\*(?:URL|Date|Author|Source|Platform|Fetched|Type|People)\*\*.*$', '',
                                       clean_content, flags=re.MULTILINE | re.IGNORECASE)
                clean_content = re.sub(r'^---+$', '', clean_content, flags=re.MULTILINE)
                clean_content = clean_content.strip()

                if not clean_content:
                    badges_html = '<span class="badge-no-content">抓取失败</span>'
                    zh_md = ""
                    orig_md = ""
                else:
                    # Content exists but no translation section markers
                    zh_md = clean_content
                    orig_md = clean_content
                    badges_html = '<span class="badge-untranslated">未分栏</span>'
            elif not has_translation:
                badges_html = '<span class="badge-untranslated">未翻译</span>'
                # Show orig in both layers
                if not zh_md:
                    zh_md = orig_md

            # Convert markdown to HTML with per-paragraph copy icons
            zh_html = _md_to_html_with_pcopy(zh_md) if zh_md else '<p style="color:var(--text-tertiary)">暂无中文翻译内容。</p>'
            orig_html = _md_to_html_with_pcopy(orig_md) if orig_md else '<p style="color:var(--text-tertiary)">暂无原文内容。</p>'

            # Base64 encode the full markdown for copy functionality
            encoded_md = base64.b64encode(content.encode("utf-8")).decode("ascii")

            # Build meta text
            meta_parts = []
            if domain:
                meta_parts.append(domain)
            meta_parts.append(f"{total_chars:,} 字符")
            meta_text = escape(" · ".join(meta_parts))

            # Build badges section
            badges_section = ""
            if badges_html:
                badges_section = f'<span class="source-card-badges">{badges_html}</span>'

            # Build title with hyperlink
            title_html = f'<a href="{escape(url)}" target="_blank">{escape(title)}</a>' if url else escape(title)

            # v10.1: Extract Chinese title from translation for ZH/EN toggle
            zh_title = ""
            if zh_md:
                # Try first heading in zh content
                zh_title_match = re.search(r'^#{1,3}\s+(.+)$', zh_md, re.MULTILINE)
                if zh_title_match:
                    zh_title = zh_title_match.group(1).strip()
                else:
                    # Use first non-empty line
                    for line in zh_md.split('\n'):
                        line = line.strip().strip('-').strip()
                        if len(line) > 5:
                            zh_title = line[:80]
                            break
            zh_title_escaped = escape(zh_title) if zh_title else escape(title)
            zh_title_html = f'<a href="{escape(url)}" target="_blank">{zh_title_escaped}</a>' if url else zh_title_escaped

            # v10.0: Skip sources with very little actual content
            if len(zh_md) < 100 and len(orig_md) < 100:
                print(f"    SKIP (too short): {src_id} — zh={len(zh_md)}, orig={len(orig_md)}")
                continue

            card_html = f'''<div class="source-card" id="full-src-{escape(src_id)}" data-markdown="{encoded_md}" data-title-zh="{zh_title_escaped}" data-title-en="{escape(title)}">
  <div class="source-card-header">
    <span class="source-card-title" data-title-zh="{zh_title_escaped}" data-title-en="{escape(title)}">{zh_title_html}</span>
    <span class="source-card-meta">{meta_text}</span>
  </div>
  <div class="source-content">
    <div class="source-content-zh active">{zh_html}</div>
    <div class="source-content-en">{orig_html}</div>
  </div>
</div>'''
            card_htmls.append(card_html)
            total_cards += 1

        # Format module character count
        mod_wc_display = format_word_count(mod_total_chars)

        # Build module section
        mod_id = f"ft-module-{mod_key}"
        mod_html = f'''<div class="ft-module-section" id="{mod_id}">
  <div class="ft-module-header">
    <h3 class="ft-module-title">{escape(mod_title)}</h3>
    <span class="ft-module-stats">{source_count} 篇 · {mod_wc_display}</span>
  </div>
{"".join(card_htmls)}
</div>'''
        module_parts.append(mod_html)

    # v10.0: Add "待人工查看" section for incomplete/failed sources
    incomplete_rows = []
    for src_id, src_data in sources_json.items():
        content = src_data.get("content", "")
        _, orig = _split_zh_orig(content)
        url = src_data.get("url", "")
        title = src_data.get("title", src_id)
        if len(orig) < 200 and url:
            reason = "付费墙" if "paywall" in content.lower() or "Bezahl" in content else "内容不完整"
            if "FETCH FAILED" in content:
                reason = "抓取失败"
            if "404" in content or "nicht gefunden" in content.lower():
                reason = "页面已删除 (404)"
            incomplete_rows.append(f'<tr><td><a href="{escape(url)}" target="_blank">{escape(title[:80])}</a></td><td>{reason}</td></tr>')

    if incomplete_rows:
        incomplete_html = f'''<div class="ft-module-section" id="ft-module-incomplete" style="margin-top:48px;">
  <div class="ft-module-header">
    <h3 class="ft-module-title" style="color:var(--text-secondary);">待人工查看</h3>
    <span class="ft-module-stats">{len(incomplete_rows)} 篇未能获取完整内容</span>
  </div>
  <p style="color:var(--text-secondary);margin:8px 0 16px;">以下来源因付费墙、页面删除或反爬虫等原因未能抓取完整正文，需要人工访问查看。</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="border-bottom:2px solid var(--border);"><th style="text-align:left;padding:8px 0;">来源</th><th style="text-align:left;padding:8px 0;width:120px;">原因</th></tr></thead>
    <tbody>{"".join(incomplete_rows)}</tbody>
  </table>
</div>'''
        module_parts.append(incomplete_html)
        print(f"  Incomplete sources: {len(incomplete_rows)} listed for manual review")

    print(f"  Fulltext: generated {total_cards} source cards in {len(module_parts)} modules")
    return "\n\n".join(module_parts)


# ========================
# Main
# ========================
def main():
    if len(sys.argv) < 2:
        print("Usage: python assemble_single.py <artifact_root>")
        sys.exit(1)

    root = Path(sys.argv[1])
    modules_dir = root / "modules"
    sources_dir = root / "sources"
    final_dir = root / "final"
    final_dir.mkdir(parents=True, exist_ok=True)

    # ---- Read manifest ----
    manifest_path = root / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    brand = manifest.get("brand", {})
    brand_name = brand.get("name", "Brand")
    brand_name_zh = brand.get("name_zh", brand_name)
    date = manifest.get("date", "2026.03")

    # ---- Locate template ----
    script_dir = Path(__file__).parent
    skill_dir = script_dir.parent  # scripts/ -> skill root
    template_dir = skill_dir / "templates"

    if not template_dir.exists():
        template_dir = root / "templates"
    if not template_dir.exists():
        # Fallback paths
        for possible in [
            Path("/tmp/fbif-research-v5/templates"),
            Path("/tmp/fbif-research/templates"),
        ]:
            if possible.exists():
                template_dir = possible
                break

    template_path = template_dir / "single-page-template.html"
    if not template_path.exists():
        print(f"ERROR: Template not found at {template_path}")
        sys.exit(1)

    template = template_path.read_text(encoding="utf-8")
    print(f"Template loaded: {template_path}")

    # ---- Build sources JSON from source files ----
    sources_json = build_sources_json(sources_dir)

    # ---- v10.0: Build modules_data from source-inventory.json (no modules/ dir needed) ----
    modules_data = []
    total_words = 0
    total_zh = 0

    # Count words from all source files
    for src_id, src_data in sources_json.items():
        content = src_data.get("content", "")
        words, zh = count_words(content)
        total_words += words
        total_zh += zh

    # Build virtual module entries from MODULES list for fulltext grouping
    src_inv_data = {}
    if (root / "source-inventory.json").exists():
        src_inv_data = json.loads((root / "source-inventory.json").read_text(encoding="utf-8"))

    inv_sources = src_inv_data.get("sources", [])
    module_source_counts = {}
    for s in inv_sources:
        mod = s.get("module", "other")
        module_source_counts[mod] = module_source_counts.get(mod, 0) + 1

    for m in MODULES:
        mod_key = m.get("id", m.get("tag", "").lower())
        src_count = module_source_counts.get(mod_key, 0)
        if src_count > 0:
            modules_data.append({
                **m,
                "html_content": "",
                "words": 0,
                "zh": 0,
                "preview": f"{src_count} sources",
            })
            print(f"  OK {m['tag']:>4} {m['title']:<20} {src_count} sources")

    if not modules_data and not sources_json:
        print("ERROR: No sources found.")
        sys.exit(1)

    print(f"  Total: {total_words:,} chars, {total_zh:,} Chinese chars from {len(sources_json)} source files")

    # ---- Build brand card HTML ----
    brand_card_html = ""
    card_fields = [
        ("Brand", brand.get("name", "--")),
        ("Chinese", brand.get("name_zh", "--")),
        ("Company", brand.get("company", "--")),
        ("Country", brand.get("country", "--")),
        ("Category", brand.get("core_category", "--")),
    ]
    for label, value in card_fields:
        brand_card_html += f'<tr><th>{escape(label)}</th><td>{escape(str(value))}</td></tr>\n'

    # ---- Build stories & quotes (from manifest) ----
    stories_html = manifest.get(
        "stories_html",
        '<div class="story-card"><p>Story points will be generated during Phase 5 assembly.</p></div>'
    )
    quotes_html = manifest.get(
        "quotes_html",
        '<div class="quote-card"><p>Quotes will be generated during Phase 5 assembly.</p></div>'
    )
    one_liner = manifest.get("one_liner", "--")

    # ---- Build appendix ----
    src_inv_path = root / "source-inventory.json"
    appendix_html, source_count = build_appendix_html(src_inv_path, sources_json)

    # If source count from inventory is 0 but we have source files, use those
    if source_count == 0 and sources_json:
        source_count = len(sources_json)

    # ---- Build navigation items HTML ----
    nav_items_html = build_nav_items_html(modules_data)

    # ---- Build all modules HTML ----
    reset_footnotes()  # Reset footnote numbering
    all_modules_html = build_all_modules_html(modules_data)

    # ---- Build fulltext HTML (NEW) ----
    fulltext_html = build_fulltext_html(sources_json, src_inv_path)

    # ---- Serialize sources JSON for embedding (base64 to avoid HTML parser issues) ----
    sources_json_raw = json.dumps(sources_json, ensure_ascii=False, indent=None)
    sources_json_str = base64.b64encode(sources_json_raw.encode("utf-8")).decode("ascii")

    # ---- Replace all placeholders ----
    output = template
    output = output.replace("{{BRAND_NAME}}", escape(brand_name))
    output = output.replace("{{BRAND_NAME_ZH}}", escape(brand_name_zh))
    output = output.replace("{{DATE}}", escape(date))
    output = output.replace("{{BRAND_CARD_HTML}}", brand_card_html)
    output = output.replace("{{ONE_LINER}}", escape(one_liner))
    output = output.replace("{{STORIES_HTML}}", stories_html)
    output = output.replace("{{QUOTES_HTML}}", quotes_html)
    output = output.replace("{{ALL_MODULES_HTML}}", all_modules_html)
    output = output.replace("{{APPENDIX_HTML}}", appendix_html)
    output = output.replace("{{FULLTEXT_HTML}}", fulltext_html)
    output = output.replace("{{TOTAL_WORDS}}", f"{total_words:,}")
    output = output.replace("{{TOTAL_ZH}}", f"{total_zh:,}")
    output = output.replace("{{MODULE_COUNT}}", str(len(modules_data)))
    output = output.replace("{{SOURCE_COUNT}}", str(source_count))
    output = output.replace("{{DOWNLOAD_URL}}", manifest.get("download_url", "#"))
    output = output.replace("{{SOURCES_JSON}}", sources_json_str)
    output = output.replace("{{NAV_ITEMS_HTML}}", nav_items_html)

    # ---- Write output ----
    out_path = final_dir / "report.html"
    out_path.write_text(output, encoding="utf-8")

    # ---- Summary ----
    print(f"\n{'='*55}")
    print(f"  Single-page report assembled: {out_path}")
    print(f"  Modules:       {len(modules_data)}")
    print(f"  Total chars:   {total_words:,}")
    print(f"  Chinese chars: {total_zh:,}")
    print(f"  Sources:       {source_count}")
    print(f"  Sources JSON:  {len(sources_json)} files embedded")
    print(f"  Fulltext cards: {len(sources_json)} generated")
    print(f"{'='*55}")

    if total_words < 77000:
        print(f"  NOTE: Total chars ({total_words:,}) below 77,000 target")
    if total_zh < 30000:
        print(f"  NOTE: Chinese chars ({total_zh:,}) below 30,000 target")


if __name__ == "__main__":
    main()
