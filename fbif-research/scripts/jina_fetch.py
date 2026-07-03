#!/usr/bin/env python3
"""
Jina Reader content fetcher — reliable full-text extraction from any URL.

Uses https://r.jina.ai/{url} to get clean markdown from web pages.
Free, no API key, handles JS rendering and anti-bot measures.

Usage:
    python jina_fetch.py <url> <output_file> [--translate]

Examples:
    python jina_fetch.py "https://example.com/article" sources/src-0001.md
    python jina_fetch.py "https://example.com/article" sources/src-0001.md --translate
"""

import sys
import os
import re
import requests
import json
from datetime import datetime
from pathlib import Path

JINA_BASE = "https://r.jina.ai"
TIMEOUT = 60
HEADERS = {
    "Accept": "text/markdown",
    "User-Agent": "fbif-research/5.0",
}


def fetch_via_jina(url: str) -> dict:
    """Fetch complete content from any URL via Jina Reader."""
    jina_url = f"{JINA_BASE}/{url}"

    try:
        resp = requests.get(jina_url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        text = resp.text.strip()

        lines = text.split("\n")
        title = ""
        content_lines = []

        for line in lines:
            if not title and line.strip():
                title = line.lstrip("#").strip()
            else:
                content_lines.append(line)

        content = "\n".join(content_lines).strip()
        word_count = len(content)
        zh_count = len(re.findall(r"[\u4e00-\u9fff]", content))

        return {
            "title": title[:200],
            "content": content,
            "url": url,
            "word_count": word_count,
            "zh_count": zh_count,
            "fetched_at": datetime.now().isoformat(),
        }

    except requests.Timeout:
        print(f"ERROR: Timeout fetching {url}", file=sys.stderr)
        sys.exit(1)
    except requests.RequestException as e:
        print(f"ERROR: Failed to fetch {url} — {e}", file=sys.stderr)
        sys.exit(1)


def save_source_file(data: dict, output_path: str):
    """Save fetched content to a structured source file."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    content = f"""# {data['title']}

**URL**: {data['url']}
**Fetched**: {data['fetched_at']}
**Total characters**: {data['word_count']:,}
**Chinese characters**: {data['zh_count']:,}

---

## Original Full Text

{data['content']}

---

## Chinese Translation

> [Translation pending — to be added by the research agent]

"""
    path.write_text(content, encoding="utf-8")
    return path


def main():
    if len(sys.argv) < 3:
        print("Usage: python jina_fetch.py <url> <output_file>")
        sys.exit(1)

    url = sys.argv[1]
    output_file = sys.argv[2]

    print(f"Fetching: {url}")
    data = fetch_via_jina(url)

    save_source_file(data, output_file)

    # Print summary to stdout (for the model to read)
    result = {
        "status": "ok",
        "title": data["title"],
        "url": data["url"],
        "word_count": data["word_count"],
        "zh_count": data["zh_count"],
        "saved_to": output_file,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
