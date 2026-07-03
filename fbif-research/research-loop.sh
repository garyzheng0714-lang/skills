#!/bin/bash
# research-loop.sh — 批量品牌调研主循环
#
# 用法：
#   bash research-loop.sh              # 调研全部待调研品牌
#   bash research-loop.sh --limit 10   # 只调研前10个
#   bash research-loop.sh --dry-run    # 只读取不执行
#   bash research-loop.sh --dry-run --limit 3  # 预览前3个
#
# 加固措施（针对 Codex 审查反馈）：
#   1. 每个品牌独立 claude 会话（上下文隔离）
#   2. 硬超时 90 分钟防挂死
#   3. 本地锁文件防重入
#   4. 完成验证门控（不通过不写回）
#   5. 幂等写回（已调研表查重）
#   6. 详细日志（每品牌独立 log）
#   7. 启动时自动清理 >3 小时残留锁文件
#   8. dry-run 退出时清理临时锁文件

set -eo pipefail

SKILL_DIR="$HOME/.claude/skills/fbif-research"
SCRIPTS="$SKILL_DIR/scripts"
OUTPUT_BASE="$SKILL_DIR/outputs"
LOG_DIR="$SKILL_DIR/logs"
LOCK_DIR="$SKILL_DIR/.locks"
MAX_TIMEOUT=5400   # 90 分钟硬超时
MAX_TURNS=300      # claude max turns
DRY_RUN=false
LIMIT=0            # 0=不限制

# 解析参数
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --limit) LIMIT="$2"; shift ;;
    --limit=*) LIMIT="${1#--limit=}" ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
  shift
done

mkdir -p "$OUTPUT_BASE" "$LOG_DIR" "$LOCK_DIR"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') | $*"; }
log_brand() { echo "$(date '+%Y-%m-%d %H:%M:%S') | [$BRAND] $*"; }

# --- 启动检查：自动清理 >3 小时残留锁文件 ---
LOCK_FILE=""
BRAND=""
RECORD_ID=""
stale_locks=$(find "$LOCK_DIR" -name "*.lock" -mmin +180 2>/dev/null || true)
if [ -n "$stale_locks" ]; then
  log "AUTO-CLEANUP: 删除残留锁文件（>3小时）："
  echo "$stale_locks" | while read -r sl; do
    log "  删除: $sl"
    rm -f "$sl"
  done
fi

# --- dry-run 退出时清理临时锁文件 ---
cleanup_dry_run_locks() {
  if $DRY_RUN; then
    find "$LOCK_DIR" -name "*.lock" -newer "$0" 2>/dev/null | while read -r lf; do
      content=$(cat "$lf" 2>/dev/null || true)
      if [ "$content" = "dry_run" ]; then
        rm -f "$lf"
      fi
    done
  fi
}
trap cleanup_dry_run_locks EXIT

# --- 主循环 ---
ROUND=0
COMPLETED=0
if [ "$LIMIT" -gt 0 ] 2>/dev/null; then
  log "限制调研数量: $LIMIT"
fi
while true; do
  ROUND=$((ROUND + 1))
  log "========== 第 $ROUND 轮 $([ "$LIMIT" -gt 0 ] 2>/dev/null && echo "(已完成 $COMPLETED/$LIMIT)") =========="

  # 1. 读取下一个待调研品牌（排除已有锁文件的）
  EXCLUDE_ARGS=""
  for lf in "$LOCK_DIR"/*.lock; do
    [ -f "$lf" ] || continue
    rid=$(basename "$lf" .lock)
    EXCLUDE_ARGS="$EXCLUDE_ARGS $rid"
  done
  if [ -n "$EXCLUDE_ARGS" ]; then
    NEXT=$(python3 "$SCRIPTS/bitable_read.py" --next --exclude $EXCLUDE_ARGS 2>&1) || true
  else
    NEXT=$(python3 "$SCRIPTS/bitable_read.py" --next 2>&1) || true
  fi

  # 检查是否包含有效 JSON（bitable_read.py 失败时输出 ERROR 到 stderr）
  if ! echo "$NEXT" | python3 -c "import sys,json;json.load(sys.stdin)" 2>/dev/null; then
    log "ERROR: bitable_read.py 执行失败: $NEXT"
    exit 1
  fi

  BRAND=$(echo "$NEXT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('brand_name',''))" 2>/dev/null)
  RECORD_ID=$(echo "$NEXT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('record_id',''))" 2>/dev/null)
  IS_DONE=$(echo "$NEXT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('done',False))" 2>/dev/null)

  if [ "$IS_DONE" = "True" ] || [ -z "$BRAND" ] || [ "$BRAND" = "None" ]; then
    log "全部调研完成！共执行 $((ROUND - 1)) 轮"
    break
  fi

  # 2. 检查锁文件（防重入）
  LOCK_FILE="$LOCK_DIR/${RECORD_ID}.lock"
  if [ -f "$LOCK_FILE" ]; then
    log_brand "跳过（锁文件存在: $LOCK_FILE）"
    continue
  fi

  log_brand "开始调研 (record: $RECORD_ID)"

  if $DRY_RUN; then
    log_brand "[DRY RUN] 跳过实际调研"
    # dry-run 也创建锁文件，防止死循环
    echo "dry_run" > "$LOCK_FILE"
    continue
  fi

  # 3. 创建锁文件
  echo "{\"brand\":\"$BRAND\",\"record_id\":\"$RECORD_ID\",\"started\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"pid\":$$}" > "$LOCK_FILE"

  # 4. 品牌 slug（使用 RECORD_ID 避免名称碰撞）
  BRAND_SLUG="rec-${RECORD_ID}"
  BRAND_LOG="$LOG_DIR/${BRAND_SLUG}-$(date +%Y%m%d-%H%M%S).log"
  ARTIFACT_ROOT="$OUTPUT_BASE/$BRAND_SLUG"

  # 5. 执行调研（带超时），传 --output-dir 使产物路径确定
  log_brand "启动 claude 会话 (timeout: ${MAX_TIMEOUT}s, max-turns: $MAX_TURNS)"
  log_brand "日志: $BRAND_LOG"
  log_brand "产物目录: $ARTIFACT_ROOT"

  RESEARCH_EXIT=0
  timeout "$MAX_TIMEOUT" claude -p "调研 $BRAND，产物输出到 $ARTIFACT_ROOT" \
    --max-turns "$MAX_TURNS" \
    > "$BRAND_LOG" 2>&1 || RESEARCH_EXIT=$?

  if [ $RESEARCH_EXIT -eq 124 ]; then
    log_brand "ERROR: 超时 (${MAX_TIMEOUT}s)"
    echo "timeout" >> "$LOCK_FILE"
    continue
  elif [ $RESEARCH_EXIT -ne 0 ]; then
    log_brand "ERROR: claude 退出码 $RESEARCH_EXIT"
    echo "exit_code=$RESEARCH_EXIT" >> "$LOCK_FILE"
    continue
  fi

  log_brand "claude 会话完成 (exit: $RESEARCH_EXIT)"

  # 6. 验证产物目录存在
  if [ ! -d "$ARTIFACT_ROOT" ] || [ ! -f "$ARTIFACT_ROOT/manifest.json" ]; then
    log_brand "ERROR: 找不到产物目录或 manifest.json: $ARTIFACT_ROOT"
    echo "no_artifacts" >> "$LOCK_FILE"
    continue
  fi

  # 7. 完成验证门控
  log_brand "验证产物完整性..."
  VALIDATE_OUTPUT=$(python3 "$SCRIPTS/validate_completion.py" "$ARTIFACT_ROOT" 2>&1) || {
    log_brand "ERROR: 验证不通过:"
    echo "$VALIDATE_OUTPUT" | while read -r line; do log_brand "  $line"; done
    echo "validation_failed" >> "$LOCK_FILE"
    continue
  }
  log_brand "$VALIDATE_OUTPUT"

  # 8. 写回 Bitable（幂等）
  log_brand "写回飞书多维表格..."
  WRITE_OUTPUT=$(python3 "$SCRIPTS/bitable_write.py" "$ARTIFACT_ROOT" --record-id "$RECORD_ID" 2>&1) || {
    log_brand "ERROR: 写回失败:"
    echo "$WRITE_OUTPUT" | while read -r line; do log_brand "  $line"; done
    echo "writeback_failed" >> "$LOCK_FILE"
    continue
  }
  echo "$WRITE_OUTPUT" | while read -r line; do log_brand "$line"; done

  # 9. 清除锁文件（成功完成）
  rm -f "$LOCK_FILE"
  log_brand "调研完成并写回成功"
  COMPLETED=$((COMPLETED + 1))

  # 10. 检查 limit
  if [ "$LIMIT" -gt 0 ] 2>/dev/null && [ "$COMPLETED" -ge "$LIMIT" ]; then
    log "已达到限制数量 ($COMPLETED/$LIMIT)，停止"
    break
  fi

  # 11. 间隔
  log "等待 30 秒后继续下一个..."
  sleep 30
done

log "========== 批量调研结束 =========="
