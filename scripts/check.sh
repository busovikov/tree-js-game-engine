#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== @haku check =="

if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm -r run build
  pnpm test
else
  echo "pnpm not found — building packages with npm"
  for pkg in schema core serializer engine editor create; do
    (cd "packages/$pkg" && npm run build)
  done
  npx vitest run packages/schema/src/index.test.ts packages/core/src/world.test.ts packages/serializer/src/index.test.ts
  (cd apps/playground && npm run build)
  (cd apps/editor && npm run build)
fi

echo "== playground bundle audit =="
if grep -qi 'react-dom\|@haku/editor\|TransformControls' apps/playground/dist/assets/*.js 2>/dev/null; then
  echo "FAIL: editor code found in playground bundle"
  exit 1
fi

echo "OK: all checks passed"
