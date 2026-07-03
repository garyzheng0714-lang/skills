#!/usr/bin/env python3
"""FBIF 获奖海报批量渲染 — CSV/JSONL in, rendered JPEG out.

用法：
    python3 batch_render.py rows.jsonl out_dir
    python3 batch_render.py rows.csv    out_dir

每行/每条记录必须有这些字段：
  category        品类（去英文）
  product_name_1  产品名第 1 行
  product_name_2  产品名第 2 行 (可空)
  company         公司名
  product_img     产品图（https / /uploads/... / data:）

默认读环境变量 API (http://localhost:19090) 和 API_KEY。
"""
from __future__ import annotations
import csv, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from award_map import split_award

API = os.environ.get("API", "http://localhost:19090")
KEY = os.environ.get("API_KEY", "test-key-1")
TID = os.environ.get("TEMPLATE_ID", "7ff26abd-abe5-49a3-90e7-a6f442179198")


def render_one(row: dict, out_dir: Path) -> tuple[int, str, str | None, str | None]:
    idx = row.get("_idx", 0)
    body = {
        "templateId": TID,
        "variables": {
            "var_产品图": {"url": row["product_img"]},
            "产品名第1行": row["product_name_1"],
            "产品名第2行": row.get("product_name_2", ""),
            "公司名":     row["company"],
            "奖项名":     split_award(row["category"]),
        },
        "format": "jpeg",
    }
    req = urllib.request.Request(
        f"{API}/api/v1/render",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.load(resp)
    except Exception as e:
        return idx, row["category"], None, str(e)

    url = API + result["url"]
    safe_cat = row["category"].replace("/", "_")
    local = out_dir / f"{idx:04d}-{safe_cat}.jpg"
    urllib.request.urlretrieve(url, local)
    return idx, row["category"], str(local), None


def load_rows(path: Path) -> list[dict]:
    if path.suffix == ".jsonl":
        return [json.loads(l) for l in path.read_text().splitlines() if l.strip()]
    if path.suffix == ".csv":
        with path.open() as f:
            return list(csv.DictReader(f))
    raise SystemExit(f"unsupported format: {path.suffix}")


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)

    rows = load_rows(src)
    for i, r in enumerate(rows, 1):
        r["_idx"] = i

    t0 = time.time()
    ok = err = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {pool.submit(render_one, r, out): r for r in rows}
        for fut in as_completed(futs):
            idx, cat, path, error = fut.result()
            if error:
                print(f"[{idx:03d}] FAIL {cat!r}: {error}")
                err += 1
            else:
                print(f"[{idx:03d}] OK   {cat!r:20s} → {path}")
                ok += 1

    print(f"\nDone in {time.time()-t0:.1f}s — ok={ok} err={err}")


if __name__ == "__main__":
    main()
