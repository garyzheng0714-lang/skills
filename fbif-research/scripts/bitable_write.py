#!/usr/bin/env python3
"""调研完成后回写飞书多维表格（双表写入）。

用法：
    python3 bitable_write.py {artifact_root} --record-id {待调研表record_id}

逻辑：
    1. 读取 manifest.json + validate_completion 统计
    2. 在已调研表新增一条记录
    3. 更新待调研表的调研结果字段（触发状态公式更新）
"""
import sys, os, json, re, urllib.request, argparse
from pathlib import Path
from datetime import datetime

def load_config():
    p = Path(__file__).parent.parent / "bitable-config.json"
    if p.exists():
        return json.loads(p.read_text())
    return {"app_id": os.environ.get("FEISHU_APP_ID",""),
            "app_secret": os.environ.get("FEISHU_APP_SECRET","")}

def get_token(cfg):
    data = json.dumps({"app_id": cfg["app_id"], "app_secret": cfg["app_secret"]}).encode()
    req = urllib.request.Request(
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    if res.get("code") != 0:
        print(f"ERROR: auth failed: {res}", file=sys.stderr); sys.exit(1)
    return res["tenant_access_token"]

def api(token, method, table_id, path, body=None, cfg=None):
    app_token = cfg.get("app_token", "BW5ybdOQvagY2zsTGMGc7yo5noe") if cfg else "BW5ybdOQvagY2zsTGMGc7yo5noe"
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def find_record_by_field(token, table_id, field_name, field_value, cfg):
    """Paginated search for a record matching field_name == field_value."""
    app_token = cfg.get("app_token", "BW5ybdOQvagY2zsTGMGc7yo5noe") if cfg else "BW5ybdOQvagY2zsTGMGc7yo5noe"
    page_token = None
    while True:
        url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records?page_size=500"
        if page_token:
            url += f"&page_token={page_token}"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            res = json.loads(r.read())
        if res.get("code") != 0:
            print(f"WARNING: paginated search failed: {res}", file=sys.stderr)
            return None
        for item in res.get("data", {}).get("items", []):
            if item["fields"].get(field_name) == field_value:
                return item["record_id"]
        if not res.get("data", {}).get("has_more"):
            break
        page_token = res["data"].get("page_token")
    return None

def count_words(root):
    report = root / "final" / "report.html"
    if not report.exists():
        return 0, 0
    html = report.read_text(encoding="utf-8", errors="ignore")
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", html)
    total = len(text.strip())
    zh = len(re.findall(r"[\u4e00-\u9fff]", text))
    return total, zh

def count_sources(root):
    inv = root / "source-inventory.json"
    if not inv.exists():
        return 0
    try:
        data = json.loads(inv.read_text())
        return len(data) if isinstance(data, list) else len(data.get("sources", []))
    except:
        return 0

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact_root", help="调研产物根目录")
    parser.add_argument("--record-id", required=True, help="待调研表的 record_id")
    args = parser.parse_args()

    root = Path(args.artifact_root)
    cfg = load_config()
    if not cfg.get("app_id"):
        print("ERROR: 缺少凭证", file=sys.stderr); sys.exit(1)

    # 读 manifest
    manifest = json.loads((root / "manifest.json").read_text())
    brand = manifest.get("brand", {})
    total_words, zh_words = count_words(root)
    source_count = count_sources(root)
    # Count modules from source-inventory.json (more reliable than manifest.modules)
    inv_path = root / "source-inventory.json"
    module_set = set()
    if inv_path.exists():
        try:
            inv = json.loads(inv_path.read_text())
            inv_list = inv if isinstance(inv, list) else inv.get("sources", [])
            for item in inv_list:
                mod = item.get("module", "")
                if mod:
                    module_set.add(mod)
        except Exception:
            pass
    module_count = len(module_set) if module_set else len(manifest.get("modules", {}))
    report_url = manifest.get("report_url", "")
    download_url = manifest.get("download_url", "")

    token = get_token(cfg)
    pending_table = cfg.get("pending_table_id", "tblGmMTRPn7mjZ3L")
    done_table = cfg.get("done_table_id", "tbl5uttQVYsFsS43")

    # --- 1. 已调研表: 新增记录 ---
    done_fields = {
        "品牌名称": brand.get("name", ""),
        "母公司": brand.get("company", ""),
        "所属国家": brand.get("country", ""),
        "核心品类": brand.get("core_category", ""),
        "调研日期": datetime.now().strftime("%Y-%m-%d"),
        "模块数": module_count,
        "来源数": source_count,
        "总字数": total_words,
        "中文字数": zh_words,
        "状态": "已完成",
        "对应待调研表里的记录ID": args.record_id,
    }
    if report_url:
        done_fields["报告链接"] = {"link": report_url, "text": report_url}
    if download_url:
        done_fields["下载链接"] = {"link": download_url, "text": download_url}

    # 先检查是否已有同 record_id 记录（幂等性：不重复创建，分页搜索全表）
    found_id = find_record_by_field(token, done_table, "对应待调研表里的记录ID", args.record_id, cfg)

    if found_id:
        res = api(token, "PUT", done_table, f"records/{found_id}", {"fields": done_fields}, cfg)
        print(f"✓ 已调研表: 更新已有记录 {found_id}")
    else:
        res = api(token, "POST", done_table, "records", {"fields": done_fields}, cfg)
        new_id = res.get("data", {}).get("record", {}).get("record_id", "?")
        print(f"✓ 已调研表: 新增记录 {new_id}")

    if res.get("code") != 0:
        print(f"ERROR: 已调研表写入失败: {res}", file=sys.stderr); sys.exit(1)

    # --- 2. 待调研表: 更新调研结果字段 ---
    if report_url:
        pending_fields = {
            "调研结果": [{"link": report_url, "text": report_url, "type": "url"}]
        }
        res2 = api(token, "PUT", pending_table, f"records/{args.record_id}",
                   {"fields": pending_fields}, cfg)
        if res2.get("code") == 0:
            print(f"✓ 待调研表: 已更新 {args.record_id} 的调研结果")
        else:
            print(f"WARNING: 待调研表更新失败: {res2}", file=sys.stderr)

    # 输出汇总
    print(f"\n品牌: {brand.get('name','')} | 总字数: {total_words:,} | 中文: {zh_words:,} | 来源: {source_count} | 报告: {report_url}")

if __name__ == "__main__":
    main()
