# Links

> **Canonical reference for agents.** Use this file instead of web search or guessing APIs.  
> If an API is not listed here or in the linked source files — **do not invent it**.

---

## Agent rules (read first)

| Rule | Action |
| ---- | ------ |
| **No API guessing** | Use exports listed in § Internal API below, or read the linked source file |
| **No web search for pinned libs** | Use official docs in § Official documentation (versions match `package.json`) |
| **Source of truth order** | `docs/` → `IMPLEMENTATION_PLAN.md` → package `src/index.ts` → official docs |
| **Write path** | Editor mutations → `commitSceneEdit`; persistence → `projectService` / serializer |
| **Read path** | Disk/HTTP → `validateSceneDocument` → `loadSceneDocument` |
| **Invented APIs** | Forbidden — add to schema/core first, then document here |

---

## Internal documentation

### Agent docs (`docs/`)

| Doc | Path | Use when |
| --- | ---- | -------- |
| Index | [`README.md`](./README.md) | Start here |
| **Agent workflow** | [`agent-workflow.md`](./agent-workflow.md) | **New task** — context rules, done criteria |
| **Notion TODO** | [`notion.md`](./notion.md) | Anchor URL; comment + status each pass |
| **Create Notion ticket** | [`notion-create-task.md`](./notion-create-task.md) | Skill `@notion-create-task` |
| Tech stack | [`techstack.md`](./techstack.md) | Versions, deps, per-module tools |
| Architecture | [`architecture.md`](./architecture.md) | Subsystems, data flow, folder rules |
| Edge cases | [`edge-cases.md`](./edge-cases.md) | Failures, empty states, validation — not happy path |
| UI kit | [`ui-kit.md`](./ui-kit.md) | Editor components, mutation flow |

### Repo root (source of truth)

| Doc | Path | Contents |
| --- | ---- | -------- |
| Agent guide | [`AGENTS.md`](../AGENTS.md) | Package map, commands, hard rules |
| Implementation plan | [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) | Locked decisions, phases, scene format |
| Render roadmap | [`RENDER_PLAN.md`](../RENDER_PLAN.md) | RenderSettings, shadows, post FX, material types |
| Human README | [`README.md`](../README.md) | Quick start, CI |

### Team guidelines & skills

| Guideline | Path |
| --------- | ---- |
| Git workflow | [`.agents/skills/git-workflow-and-versioning/SKILL.md`](../.agents/skills/git-workflow-and-versioning/SKILL.md) |
| Incremental delivery | [`.agents/skills/incremental-implementation/SKILL.md`](../.agents/skills/incremental-implementation/SKILL.md) |
| TDD | [`.agents/skills/test-driven-development/SKILL.md`](../.agents/skills/test-driven-development/SKILL.md) |
| CI/CD | [`.agents/skills/ci-cd-and-automation/SKILL.md`](../.agents/skills/ci-cd-and-automation/SKILL.md) |
| Source-driven (verify vs official docs) | [`.agents/skills/source-driven-development/SKILL.md`](../.agents/skills/source-driven-development/SKILL.md) |
| Three.js (engine) | [`.agents/skills/three-best-practices/SKILL.md`](../.agents/skills/three-best-practices/SKILL.md) |
| Three.js fundamentals | [`.agents/skills/threejs-fundamentals/SKILL.md`](../.agents/skills/threejs-fundamentals/SKILL.md) |
| Three.js loaders | [`.agents/skills/threejs-loaders/SKILL.md`](../.agents/skills/threejs-loaders/SKILL.md) |
| Three.js geometry | [`.agents/skills/threejs-geometry/SKILL.md`](../.agents/skills/threejs-geometry/SKILL.md) |
| Three.js animation | [`.agents/skills/threejs-animation/SKILL.md`](../.agents/skills/threejs-animation/SKILL.md) |
| ESLint package boundaries | [`eslint.config.js`](../eslint.config.js) |

---

## Internal API reference

> **Do not use APIs not exported here.** Read the file if signature is unclear.

### `@haku/schema` — `packages/schema/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `validateSceneDocument(data)` | **Read gate** — parse + legacy preprocess |
| `SceneDocumentSchema`, `SceneDocument` | Top-level scene type |
| `HakuProjectSchema`, `HakuProject` | `haku.project.json` |
| `TransformSchema`, `CameraSchema`, `LightSchema`, `MeshRendererSchema`, … | Component shapes |
| `coreComponentSchemas` | Map component id → Zod schema (inspector) |
| `CORE_COMPONENT_IDS` | Allowed component type strings |
| `defaultRenderSettings()`, `RenderSettingsSchema`, `isFeatureActive()` | Render config |
| `MATERIAL_TYPES`, `MATERIAL_PROPERTY_SPECS`, `switchMaterialType()` | Material registry — [`material.ts`](../packages/schema/src/material.ts) |
| `resolveActiveCameraId()`, `listCameraEntityIds()` | Active camera — [`scene-camera.ts`](../packages/schema/src/scene-camera.ts) |
| `defaultEditorProjectSettings()`, `EDITOR_PROJECT_SETTINGS_PATH` | Editor-only prefs — [`.haku/editor.json`](../packages/schema/src/editor-project-settings.ts) |
| `projectPathToUrl()`, `relativeToAssetsDir()`, `DEFAULT_ASSETS_DIR` | Asset path helpers — [`paths.ts`](../packages/schema/src/paths.ts) |
| `isComponentEnabled()`, `withComponentEnabled()` | Component enable flag |

### `@haku/core` — `packages/core/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `World` | `IWorld` implementation |
| `cloneWorld(world)` | Deep clone (undo / play snapshot) |
| `entityId(string)`, `entityIdToString()` | Branded entity id |
| `*Component` | `TransformComponent`, `CameraComponent`, `LightComponent`, `MeshRendererComponent`, … |
| `getCoreComponent(typeId)` | Registry lookup |
| `IWorld`, `ISystem`, `IRenderBackend` | Stability contracts — [`types.ts`](../packages/core/src/types.ts) |

### `@haku/serializer` — `packages/serializer/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `loadSceneDocument(input, { expandPrefabs? })` | JSON → `World` |
| `saveSceneDocument(world, metadata, prototypes, prefabs, renderSettings)` | **Write gate** → `SceneDocument` |
| `roundtripSceneDocument(doc)` | Test helper |
| `validateSceneDocument` | Re-export from schema |

**Node only:** `@haku/serializer/node` — [`node.ts`](../packages/serializer/src/node.ts) — `loadSceneDocumentFromFile(path)`.

### `@haku/engine` — full API — `packages/engine/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `Engine`, `EngineOptions`, `EngineFeatureFlags` | Game loop — [`engine.ts`](../packages/engine/src/engine.ts) |
| `SceneLoader.load(path)`, `SceneLoader.fromDocument(doc)` | HTTP load + validate |
| `ThreeRenderBackend`, `RenderSyncSystem` | Render pipeline |
| `createMaterial`, `createMeshFromRenderer`, `updateMeshMaterial`, … | Mesh factory |
| `setModelAssetResolver`, `setModelResourceResolver`, `clearModelCache` | glTF loading hooks |
| `setHakuLogSink`, `sceneLog`, `modelLogError`, … | Structured logging |

### `@haku/engine/runtime` — games only — `packages/engine/src/runtime.ts`

| Export | Purpose |
| ------ | ------- |
| `Engine`, `SceneLoader` | Minimal bootstrap |
| `projectPathToUrl`, `relativeToAssetsDir`, `DEFAULT_ASSETS_DIR` | Re-export from schema |

**Playground pattern:** [`apps/playground/src/main.ts`](../apps/playground/src/main.ts)

### `@haku/editor` — `packages/editor/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `EditorApp`, `EditorLayout` | React root |
| `useEditorStore` | Zustand state |
| `projectService` | Project read/write — [`project-service.ts`](../packages/editor/src/services/project-service.ts) |
| `globalCommandBus`, `executeCommand` | Undo + world commands |

**Not exported publicly (internal):** `commitSceneEdit` — import from `commands/scene-history.js` inside editor package only.

### `@haku/create` — `packages/create/src/index.ts`

| Export | Purpose |
| ------ | ------- |
| `createHakuProject(options)` | Scaffold external game |
| CLI | `create-haku` bin — [`cli.ts`](../packages/create/src/cli.ts) |

---

## Read / write rules

### Scene document (`.scene.json`)

```
READ:  file → JSON.parse → validateSceneDocument() → loadSceneDocument()
WRITE: world + metadata → saveSceneDocument() → JSON.stringify → projectService.saveScene()
```

| Step | API | Package |
| ---- | --- | ------- |
| Validate only | `validateSceneDocument(unknown)` | `@haku/schema` |
| Hydrate world | `loadSceneDocument(doc, { expandPrefabs })` | `@haku/serializer` |
| Serialize | `saveSceneDocument(world, metadata, prototypes, prefabs, renderSettings)` | `@haku/serializer` |
| HTTP load (runtime) | `SceneLoader.load(url)` | `@haku/engine/runtime` |
| Push to engine | `engine.loadWorld(world, prototypes, prefabs, renderSettings, activeCameraId)` | `@haku/engine` |
| Live edit (no save) | `engine.setWorld(world)` | `@haku/engine` |

**Example scene:** [`examples/minimal.scene.json`](../examples/minimal.scene.json)

### Project manifest (`haku.project.json`)

```json
{
  "name": "my-game",
  "entryScene": "public/assets/scenes/menu.scene.json",
  "assetsDir": "public/assets",
  "scriptsDir": "scripts"
}
```

Parse with `HakuProjectSchema`. Playground: [`apps/playground/haku.project.json`](../apps/playground/haku.project.json).

### Editor project settings (`.haku/editor.json`)

Editor-only — **not shipped in games**. Camera position per scene, active viewport tab.

Path: `EDITOR_PROJECT_SETTINGS_PATH` = `.haku/editor.json`  
Schema: `EditorProjectSettingsSchema` — [`editor-project-settings.ts`](../packages/schema/src/editor-project-settings.ts)

### Editor live mutations (before save)

```
User edit → commitSceneEdit(draft => mutate draft.world + draft.sceneDocument)
         → worldRevision++
         → engine.setWorld(world)
```

Never mutate `useEditorStore` world/sceneDocument directly for user actions. See [`scene-history.ts`](../packages/editor/src/commands/scene-history.ts).

### Project file I/O

| Storage | Read | Write |
| ------- | ---- | ----- |
| Native FS (Chrome/Edge) | `nativeProjectStore.readText()` | `nativeProjectStore.writeText()` after `ensureWritePermission()` |
| Virtual (folder picker) | `browserProjectStore.readText()` | `browserProjectStore.writeText()` (in-memory) |
| All paths | **`projectService`** — do not bypass | [`project-service.ts`](../packages/editor/src/services/project-service.ts) |

### Asset / model loading

```
MeshRenderer.modelAsset path
  → projectService.resolveModelAssetUrl(path)
  → setModelAssetResolver (editor wires this)
  → loadModelTemplate(path) in engine
```

Log categories: `modelLog`, `gltf.load.failed` — [`model-loader.ts`](../packages/engine/src/model-loader.ts).

### Logs

Append-only project log: `logs/haku.log` via `projectService.appendProjectLog()`.

---

## Migrations & schema compatibility

> No separate migration tool — **Zod preprocess + defaults** at load time.  
> **`schemaVersion` must be `1`** — other versions throw.

| Legacy input | Migration (automatic) | Where |
| ------------ | --------------------- | ----- |
| Scene without `renderSettings` | Inject `defaultRenderSettings()` | `SceneDocumentSchema` preprocess — [`index.ts`](../packages/schema/src/index.ts) |
| Material without `materialType` | Default to `standard` | `MeshMaterialSchema` preprocess — [`material.ts`](../packages/schema/src/material.ts) |
| Legacy inline material on MeshRenderer | Normalized via `normalizeMeshRenderer()` | [`mesh.ts`](../packages/schema/src/mesh.ts) |
| Spot light `angle` / `penumbra` | Mapped to `outerAngle` / `innerAngle` | `SpotLightDataSchema` + `spotToThreeCone()` |
| `schemaVersion: 2+` | **Rejected** — implement `v1 → v2` in serializer when needed | `IMPLEMENTATION_PLAN.md` §5.5 |

**Future migration rule (locked):** bump `schemaVersion`, add function in `@haku/serializer`, keep preprocess for one version back.

**Do not** hand-edit migration logic in editor — centralize in schema preprocess or serializer.

---

## Limitations (do not work around silently)

| Limitation | Detail | Doc |
| ---------- | ------ | --- |
| No backend / auth / DB | Local-first browser app | [`edge-cases.md`](./edge-cases.md) |
| No React in engine/playground | ESLint enforced | [`architecture.md`](./architecture.md) |
| No Three.js in core/schema | Pure data layer | `eslint.config.js` |
| `schemaVersion` only `1` | v2 not implemented | serializer tests |
| ScriptRef runtime | Stub — no hot reload | `IMPLEMENTATION_PLAN.md` |
| Instancing/batching | Stub hooks only | `RENDER_PLAN.md` |
| ECS | Out of scope | `IMPLEMENTATION_PLAN.md` §10 |
| File System Access | Chrome/Edge native write; others use virtual FS | MDN link below |
| Play undo | Disabled in play mode | `editor-store.ts` |

---

## Official documentation (pinned versions)

> Versions from `package.json`. **Use these URLs — do not assume newer Three/React APIs.**

### Three.js `^0.171.0`

| Topic | URL |
| ----- | --- |
| Docs index | https://threejs.org/docs/ |
| Manual | https://threejs.org/manual/ |
| WebGLRenderer | https://threejs.org/docs/#api/en/renderers/WebGLRenderer |
| Object3D / Scene graph | https://threejs.org/docs/#api/en/core/Object3D |
| MeshStandardMaterial | https://threejs.org/docs/#api/en/materials/MeshStandardMaterial |
| DirectionalLight + shadows | https://threejs.org/docs/#api/en/lights/shadows/DirectionalLightShadow |
| GLTFLoader (examples) | https://threejs.org/docs/#examples/en/loaders/GLTFLoader |
| TransformControls (editor) | https://threejs.org/docs/#examples/en/controls/TransformControls |
| OrbitControls (editor) | https://threejs.org/docs/#examples/en/controls/OrbitControls |
| EffectComposer / post | https://threejs.org/manual/en/post-processing.html |
| Render targets | https://threejs.org/manual/en/rendertargets.html |
| WebGPU / TSL (future only) | https://threejs.org/manual/en/webgpurenderer |

### React `^18.3.1`

| Topic | URL |
| ----- | --- |
| React docs | https://react.dev/ |
| useEffect | https://react.dev/reference/react/useEffect |
| memo | https://react.dev/reference/react/memo |

### State & UI

| Lib | Version | URL |
| --- | ------- | --- |
| Zustand | ^5.0 | https://zustand.docs.pmnd.rs/getting-started/introduction |
| react-resizable-panels | ^2.1 | https://github.com/bvaughn/react-resizable-panels/blob/main/README.md |

### Validation & language

| Lib | Version | URL |
| --- | ------- | --- |
| Zod | ^3.25 | https://zod.dev/ |
| Zod `.preprocess()` | | https://zod.dev/?id=preprocess |
| TypeScript | ^5.7 | https://www.typescriptlang.org/docs/ |

### Build & test

| Lib | Version | URL |
| --- | ------- | --- |
| Vite | ^6 | https://vite.dev/guide/ |
| Vitest | ^2.1 | https://vitest.dev/guide/ |
| pnpm workspaces | 9.15 | https://pnpm.io/workspaces |

### Web platform (editor I/O)

| Topic | URL |
| ----- | --- |
| File System Access API | https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API |
| `showDirectoryPicker` | https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker |
| `webkitdirectory` fallback | https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/webkitdirectory |
| Fetch API | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API |

---

## Key source files (deep links)

| Task | File |
| ---- | ---- |
| Add component schema | `packages/schema/src/index.ts` |
| Material registry | `packages/schema/src/material.ts` |
| Render settings schema | `packages/schema/src/render-settings.ts` |
| World / hierarchy | `packages/core/src/world.ts` |
| Component registry | `packages/core/src/components.ts` |
| Load/save scene | `packages/serializer/src/index.ts` |
| Engine loop | `packages/engine/src/engine.ts` |
| Render backend | `packages/engine/src/render-backend.ts` |
| Entity → Object3D | `packages/engine/src/render-sync/render-sync-system.ts` |
| Apply render settings | `packages/engine/src/render/apply-render-settings.ts` |
| Material factories | `packages/engine/src/mesh-factory.ts` |
| glTF loader | `packages/engine/src/model-loader.ts` |
| Editor store | `packages/editor/src/store/editor-store.ts` |
| Undo / commit | `packages/editor/src/commands/scene-history.ts` |
| World commands | `packages/editor/src/commands/world-commands.ts` |
| Viewport + engine lifecycle | `packages/editor/src/panels/ViewportPanel.tsx` |
| Inspector | `packages/editor/src/panels/InspectorPanel.tsx` |
| Project I/O | `packages/editor/src/services/project-service.ts` |
| Create templates | `packages/create/templates/` |
| CI check | `scripts/check.sh` |

---

## Examples & templates

| Resource | Path |
| -------- | ---- |
| Minimal valid scene | [`examples/minimal.scene.json`](../examples/minimal.scene.json) |
| Playground entry scene | `apps/playground/public/assets/scenes/menu.scene.json` |
| External game template | `packages/create/templates/` |
| Serializer tests (roundtrip) | `packages/serializer/src/index.test.ts` |
| Schema legacy tests | `packages/schema/src/index.test.ts`, `render-settings.test.ts` |

---

## Commands

```bash
pnpm install && pnpm build
pnpm test
pnpm --filter @haku/playground dev
pnpm --filter @haku/editor-app dev
pnpm --filter @haku/schema test
pnpm --filter @haku/engine test
pnpm --filter @haku/create exec create-haku ../my-game --name my-game --no-install
./scripts/check.sh
```

---

## When to update this file

Add an entry here when you:

- Export a new public API from any `@haku/*` package
- Add a new official library dependency
- Introduce a schema migration or new `schemaVersion`
- Change read/write path (project I/O, scene format)
- Add a team guideline or hard limitation
