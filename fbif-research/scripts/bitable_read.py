#!/usr/bin/env python3
"""读取飞书多维表格待调研品牌清单。

用法：
    python3 bitable_read.py --next          # 返回下一个待调研品牌(JSON)
    python3 bitable_read.py --all           # 列出所有记录
    python3 bitable_read.py --status 待调研  # 按状态文本筛选
"""
import sys, os, json, urllib.request, argparse
from pathlib import Path

# --- 已知常量 ---
PENDING_OPTION_ID = "optSgOSmVF"   # 待调研
DONE_OPTION_ID = "optpv9cBio"      # 已完成

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

def list_records(token, cfg):
    app_token = cfg.get("app_token", "BW5ybdOQvagY2zsTGMGc7yo5noe")
    table_id = cfg.get("pending_table_id", "tblGmMTRPn7mjZ3L")
    url = f"https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records?page_size=500"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        res = json.loads(r.read())
    if res.get("code") != 0:
        print(f"ERROR: list failed: {res}", file=sys.stderr); sys.exit(1)
    return res.get("data", {}).get("items", [])

def is_pending(fields):
    """判断状态是否为待调研。兼容 option ID 数组和文本格式。"""
    status = fields.get("状态")
    if isinstance(status, list):
        return PENDING_OPTION_ID in status
    if isinstance(status, str):
        return status == "待调研"
    return False

def has_brand_name(fields):
    name = fields.get("品牌名称", "")
    return bool(name and name.strip())

def get_auto_number(fields):
    """提取自动编号，用于排序。"""
    val = fields.get("自动编号", "999999")
    try:
        return int(val)
    except (ValueError, TypeError):
        return 999999

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--next", action="store_true", help="返回下一个待调研品牌(JSON)")
    parser.add_argument("--all", action="store_true", help="列出所有")
    parser.add_argument("--status", default="待调研")
    parser.add_argument("--exclude", nargs="*", default=[], help="排除的 record_id 列表")
    args = parser.parse_args()

    cfg = load_config()
    if not cfg.get("app_id"):
        print("ERROR: 缺少凭证", file=sys.stderr); sys.exit(1)
    token = get_token(cfg)
    records = list_records(token, cfg)

    # 筛选
    exclude_set = set(args.exclude) if args.exclude else set()

    if args.all:
        filtered = records
    else:
        filtered = [r for r in records
                    if is_pending(r["fields"]) and has_brand_name(r["fields"])
                    and r["record_id"] not in exclude_set]

    # 按自动编号排序
    filtered.sort(key=lambda r: get_auto_number(r["fields"]))

    if args.next:
        if not filtered:
            print(json.dumps({"record_id": None, "brand_name": None, "done": True}))
            return
        f = filtered[0]["fields"]
        print(json.dumps({
            "record_id": filtered[0]["record_id"],
            "brand_name": f.get("品牌名称", ""),
            "auto_number": get_auto_number(f),
            "done": False
        }, ensure_ascii=False))
        return

    # Pretty print
    if not filtered:
        print("没有符合条件的记录"); return
    print(f"{'#':<4} {'品牌名称':<20} {'状态':<12} {'record_id':<18}")
    print("-" * 54)
    for r in filtered:
        f = r["fields"]
        num = f.get("自动编号", "?")
        name = f.get("品牌名称", "")
        st = "待调研" if is_pending(f) else "已完成"
        print(f"{num:<4} {name:<20} {st:<12} {r['record_id']:<18}")
    print(f"\n共 {len(filtered)} 条")

if __name__ == "__main__":
    main()
