# @haku

Three.js-based browser game **engine** + standalone **editor**. Production games depend on `@haku/engine` only.

## Quick start

```bash
# Install (pnpm recommended; npm per-package also works in this repo)
corepack prepare pnpm@9.15.0 --activate
pnpm install

# Build all packages
pnpm build

# Run reference game (engine only)
pnpm --filter @haku/playground dev

# Run editor
pnpm --filter @haku/editor-app dev

# Tests (serializer roundtrip + core smoke)
pnpm test
```

## Monorepo layout

| Package | Role |
|---------|------|
| `@haku/schema` | Scene JSON v1 Zod schemas |
| `@haku/core` | `IWorld`, components, systems |
| `@haku/serializer` | Load/save scenes (+ `@haku/serializer/node` for fs) |
| `@haku/engine` | Three.js runtime (`@haku/engine/runtime` for games) |
| `@haku/editor` | React editor UI library |
| `@haku/create` | `create-haku` scaffolder for external games |
| `apps/playground` | Reference game project |
| `apps/editor` | Editor shell |

## Editor features

- **Open Project…** — pick a folder with `haku.project.json` (e.g. `apps/playground`)
- **Hierarchy / Inspector / Viewport / Assets** — edit entities, transforms, prototypes
- **Undo/Redo** — transform, create/delete entity, prefab ops
- **Create Prefab / Place Prefab** — prefab workflow v1
- **Play mode** — snapshot on play, restore on stop
- **Import assets** — GLTF/PNG into virtual project (browser folder picker)

## CI

```bash
./scripts/check.sh
```

```bash
pnpm --filter @haku/create exec create-haku ../my-game --name my-game --no-install
cd ../my-game
# set "@haku/engine": "file:../tree-js-projects/packages/engine"
pnpm install && pnpm dev
```

## Architecture

- **Simulation ≠ Presentation**: component data in `IWorld`; `RenderSyncSystem` syncs to Three.js
- **Editor/engine split**: no React in engine/playground bundles
- **Scene format**: `examples/minimal.scene.json`, validated by `@haku/schema`

See `AGENTS.md` and the full plan in `/Users/pavel/haku/IMPLEMENTATION_PLAN.md`.
