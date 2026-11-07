#!/usr/bin/env bash
# Launch an isolated Slidev preview of example.md for verify-hebmu.
set -euo pipefail

ROOT="${HEBMU_VERIFY_ROOT:-$(pwd)}"
if [[ ! -f "$ROOT/example.md" || ! -f "$ROOT/package.json" ]]; then
  echo "launch.sh: run from theme repo root (missing example.md or package.json)" >&2
  exit 1
fi

SKILL_DIR="$ROOT/.cursor/skills/verify-hebmu"
RUN_ID="${HEBMU_VERIFY_RUN_ID:-$(date +%Y%m%d-%H%M%S)}"
RUN_DIR="$SKILL_DIR/artifacts/runs/$RUN_ID"
mkdir -p "$RUN_DIR" "$SKILL_DIR/artifacts/proof/$RUN_ID"

pick_port() {
  node -e '
    const net = require("net");
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => process.stdout.write(String(port)));
    });
  '
}

PORT="$(pick_port)"
LOG="$RUN_DIR/dev.log"
STATE="$RUN_DIR/state.env"

cd "$ROOT"
# Call slidev directly so package.json's `dev --open` does not steal focus.
nohup npx slidev example.md --port "$PORT" --remote >"$LOG" 2>&1 &
PID=$!

cat >"$STATE" <<EOF
HEBMU_VERIFY_ROOT=$ROOT
HEBMU_VERIFY_RUN_ID=$RUN_ID
HEBMU_VERIFY_PORT=$PORT
HEBMU_VERIFY_PID=$PID
HEBMU_VERIFY_URL=http://127.0.0.1:$PORT/
HEBMU_VERIFY_LOG=$LOG
EOF

# Latest pointer for doctor/cleanup when RUN_ID unset
ln -sfn "$RUN_ID" "$SKILL_DIR/artifacts/runs/latest" 2>/dev/null || true
printf '%s\n' "$RUN_ID" >"$SKILL_DIR/artifacts/runs/latest-id"

echo "launch.sh: started pid=$PID port=$PORT run=$RUN_ID"

ready=0
for _ in $(seq 1 60); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "launch.sh: process exited early; see $LOG" >&2
    exit 1
  fi
  title="$(
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/" 2>/dev/null \
      | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' \
      | head -1 || true
  )"
  if [[ "$title" == *"slidev-theme-hebmu 主题演示"* ]]; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "launch.sh: timed out waiting for deck title; see $LOG" >&2
  kill "$PID" 2>/dev/null || true
  exit 1
fi

echo "launch.sh: ready url=http://127.0.0.1:$PORT/ title_ok=1"
echo "export HEBMU_VERIFY_RUN_ID=$RUN_ID"
echo "export HEBMU_VERIFY_ROOT=$ROOT"
