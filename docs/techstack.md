# Tech Stack

> Per-module technology choices. Use this when adding dependencies or choosing tools.

This file documents installed/current technology. Approved target packages and replaceable
React Flow/Monaco providers are described in
[`node-graph-architecture.md`](./node-graph-architecture.md) and are added only in their
milestones. The target remains browser-first: authoring cannot require a CLI, Node daemon,
or server-side processing.

## Monorepo

| Tool | Version / notes |
| ---- | --------------- |
| **Package manager** | pnpm 9.x workspaces (`pnpm-workspace.yaml`) |
| **Language** | TypeScript 5.7+ |
| **Node** | ≥ 20 |
| **Test runner** | Vitest (root `vitest.config.ts`) |
| **Lint** | ESLint 9 + `@typescript-eslint` |
| **Format** | Prettier |

Root scripts: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.

## `@haku/assets`

**Role:** UUID project asset manifest, typed references, structured diagnostics, asset-type
registry, manifest index, and deterministic dependency closure.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/schema` | Base UUID and typed-reference schemas |
| **Zod** | Manifest and asset descriptor schemas |

**Build:** `tsc` → `dist/`

---

## `@haku/schema`

**Role:** Scene document v1 — Zod schemas, types, material registry. No runtime, no Three.js.

| Dependency | Purpose |
| ---------- | ------- |
| **Zod** ^3.25 | Schema validation, inferred TS types |

**Build:** `tsc` → `dist/`

**Key modules:**
- `index.ts` — `SceneDocument`, components (`Transform`, `Camera`, `Light`, `MeshRenderer`, …)
- `material.ts` — `MaterialTypeSchema`, `MATERIAL_PROPERTY_SPECS`, `switchMaterialType()`
- `render-settings.ts` — `RenderSettings`, feature flags
- `rendering-layers.ts` — layer bitmask constants

**Tests:** `packages/schema/src/*.test.ts`

---

## `@haku/core`

**Role:** Simulation contract — `IWorld`, components, systems, `IRenderBackend` interface. No Three.js, no DOM.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/schema` | Component data shapes |
| **Zod** | Component registry validation |

**Build:** `tsc` → `dist/`

**Key exports:**
- `World` — scene-graph implementation of `IWorld`
- `*Component` — typed component handles (`TransformComponent`, `MeshRendererComponent`, …)
- `cloneWorld()` — deep clone for undo/play snapshots
- `IRenderBackend`, `ISystem` — interfaces for engine

**Tests:** `packages/core/src/world.test.ts`

---

## `@haku/serializer`

**Role:** `SceneDocument` ↔ `IWorld` hydration and persistence.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/schema` | Validation |
| `@haku/core` | World construction |

**Exports:**
- `.` — browser-safe load/save
- `./node` — filesystem helpers (Node only)

**Build:** `tsc`

**Tests:** roundtrip golden test in `packages/serializer/src/index.test.ts`

---

## `@haku/physics`

**Role:** Backend-agnostic physics simulation API — rigid bodies, colliders, raycasts, raycast vehicle interface. No Rapier, no Three.js.

| Dependency | Purpose |
| ---------- | ------- |
| *(none)* | Pure TypeScript interfaces + stub backend for CI |

**Build:** `tsc` → `dist/`

**Key exports:**
- `IPhysicsBackend`, `IPhysicsWorld`, `PhysicsWorld`
- `createBodyWithShape()`, `destroyBodyWithShape()` — spawn primitive colliders on bodies
- `StubPhysicsBackend` — no-op backend for unit tests without WASM
- Shape descriptors: box, sphere, capsule

**Tests:** `packages/physics/src/stub-backend.test.ts`, `packages/physics/src/primitives.test.ts`

**Vehicle solver references:** [`links.md` § Rapier](./links.md#rapier-dimforge-rapier3d-compat-0193) — Rapier docs + custom raycast vehicle examples (Isaac Mason sketch, Three.js Rapier vehicle controller).

---

## `@haku/physics-rapier`

**Role:** Rapier WASM adapter implementing `IPhysicsBackend` (AD-02). All `@dimforge/rapier3d-compat` imports confined to this package.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/physics` | Abstract backend contract |
| `@dimforge/rapier3d-compat` ^0.19.3 | WASM physics engine |

**Build:** `tsc` → `dist/`

**Key exports:**
- `RapierPhysicsBackend`, `createRapierPhysicsBackend()`, `ensureRapierWasmLoaded()`

**Tests:** `packages/physics-rapier/src/rapier-backend.test.ts` (WASM init, bodies, colliders, raycast, vehicle hooks)

**Official docs & vehicle references:** [`links.md` § Rapier](./links.md#rapier-dimforge-rapier3d-compat-0193) — https://rapier.rs/docs/, Three.js Rapier vehicle example, Isaac Mason custom raycast vehicle sketch.

---

## `@haku/engine`

**Role:** Three.js runtime — game loop, render backend, asset loading, render sync.

| Dependency | Purpose |
| ---------- | ------- |
| **Three.js** ^0.171 | WebGL rendering, loaders, post-processing examples |
| `@haku/core`, `@haku/schema`, `@haku/serializer` | World + scene data |

**Build:** `tsc`

**Entry points:**
- `@haku/engine` — full API (editor + dev tools)
- `@haku/engine/runtime` — tree-shake friendly for shipped games

**Key modules:**
| Path | Role |
| ---- | ---- |
| `engine.ts` | `Engine` class, RAF loop, system runner |
| `render-backend.ts` | `ThreeRenderBackend` facade |
| `render-sync/` | `RenderSyncSystem` — entity → Object3D |
| `mesh-factory.ts` | Material/geometry factories |
| `model-loader.ts` | glTF loading, async material apply |
| `render/` | `RenderGraph`, passes, `apply-render-settings.ts` |
| `runtime.ts` | Minimal game bootstrap exports |

**Tests:** mesh factory, render settings, shadow sync, layer resolver, post-process chain.

**Must NOT depend on:** React, `@haku/editor`.

---

## `@haku/ui`

**Role:** Strict UUID UI assets, production native DOM renderer, public service/events,
Custom Node SDK, and graph runtime adapters. No React or editor dependency.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets`, `@haku/schema` | Asset descriptor, typed image references, UUID schemas |
| `@haku/graph`, `@haku/graph-runtime` | UI node contracts and runtime adapters |
| **Zod** ^3.25 | Strict UI document validation |

**Build:** `tsc` → `dist/`

**Tests:** schema/DOM behavior, asset closure, service, SDK, graph contracts/adapters, and
playground native/service/graph diagnostic.

**Must NOT depend on:** React, `react-dom`, `@haku/editor`.

---

## `@haku/audio`

**Role:** DOM-free Audio Clip/AudioSource contracts, headless mixer/runtime, services,
Custom Node SDK, graph adapters, and activation/pool lifecycle.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets`, `@haku/schema`, `@haku/core` | Asset/component schemas, registries, and typed IDs |
| `@haku/graph`, `@haku/graph-runtime` | Audio node contracts, checkpoint effects, and adapters |
| `@haku/pool` | External voice lifecycle participation |
| **Zod** ^3.25 | Strict AudioSource and pose validation |

**Build:** `tsc` → `dist/`

**Tests:** model/schema, headless routing/controls, activation/pool cleanup, service/SDK,
graph contracts/adapters, and failure paths.

**Must NOT depend on:** DOM, Web Audio, React, `react-dom`, `@haku/editor`.

---

## `@haku/audio-web`

**Role:** Browser `AudioContext` adapter for local byte decoding, buses, spatial/listener
graphs, gesture unlock, pause/resume, natural completion, and disposal.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/audio` | Backend, clip, voice, bus, and listener contracts |

**Build:** `tsc` → `dist/`

**Tests:** fake-context decode/graph/lifecycle behavior plus production user-Chrome
diagnostic in `apps/playground`.

**Must NOT own:** serialized asset/component data or editor UI.

---

## `@haku/editor`

**Role:** React UI library — panels, inspector, viewport orchestration, undo.

| Dependency | Purpose |
| ---------- | ------- |
| **React** ^18.3 | UI (peer dependency) |
| **Zustand** ^5 | Editor state store |
| **react-resizable-panels** ^2 | Dockable panel layout |
| **Three.js** ^0.171 | Viewport gizmos, `TransformControls`, `OrbitControls` (editor-only) |
| `@haku/engine`, `@haku/core`, `@haku/schema`, `@haku/serializer`, `@haku/ui`, `@haku/audio`, `@haku/audio-web` | Same render/UI/audio asset paths plus local preview adapter |

**Build:** `tsc` (no Vite — consumed by `apps/editor`)

**Architecture:** See [ui-kit.md](./ui-kit.md) and [architecture.md](./architecture.md).

**Must NOT be imported by:** `@haku/engine`, `@haku/playground`.

---

## `@haku/create`

**Role:** CLI scaffolder for external game projects.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets` | Validate and resolve template project manifests |
| `@haku/schema` | Validate template scene JSON |
| Node built-ins | File copy, `git init` |

**CLI:** `create-haku` (bin)

**Templates:** `packages/create/templates/` — Vite game shell with `@haku/engine/runtime` only.

---

## `apps/playground` (`@haku/playground`)

**Role:** Reference game — engine only, no React.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets` | Project manifest validation and UUID asset lookup |
| `@haku/engine` | Runtime |
| `@haku/ui` | Production DOM UI diagnostic; no editor/React dependency |
| `@haku/audio`, `@haku/audio-web` | Production local-byte Web Audio diagnostic; no editor/React dependency |
| **Vite** ^6 | Dev server + production bundle |

**Layout:** `haku.project.json`, `public/assets/scenes/`, `src/main.ts`

---

## `apps/editor` (`@haku/editor-app`)

**Role:** Vite shell that mounts `@haku/editor`.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/editor` | Editor UI library |
| **React** ^18.3 | Mount point |
| **Vite** ^6 + `@vitejs/plugin-react` | Dev/build |

---

## Cross-cutting conventions

| Concern | Choice |
| ------- | ------ |
| Module format | ESM (`"type": "module"`) |
| Package linking | `workspace:*` or `file:../` in monorepo |
| Scene files | `*.scene.json`, schema v1 |
| Project manifest | `haku.project.json`, schema v1 UUID asset inventory |
| Rotation in JSON | Quaternion `[x, y, z, w]` |
| Entity IDs | UUID v4 strings |

## Explicitly out of scope (do not add without user request)

- ECS backend (`@haku/engine-ecs`)
- React in engine/playground
- R3F (React Three Fiber) in engine
- Spatial index / frustum culling at scale
- Multi-user collaboration
- Mobile export pipelines
