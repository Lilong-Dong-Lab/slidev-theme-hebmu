#!/usr/bin/env bash
# Capture metrics + PNGs for one or more example.md slide indices.
set -euo pipefail

ROOT="${HEBMU_VERIFY_ROOT:-$(pwd)}"
SKILL_DIR="$ROOT/.cursor/skills/verify-hebmu"
RUN_ID="${HEBMU_VERIFY_RUN_ID:-}"
if [[ -z "$RUN_ID" && -f "$SKILL_DIR/artifacts/runs/latest-id" ]]; then
  RUN_ID="$(cat "$SKILL_DIR/artifacts/runs/latest-id")"
fi
if [[ -z "$RUN_ID" ]]; then
  echo "measure.sh: no HEBMU_VERIFY_RUN_ID; launch first" >&2
  exit 1
fi

STATE="$SKILL_DIR/artifacts/runs/$RUN_ID/state.env"
# shellcheck disable=SC1090
source "$STATE"

if [[ "$#" -lt 1 ]]; then
  echo "usage: measure.sh <slideIndex> [slideIndex...]" >&2
  exit 1
fi

PROOF="$SKILL_DIR/artifacts/proof/$RUN_ID"
mkdir -p "$PROOF"
export HEBMU_VERIFY_PROOF_DIR="$PROOF"
export HEBMU_VERIFY_URL="${HEBMU_VERIFY_URL%/}/"

cd "$ROOT"
node "$SKILL_DIR/scripts/measure.mjs" --base "$HEBMU_VERIFY_URL" "$@"
echo "measure.sh: proof dir $PROOF"
