#!/usr/bin/env bash
# Read-only health check for a verify-hebmu launched instance.
set -euo pipefail

ROOT="${HEBMU_VERIFY_ROOT:-$(pwd)}"
SKILL_DIR="$ROOT/.cursor/skills/verify-hebmu"
RUN_ID="${HEBMU_VERIFY_RUN_ID:-}"
if [[ -z "$RUN_ID" && -f "$SKILL_DIR/artifacts/runs/latest-id" ]]; then
  RUN_ID="$(cat "$SKILL_DIR/artifacts/runs/latest-id")"
fi
if [[ -z "$RUN_ID" ]]; then
  echo "doctor.sh: no HEBMU_VERIFY_RUN_ID and no latest run" >&2
  exit 1
fi

STATE="$SKILL_DIR/artifacts/runs/$RUN_ID/state.env"
if [[ ! -f "$STATE" ]]; then
  echo "doctor.sh: missing state $STATE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$STATE"

fail=0
check() {
  local name="$1" ok="$2" detail="$3"
  if [[ "$ok" == "1" ]]; then
    echo "OK  $name — $detail"
  else
    echo "FAIL $name — $detail" >&2
    fail=1
  fi
}

pid_ok=0
if [[ -n "${HEBMU_VERIFY_PID:-}" ]] && kill -0 "$HEBMU_VERIFY_PID" 2>/dev/null; then
  pid_ok=1
fi
check "pid" "$pid_ok" "pid=${HEBMU_VERIFY_PID:-unset}"

port="${HEBMU_VERIFY_PORT:-}"
http_ok=0
title=""
if [[ -n "$port" ]]; then
  body="$(curl -fsS --max-time 3 "http://127.0.0.1:$port/" 2>/dev/null || true)"
  if [[ -n "$body" ]]; then
    http_ok=1
    title="$(printf '%s' "$body" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1)"
  fi
fi
check "http" "$http_ok" "port=$port"

title_ok=0
if [[ "$title" == *"slidev-theme-hebmu 主题演示"* ]]; then
  title_ok=1
fi
check "title" "$title_ok" "title=${title:-<none>}"

root_ok=0
if [[ -n "${HEBMU_VERIFY_ROOT:-}" && -f "$HEBMU_VERIFY_ROOT/example.md" ]]; then
  root_ok=1
fi
check "root" "$root_ok" "root=${HEBMU_VERIFY_ROOT:-unset}"

echo "run_id=$RUN_ID url=${HEBMU_VERIFY_URL:-}"
exit "$fail"
