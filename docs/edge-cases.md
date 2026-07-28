# Edge Cases & Decisions

> Situations to anticipate, accepted solutions, and known gaps.  
> **Read this before implementing** to avoid repeating failed approaches.

Entries below describe the current v1 implementation unless marked otherwise. The
engine-game program deliberately replaces current schemas/assets without a compatibility
layer in M02. New graph, checkpoint, browser-code, activation, pool, UI, audio, save, and
export failure contracts are acceptance criteria in
[`engine-game-development-plan.md`](./engine-game-development-plan.md) and become current
entries here as their stages land.

---

## Agent testing mandate

**Do not test or implement only the happy path.**

Every feature must consider at minimum:

| Category | Question to answer |
| -------- | ------------------ |
| **Empty state** | What does UI/engine do with zero entities, no selection, no project, no assets? |
| **Invalid input** | What happens on bad JSON, wrong types, out-of-range numbers, missing refs? |
| **Partial failure** | What if load succeeds but asset fails? What if save fails mid-edit? |
| **Cancellation** | User closes picker, denies permission, presses Escape — silent or error? |
| **Concurrency** | Async glTF, rapid asset switch, undo during pending load |
| **Stale state** | Selection points to deleted entity, prefab removed, camera entity destroyed |
| **Mode guards** | Edit vs play, hand tool vs transform, multi-select mixed values |

**Required test types (not optional):**

```
Schema     — invalid input throws; legacy preprocess; defaults on {}
Serializer — roundtrip + reject schemaVersion mismatch + unknown component
Engine     — feature flag off path; stale loadId ignored; empty scene renders
Editor     — commitSceneEdit without world throws; AbortError not alerted
```

Manual viewport checks **supplement** automated tests — never replace them.

---

## Empty states

| Context | Condition | Expected behavior | Where |
| ------- | --------- | ----------------- | ----- |
| **No project** | `projectRoot === null` | Menu works; status bar shows `No scene loaded`; panels empty | `EditorApp.tsx` |
| **No scene file** | Project open but scene not loaded | Inspector: no world | `commitSceneEdit` throws `No scene loaded` |
| **No selection** | `selection.length === 0` | Inspector: `Select an entity` | `InspectorPanel` → `haku-inspector--empty` |
| **Empty hierarchy** | Zero entities in world | `No entities — click +` | `HierarchyPanel` |
| **Filter no match** | Hierarchy filter active, zero visible | `No entities match filter` | `HierarchyPanel` |
| **No model assets** | Asset dir empty | Model picker: `No model assets in project` | `ModelPickerDialog` |
| **No camera in scene** | Zero `Camera` components | `resolveActiveCameraId()` → `null`; editor falls back to orbit camera | `scene-camera.ts` |
| **No prefabs** | Manifest has no prefab assets | Place prefab menu → alert `No prefab assets in project` | `EditorApp.tsx` |
| **No model reference** | `MeshRenderer.modelAsset` omitted | Primitive renderers work; `ModelGeometry` has no model to load | `render-sync-system.ts` |
| **Empty folder picker** | `fileList.length === 0` | `No files selected` | `browser-project-store.ts` |
| **Selection outline** | No targets | Outline pass skipped (no GPU alloc) | `editor-selection-outline.ts` |
| **Post-processing off** | `features.postProcessing === false` | No `EffectComposer` created | `post-process-chain.ts` |

**Agent rule:** every new panel/dialog must define its empty state copy and disabled actions — not a blank panel.

---

## Validation errors

### Scene document (Zod)

| Input | Result | Test reference |
| ----- | ------ | -------------- |
| `schemaVersion: 2` | `validateSceneDocument()` throws | `serializer/index.test.ts` |
| Missing required fields | Zod error at parse | schema tests |
| Invalid entity UUID in `parent` | Parse failure | `EntityRecordSchema` |
| Unknown component `type` at load | `Unknown component type: X` | `serializer/index.ts` |
| Invalid `$ref` format | Zod regex failure | `EntityRefSchema`, `AssetRefSchema` |
| Legacy scene without `materialType` | Preprocess → `standard` | `material.ts` preprocess |
| Legacy scene without `renderSettings` | Preprocess → `defaultRenderSettings()` | `render-settings.test.ts` |
| Component data wrong shape | `type.schema.parse(comp.data)` throws at load | serializer hydrate |
| Collider/PhysicsController data contains runtime or legacy physics handles | Load succeeds and recognized handles remain available in memory; save and component copy omit `physicsBodyHandle`, `physicsHandle`, and `physicsVehicleHandle` | `serializer/collider.test.ts`, `serializer/physics-controller.test.ts` |
| Legacy `Collider.isStatic: false` without `RigidBody` | Load synthesizes `RigidBody { type: 'dynamic' }`; handle migrates from collider to RigidBody | `serializer/collider.test.ts` |
| Legacy `Collider.isStatic: true` or omitted | Collider-only implicit static body; no RigidBody synthesized | `serializer/physics-migration.ts` |
| `Collider` + `RigidBody` with `trimesh` + `type: dynamic` | Load throws `PhysicsValidationError` | `serializer/collider.test.ts` |
| Collider `layer` ≥ 16 | Schema parse failure at load | `collider.test.ts` |
| Scene without `physicsSettings` | Preprocess → `defaultPhysicsProjectSettings()` | `physics-project-settings.test.ts` |

**Do not** silently coerce invalid scene data — fail at load with clear error; log via `sceneLogError('load.failed', ...)`.

### Component field edits (inspector)

| Input | Result |
| ----- | ------ |
| Paste invalid clipboard component | `component.schema.parse()` throws — guard in `InspectorPanel` |
| Number out of Zod min/max | Browser input may clamp; schema re-parse on save |
| Multi-select mixed types | Field shows `—`, edit disabled | `multi-edit.ts` |
| Invalid light subtype data | `LightSchema.parse()` in sync/gizmos |

### Project manifest

| Input | Result |
| ----- | ------ |
| Missing `haku.project.json` | Open project fails at manifest read |
| Invalid manifest JSON/schema | `validateProjectManifest()` throws `AssetDiagnosticError` with `manifest.invalid` diagnostics |
| Duplicate asset UUID | `validateProjectManifest()` throws `asset.duplicate-id` |
| Unknown asset UUID | `ProjectAssetIndex.require()` throws `asset.unknown-id` |
| Typed reference points to the wrong asset type | `ProjectAssetIndex.require()` throws `asset.type-mismatch` |
| `entryScene` UUID missing or not a scene | Project open fails before scene loading |

### Gameplay graph assets and compilation

| Input | Result |
| ----- | ------ |
| UI-library state in a graph, node, property, or metadata object | Strict graph parse failure; React Flow objects never enter the asset |
| Palette, drag, property, connect, paste, duplicate, or delete mutation | `GraphAuthoringSession` emits a Haku command; Undo restores the prior strict asset |
| Input is already connected, has the wrong direction/kind, or has an incompatible type | Canvas rejects it before mutation; compiler validation remains authoritative |
| Create/open would replace dirty graph state | Editor requests discard confirmation; browser unload receives the unsaved-change guard |
| Duplicate graph node/callsite/connection/public-port UUID | Structured diagnostic with exact graph and local identity |
| Unknown node type or port | Structured registry/compiler diagnostic; no plan |
| Flow/event/data kind mismatch | Compile error at the target node/port/callsite and connection |
| Incompatible data types | Compile error with source/target causal chain; no implicit conversion |
| Data dependency cycle | Compile error with the deterministic cycle chain |
| Data edge crosses scheduler domains | Compile error; use a typed event instead |
| Flow/event crosses scheduler domains | Deterministic queue operation in the plan, never a synchronous call |
| Missing or incompatible subgraph | Compile error with root graph → subgraph call causal chain |
| `NodeRef` targets a node outside the same graph instance | Compile error; cross-instance node access is not representable |
| Unknown/external effect or dynamic resource read | Plan remains compilable but checkpoint-ineligible with causal reasons |
| Plan registry fingerprint differs at load | Plan is incompatible and must be recompiled |
| Browser-native `crypto.randomUUID()` is used by a graph command | Invoke through the `crypto` receiver; detached browser methods throw `Illegal invocation` |

### Gameplay graph runtime

| Input | Result |
| ----- | ------ |
| Cross-domain flow or any event fan-out | Enqueue through `EngineScheduler` in compiled connection order; never synchronously reenter the target |
| Parameter or declared resource changes during data evaluation | Current execution keeps its frozen snapshot; the next snapshot observes the incremented invalidation revision |
| Async node starts child work | Child must use the execution scope; downstream flow waits for all owned children |
| Graph instance deactivates, stops, or is destroyed | Abort owned tasks, invalidate queued continuations, clear subscriptions, and suppress cancelled flow |
| Flow/event feedback exceeds the configured step budget | Throw `GraphRuntimeError` with `runtime.runaway` and graph/node/domain/tick context |
| Runtime adapter throws | Wrap as `runtime.node-error` and append a deterministic error trace entry |
| Subgraph compiled plan is missing or has the wrong graph ID | Reject before executing the child |
| Runtime `NodeRef` targets another/unknown instance node or undeclared state | Reject; return only cloned declared exported state |
| Unrelated dynamic body exists outside a checkpoint scope | Independent bounded logic remains checkpoint-eligible |
| Scoped node directly/transitively reads dynamic physics or an unprovable query | Reject checkpoint metadata with the complete causal chain; never snapshot Rapier |
| Checkpoint is created while async work may be live | Require an exact compiler-emitted callsite UUID and one supported wait/restart/resume/reconnect/materialized/cancel-fallback/reject policy |
| Wait policy timeout is non-positive/non-finite or expires | Reject with typed `CheckpointPolicyError`; do not replace the active checkpoint |
| Restart/resume/reconnect adapter lacks persisted inputs, state-machine identity, or durable operation identity | Reject the checkpoint barrier; arbitrary promises/handles are never serialized |
| Rewind has post-checkpoint queued work | Cancel the prior execution generation and remove only this instance's matching post-watermark scheduler commands |
| Rewind encounters prior score/audio/event effects | Reconcile stable effect IDs without replaying delivered one-shot effects |
| Persistent record checksum, plan/registry/scope/reference fingerprint, or migration is incompatible | Run only the graph's fallback entry; do not delete the checkpoint or invalidate unrelated save-slot data |
| Persistent checkpoint restores successfully | Restore/recompute the bounded scope and dispatch `resume-from-checkpoint`, never repeat start flow |

### Hierarchy / world invariants

| Action | Result |
| ------ | ------ |
| Reparent creating cycle | `Cannot set parent: would create cycle` | `world.ts` |
| Create child/parent without selection | `Selection required to create a child entity` | `entity-placement.ts` |
| Place unknown prefab | `Prefab not found: {id}` | `world-commands.ts`, serializer |

---

## Atypical user actions

Test these explicitly — users will do them.

| Action | Expected behavior |
| ------ | ----------------- |
| **Cancel directory picker** | `AbortError` — silent return, no alert | `EditorApp.isAbortError` |
| **Cancel project name prompt** | `AbortError` — project creation aborted | `project-service.createNewProject` |
| **Open non-empty folder for new project** | `Selected folder is not empty` | `native-project-store` |
| **Deny write permission** | `Write permission to the project folder was denied` | `ensureWritePermission` |
| **Save with no project open** | `No project open` | `project-service` |
| **Import asset outside assets dir** | Alert: asset outside project assets directory | `AssetBrowserPanel` |
| **Assign model without selection** | Alert: select entity first | `AssetBrowserPanel` |
| **Assign non-GLTF file to mesh** | Alert: only GLB/GLTF | `AssetBrowserPanel` |
| **Undo/redo during play mode** | Should be no-op or disabled | play mode guards |
| **Delete selected entity then undo** | Selection restored from snapshot | `SceneEditCommand` |
| **Rapid gizmo drag** | Commands merge via epsilon threshold | `mergeTransformCommand` |
| **Switch model asset mid-load** | Stale callback ignored (`modelLoadId`) | `render-sync-system.ts` |
| **Select deleted entity** | Filtered out: `world?.hasEntity(id)` | `InspectorPanel` |
| **Edit in play mode** | Non-Transform inspector fields stay disabled. Transform is editable and teleports the live physics body via `resetBodyState` (velocities cleared). | `InspectorPanel.canEditTransform`, `teleportEntitiesToAuthoredTransform` |
| **R respawn in play mode** | Controller teleports to spawn pose; physics, input, propulsion, brake/motor, steering and buffered jump state are cleared. Held input may be sampled again by input binding on the next frame. | `RespawnSystem`, `PhysicsControllerSystem` |
| **Drive off level (Y below -20)** | Auto-respawn to captured spawn transform | `RespawnSystem` (T01.21) |
| **Disable an active physics controller** | On the enabled→disabled transition, custom/dynamic raycast forces and brakes, arcade velocity state, character movement buffers, and revolute motors are neutralized once | `PhysicsControllerSystem` |
| **Disable an entity or any ancestor** | Preserve each descendant's authored `activeSelf`, derive `activeInHierarchy = false`, deactivate descendants before parents, and remove inactive render/physics participation | `World.setActiveSelf`, `RenderSyncSystem`, `PhysicsWorldSystem` |
| **Re-enable an inactive hierarchy** | Recompute hierarchy activity and activate parents before descendants; component hooks use component-type UUID order within each entity | `World.setActiveSelf`, `ComponentLifecycleHooks` |
| **Inspect inactive entities** | Normal `query()` excludes them; diagnostics and authoring explicitly use `queryIncludingInactive()` | `IWorld` |
| **Physics controller also has a redundant Collider** | Runtime and editor use the same resolution contract: custom/dynamic/revolute controllers ignore it for their implicit chassis; arcade uses it explicitly or falls back to its chassis; kinematic ignores it for the implicit capsule; custom-spring and pointer-controls create no collider | `resolveColliderDescriptor`, `SceneColliderGizmos` |
| **Apply force before a physics step** | Force and point torque affect exactly the next step, then clear | Stub/Rapier backend contract tests |
| **Custom spring target is missing** | No-op; no force is queued for either body | `physics-controller-runtime.test.ts` |
| **Render frame produces multiple physics substeps** | Custom spring recomputes force before every fixed substep | `PhysicsWorldSystem.queueSubstepAction` |
| **Render FPS drops below 60** | The sole scheduler fixed-step policy catches up with at most three substeps; hitches beyond 50 ms drop excess simulation time | `ENGINE_SCHEDULER_POLICY` |
| **Render FPS exceeds fixed physics rate** | Render sync lerps previous/current body position and normalized shortest-path quaternion using scheduler interpolation alpha; authoritative `Transform` remains the latest fixed pose | `EngineScheduler.interpolationAlpha`, `PhysicsWorldSystem.resolvePresentationTransform`, `RenderSyncSystem` |
| **No physics step occurs on a render frame** | Reuse retained fixed poses with the new scheduler alpha; first registration has identical previous/current poses and therefore snaps safely | `physics-world-system.test.ts` |
| **Pause then single-step** | Paused frames still produce coherent frame/presentation phases without accumulating time; one request advances exactly one fixed tick and one presentation update | `EngineScheduler.requestSingleStep` |
| **Physics body teleports or respawns** | Reset previous/current presentation poses to the teleported pose so no blend trail crosses the discontinuity | `PhysicsWorldSystem.resetBodyState`, `RespawnSystem` |
| **Engine world or physics backend is replaced** | Invalidate retained presentation history; render uses the replacement world's authoritative transform until a fresh pose is captured, then snaps | `Engine.loadWorld`, `Engine.setWorld`, `PhysicsWorldSystem.setBackend` |
| **Vehicle camera and wheels render during interpolation** | Chase/follow cameras consume the chassis presentation pose; wheel children inherit the same interpolated chassis parent. Wheel-local suspension, steering, and spin still update from current fixed-step samples without a second interpolation buffer | vehicle camera and visual sync systems |
| **Edit-mode dynamic-raycast wheel rest pose recomputes after `worldRevision`** | Install a render-only presentation resolver and preserve the authored wheel `Transform`; save, undo, and the Play-mode snapshot therefore see only explicit scene edits | `createDynamicRaycastWheelRestPoseResolver`, `ViewportPanel` |
| **Controller ramp runs at 30/60/120 FPS** | Three.js dynamic-raycast force/brake steps scale by `dt × 60`; steer and arcade speed alphas convert as `1 − (1 − legacyAlpha)^(dt × 60)`. Existing fields remain legacy per-60-Hz-reference-step values, preserving authored 60 Hz feel. | `physics-controller-runtime.ts` |
| **Controller ramp receives zero, invalid, or hitch-sized dt** | Zero/negative/non-finite dt does not advance the ramp; positive dt is capped at 50 ms for ramp math so a hitch cannot jump directly to the target. Fixed-step and force contracts are unchanged. | `physics-controller-runtime.ts` |
| **Keyboard shortcut while typing in input** | Shortcuts should not fire (check `event.target`) | `EditorApp` keydown |
| **Open project in Safari/Firefox** | No File System Access → fallback folder picker or error message | `isFileSystemAccessSupported()` |
| **Double-click scene in asset browser** | Loads scene; errors → alert | `AssetBrowserPanel` |

---

## Network & I/O failures

> @haku is **local-first** — no backend API, no remote auth. “Network” means **fetch** for scenes/assets in dev and playground.

| Failure | Symptom | Handling |
| ------- | ------- | -------- |
| **Scene HTTP 404** | `Failed to load scene: {url}` | Thrown; logged `load.failed` | `project-service`, `SceneLoader` |
| **Asset fetch failed** | `Failed to fetch {url}` | Thrown | `browser-project-store.registerFromUrl` |
| **Dev server returns HTML for asset** | `Asset URL returned HTML instead of a file` | Common Vite 404 misroute — explicit check | `browser-project-store` |
| **glTF load error** | Logged `gltf.load.failed`; entity may stay without mesh | Non-fatal; `modelLogError` | `model-loader.ts` |
| **Template fetch fail (create project)** | `Failed to load project template file` | Thrown | `project-template.ts` |
| **Playground log sync fail** | Swallowed silently | Best-effort `/__haku/log/append` | `syncPlaygroundLogToDisk` |
| **Model asset not in project** | `Model asset not found: {path}` | Thrown at resolve | `project-service` |
| **Binary read as text** | `Binary file cannot be read as text` | Thrown | `browser-project-store` |

**Agent rule:** distinguish **fatal** (scene/manifest won't load) vs **non-fatal** (single model fails — log, don't crash editor).

### Storage backends (not a database)

| Backend | `storage` value | Failure modes |
| ------- | --------------- | ------------- |
| In-memory virtual FS | `memory` | Lost on refresh; no disk persist until export |
| Playground embedded | `playground` | Same as memory + optional Vite sync |
| Native File System Access | `native` | Permission denied, file not found, disk full (write fail) |

There is **no SQL/NoSQL database** in @haku v1. Do not add DB error handling unless a backend is introduced.

---

## Permissions & authorization

> No user login / JWT / OAuth in v1. “Authorization” = **browser filesystem permissions** and **same-origin asset access**.

| Scenario | Error / behavior | Module |
| -------- | ---------------- | ------ |
| File System Access unsupported | `File System Access API is not supported in this browser. Use Chrome or Edge.` | `project-service` |
| Read without project open | `No project folder open` | `native-project-store` |
| Write permission denied | `Write permission to the project folder was denied` | `ensureWritePermission` |
| Read missing file | `File not found: {path}` | native + browser stores |
| Invalid path traversal | Imports are rejected unless the normalized path is under `assetsDir` | `project-service` manifest registration |

**Not applicable (do not implement without explicit request):**
- HTTP 401 / 403 from API
- Session expiry
- Role-based access control
- OAuth token refresh

---

## Browser code workspace

| Scenario | Error / behavior | Enforcement |
| -------- | ---------------- | ----------- |
| Imported project code requests diagnose/build/Play | `trust.untrusted-code`; language, bundler, and Play clients are not invoked | `runTrustedBrowserBuild`, `CodeWorkspacePanel` |
| Trusted project requests an unapproved capability | `trust.capability-not-approved`; bundle and Play are blocked | `runTrustedBrowserBuild` |
| Built-in project source is edited | Workspace is read-only; user must `Fork to disk` through the native directory picker | `BrowserProjectWorkspace`, `ProjectService` |
| Disk changed while editor buffer is clean | Reloads from disk and updates its baseline | `pollExternalChanges` |
| Disk changed while editor buffer is dirty | Shows an external conflict; neither side overwrites until `Use disk changes` or `Keep editor changes` | `BrowserProjectWorkspace`, `CodeWorkspacePanel` |
| Generated declaration is present | Included in language/VS Code project files, excluded from editable source selection | `ProjectCodeWorkspacePanel`, `CodeWorkspacePanel` |
| Play code throws | Reports the crash, destroys the sandbox, keeps editor state | `play-sandbox`, `CodeWorkspacePanel` |
| Play code does not yield | Ten-second timeout destroys the opaque-origin iframe; `Stop` remains available while running | `play-sandbox`, `CodeWorkspacePanel` |
| Source is non-TypeScript workspace metadata | Persisted/shared with VS Code but not opened as a Monaco TypeScript model | `ProjectCodeWorkspacePanel` |

---

## Security constraints

| Constraint | Rationale | Enforcement |
| ---------- | --------- | ----------- |
| **Engine/playground no React** | Production bundle must not ship editor | ESLint `no-restricted-imports`, dep graph |
| **Core/schema no Three.js** | Serializable pure data layer | ESLint on `@haku/core` |
| **No inline scripts in scene JSON** | XSS / arbitrary code — use `ScriptRef` paths only | Schema design |
| **No UI objects or executable closures in graph JSON** | Authoring adapters and runtime data must stay separate | `GraphAssetSchema`, metadata-only Node SDK |
| **Asset paths relative to project** | Prevent arbitrary file read outside project root | `relativeToAssetsDir`, import guards |
| **No `eval` / dynamic script from scene** | Scene data is data, not code | Architecture |
| **HTML response detection on fetch** | Prevent loading error pages as assets | `browser-project-store` |
| **File picker user gesture** | Directory picker must run before `prompt()` | `createNewProject` ordering |
| **CORS / same-origin for playground assets** | Assets served from dev server origin | Vite static files |
| **Editor logs to project file** | `logs/haku.log` — no secrets in log payloads | `project-log-sink` |

**Agent rule:** never execute scene JSON fields as code; never bypass `projectService` for file access in editor.

---

## Locked decisions (do not revisit)

These are final unless the user explicitly asks to change them. Full rationale in `IMPLEMENTATION_PLAN.md` §2.

| Topic | Decision |
| ----- | -------- |
| Runtime model | Classic scene graph behind `IWorld` (not ECS now) |
| Editor UI | React 18 + Zustand — never in engine/playground |
| Scene format | JSON v1, UUID entity IDs, quaternion rotation |
| Render model | Simulation ≠ Presentation; `RenderSyncSystem` owns Three.js |
| Prefabs | Manifest UUID asset reference + component-keyed overrides |
| Spatial index | Out of scope — no culling optimizations unless requested |
| Testing scope | Minimal but **must include failure paths** — not happy-path only |

---

## Package boundaries

### ❌ Do not

- Import `@haku/editor`, `react`, or `react-dom` from `@haku/engine` or `apps/playground`
- Store `THREE.Object3D` / `THREE.Material` in component data
- Put game logic in editor panels (use engine systems in playground)
- Traverse `root.children` for gameplay — use `world.query(...)`

### ✅ Do

- Edit scene via `commitSceneEdit` in editor (undo/redo)
- Push world changes via `worldRevision` bump → `engine.setWorld()`
- Use `@haku/engine/runtime` entry for shipped games
- Validate JSON with Zod before hydrating world
- Compile graph JSON through `@haku/graph` and reject incompatible plan fingerprints

### Verification

CI / manual: build playground and confirm bundle has no `react-dom`, `TransformControls`, `inspector` strings.

---

## World + SceneDocument dual state

**Problem:** Editor keeps both `world` (runtime) and `sceneDocument` (serializable). They can drift if you mutate only one.

**Accepted solution:**
- All edits mutate **both** inside `commitSceneEdit` callback
- `worldRevision` increments on every apply — viewport subscribes to this, not individual field state
- Save uses `sceneDocument` (or re-serialize from world via serializer)

**Gap:** Not every code path may sync `sceneDocument` when mutating `world` directly — always use `commitSceneEdit`.

---

## Undo / redo

**Pattern:**
```typescript
commitSceneEdit((draft) => {
  // mutate draft.world AND draft.sceneDocument
  return optionalSelectionOverride // EntityId[] | null
})
```

- `SceneEditCommand` snapshots `{ world, sceneDocument, selection }` before/after
- `globalCommandBus` for discrete commands (delete, duplicate) that wrap scene edits
- Transform gizmo drag: coalesce via `mergeTransformCommand` in `scene-history.ts` (epsilon threshold)

**Do not:** mutate store directly for user-visible edits — breaks undo.

**Play mode:** undo disabled; world restored from `playSnapshot` on stop.

**Edge case:** `captureSceneSnapshot()` when `world === null` throws — callers must guard.

---

## Async glTF loading race

**Problem:** User changes model asset before previous load finishes → stale mesh applied.

**Accepted solution (engine):**
- `EntityRenderState` tracks `modelLoadId` / generation counter
- Ignore loader callbacks when ID doesn't match current request (`sync.load.stale` log)
- Full rebuild when `visualKey` changes (component type, asset path, geometry)

**Do not:** assume synchronous model availability in inspector or viewport.

**Test:** mock loader with delayed resolve; switch asset before complete — only latest attaches.

---

## Euler degrees vs quaternion

**Problem:** Users think in Euler degrees; schema stores quaternion `[x, y, z, w]`.

**Accepted solution (editor only):**
- `packages/editor/src/transform/euler-degrees.ts` — convert for `TransformFields` UI
- Writes back quaternion on change
- Gimbal lock possible on certain angles — acceptable for editor v1

**Do not:** store Euler in scene JSON.

---

## Multi-selection inspector

**Problem:** Selected entities have different values for same field.

**Accepted solution:**
- `inspector/multi-edit.ts` — `mergeStrings`, `mergeVec3`, `mergeBooleans` return `null` for mixed
- UI shows `—` placeholder, disables edit until values match
- `buildMaterialMixedValues()` for heterogeneous material types

---

## Parent / hierarchy

**Problem:** Reparenting can create cycles or orphan subtrees.

**Accepted solution:**
- `setParent` rejects cycles: `Cannot set parent: would create cycle`
- Hierarchy drag uses `hierarchy-drag.ts` — commits via scene edit
- `Transform` does **not** contain parent — parent is entity-level field

**Placement modes** (`entity-placement.ts`): `root`, `child`, `parent`, `sibling` — used by create entity / primitive menus.

---

## Play mode snapshot

**Problem:** Gameplay systems mutate world; stopping play must restore editor state.

**Accepted solution:**
- `enterPlayMode()`: `playSnapshot = cloneWorld(world)`, switch to game tab
- `exitPlayMode()`: restore snapshot, clear play systems
- No undo during play

**Gap:** Play mode may not yet run full gameplay systems — placeholder OK; snapshot restore is mandatory.

---

## Camera switching

**Problem:** Editor orbit camera vs scene entity cameras.

**Accepted solution:**
- Default: editor orbit camera (`useEditorViewportCamera`)
- User selects camera entity → `viewportCameraEntityId` in store → `backend.setActiveCamera(entityId)`
- Scene tab vs Game tab: `activeViewportTab` from schema (`ViewportTab`)
- `resolveActiveCameraId()` in schema for active scene camera marker
- Invalid/missing `activeCameraId` → first camera in document, or `null`

**Do not:** hardcode camera entity in engine for editor viewport.

---

## Materials

**Accepted:**
- Registry in `@haku/schema/material.ts` — `MATERIAL_TYPE_SCHEMAS`, `MATERIAL_PROPERTY_SPECS`
- `switchMaterialType()` preserves compatible fields (color, opacity across types)
- Legacy scenes without `materialType` preprocess to `standard`
- Factory registry in `mesh-factory.ts` — one factory per type

**Known gaps (see RENDER_PLAN):**
- Matcap/toon may need texture refs — not all wired in UI
- `ShaderMaterial` / custom GLSL — explicitly out of scope

---

## Render settings & feature flags

**Accepted:**
- `RenderSettings.features.*` — each capability off by default for legacy scenes
- `defaultRenderSettings()` merged on load via Zod preprocess
- Engine: `applyRenderSettings()` — pure helpers, unit tested
- Disabled feature → skip pass allocation (e.g. no `EffectComposer` when `postProcessing` false)

**Do not:** enable post-processing or shadows by default without explicit scene flag.

**Test both paths:** feature on **and** feature off for every render capability.

---

## Shadows (partial implementation)

**Accepted:**
- Built-in Three.js shadow maps — not custom depth pass
- `features.shadows` gates globally; per-mesh `castShadow`/`receiveShadow` on `MeshRenderer`
- Directional light primary caster; `maxCasters` limit planned
- Default: **shadows off** for new/legacy scenes

**Known gap:** CSM, soft shadow tuning, static scene `autoUpdate=false` — future.

---

## Editor-only vs runtime rendering

| Feature | Playground | Editor |
| ------- | ---------- | ------ |
| Forward render | ✅ | ✅ |
| Selection outline | ❌ | ✅ |
| TransformControls | ❌ | ✅ |
| Orbit camera default | ❌ (uses scene camera) | ✅ |
| Picking API | unused | ✅ |
| Hardcoded ambient in backend ctor | ✅ (today) | ✅ |

**Do not:** require editor-only passes for games to render correctly.

New features should be **scene-backed** (`RenderSettings`, components) so playground and editor match.

---

## Prefabs

**Accepted:**
- Create prefab: extract subtree → separate `*.prefab.json` asset + manifest UUID entry
- Place instance: typed `PrefabInstance.prefab` asset reference + injected UUID resolver at load
- Overrides keyed by UUID component type

Scene documents never embed prefab definitions. Missing and type-mismatched prefab references
fail with structured asset diagnostics.

**Gap:** Deep override paths, nested prefab variants — keep v1 simple.

---

## Component enable/disable

**Accepted:**
- `ComponentEnabledSchema` — boolean on component records
- `isComponentEnabled()` / `withComponentEnabled()` in schema
- Disabled components skipped by render sync (verify when adding new component types)
- Physics controllers use normalized `enabled !== false` semantics. The transition to disabled performs a one-shot runtime reset; remaining disabled does not repeat motor/force writes.

---

## Static entities

**Accepted:**
- `StaticComponent` marks entity — transform sync may use matrix auto-update mode
- Future: shadow map `autoUpdate=false` for static scenes

---

## Naming collisions

**Accepted:**
- `uniqueEntityName()` in `entity-placement.ts` — appends ` (2)`, ` (3)`, …
- Used for create entity, primitives, lights

---

## Performance pitfalls (editor)

**Do not:**
- Put Three.js objects in React state
- Re-create `Engine` on every inspector keystroke
- Subscribe entire `EditorApp` to `world` — use granular Zustand selectors

**Do:**
- `memo()` on heavy panels (`InspectorPanel`, `ViewportPanel`)
- Bump `worldRevision` only on commit, not on focus/blur
- Viewport effect depends on `worldRevision`, not deep field watches

---

## Known gaps (intentional — do not "fix" without request)

| Gap | Status | Reference |
| --- | ------ | --------- |
| ECS backend | Out of scope | IMPLEMENTATION_PLAN §10 |
| Spatial index / 6k objects | Out of scope | IMPLEMENTATION_PLAN §10 |
| Script system runtime | Stub / ScriptRef only | Phase 5 placeholder |
| Instanced/batched render buckets | Stub | RENDER_PLAN §2.2 |
| WebGPU / TSL | Future | RENDER_PLAN §13 |
| Full post-processing stack | Partial | RENDER_PLAN §8 |
| Render targets in production | Partial / flagged | RENDER_PLAN §9 |
| Advanced material editor | Out of scope | IMPLEMENTATION_PLAN §10 |
| Multi-user editing | Out of scope | IMPLEMENTATION_PLAN §10 |
| Remote API / auth / database | Not in v1 | — |
| `render-backend.ts` size | Refactor in progress — split to `render/` | RENDER_PLAN §12 |

---

## Failed approaches (don't retry)

| Attempt | Why it fails | Use instead |
| ------- | ------------ | ----------- |
| React Three Fiber in engine | Violates package boundary, bloats playground | Raw Three.js in `@haku/engine` |
| Store meshes in components | Breaks serialization, undo, play snapshot | `RenderSyncSystem` derived state |
| Direct store mutation for edits | No undo | `commitSceneEdit` |
| Array index entity IDs | Breaks save/load, copy/paste | UUID v4 |
| Unity-style material pass tags | Not Three.js canonical | Layers + forward pass (RENDER_PLAN §4.1) |
| Big-bang render refactor | Unreviewable, regressions | Incremental R0–R9 phases in RENDER_PLAN |
| Default-on shadows/post FX | Perf + legacy scene breakage | Feature flags, default off |
| Happy-path-only tests | Regressions in production edge cases | Table above + failure fixtures |
| Backend auth for local editor | Over-engineering for v1 | File System Access permissions |

---

## Test fixture checklist (agent)

When adding a feature, add fixtures/tests for:

```
packages/schema/src/__fixtures__/     legacy scene, invalid schemaVersion
packages/serializer/                  reject unknown component, prefab not found
packages/engine/src/**/*.test.ts      feature flag off, stale model loadId
packages/editor/src/**/*.test.ts      AbortError, empty file list, permission denied (mock)
```

---

## When adding a new component type — checklist

1. Zod schema in `@haku/schema` + register in `coreComponentSchemas`
2. `ComponentType` in `@haku/core` registry
3. Serializer roundtrip (load/save)
4. `RenderSyncSystem` sync handler (if visual)
5. Inspector fields (dedicated component or `SchemaFields`)
6. `commitSceneEdit` mutation path
7. Unit test: **defaults**, **invalid data**, **disabled component**
8. Empty/disabled UI state documented
9. Update this doc if new edge case discovered
