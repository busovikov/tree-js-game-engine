# Architecture

> System design for @haku — browser game engine + standalone editor.

## Product split

```
Production game                    Development
─────────────────                  ───────────
@haku/engine                       @haku/editor
@haku/schema                       apps/editor (Vite shell)
@haku/core
@haku/serializer
scene assets (.scene.json)
```

**Rule:** shipped games never bundle editor code or React.

---

## Monorepo dependency graph

```
@haku/schema          (no deps)
    ↓
@haku/core            → schema
    ↓
@haku/physics         (abstract API — no Rapier/Three.js)
@haku/physics-rapier  → physics, @dimforge/rapier3d-compat (adapter only)
@haku/serializer      → schema, core
    ↓
@haku/engine          → core, schema, serializer, physics, three
    ↓
@haku/editor          → engine, core, schema, serializer, react*, zustand
    ↓
@haku/editor-app      → editor

@haku/playground      → engine only
@haku/create          → schema (templates)
```

---

## Core principle: Simulation ≠ Presentation

| Layer | Owns | Must NOT own |
| ----- | ---- | ------------ |
| **Simulation** | Entity graph, component data, game systems | Three.js objects, GPU state |
| **Presentation** | Object3D tree, materials, lights, cameras | Source-of-truth component data |

```
SceneDocument (.scene.json)
       │
       ▼ loadSceneDocument (serializer)
    IWorld (components: Transform, MeshRenderer, Light, Camera, …)
       │
       ▼ RenderSyncSystem.syncAll() each tick
    THREE.Object3D tree
       │
       ▼ ThreeRenderBackend.render()
    WebGL frame
```

**Implication for agents:** edit components in `IWorld` / `SceneDocument`; never put `THREE.Mesh` in component data.

---

## `IWorld` contract

Stable API between editor, serializer, and engine. Scene-graph today; ECS-compatible shape for future.

```typescript
interface IWorld {
  createEntity(name?: string): EntityId
  destroyEntity(id: EntityId): void
  addComponent<T>(id, type, data): void
  getComponent<T>(id, type): T | undefined
  setParent(child, parent): void
  query(...types): Iterable<EntityId>
}
```

- Entity IDs: **UUID v4** strings (not indices)
- Components: **plain data** + Zod schema in `@haku/schema`
- Hierarchy: `parent` field on entity (not inside Transform)

Implementation: `World` class in `@haku/core`.

---

## Scene document (v1)

Top-level shape (`packages/schema/src/index.ts`):

```json
{
  "schemaVersion": 1,
  "metadata": { "name": "Level01" },
  "entities": [ /* EntityRecord[] */ ],
  "prototypes": { /* RenderPrototype map */ },
  "prefabs": { /* PrefabDefinition map */ },
  "renderSettings": { /* optional, merged with defaults */ }
}
```

**Entity record:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "MainCamera",
  "parent": null,
  "components": [
    { "type": "Transform", "data": { "position": [0,2,5], "rotation": [0,0,0,1], "scale": [1,1,1] } }
  ]
}
```

**References:** `{ "$ref": "entity:uuid" }`, `{ "$ref": "asset:path" }`, `{ "$ref": "prefab:id" }`

**Prefabs:** `PrefabInstance` component with `prefabId` + `overrides`; expanded at load time.

---

## Engine loop

`packages/engine/src/engine.ts`:

```
tick(dt):
  1. systems.update(world, dt)     // game logic (PhysicsWorldSystem @ order 50 when enabled)
  2. RenderSyncSystem.syncAll()    // mirror components → Three.js
  3. backend.render()              // forward pass + editor overlays
```

**Physics (optional):** `Engine.setPhysicsBackend(backend)` registers `PhysicsWorldSystem` — fixed 60 Hz step via `@haku/physics`, dynamic body transforms written back to `Transform` components. Rapier wiring stays in playground/app factory (`@haku/physics-rapier`), not in engine core.

**Primitive colliders (T01.4):** Box, sphere, and capsule shapes attach via `PhysicsShapeDescriptor` on `IPhysicsWorld.attachShape()`. Use `createBodyWithShape()` from `@haku/physics` to spawn static ground or dynamic bodies. Static bodies need no entity registration; register dynamic bodies with `PhysicsWorldSystem.registerBody()` for transform sync.

**Collider component (T01.7):** `Collider` in `@haku/schema` / `@haku/core` — discriminated union on `shape` (`box` \| `sphere` \| `capsule`) with size fields aligned to `PhysicsShapeDescriptor`, local `offset` + `rotation`, `isStatic` body flag, and optional runtime `physicsBodyHandle`. `@haku/serializer` load/save round-trips collider fields via the generic component path (T01.8); editor UI (T01.9) and engine sync spawn bodies from component data.

**Vehicle component (T01.11):** `Vehicle` in `@haku/schema` / `@haku/core` — grouped tunable params for chassis (mass, halfExtents, lift, damping, inertia), four-wheel connection pattern (radius, halfWidth, height, halfLength), suspension (stiffness, rest length, travel, friction, damping), engine/steering/brakes, jump, and arcade assists. Fields align with `@haku/physics` `WheelConfig` where applicable; optional runtime `physicsVehicleHandle` for raycast vehicle sync (T01.12). Serializer round-trip via generic component path; editor inspector deferred to T01.27.

**Raycast vehicle (T01.12):** Shared sketchbook-style solver in `@haku/physics` (`stepRaycastVehicle`) — per-wheel suspension raycasts, spring-damper (compression/relaxation), lateral friction, engine/brake/steering via `IRaycastVehicle`. `StubPhysicsBackend` and `RapierPhysicsBackend` call the solver in `step()` before integration; Rapier types stay in `@haku/physics-rapier` only. Wheel state: `inContact`, `suspensionLength`, `rotation`, `steering`, `engineForce`. Visual sync (T01.14) and arcade assists (T01.15) out of scope.

**Vehicle controller (T01.13):** `VehicleControllerSystem` in `@haku/engine` (order 48, before `PhysicsWorldSystem`) — creates `IRaycastVehicle` per entity with `VehicleComponent` + collider body; reads component params each frame. RWD engine force, smoothed steering, coast/service/handbrake, boost speed cap, jump with grounded check. Programmatic input via `setVehicleInput(entityId, { throttle, steer, boost, jump, brake })` — keyboard binding deferred to T01.18.

**Vehicle visual sync (T01.14):** `VehicleVisualSyncSystem` in `@haku/engine` (order 90, after physics, before `RenderSyncSystem`) — writes chassis `Transform` from physics body pose and four wheel child entity transforms from `IRaycastVehicle` wheel state (contact, suspension length, steering, spin). Wheel meshes: child entities with `MeshRenderer`, named `frontLeft` / `frontRight` / `backLeft` / `backRight` (or first four mesh children in FL→FR→BL→BR order). Tire marks (T01.16) out of scope.

- `Engine.start()` → `requestAnimationFrame`
- Editor creates `Engine` once in `ViewportPanel` `useEffect`; scene edits call `engine.setWorld()` — do not recreate engine per edit

---

## Render pipeline (current)

`ThreeRenderBackend`:
- Single `THREE.Scene`, one `WebGLRenderer`, one active camera
- Editor: internal orbit camera OR scene entity camera
- Selection outline: `OutlinePass` (editor-only, when targets set)

`RenderSyncSystem` per entity:
1. Create/rebuild Object3D when visual key changes
2. Sync mesh (primitives or async glTF)
3. Apply transform (respects `StaticComponent`)
4. Sync light/camera params
5. Reparent to match world hierarchy

**Roadmap:** `RenderGraph`, `RenderSettings`, shadows, post FX — see `RENDER_PLAN.md` and partial implementation in `packages/engine/src/render/`.

---

## Editor architecture

```
EditorApp (React)
├── MenuBar                    — File, Edit, View (Render Settings)
├── EditorLayout               — react-resizable-panels
│   ├── HierarchyPanel         — entity tree, drag-reparent
│   ├── HierarchyToolsPanel    — transform tools, gizmo space
│   ├── ViewportTabsShell      — Scene / Game tabs
│   ├── AssetBrowserPanel      — project assets
│   └── InspectorPanel         — component fields
├── useEditorStore (Zustand)   — world, selection, mode, tools
├── commitSceneEdit            — undo/redo via SceneEditCommand
├── globalCommandBus           — Command pattern
└── projectService             — open/save project, asset I/O
```

### Data flow (edit)

```
User action (inspector / gizmo / hierarchy)
    → commitSceneEdit(draft => { mutate draft.world + draft.sceneDocument })
    → SceneEditCommand pushed to CommandBus
    → store: world, sceneDocument, worldRevision++
    → ViewportPanel effect: engine.setWorld(world)
    → RenderSyncSystem syncs to viewport
```

### Edit vs Play mode

| | Edit | Play |
| - | ---- | ---- |
| Gizmos | ✅ | ❌ |
| Undo | ✅ | ❌ |
| World | live | snapshot → run → restore on stop |

Play snapshot: `cloneWorld()` stored in `playSnapshot`; restored in `exitPlayMode()`.

---

## Project layout (game project)

External games and `apps/playground` share this layout:

```
my-game/
├── haku.project.json       # name, entryScene, assetsDir
├── package.json            # @haku/engine only
├── src/main.ts             # Engine bootstrap
├── assets/
│   ├── scenes/*.scene.json
│   ├── models/
│   └── textures/
└── scripts/                # ScriptRef targets (future)
```

Editor opens folder containing `haku.project.json`; reads/writes scenes under project root.

---

## Render buckets (design, partial impl)

Entities reference `RenderPrototype` (`mode: mesh | instanced | batched | sprite-atlas`).

- Today: **mesh mode** fully wired for primitives + glTF
- Instancing/batching: stub hooks on backend — extend `RenderSyncSystem`, do not bypass it

---

## Extension points

| Need | Where |
| ---- | ----- |
| New component type | `@haku/schema` Zod + `@haku/core` registry + serializer + inspector fields + render sync |
| New material type | `material.ts` schema + `mesh-factory.ts` factory + inspector auto-lists from registry |
| New render feature | `render-settings.ts` feature flag + engine pass + Render Settings UI |
| Custom game logic | `apps/playground/src/main.ts` — add `ISystem` to engine |
| Editor command | `commands/*.ts` — implement `Command`, use `commitSceneEdit` for scene mutations |

---

## Key files index

```
packages/schema/src/          Scene + component schemas, materials, render settings
packages/core/src/            IWorld, World, components, types
packages/serializer/src/      loadSceneDocument, saveSceneDocument
packages/engine/src/
  engine.ts                   Engine loop
  render-backend.ts           ThreeRenderBackend
  render-sync/                Entity → Object3D sync
  render/                     RenderGraph, passes, apply helpers
  mesh-factory.ts             Material factories
packages/editor/src/
  store/editor-store.ts       Zustand state
  commands/scene-history.ts   commitSceneEdit, undo
  panels/ViewportPanel.tsx      Engine lifecycle + gizmos
  panels/InspectorPanel.tsx   Component editing
  services/project-service.ts Project I/O
apps/playground/src/main.ts   Minimal runtime bootstrap
apps/editor/                  Vite shell
```
