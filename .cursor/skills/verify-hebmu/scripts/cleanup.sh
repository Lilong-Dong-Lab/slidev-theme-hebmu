#!/usr/bin/env bash
# Stop the verify-hebmu instance recorded for RUN_ID. Keep proof artifacts.
set -euo pipefail

ROOT="${HEBMU_VERIFY_ROOT:-$(pwd)}"
SKILL_DIR="$ROOT/.cursor/skills/verify-hebmu"
RUN_ID="${HEBMU_VERIFY_RUN_ID:-}"
if [[ -z "$RUN_ID" && -f "$SKILL_DIR/artifacts/runs/latest-id" ]]; then
  RUN_ID="$(cat "$SKILL_DIR/artifacts/runs/latest-id")"
fi
if [[ -z "$RUN_ID" ]]; then
  echo "cleanup.sh: no HEBMU_VERIFY_RUN_ID and no latest run" >&2
  exit 1
fi

STATE="$SKILL_DIR/artifacts/runs/$RUN_ID/state.env"
if [[ ! -f "$STATE" ]]; then
  echo "cleanup.sh: missing state $STATE" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$STATE"

if [[ -n "${HEBMU_VERIFY_PID:-}" ]] && kill -0 "$HEBMU_VERIFY_PID" 2>/dev/null; then
  kill "$HEBMU_VERIFY_PID" 2>/dev/null || true
  # child npm/node may outlive the shell wrapper briefly
  sleep 0.5
  if kill -0 "$HEBMU_VERIFY_PID" 2>/dev/null; then
    kill -9 "$HEBMU_VERIFY_PID" 2>/dev/null || true
  fi
  # Also stop listeners on the recorded port if still held by a child
  if [[ -n "${HEBMU_VERIFY_PORT:-}" ]]; then
    if command -v lsof >/dev/null 2>&1; then
      pids="$(lsof -tiTCP:"$HEBMU_VERIFY_PORT" -sTCP:LISTEN 2>/dev/null || true)"
      if [[ -n "$pids" ]]; then
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
      fi
    fi
  fi
  echo "cleanup.sh: stopped pid=$HEBMU_VERIFY_PID port=${HEBMU_VERIFY_PORT:-}"
else
  echo "cleanup.sh: process already gone pid=${HEBMU_VERIFY_PID:-unset}"
fi

echo "cleanup.sh: proof kept at $SKILL_DIR/artifacts/proof/$RUN_ID/"
echo "cleanup.sh: run meta at $SKILL_DIR/artifacts/runs/$RUN_ID/ (left for audit)"
