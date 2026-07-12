#!/usr/bin/env zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TARGET="${HAKU_TARGET_PATH:-$HOME/work/tmp-js-game-project}"

cd "$ROOT"
export HAKU_TARGET_PATH="$TARGET"

echo "Starting editor with target: $HAKU_TARGET_PATH"
echo "Then open in browser (quotes required in zsh):"
echo "  open 'http://localhost:5174/?hakuOpenTarget=1'"
echo ""

pnpm --filter @haku/editor-app dev
