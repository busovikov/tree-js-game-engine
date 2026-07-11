# Edge Cases & Decisions

> Situations to anticipate, accepted solutions, and known gaps.  
> **Read this before implementing** to avoid repeating failed approaches.

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
| **No prefabs** | `prefabs` map empty | Place prefab menu → alert `No prefabs in scene` | `EditorApp.tsx` |
| **Empty model path** | `MeshRenderer.modelAsset === ''` | `loadModelTemplate` throws `Model asset path is empty` | `model-loader.ts` |
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
| Invalid manifest JSON | `HakuProjectSchema.parse()` throws |
| `entryScene` path missing | Scene load → `File not found` / fetch 404 |

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
| **Edit in play mode** | Inspector/transform disabled (`mode !== 'edit'`) | `InspectorPanel.canEdit` |
| **R respawn in play mode** | Vehicle teleports to spawn pose; physics + steer/jump state cleared | `RespawnSystem` (T01.21) |
| **Drive off level (Y below -20)** | Auto-respawn to captured spawn transform | `RespawnSystem` (T01.21) |
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
| Invalid path traversal | Paths normalized; assets must be under `assetsDir` | `project-service` import guard |

**Not applicable (do not implement without explicit request):**
- HTTP 401 / 403 from API
- Session expiry
- Role-based access control
- OAuth token refresh

---

## Security constraints

| Constraint | Rationale | Enforcement |
| ---------- | --------- | ----------- |
| **Engine/playground no React** | Production bundle must not ship editor | ESLint `no-restricted-imports`, dep graph |
| **Core/schema no Three.js** | Serializable pure data layer | ESLint on `@haku/core` |
| **No inline scripts in scene JSON** | XSS / arbitrary code — use `ScriptRef` paths only | Schema design |
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
| Prefabs | Required from v1 — `prefabId` + overrides |
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
- Create prefab: extract subtree → `prefabs` map in scene document
- Place instance: `PrefabInstance` component + resolver at load
- Overrides keyed by component type name

**Gap:** Deep override paths, nested prefab variants — keep v1 simple.

---

## Component enable/disable

**Accepted:**
- `ComponentEnabledSchema` — boolean on component records
- `isComponentEnabled()` / `withComponentEnabled()` in schema
- Disabled components skipped by render sync (verify when adding new component types)

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
