#!/usr/bin/env python3
"""Deploy report.html to Alibaba Cloud OSS.

配置方式（按优先级）：
1. 环境变量: OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_ENDPOINT, OSS_BUCKET, OSS_BASE_URL
2. 配置文件: {artifact_root}/oss-config.json
"""
import sys
import os
import json
from pathlib import Path

def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    report = root / 'final' / 'report.html'
    if not report.exists():
        print(f"ERROR: {report} not found")
        sys.exit(1)

    # Load config: env vars first, then oss-config.json
    access_key_id = os.environ.get('OSS_ACCESS_KEY_ID', '')
    access_key_secret = os.environ.get('OSS_ACCESS_KEY_SECRET', '')
    endpoint = os.environ.get('OSS_ENDPOINT', 'https://oss-cn-beijing.aliyuncs.com')
    bucket_name = os.environ.get('OSS_BUCKET', 'fbif-html-share')
    base_url = os.environ.get('OSS_BASE_URL', '')

    config_path = root / 'oss-config.json'
    if config_path.exists() and (not access_key_id or not access_key_secret):
        config = json.loads(config_path.read_text())
        access_key_id = access_key_id or config.get('accessKeyId', '')
        access_key_secret = access_key_secret or config.get('accessKeySecret', '')
        endpoint = config.get('endpoint', endpoint)
        bucket_name = config.get('bucket', bucket_name)
        base_url = config.get('baseUrl', base_url)

    if not access_key_id or not access_key_secret:
        print("ERROR: OSS credentials not found.")
        print("Set env vars OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET, or create oss-config.json")
        sys.exit(1)

    try:
        import oss2
    except ImportError:
        print("ERROR: oss2 not installed. Run: pip install oss2")
        sys.exit(1)

    manifest_path = root / 'manifest.json'
    brand_slug = 'report'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        brand_slug = manifest.get('brand', {}).get('name', 'report').lower()

    auth = oss2.Auth(access_key_id, access_key_secret)
    bucket = oss2.Bucket(auth, endpoint, bucket_name)

    oss_key = f'{brand_slug}/index.html'
    with open(report, 'rb') as f:
        bucket.put_object(oss_key, f, headers={
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
        })

    url = f'{base_url}/{brand_slug}/index.html' if base_url else f'https://{bucket_name}.{endpoint.replace("https://","")}/{oss_key}'
    print(f'Uploaded: {url}')

    # Write report_url back to manifest.json so validate_completion and bitable_write can find it
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        manifest['report_url'] = url
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        print(f'Updated manifest.json with report_url')

    return url

if __name__ == '__main__':
    main()
