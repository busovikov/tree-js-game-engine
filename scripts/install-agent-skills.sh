#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing Tier 1 + React agent skills into .cursor/skills/ …"

# --- Tier 1: Engineering workflow ---
npx skills add addyosmani/agent-skills --skill source-driven-development -y
npx skills add addyosmani/agent-skills --skill incremental-implementation -y
npx skills add addyosmani/agent-skills --skill test-driven-development -y
npx skills add addyosmani/agent-skills --skill ci-cd-and-automation -y
npx skills add addyosmani/agent-skills --skill git-workflow-and-versioning -y
npx skills add addyosmani/agent-skills --skill context-engineering -y

# --- Tier 1: Three.js (engine) ---
npx skills add emalorenzo/three-agent-skills --skill three-best-practices -y
npx skills add cloudai-x/threejs-skills --skill threejs-fundamentals -y
npx skills add cloudai-x/threejs-skills --skill threejs-loaders -y
npx skills add cloudai-x/threejs-skills --skill threejs-animation -y
npx skills add cloudai-x/threejs-skills --skill threejs-geometry -y

# --- Tier 1: Git / GitHub ---
npx skills add gardusig/cursor-skills -y

# --- React (editor UI) ---
npx skills add vercel-labs/agent-skills --skill react-best-practices -y
npx skills add vercel-labs/agent-skills --skill composition-patterns -y
npx skills add vercel-labs/agent-skills --skill web-design-guidelines -y
npx skills add addyosmani/agent-skills --skill frontend-ui-engineering -y

echo "Done. Verify: npx skills list"
