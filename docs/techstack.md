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
| **Package manager** | pnpm 9.15.0 workspaces (`packageManager`, `pnpm-workspace.yaml`) |
| **Language** | TypeScript ^5.7.2 at the root |
| **Node** | ≥ 20 |
| **Test runner** | Vitest ^2.1.8 (root `vitest.config.ts`) |
| **Lint** | ESLint ^9.16.0 + `@typescript-eslint` ^8.18.0 |
| **Format** | Prettier ^3.4.2 |

Root scripts: `pnpm build`, `pnpm test`, `pnpm lint`, `pnpm typecheck`.

## Published workspace inventory

All published `@haku/*` manifests currently declare version `0.1.0`. Public specifiers are
defined by each package's `exports`; [`links.md`](./links.md#published-entrypoints) inventories
every root and subpath entrypoint.

| Package | Public role |
| ------- | ----------- |
| `@haku/assets` | UUID manifest, asset registry, and dependency closure |
| `@haku/audio` | DOM-free audio contracts, headless runtime, graph/SDK integration |
| `@haku/audio-web` | Web Audio backend |
| `@haku/build` | Browser TypeScript tooling, Worker build, static export/ZIP |
| `@haku/core` | World, lifecycle, scheduler, custom behavior, replay primitives |
| `@haku/create` | Node scaffolder for engine-only games |
| `@haku/editor` | React editor library; development only |
| `@haku/engine` | Three.js runtime and engine systems |
| `@haku/graph` | Typed graph schema, node/type registries, compiler |
| `@haku/graph-runtime` | Interpreter, effects, checkpoint/rewind/persistence |
| `@haku/physics` | Backend-neutral physics contracts |
| `@haku/physics-rapier` | Rapier ^0.19.3 adapter |
| `@haku/platform` | Provider-neutral lifecycle/capability contracts |
| `@haku/pool` | Prefab-backed entity pooling and lifecycle integration |
| `@haku/schema` | Serializable scene/project primitives and path helpers |
| `@haku/serializer` | Scene/prefab hydration and persistence |
| `@haku/storage` | Async save slots, IndexedDB, replication contracts |
| `@haku/ui` | React-free production DOM UI assets/runtime |

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
| `@haku/core`, `@haku/schema` | Entity/world IDs and serializable physics components |
| **Zod** ^3.25.76 | Physics component validation |

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
| `@haku/audio`, `@haku/assets`, `@haku/core`, `@haku/graph`, `@haku/physics`, `@haku/pool`, `@haku/schema`, `@haku/serializer`, `@haku/ui` | Runtime subsystem contracts |

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

## `@haku/graph` and `@haku/graph-runtime`

**Role:** Strict metadata-only graph contracts/compiler plus scheduler-owned execution,
checkpoint/rewind, and injected public-service runtime adapters.

M10f adds deterministic catalog composition at
`packages/graph/src/foundation-catalog.ts` and
`packages/graph-runtime/src/foundation-runtime-catalog.ts`. Graph-owned lifecycle,
control/math/vector, variable/random, world/component/prefab/physics, save/platform/debug,
and assertion foundations compose with pool, UI, and audio registrars without reversing
package dependencies.

**Tests:** combined registry fingerprint, domains/queue crossings, effects and async policy;
seeded-random checkpoint/rewind and undeclared-resource rejection; real public-service
composition in the playground.

**Must NOT depend on:** React, React Flow, editor packages, browser storage, or subsystem
implementations.

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

## `@haku/storage`

**Role:** Async typed local save slots, separate replay artifacts, optimistic revisions,
IndexedDB/in-memory backends, replication contracts, and graph checkpoint adaptation.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/graph-runtime` | Public `SaveService` and persistent checkpoint records |
| Browser IndexedDB/Storage APIs | Atomic local persistence and optional usage/quota estimates |

**Build:** `tsc` → `dist/`

**Tests:** in-memory clone/quota/conflict cases, deterministic fake IndexedDB transactions,
replication surface/limits, and graph migration/fallback integration.

**Must NOT depend on:** engine, editor, React, provider SDKs, or remote services.

---

## `@haku/platform`

**Role:** Provider-neutral capabilities, auth-provider boundary, visibility/focus lifecycle,
composed pause reasons, and narrow simulation/input/audio callbacks.

**Build:** `tsc` → `dist/`

**Tests:** deterministic visibility/focus/platform-pause transitions and honest capability
queries.

**Must NOT own:** engine/input/audio instances, auth tokens, storage, or provider SDK handles.

---

## `@haku/build`

**Role:** Browser-local TypeScript analysis, trust-gated gameplay/editor bundles, and
deterministic static HTML5 ZIP export.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets` | Manifest validation and deterministic asset dependency closure |
| **TypeScript** ^5.7 | Browser language-service diagnostics |
| **esbuild-wasm** ^0.28 | Worker-local tree-shaken/minified ESM runtime compilation |

Static export uses in-memory inputs and outputs only. The editor creates one lazy dedicated
Worker, packages root `index.html` plus reachable relative assets into a stored ZIP, and
downloads it through a short-lived Blob URL. The archive contains no editor or
editor-extension bundle.

**Build:** `tsc` → `dist/`

**Tests:** closure/URL rewriting, Worker diagnostics, ZIP records/path safety/modes, and
browser-client RPC.

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
| `@haku/schema` | Validate template scene JSON |
| Node built-ins | File copy, `git init` |

**CLI:** `create-haku` (bin)

**Templates:** `packages/create/templates/` — relative Vite game shell with public
`@haku/engine/runtime` and `@haku/assets` imports. A local `file:` engine link derives its
complete internal production dependency closure from package manifests.

---

## `apps/playground` (`@haku/playground`)

**Role:** Diagnostic catalog — engine only, no React.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/assets` | Project manifest validation and UUID asset lookup |
| `@haku/engine` | Runtime |
| `@haku/ui` | Production DOM UI diagnostic; no editor/React dependency |
| `@haku/audio`, `@haku/audio-web` | Production local-byte Web Audio diagnostic; no editor/React dependency |
| `@haku/storage`, `@haku/platform` | Real IndexedDB and browser lifecycle/control diagnostic; no cloud SDK |
| `@haku/graph`, `@haku/graph-runtime`, `@haku/pool` | Combined public-service graph composition and deterministic trace |
| `@haku/build/browser-static-export` | Bounded in-memory export fixture without Worker/toolchain closure |
| **Vite** ^6 | Dev server + production bundle |

**Layout:** `haku.project.json`, `public/assets/scenes/`, `src/main.ts`; isolated M10f browser
QA uses `m10f-diagnostic.html` and `vite.m10f.config.ts` with `publicDir: false`.

---

## `apps/bounce-run` (`@haku/bounce-run`)

**Role:** Complete engine-only proof for graph/runtime/scheduler/checkpoint, prefab/pool,
Rapier physics, DOM UI, Web Audio, IndexedDB saves, replay/generator/QA, and static export.
It imports public `@haku/*` entrypoints only and has no editor or React dependency.

| Dependency | Purpose |
| ---------- | ------- |
| `@haku/engine` and runtime subsystem packages | Production game composition |
| `@haku/physics-rapier` | Concrete browser physics adapter |
| **Vite** ^6.0.3 | Dev server and relative production build |

**Commands:** `pnpm --filter @haku/bounce-run dev`,
`pnpm --filter @haku/bounce-run typecheck`, `pnpm --filter @haku/bounce-run build`.

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
