#!/usr/bin/env zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PW_DIR="$ROOT/.agents/tools/editor-playwright"
TARGET="${HAKU_TARGET_PATH:-$HOME/work/tmp-js-game-project}"

cd "$PW_DIR"
export HAKU_TARGET_PATH="$TARGET"

echo "Playwright from: $PW_DIR"
echo "Target project:  $HAKU_TARGET_PATH"
echo ""

pnpm exec playwright test tests/t01-39-vehicle-smoke.spec.ts "$@"
