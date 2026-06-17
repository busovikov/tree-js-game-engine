# RENDER_PLAN — Haku Rendering Architecture & Roadmap

> **Audience:** Implementation agent.  
> **Status:** Planning document only — no implementation implied by this file.  
> **Goal:** Canonical, scalable rendering stack for `@haku/engine` + `@haku/editor`, aligned with Three.js best practices (WebGL today, WebGPU/TSL later).

---

## 1. Executive summary

Haku already separates **simulation** (`IWorld`, components, systems) from **presentation** (`RenderSyncSystem`, `ThreeRenderBackend`). Rendering today is a **single forward pass** + **one editor-only overlay** (selection outline). Materials support one type (`standard` → `MeshStandardMaterial`) via a schema registry.

This plan defines:

1. Extension of the **material type registry** to cover remaining built-in Three.js mesh materials used in production games.
2. A **Render Settings** window (menu-driven) for scene/viewport configuration.
3. **Shadow mapping** (built-in Three.js shadow subsystem).
4. A **post-processing pipeline** abstraction (extensible passes).
5. **Render target** workflow (offscreen cameras, textures).
6. **Layer masks** for visibility filtering across passes.

Architecture centers on a **`RenderGraph`** owned by the engine, configured by **schema-backed scene data** and **editor UI**, without leaking React or editor gizmos into `@haku/engine`.

---

## 2. Current state (baseline)

### 2.1 Engine (`packages/engine`)

| Area | Today | Gap |
|------|--------|-----|
| `ThreeRenderBackend` | `WebGLRenderer`, one `Scene`, `render()` → `renderer.render(scene, camera)` | No shadow map, no composer graph |
| `RenderSyncSystem` | Syncs Transform, MeshRenderer, Light, Camera to Three.js objects | Lights do not enable `castShadow`; meshes do not set `castShadow`/`receiveShadow` |
| Materials | `mesh-factory.ts` maps `materialType: 'standard'` → `MeshStandardMaterial` | Only one type |
| Post FX | `OutlinePass` + `WebGLRenderTarget` scratch buffer, editor selection only | Ad-hoc, not generalized |
| Layers | Not used (`Object3D.layers` default 0) | No picking layer, no mask API |
| `IRenderBackend` | `attach`, `detach`, `setActiveCamera`, `render`, `resize` | Too narrow for RT/post/settings |

### 2.2 Schema (`packages/schema`)

| Area | Today | Gap |
|------|--------|-----|
| `MeshMaterial` | `materialType: 'standard'` + PBR fields | No basic/physical/toon/matcap |
| `material.ts` | `MATERIAL_TYPE_SCHEMAS`, `MATERIAL_PROPERTY_SPECS` registry | Single entry |
| Scene document | Entities + components | No `RenderSettings` / post profile |

### 2.3 Editor (`packages/editor`)

| Area | Today | Gap |
|------|--------|-----|
| Inspector | `MaterialPropertiesPanel` driven by registry | Type selector shows only Standard |
| Menu | `MenuBar` in `EditorApp.tsx` (File, Edit, …) | No Render Settings entry |
| Viewport | `ViewportPanel` delegates to engine backend | No exposure/shadow/post UI |

### 2.4 Package boundaries (must preserve)

```
@haku/schema   — serializable render/material settings (no Three.js)
@haku/core     — IRenderBackend interface extensions (no Three.js)
@haku/engine   — Three.js, RenderGraph, passes, mesh-factory
@haku/editor   — React UI, dialogs, maps schema ↔ store
apps/playground — engine only, no editor
```

Editor-only passes (outline, picking debug) stay in engine behind **`RenderFeatureFlags`** or **`EditorRenderExtensions`**, not in production game bundles.

---

## 3. Architectural principles

### 3.1 Three.js canonical model (WebGL phase)

Do **not** emulate Unity `LightMode` / material pass tags as the primary API. Use Three.js layers:

| Need | Three.js mechanism |
|------|-------------------|
| Main lit frame | `renderer.render(scene, camera)` |
| Built-in shadows | `renderer.shadowMap` + `castShadow` / `receiveShadow` (internal depth passes) |
| Object pass filter | `Object3D.layers` (0–31) + `camera.layers` |
| Offscreen / RT | `WebGLRenderTarget` + `setRenderTarget` |
| Screen effects | `EffectComposer` + pass chain |
| Multi-pass same geometry | Same `BufferGeometry`, multiple draws with different materials/programs |

### 3.2 Haku render graph (target)

Introduce **`RenderGraph`** in `packages/engine/src/render/`:

```
RenderGraph
├── RenderContext          (renderer, size, pixelRatio, feature flags)
├── RenderSettings         (from schema: shadows, tone mapping, exposure, …)
├── PassRegistry           (ordered passes)
│   ├── ShadowPass         (builtin — wraps shadowMap update, optional config)
│   ├── ForwardPass        (main scene render)
│   ├── CustomPass[]       (user/scriptable later)
│   └── PostProcessChain   (composer or manual RT chain)
└── LayerMaskResolver      (entity/component → THREE.Layers)
```

Each **pass** implements:

```ts
interface RenderPass {
  readonly id: string
  readonly order: number
  enabled(settings: RenderSettings): boolean
  resize(width: number, height: number): void
  render(ctx: RenderContext, scene: THREE.Scene, camera: THREE.Camera): void
  dispose(): void
}
```

**Important:** Passes orchestrate **when** and **where** to draw; **material type** still decides **how** each mesh draws in forward pass. Layer masks decide **which objects** participate.

### 3.3 Configuration sources

| Source | Scope | Persisted |
|--------|--------|-----------|
| `RenderSettings` (schema) | Per scene document | Yes — `.scene.json` |
| `ViewportSettings` (editor store) | Editor preview only | No (or user prefs file later) |
| Component fields | Per entity (e.g. `Light.castShadow`) | Yes |
| `RenderingLayers` component | Per entity bitmask | Yes |

### 3.4 Scalability hooks

- **Registry pattern** for materials (already started) and **post effects** (same shape: `effectType` + property specs).
- **Pass plugins** registered at engine init (editor registers outline pass; runtime game registers bloom).
- **Feature flag** `rendererBackend: 'webgl' | 'webgpu'` for future TSL migration (see §12).

---

## 4. Material system — remaining standard types

### 4.1 Goal

Expose built-in Three.js material families in the inspector via the existing registry (`MATERIAL_TYPE_SCHEMAS`, `MATERIAL_PROPERTY_SPECS`, `MaterialPropertiesPanel`). No custom GLSL in this phase.

### 4.2 Types to add (priority order)

| `materialType` | Three.js class | Use case | Key properties beyond shared |
|----------------|----------------|----------|------------------------------|
| `standard` | `MeshStandardMaterial` | **Done** — default PBR | color, metalness, roughness, opacity, transparent, wireframe |
| `basic` | `MeshBasicMaterial` | Unlit, UI blobs, fx | color, map (future), opacity, transparent, wireframe |
| `physical` | `MeshPhysicalMaterial` | Glass, clear coat, advanced PBR | extends standard + `clearcoat`, `clearcoatRoughness`, `transmission`, `thickness`, `ior`, `attenuationColor`, `attenuationDistance` |
| `toon` | `MeshToonMaterial` | Stylized/cel | color, gradientMap (optional ref), opacity |
| `matcap` | `MeshMatcapMaterial` | Sculpting preview | matcap texture ref, color |
| `normal` | `MeshNormalMaterial` | Debug (editor-only default) | flatShading, opacity |
| `depth` | `MeshDepthMaterial` | Custom depth prepass (advanced) | depthPacking |

**Do not** add `ShaderMaterial` / TSL in this phase — separate track (§12).

### 4.3 Schema changes (`packages/schema/src/material.ts`)

For each type:

1. Add to `MaterialTypeSchema` enum.
2. Define `XxxMaterialSchema` (Zod).
3. Register in `MATERIAL_TYPE_SCHEMAS`.
4. Register UI fields in `MATERIAL_PROPERTY_SPECS` (kinds: `color`, `number`, `boolean`, later `texture`).
5. Implement `switchMaterialType()` field preservation rules (document per type: e.g. preserve `color`, `opacity`; reset `metalness` when leaving PBR).

`MeshMaterialSchema` remains a **discriminated union** on `materialType`. Legacy scenes without `materialType` preprocess to `standard` (already implemented).

### 4.4 Engine mapping (`packages/engine/src/mesh-factory.ts`)

Refactor to **material factory registry**:

```ts
const MATERIAL_FACTORIES: Record<MaterialType, (data: MeshMaterial) => THREE.Material>
```

- `createMaterial(type, data)` dispatches to factory.
- `applyMaterial(material, data)` updates in place when possible (avoid reallocation per frame).
- `physical` factory may start as `MeshPhysicalMaterial` with subset of props; unmapped props ignored until UI exposes them.

### 4.5 Editor UI (`packages/editor`)

| Task | Detail |
|------|--------|
| Type selector | Populate from `MATERIAL_TYPES` / `MATERIAL_TYPE_LABELS` (auto-updates when schema grows) |
| Properties panel | No changes to structure — already registry-driven |
| Hints / grouping | Group advanced physical props under collapsible "Advanced" in `MaterialPropertiesPanel` |
| Multi-edit | `buildMaterialMixedValues()` must handle heterogeneous types (show "—" when types differ) |
| Preview | Viewport updates via existing `updateMeshMaterial` path |

### 4.6 Acceptance criteria (materials)

- [ ] User can switch entity material type in inspector; scene saves/loads roundtrip.
- [ ] Each type renders correctly in viewport with at least one point/ambient light (where lit).
- [ ] `pnpm build` + schema golden tests for each new type defaults.
- [ ] Playground (engine-only) renders scene using non-standard type without editor.

---

## 5. Render Settings window (menu)

### 5.1 UX

- **Menu path:** `View → Render Settings…` (or `Window → Render Settings…`).
- **Presentation:** Modal dialog or dockable panel (prefer **modal** first — simpler; dock later).
- **Scope tabs:**
  - **Scene** — persisted in scene document (`RenderSettings` block).
  - **Viewport** — editor-only preview overrides (optional grid, debug normals); stored in `editor-store` or localStorage.

### 5.2 Schema: `RenderSettings` (new, in `@haku/schema`)

Proposed v1 fields (serializable, no Three types):

```ts
RenderSettings {
  version: 1
  // Output
  toneMapping: 'none' | 'aces' | 'agx' | 'neutral'  // maps to renderer.toneMapping
  toneMappingExposure: number
  outputColorSpace: 'srgb' | 'linear-srgb'          // renderer.outputColorSpace

  // Background
  background: { type: 'color', color: string }
              | { type: 'skybox', equirect?: string }  // future

  // Shadows (scene default; per-light override still allowed)
  shadows: {
    enabled: boolean
    type: 'basic' | 'pcf' | 'pcfsoft' | 'vsm'
    mapSize: 512 | 1024 | 2048 | 4096
    bias: number
    normalBias: number
    autoUpdate: boolean
  }

  // Ambient defaults (if no entity ambient — engine already adds one; align or remove hardcoded)
  ambient: { color: string, intensity: number }

  // Post-processing profile (see §7)
  postProcessing: PostProcessingProfile

  // Layers policy (see §9)
  defaultLayer: number  // usually 0
}
```

Embed in `SceneDocument`:

```json
{
  "version": 1,
  "entities": [...],
  "prototypes": {},
  "renderSettings": { ... }
}
```

Default: merge with `DEFAULT_RENDER_SETTINGS` when missing (backward compatible).

### 5.3 Editor components (new)

| File | Responsibility |
|------|----------------|
| `packages/editor/src/components/RenderSettingsDialog.tsx` | Modal shell, tabs, Apply/OK/Cancel |
| `packages/editor/src/components/render-settings/*.tsx` | Sub-panels: Output, Shadows, Post, Layers |
| `packages/editor/src/panels/MenuBar` / `EditorApp.tsx` | Menu item + open state |

Wire changes through `commitSceneEdit` for scene tab; `useEditorStore` for viewport tab.

### 5.4 Engine application

`ThreeRenderBackend` reads `RenderSettings` on attach and when document changes:

- Apply to `WebGLRenderer` (toneMapping, exposure, shadowMap.type, shadowMap.enabled).
- Apply `scene.background` from settings (replace hardcoded `0x1a1a2e` or make editor default an override).
- Re-run shadow map resize when `mapSize` changes.

### 5.5 Acceptance criteria (render settings UI)

- [ ] Menu opens dialog; changes persist on save scene.
- [ ] Tone mapping / exposure visibly affect viewport.
- [ ] New scene gets defaults; old scenes load without migration errors.

---

## 6. Shadows

### 6.1 Three.js integration (canonical)

Shadows are **not** a custom pass in v1 — use built-in subsystem:

1. `renderer.shadowMap.enabled = true`
2. `renderer.shadowMap.type = PCFSoftShadowMap` (or from settings)
3. For each shadow-casting light: `light.castShadow = true`, configure `light.shadow.*`
4. For meshes: `mesh.castShadow`, `mesh.receiveShadow`

Internal depth passes run inside `renderer.render()` before color pass.

### 6.2 Component extensions

**`Light` component** (`packages/schema` — already exists):

Add / expose fields:

```ts
castShadow: boolean
shadowMapSize?: number      // override scene default
shadowBias?: number
shadowNormalBias?: number
shadowCameraNear/Far/...   // per light type (directional vs spot)
```

**`MeshRenderer` component** (or new **`ShadowCaster`** flags):

```ts
castShadow: boolean   // default true for opaque meshes
receiveShadow: boolean // default true
```

Alternatively keep on `MeshRenderer.material` — prefer **top-level MeshRenderer** flags so model root and primitives behave consistently.

### 6.3 RenderSyncSystem changes

When syncing mesh `Object3D`:

```ts
object3d.traverse(mesh => {
  mesh.castShadow = meshRenderer.castShadow ?? true
  mesh.receiveShadow = meshRenderer.receiveShadow ?? true
})
```

When syncing lights:

```ts
light.castShadow = lightData.castShadow ?? renderSettings.shadows.enabled
// configure shadow camera from light type + scene settings
```

Directional light: orthographic shadow camera frustum (fit to scene bounds — editor helper optional). Spot: angle/radius from `Light` component.

### 6.4 Editor

- Render Settings → Shadows section (global).
- Inspector → Light → cast shadow + bias overrides.
- Inspector → MeshRenderer → cast/receive toggles.
- Viewport toolbar optional quick toggle "Preview shadows" (editor store, does not mutate scene).

### 6.5 Performance notes

- Single directional + one shadow map is enough for v1.
- Document max `mapSize` for web; default 1024.
- `shadowMap.autoUpdate = false` option for static scenes (future optimization).

### 6.6 Acceptance criteria (shadows)

- [ ] Directional "Sun" entity casts shadows onto ground mesh in playground.
- [ ] Toggling shadows in Render Settings affects viewport immediately.
- [ ] Settings persist in scene JSON.

---

## 7. Post-processing

### 7.1 Goals

- Unified pipeline for **bloom**, **FXAA**, **color grading**, **outline** (editor), extensible later.
- Same orchestration code for editor viewport and runtime (runtime may enable subset).

### 7.2 Architecture

```
PostProcessChain (engine)
├── owns EffectComposer (WebGL) OR manual RT ping-pong
├── Pass list from PostProcessingProfile (schema)
└── editor registers OutlinePass when selection non-empty
```

**Schema `PostProcessingProfile`:**

```ts
{
  enabled: boolean
  effects: Array<
    | { type: 'fxaa' }
    | { type: 'bloom', intensity: number, threshold: number, radius: number }
    | { type: 'vignette', offset: number, darkness: number }
    | { type: 'outline', ... }  // editor-only: gated by feature flag
  >
}
```

**Registry** (mirror materials):

```ts
POST_EFFECT_SCHEMAS
POST_EFFECT_PROPERTY_SPECS
```

Editor: optional **Post Processing** tab in Render Settings with effect list + reorder (v2).

### 7.3 Render flow (target)

```ts
render():
  shadowMapUpdate()                    // implicit in Three.js render OR explicit pass
  forwardPass.render()                 // scene → RT or screen
  postProcessChain.render()            // composer consumes RT
  editorExtensions.renderOverlays()    // outline overlay (current pattern)
```

Migrate existing `OutlinePass` from ad-hoc methods in `ThreeRenderBackend` into `EditorSelectionOutlinePass` implementing `RenderPass`.

### 7.4 Dependencies

- `three/examples/jsm/postprocessing/*` — acceptable in **engine** (already using OutlinePass).
- Pin resize handling: composer + all RTs update in `resize()`.

### 7.5 Acceptance criteria (post)

- [ ] Bloom can be toggled from Render Settings and works in viewport.
- [ ] Selection outline still works after refactor.
- [ ] Disabling post profile falls back to direct `renderer.render`.

---

## 8. Render targets

### 8.1 Use cases

| Use case | Description |
|----------|-------------|
| **Scene camera RT** | Entity with `Camera` renders to texture (security monitor, picture-in-picture) |
| **Reflection probe** | Static RT captured from probe position (v2) |
| **Editor thumbnail** | Render entity to texture for asset preview |
| **Manual compositing** | Material samples RT as `map` |

### 8.2 Schema

**Option A — `Camera` extension:**

```ts
Camera {
  ...
  renderTarget?: {
    width: number
    height: number
    attachToMaterial?: string  // entity id + material slot — defer to v2
  }
}
```

**Option B — new component `RenderTexture`:**

```ts
RenderTexture {
  width: number
  height: number
  cameraEntityId: EntityId   // which camera renders into it
  updateMode: 'always' | 'on-demand' | 'once'
}
```

Recommend **Option B** for clarity.

### 8.3 Engine: `RenderTargetPool`

- Manages `WebGLRenderTarget` lifecycle (create, resize, dispose).
- `RenderTargetPass`: for each active `RenderTexture`, render sub-scene or full scene from specified camera to RT.
- Expose `getTexture(entityId)` for material binding (future `texture` property kind in material registry).

### 8.4 Editor

- Inspector for `RenderTexture` component.
- Preview swatch in inspector (small canvas blitting RT).
- Render Settings → optional "Offscreen cameras" list.

### 8.5 Acceptance criteria (RT)

- [ ] Entity with Camera + RenderTexture renders to texture visible on a mesh (`map` via basic material).
- [ ] Resize viewport updates RT dimensions when set to "match viewport".
- [ ] No RT leaks on entity delete (dispose).

---

## 9. Layers

### 9.1 Three.js model

- `Object3D.layers` is a **bitmask** (32 layers).
- Camera `layers` mask determines which objects are visible in that render.
- Lights also respect layers in recent Three.js versions — verify version in package.json when implementing.

### 9.2 Schema: `RenderingLayers` component

```ts
RenderingLayers {
  mask: number   // bitmask, default 1 (layer 0)
}
```

**Reserved layers (convention):**

| Layer | Bit | Purpose |
|-------|-----|---------|
| 0 | `1 << 0` | Default world geometry |
| 1 | `1 << 1` | Transparent / overlay (optional split) |
| 2 | `1 << 2` | Editor gizmos (if ever in engine scene) |
| 30 | `1 << 30` | Editor picking only |
| 31 | `1 << 31` | Debug visualization |

Document in schema constants: `RENDER_LAYER_DEFAULT`, `RENDER_LAYER_PICKING`, etc.

### 9.3 Camera / pass integration

- Main viewport camera: mask = `renderSettings.defaultLayerMask` (default: layer 0 only).
- Picking pass (`pickEntityAt`): use **picking camera** with mask = `PICKING_LAYER` only; sync pickable meshes to that layer in `RenderSyncSystem` or dedicated pass.
- Optional: user assigns entities to custom layers; **second camera** in scene renders layer mask to RT (advanced).

### 9.4 Editor UI

- Inspector → RenderingLayers: checkboxes Layer 0–7 (expandable bitmask UI).
- Render Settings → Default camera layer mask.
- Hierarchy optional column/filter by layer (v2).

### 9.5 Acceptance criteria (layers)

- [ ] Entity on layer 1 hidden from main camera when main mask excludes layer 1.
- [ ] Picking ignores gizmo-only objects via layer separation.
- [ ] Layer mask persists in scene.

---

## 10. `IRenderBackend` evolution

Extend `@haku/core` interface (breaking — update both engine and editor call sites):

```ts
interface IRenderBackend {
  attach(world: IWorld, sceneDocument: SceneDocument): void
  detach(): void
  setActiveCamera(entityId: EntityId): void
  setRenderSettings(settings: RenderSettings): void
  setViewportOverrides(overrides: ViewportRenderOverrides): void  // editor-only
  render(): void
  resize(width: number, height: number): void

  // Optional capabilities
  getRenderTarget?(entityId: EntityId): unknown  // texture handle for editor preview
  requestRenderTargetUpdate?(entityId: EntityId): void
}
```

Keep Three.js types out of `core` — `unknown` or opaque handle pattern.

---

## 11. File / module map (target)

```
packages/schema/src/
  material.ts              # extend types
  render-settings.ts       # NEW: RenderSettings, PostProcessingProfile
  rendering-layers.ts      # NEW: component schema
  render-texture.ts        # NEW: component schema

packages/core/src/
  types.ts                 # IRenderBackend extend

packages/engine/src/
  render/
    render-graph.ts        # NEW
    render-context.ts      # NEW
    passes/
      forward-pass.ts
      shadow-config.ts     # applies shadowMap settings (not custom depth)
      post-process-chain.ts
      render-target-pass.ts
    layers/
      layer-constants.ts
      layer-resolver.ts
  mesh-factory.ts          # material factory registry
  render-backend.ts        # thin: owns RenderGraph, delegates render()

packages/editor/src/
  components/
    RenderSettingsDialog.tsx
    render-settings/
    MaterialPropertiesPanel.tsx  # extend only if needed
  panels/
    MenuBar integration in EditorApp.tsx
```

---

## 12. Future: WebGPU + TSL (out of scope but planned)

Per [Three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer):

- `ShaderMaterial` / `onBeforeCompile` **do not** port to WebGPU.
- Materials → **NodeMaterial + TSL**; post → new composer stack.
- Plan: `rendererBackend` flag; parallel implementation behind `IMaterialBackend` interface.

**Migration strategy:**

1. Complete WebGL RenderGraph on `WebGLRenderer`.
2. Add `WebGPURenderer` backend implementing same `RenderGraph` pass interfaces where possible.
3. Port `materialType` factories to TSL node graphs per type.
4. Deprecate direct `MeshStandardMaterial` construction in mesh-factory.

Do **not** start TSL until WebGL graph is stable.

---

## 13. Phased implementation plan (agent checkpoints)

### Phase R1 — Material types (editor + schema + engine)

**Scope:** `basic`, `physical`, `toon` (minimum); matcap optional.  
**Deps:** None.  
**Verify:** build, schema tests, manual viewport check per type.

### Phase R2 — RenderSettings schema + engine apply

**Scope:** `RenderSettings` in scene doc; tone mapping, exposure, background color; apply in `ThreeRenderBackend`.  
**Deps:** R1 optional.  
**Verify:** save/load scene; exposure visible.

### Phase R3 — Render Settings dialog (menu)

**Scope:** `View → Render Settings`; edit scene render settings; wire to serializer.  
**Deps:** R2.  
**Verify:** menu opens; OK applies; persist.

### Phase R4 — Shadows

**Scope:** Global shadow settings; Light/MeshRenderer flags; RenderSyncSystem sync.  
**Deps:** R2.  
**Verify:** sun shadow in demo scene.

### Phase R5 — RenderGraph refactor (forward + post shell)

**Scope:** Extract passes from `render-backend.ts`; no new effects yet.  
**Deps:** R4.  
**Verify:** visual parity with pre-refactor; outline still works.

### Phase R6 — Post-processing profile

**Scope:** Bloom + FXAA; schema registry; UI in Render Settings.  
**Deps:** R5.  
**Verify:** toggle bloom; performance acceptable.

### Phase R7 — Layers

**Scope:** `RenderingLayers` component; picking layer; camera mask.  
**Deps:** R5.  
**Verify:** hide layer; picking ignores editor overlay.

### Phase R8 — Render targets

**Scope:** `RenderTexture` component; `RenderTargetPass`; inspector preview.  
**Deps:** R5, R7 recommended.  
**Verify:** RT on mesh; dispose on delete.

### Phase R9 — Polish & docs

**Scope:** AGENTS.md cross-link; minimal playground demo scene with shadows + physical material.  
**Deps:** all above.

---

## 14. Testing strategy

| Layer | Tests |
|-------|--------|
| Schema | Zod parse defaults; roundtrip JSON fixtures per material type + renderSettings |
| Engine | Unit: material factory creates correct Three class; layer resolver bitmask |
| Integration | Headless not required — manual viewport checklist per phase |
| Serializer | Scene with `renderSettings` loads old scenes without field |

---

## 15. Non-goals (explicit)

- Custom `ShaderMaterial` / GLSL editor in UI.
- Cascaded shadow maps (CSM), SSR, SSGI.
- Full Unity-style material pass tagging system.
- ECS render buckets rewrite.
- `EffectComposer` in production until performance profiled.

---

## 16. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| `render-backend.ts` becomes god object | RenderGraph + passes in R5 |
| Material type explosion | Strict registry; one PR per type |
| Editor/engine leak | Editor passes behind `EditorRenderExtensions` |
| Shadow perf on low-end | Default 1024, soft shadows optional |
| Breaking scene format | Zod defaults + preprocess for missing `renderSettings` |

---

## 17. Reference links

- [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) — `render`, `autoClear`, `setRenderTarget`, `shadowMap`
- [Render targets manual](https://threejs.org/manual/en/rendertargets.html)
- [Post-processing manual](https://threejs.org/manual/en/introduction/How-to-use-post-processing.html)
- [WebGPURenderer + TSL](https://threejs.org/manual/en/webgpurenderer)
- [TSL specification](https://threejs.org/docs/TSL.html)

---

*End of RENDER_PLAN*
