#!/usr/bin/env python3
"""
FBIF Research — Share report via Cloudflare Tunnel (临时公网链接)

Usage:
    python share.py <final_dir>

Example:
    python share.py final/

会启动一个本地HTTP服务 + Cloudflare隧道，生成临时公网链接。
按 Ctrl+C 停止分享。
"""

import subprocess
import sys
import os
import signal
import re
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading


def find_free_port():
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def main():
    if len(sys.argv) < 2:
        print("Usage: python share.py <final_dir>")
        sys.exit(1)

    target = Path(sys.argv[1]).resolve()
    if target.is_file():
        target = target.parent

    if not target.exists():
        print(f"Error: {target} not found")
        sys.exit(1)

    # Ensure index.html exists
    index = target / "index.html"
    report = target / "report.html"
    if not index.exists() and report.exists():
        import shutil
        shutil.copy2(report, index)
        print(f"Copied report.html → index.html")

    port = find_free_port()

    # Start HTTP server in background
    os.chdir(str(target))
    server = HTTPServer(('127.0.0.1', port), SimpleHTTPRequestHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"Local server: http://127.0.0.1:{port}")

    # Start cloudflared tunnel
    print("Starting Cloudflare Tunnel...")
    print("=" * 50)

    try:
        proc = subprocess.Popen(
            ["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{port}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        # Read output and find the URL
        url_found = False
        for line in proc.stdout:
            # Look for the trycloudflare.com URL
            match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
            if match and not url_found:
                url = match.group(0)
                url_found = True
                print(f"\n{'=' * 50}")
                print(f"  Public URL: {url}")
                print(f"{'=' * 50}")
                print(f"  Press Ctrl+C to stop sharing")
                print()
                # Copy to clipboard on macOS
                try:
                    subprocess.run(["pbcopy"], input=url, text=True, timeout=3)
                    print(f"  (URL copied to clipboard)")
                except Exception:
                    pass

        proc.wait()
    except KeyboardInterrupt:
        print("\nStopping...")
        proc.terminate()
        server.shutdown()
    finally:
        # Clean up index.html copy if we created it
        if not (target / "report.html").exists():
            pass  # index.html was original, don't delete


if __name__ == "__main__":
    main()
