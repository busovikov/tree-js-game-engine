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

**Physics (optional):** `Engine.setPhysicsBackend(backend)` registers `PhysicsWorldSystem` — deterministic fixed 60 Hz steps via `@haku/physics`, with dynamic body transforms written back to `Transform` components. `PhysicsWorldSystem` is the sole simulation-authoritative writer for registered chassis transforms; vehicle visual systems only update wheel-local presentation data. Editor and playground use the shared `PHYSICS_CATCH_UP_POLICY`: up to three substeps recover uneven 30–60 FPS frames, while render-frame input and accumulated backlog are capped to one catch-up budget (50 ms) so hitches drop excess time instead of causing a spiral of death. Rapier wiring belongs to app composition roots: editor Play mode and playground may depend on `@haku/physics-rapier`, while engine production dependencies remain on the abstract `@haku/physics` API.

**Physics presentation interpolation:** `PhysicsWorldSystem` retains previous/current fixed-step poses and exposes a render-only resolver using `accumulator / fixedTimestep`. Position uses lerp; rotation uses normalized shortest-path quaternion interpolation. `RenderSyncSystem` applies the resolved pose directly to `Object3D` and never writes it into the simulation-authoritative `Transform`. Vehicle chase/follow cameras resolve the same chassis presentation pose, and wheel child meshes inherit that interpolated parent pose. Wheel-local suspension, steering, and spin remain sampled from the current fixed-step controller state; there is no separate wheel-pose interpolation buffer. First registration, respawn/teleport, backend replacement, and `Engine.loadWorld()` / `setWorld()` invalidate history and snap instead of blending across discontinuities. This is interpolation only (one fixed-step of presentation latency), not extrapolation or networking prediction.

**Force lifetime:** `IPhysicsWorld.applyForce()` accumulates force and point torque for exactly the next backend `step()`; Stub and Rapier clear both after integration. Render-frame controllers that need continuous force queue a `PhysicsWorldSystem` substep action so the force is recomputed before every fixed substep, as the custom spring does.

**Primitive colliders (T01.4):** Box, sphere, and capsule shapes attach via `PhysicsShapeDescriptor` on `IPhysicsWorld.attachShape()`. Use `createBodyWithShape()` from `@haku/physics` to spawn static ground or dynamic bodies. Static bodies need no entity registration; register dynamic bodies with `PhysicsWorldSystem.registerBody()` for transform sync.

**Collider component (T01.7):** `Collider` in `@haku/schema` / `@haku/core` — discriminated union on `shape` (`box` \| `sphere` \| `capsule`) with size fields aligned to `PhysicsShapeDescriptor`, local `offset` + `rotation`, `isStatic` body flag, and optional runtime `physicsBodyHandle`. The schema accepts runtime handles so active worlds and legacy polluted scenes remain load-compatible, while `@haku/serializer` explicitly removes physics handle fields from Collider data on save and editor component copy. Editor UI (T01.9) and engine sync spawn bodies from component data.

**PhysicsController component (T01.11):** `PhysicsController` in `@haku/schema` / `@haku/core` — a discriminated union for custom/dynamic raycast vehicles, arcade and revolute-joint vehicles, kinematic characters, custom springs, and pointer controls. Vehicle-style variants retain grouped chassis, wheel, suspension, engine, steering, brake, jump, and assist parameters where applicable. The shared optional `physicsHandle` is runtime-only controller state: schemas retain it in memory for runtime/load compatibility, but the component-specific persistence policy removes `physicsBodyHandle`, `physicsHandle`, and legacy `physicsVehicleHandle` from saves and editor component copy payloads. Other components and nested user data are not recursively filtered.

**Raycast vehicle (T01.12):** Shared sketchbook-style solver in `@haku/physics` (`stepRaycastVehicle`) — per-wheel suspension raycasts, spring-damper (compression/relaxation), lateral friction along wheel axle, engine/brake/steering via `IRaycastVehicle`. `StubPhysicsBackend` and `RapierPhysicsBackend` call the solver in `step()` before integration; Rapier types stay in `@haku/physics-rapier` only. **Implementation references:** [`links.md` § Rapier](./links.md#rapier-dimforge-rapier3d-compat-0193) (official docs, Three.js Rapier vehicle example, Isaac Mason custom raycast vehicle). Tune `PhysicsController` custom-raycast defaults for the Rapier stack in Play mode — do not port reference-game physics constants. Visual sync (T01.14) and arcade assists (T01.15) out of scope.

**Vehicle controller (T01.13):** `VehicleControllerSystem` in `@haku/engine` (order 48, before `PhysicsWorldSystem`) — creates `IRaycastVehicle` per entity with a custom-raycast `PhysicsController` + collider body; reads component params each frame. RWD engine force, smoothed steering, coast/service/handbrake, boost speed cap, jump with grounded check. Programmatic input via `setVehicleInput(entityId, { throttle, steer, boost, jump, brake })`.

**Input binding (T01.18):** `InputBindingSystem` in `@haku/engine` (order 47) — reads `InputManager` actions each frame and calls `setVehicleInput` on the controlled vehicle entity (explicit or first enabled vehicle-style `PhysicsController`). R pulse queues respawn via `RespawnSystem` (T01.21). Clears jump/respawn pulses each frame; orbit/zoom deltas consumed by `ChaseCameraSystem`.

**Respawn (T01.21):** `RespawnSystem` in `@haku/engine` (order 49) — captures spawn pose from initial vehicle transform; auto-respawns when chassis Y &lt; fall threshold (default −20, reference-aligned); manual reset on R via `InputBindingSystem` → `requestRespawn`. Resets physics body transform + linear/angular velocity and vehicle steer/jump/brake state. Wired in `startVehiclePlayMode()`.

**Chase camera (T01.19):** `ChaseCameraSystem` in `@haku/engine` (order 91, after vehicle visual sync) — follows the controlled vehicle's presentation-resolved pose with offset + exponential lerp; mouse orbit from `InputManager` (`cameraOrbitDelta`, `cameraZoomDelta`) with pitch clamp; airborne blend when wheels leave ground; boost FOV widen (lerp scene camera `fov` → 72). Updates scene camera entity `Transform` + `Camera` each frame. Registered by `startVehiclePlayMode()` alongside controller, input binding, and visual sync. Post-FX FOV blend (T01.31) out of scope.

**Runtime input (T01.17):** `InputManager` in `@haku/engine` (`packages/engine/src/input/`) — play-mode keyboard + pointer abstraction (AD-07 v1). Tracks key down/up into throttle/steer axes and modifier actions (boost, brake/handbrake, jump pulse, respawn pulse); pointer drag → `cameraOrbitDelta`, wheel → `cameraZoomDelta`. `attach`/`detach` register DOM listeners on window/canvas; `enable`/`disable` gate processing and release held keys on pause/exit. `endFrame()` clears orbit/zoom after chase camera consumes them.

**Vehicle visual sync (T01.14):** `VehicleVisualSyncSystem` in `@haku/engine` (order 90, after physics, before `RenderSyncSystem`) — reads the chassis physics pose to compute four wheel child entity transforms from `IRaycastVehicle` wheel state (contact, suspension length, steering, spin), but never writes the chassis `Transform`. `PhysicsWorldSystem` already performed the authoritative chassis write at order 50. Wheel meshes: child entities with `MeshRenderer`, named `frontLeft` / `frontRight` / `backLeft` / `backRight` (or first four mesh children in FL→FR→BL→BR order). Edit-mode dynamic-raycast wheel rest poses are installed as a `RenderSyncSystem` presentation resolver; they do not mutate authored wheel transforms or scene snapshots. Tire marks (T01.16) out of scope.

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
