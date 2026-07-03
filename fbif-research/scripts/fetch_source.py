#!/usr/bin/env python3
"""
来源抓取脚本 — 用x-reader统一抓取，自动调用save_source.py保存

用法：
    python3 scripts/fetch_source.py <artifact_root> \
      --url "https://example.com/article" \
      --title "Article Title" \
      --module "m1" \
      --language "de" \
      --type "Official"

    批量抓取（从source-inventory.json读取所有status=discovered的URL）：
    python3 scripts/fetch_source.py <artifact_root> --batch

引擎：x-reader (https://github.com/runesleo/x-reader)
    - 普通网页：Jina Reader
    - 微信公众号：Jina → Playwright自动回退
    - YouTube：字幕提取
    - B站：API抓取
    - Twitter/X：API抓取
    - 播客：字幕/描述提取
"""
import sys
import json
import asyncio
import argparse
import subprocess
from pathlib import Path
from urllib.parse import urlparse


def _fetch_via_jina(url: str) -> dict:
    """内置Jina Reader抓取（不依赖x-reader包）"""
    import requests
    jina_url = f"https://r.jina.ai/{url}"
    headers = {
        "Accept": "text/markdown",
        "User-Agent": "fbif-research/1.0",
        "X-Respond-With": "readerlm-v2",
    }
    resp = requests.get(jina_url, headers=headers, timeout=30)
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
    return {
        "title": title[:200],
        "content": "\n".join(content_lines).strip(),
    }


def fetch_single(url: str) -> dict:
    """抓取单个URL。优先用x-reader（支持微信/YouTube/B站），回退到内置Jina。"""
    # 尝试x-reader（如果安装了）
    try:
        from x_reader.reader import UniversalReader
        reader = UniversalReader()
        content = asyncio.run(reader.read(url))
        return {
            "status": "ok",
            "title": content.title or "",
            "content": content.content or "",
            "platform": content.source_name or urlparse(url).netloc,
        }
    except ImportError:
        pass  # x-reader没装，用内置Jina
    except Exception as e:
        # x-reader失败，也回退到Jina
        pass

    # 回退：内置Jina Reader（带readerlm-v2）
    try:
        data = _fetch_via_jina(url)
        return {
            "status": "ok",
            "title": data["title"],
            "content": data["content"],
            "platform": urlparse(url).netloc,
        }
    except Exception as e:
        return {
            "status": "error",
            "title": "",
            "content": "",
            "error": str(e),
        }


def save_via_script(root: Path, url: str, title: str, content: str,
                    module: str, language: str, source_type: str) -> dict:
    """调用save_source.py保存"""
    script = root / "scripts" / "save_source.py"
    if not script.exists():
        # Fallback: try skill bundle location
        script = Path(__file__).parent / "save_source.py"

    result = subprocess.run(
        [sys.executable, str(script), str(root),
         "--url", url, "--title", title,
         "--type", source_type, "--module", module, "--language", language],
        input=content, capture_output=True, text=True,
    )
    if result.returncode == 0:
        try:
            return json.loads(result.stdout.strip())
        except json.JSONDecodeError:
            return {"status": "saved", "output": result.stdout.strip()}
    else:
        return {"status": "error", "error": result.stderr.strip()}


def fetch_and_save(root: Path, url: str, title: str, module: str,
                   language: str, source_type: str) -> dict:
    """抓取 + 保存一体化"""
    # Fetch
    result = fetch_single(url)
    if result["status"] != "ok" or not result["content"]:
        print(json.dumps({
            "status": "fetch_failed",
            "url": url,
            "error": result.get("error", "empty content"),
        }, ensure_ascii=False))
        # Still save with failure marker
        content = f"[FETCH FAILED]\n\nURL: {url}\nError: {result.get('error', 'empty content')}"
        save_via_script(root, url, title or url, content, module, language, source_type)
        return {"status": "fetch_failed", "url": url}

    # Use fetched title if none provided
    final_title = title or result["title"] or urlparse(url).path.split("/")[-1]
    # Clean "Title: " prefix from Jina
    if final_title.startswith("Title: "):
        final_title = final_title[7:]

    # Save
    save_result = save_via_script(root, url, final_title, result["content"],
                                  module, language, source_type)

    output = {
        "status": "ok",
        "url": url,
        "title": final_title,
        "chars": len(result["content"]),
        "file": save_result.get("file", ""),
    }
    print(json.dumps(output, ensure_ascii=False))
    return output


def batch_fetch(root: Path):
    """批量抓取source-inventory.json中所有status=discovered的URL"""
    inv_path = root / "source-inventory.json"
    if not inv_path.exists():
        print("ERROR: source-inventory.json not found")
        sys.exit(1)

    inv = json.loads(inv_path.read_text(encoding="utf-8"))
    to_fetch = [s for s in inv["sources"] if s.get("status") == "discovered"]

    print(f"Batch fetch: {len(to_fetch)} URLs to process")

    success = 0
    failed = 0
    for i, source in enumerate(to_fetch):
        url = source.get("url", "")
        title = source.get("title", "")
        module = source.get("module", "other")
        language = source.get("language", "unknown")
        source_type = source.get("source_type", "Article")

        print(f"\n[{i+1}/{len(to_fetch)}] {url[:70]}...")
        result = fetch_and_save(root, url, title, module, language, source_type)

        if result["status"] == "ok":
            source["status"] = "fetched"
            success += 1
        else:
            source["status"] = "blocked"
            failed += 1

    # Update inventory
    inv_path.write_text(json.dumps(inv, ensure_ascii=False, indent=2))
    print(f"\nBatch complete: {success} succeeded, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description="抓取来源（x-reader引擎）")
    parser.add_argument("artifact_root", help="项目根目录")
    parser.add_argument("--url", help="单个URL")
    parser.add_argument("--title", default="", help="文章标题")
    parser.add_argument("--module", default="other", help="所属模块")
    parser.add_argument("--language", default="unknown", help="语言")
    parser.add_argument("--type", default="Article", help="来源类型")
    parser.add_argument("--batch", action="store_true", help="批量模式：从inventory读取")
    args = parser.parse_args()

    root = Path(args.artifact_root)

    if args.batch:
        batch_fetch(root)
    elif args.url:
        fetch_and_save(root, args.url, args.title, args.module, args.language, args.type)
    else:
        print("ERROR: 需要 --url 或 --batch")
        sys.exit(1)


if __name__ == "__main__":
    main()
