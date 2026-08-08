# Links

> **Canonical reference for agents.** Use this file instead of web search or guessing APIs.  
> If an API is not listed here or in the linked source files — **do not invent it**.

---

## Agent rules (read first)

| Rule                              | Action                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------- |
| **No API guessing**               | Use exports listed in § Internal API below, or read the linked source file        |
| **No web search for pinned libs** | Use official docs in § Official documentation (versions match `package.json`)     |
| **Source of truth order**         | `docs/` → `IMPLEMENTATION_PLAN.md` → package `src/index.ts` → official docs       |
| **Write path**                    | Editor mutations → `commitSceneEdit`; persistence → `projectService` / serializer |
| **Read path**                     | Disk/HTTP → `validateSceneDocument` → `loadSceneDocument`                         |
| **Invented APIs**                 | Forbidden — add to schema/core first, then document here                          |

---

## Internal documentation

### Agent docs (`docs/`)

| Doc                                    | Path                                                                   | Use when                                                       |
| -------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Index                                  | [`README.md`](./README.md)                                             | Start here                                                     |
| **Agent workflow**                     | [`agent-workflow.md`](./agent-workflow.md)                             | **New task** — context rules, done criteria                    |
| **Autonomous engine-game instruction** | [`autonomous-engine-game-agent.md`](./autonomous-engine-game-agent.md) | Full Bounce Run engine-improvement mission and constraints     |
| **Engine-game plan**                   | [`engine-game-development-plan.md`](./engine-game-development-plan.md) | Milestones, acceptance criteria, deferred backlog              |
| **Gameplay graph architecture**        | [`node-graph-architecture.md`](./node-graph-architecture.md)           | Target compiler/runtime/checkpoint/browser-authoring contracts |
| Engine-game baseline                   | [`engine-game-current-state.md`](./engine-game-current-state.md)       | Current capability matrix and current/target delta             |
| Stage handoff                          | [`stage-handoff.md`](./stage-handoff.md)                               | Fresh sub-agent stages and context rollover                    |
| Tech stack                             | [`techstack.md`](./techstack.md)                                       | Versions, deps, per-module tools                               |
| Architecture                           | [`architecture.md`](./architecture.md)                                 | Subsystems, data flow, folder rules                            |
| Edge cases                             | [`edge-cases.md`](./edge-cases.md)                                     | Failures, empty states, validation — not happy path            |
| UI kit                                 | [`ui-kit.md`](./ui-kit.md)                                             | Editor components, mutation flow                               |

### Repo root (source of truth)

| Doc                 | Path                                                  | Contents                                         |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Agent guide         | [`AGENTS.md`](../AGENTS.md)                           | Package map, commands, hard rules                |
| Implementation plan | [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) | Locked decisions, phases, scene format           |
| Render roadmap      | [`RENDER_PLAN.md`](../RENDER_PLAN.md)                 | RenderSettings, shadows, post FX, material types |
| Human README        | [`README.md`](../README.md)                           | Quick start, CI                                  |

### Team guidelines & skills

| Guideline                               | Path                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Git workflow                            | [`.agents/skills/git-workflow-and-versioning/SKILL.md`](../.agents/skills/git-workflow-and-versioning/SKILL.md) |
| TDD                                     | [`.agents/skills/test-driven-development/SKILL.md`](../.agents/skills/test-driven-development/SKILL.md)         |
| Source-driven (verify vs official docs) | [`.agents/skills/source-driven-development/SKILL.md`](../.agents/skills/source-driven-development/SKILL.md)     |
| Three.js (engine)                       | [`.agents/skills/three-best-practices/SKILL.md`](../.agents/skills/three-best-practices/SKILL.md)               |
| Three.js fundamentals                   | [`.agents/skills/threejs-fundamentals/SKILL.md`](../.agents/skills/threejs-fundamentals/SKILL.md)               |
| Three.js loaders                        | [`.agents/skills/threejs-loaders/SKILL.md`](../.agents/skills/threejs-loaders/SKILL.md)                         |
| Three.js geometry                       | [`.agents/skills/threejs-geometry/SKILL.md`](../.agents/skills/threejs-geometry/SKILL.md)                       |
| Three.js animation                      | [`.agents/skills/threejs-animation/SKILL.md`](../.agents/skills/threejs-animation/SKILL.md)                     |
| ESLint package boundaries               | [`eslint.config.js`](../eslint.config.js)                                                                       |

---

## Internal API reference

> **Do not use APIs not exported here.** Read the file if signature is unclear.

### Published entrypoints

This inventory is the release import boundary derived from workspace `package.json` exports.
Subpaths not listed here are private even when their source file exists.

| Specifier | Source entrypoint |
| --------- | ----------------- |
| `@haku/assets` | `packages/assets/src/index.ts` |
| `@haku/audio` | `packages/audio/src/index.ts` |
| `@haku/audio-web` | `packages/audio-web/src/index.ts` |
| `@haku/build` | `packages/build/src/index.ts` |
| `@haku/build/browser-static-export` | `packages/build/src/browser-static-export.ts` |
| `@haku/core` | `packages/core/src/index.ts` |
| `@haku/create` | `packages/create/src/index.ts` |
| `@haku/editor` | `packages/editor/src/index.ts` |
| `@haku/engine` | `packages/engine/src/index.ts` |
| `@haku/engine/runtime` | `packages/engine/src/runtime.ts` |
| `@haku/graph` | `packages/graph/src/index.ts` |
| `@haku/graph-runtime` | `packages/graph-runtime/src/index.ts` |
| `@haku/graph-runtime/diagnostic-graph` | `packages/graph-runtime/src/diagnostic-graph.ts` |
| `@haku/physics` | `packages/physics/src/index.ts` |
| `@haku/physics-rapier` | `packages/physics-rapier/src/index.ts` |
| `@haku/platform` | `packages/platform/src/index.ts` |
| `@haku/pool` | `packages/pool/src/index.ts` |
| `@haku/schema` | `packages/schema/src/index.ts` |
| `@haku/serializer` | `packages/serializer/src/index.ts` |
| `@haku/serializer/node` | `packages/serializer/src/node.ts` |
| `@haku/storage` | `packages/storage/src/index.ts` |
| `@haku/ui` | `packages/ui/src/index.ts` |

### `@haku/schema` — `packages/schema/src/index.ts`

| Export                                                                    | Purpose                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `validateSceneDocument(data)`                                             | **Read gate** — parse + legacy preprocess                                                    |
| `SceneDocumentSchema`, `SceneDocument`                                    | Top-level scene type                                                                         |
| `AssetIdSchema`, `AssetTypeIdSchema`, `AssetRefSchema`                    | UUID identity and typed-reference primitives                                                 |
| `TransformSchema`, `CameraSchema`, `LightSchema`, `MeshRendererSchema`, … | Component shapes                                                                             |
| `coreComponentSchemas`                                                    | Map component id → Zod schema (inspector)                                                    |
| `CORE_COMPONENT_IDS`                                                      | Allowed component type strings                                                               |
| `defaultRenderSettings()`, `RenderSettingsSchema`, `isFeatureActive()`    | Render config                                                                                |
| `MATERIAL_TYPES`, `MATERIAL_PROPERTY_SPECS`, `switchMaterialType()`       | Material registry — [`material.ts`](../packages/schema/src/material.ts)                      |
| `resolveActiveCameraId()`, `listCameraEntityIds()`                        | Active camera — [`scene-camera.ts`](../packages/schema/src/scene-camera.ts)                  |
| `defaultEditorProjectSettings()`, `EDITOR_PROJECT_SETTINGS_PATH`          | Editor-only prefs — [`.haku/editor.json`](../packages/schema/src/editor-project-settings.ts) |
| `projectPathToUrl()`, `relativeToAssetsDir()`, `DEFAULT_ASSETS_DIR`       | Asset path helpers — [`paths.ts`](../packages/schema/src/paths.ts)                           |
| `isComponentEnabled()`, `withComponentEnabled()`                          | Component enable flag                                                                        |
| `CustomComponentTypeAssetSchema`                                          | Visual Component Type asset, behavior, Inspector, graph, and editor-extension metadata       |

### `@haku/assets` — `packages/assets/src/index.ts`

| Export                                                   | Purpose                                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `validateProjectManifest(data)`, `ProjectManifestSchema` | `haku.project.json` read gate                                                                                |
| `ProjectAssetIndex`                                      | Resolve a typed UUID reference to its manifest entry/path                                                    |
| `AssetRegistry`, `AssetTypeDescriptor`                   | Decentralized asset-type registration                                                                        |
| `validateProjectAssetComposition()`                      | Production registry + manifest/reference gate                                                                |
| `dependencyClosure()`                                    | Deterministic dependency-first traversal                                                                     |
| `AssetDiagnosticError`                                   | Structured manifest/reference diagnostics                                                                    |
| `CUSTOM_COMPONENT_TYPE_ASSET_TYPE`                       | Stable Component Type asset discriminator                                                                    |
| `collectAssetReferences()`                               | Typed refs in serializable data; project scene/prefab writes additionally collect custom component envelopes |

### `@haku/core` — `packages/core/src/index.ts`

| Export                                                              | Purpose                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `World`                                                             | `IWorld` implementation                                                               |
| `cloneWorld(world)`                                                 | Deep clone (undo / play snapshot)                                                     |
| `entityId(string)`, `entityIdToString()`                            | Branded entity id                                                                     |
| `World.getActiveSelf()`, `setActiveSelf()`, `isActiveInHierarchy()` | Hierarchy activity contract                                                           |
| `World.queryIncludingInactive()`                                    | Explicit diagnostic/authoring query opt-in                                            |
| `ComponentLifecycleHooks`                                           | Deterministic create/activate/deactivate/destroy hooks                                |
| `EngineScheduler`, `SCHEDULER_PHASES`                               | Named frame/fixed phases, sole accumulator, queues, pause, and single-step            |
| `createCustomComponentDefinition()`                                 | Convert a visual Component Type asset into a strict registry definition               |
| `defineComponentBehavior()`, `ComponentBehaviorRunner`              | Declared scheduler batch/lifecycle/command contract and structured trace              |
| `*Component`                                                        | `TransformComponent`, `CameraComponent`, `LightComponent`, `MeshRendererComponent`, … |
| `getCoreComponent(typeId)`                                          | Registry lookup                                                                       |
| `IWorld`, `ISystem`, `IRenderBackend`                               | Stability contracts — [`types.ts`](../packages/core/src/types.ts)                     |

### `@haku/graph` — `packages/graph/src/index.ts`

| Export                                                                                                      | Purpose                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GraphAssetSchema`, `GraphDocumentSchema`                                                                   | Strict headless graph/public-interface/callsite JSON read gate                                                  |
| `GRAPH_ASSET_DESCRIPTOR`, `registerGraphAssetTypes()`                                                       | Graph asset registry contribution                                                                               |
| `TypeRegistry`, `createBuiltinTypeRegistry()`                                                               | Runtime-schema-backed built-in and project type registry                                                        |
| `defineVisualDataType()`, `defineSchemaDataType()`                                                          | Normalize visual and TypeScript-schema types to one registry contract                                           |
| `NodeRegistry`, `defineNode()`                                                                              | Metadata-only Custom Node definition SDK                                                                        |
| `compileGraph()`                                                                                            | Validate and compile a graph into a deterministic registry-bound plan                                           |
| `isExecutionPlanCompatible()`                                                                               | Reject a plan when node/type registry contracts change                                                          |
| `GraphDiagnosticError`, `GraphDiagnostic`                                                                   | Exact graph/node/port diagnostics and causal chains                                                             |
| `registerCustomComponentGraphContracts()`                                                                   | Project component data type plus Get/Set/Add/Remove node contracts                                              |
| `createFoundationNodeRegistry()`                                                                            | Deterministic composition of graph-owned and injected subsystem node registrars                                 |
| `FOUNDATION_GRAPH_IDS`, `DETERMINISTIC_GRAPH_CONTRACTS`, `WORLD_GRAPH_CONTRACTS`, `SERVICE_GRAPH_CONTRACTS` | Stable M10f lifecycle/control/math, variable/random, world/physics, and save/platform/debug/assertion contracts |

### `@haku/graph-runtime` — `packages/graph-runtime/src/index.ts`

| Export                                               | Purpose                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GraphInstance`                                      | Compiled-plan instance lifecycle, public parameters/outputs/events, subgraphs, cancellation, and deterministic trace |
| `ExecutionBackend`                                   | Replaceable plan-execution boundary                                                                                  |
| `NodeRuntimeRegistry`, `InterpreterExecutionBackend` | Type/version-bound runtime adapter dispatch                                                                          |
| `NodeExecutionRequest`, `NodeExecutionResult`        | Stable snapshot data/resource reads, scoped child tasks, flow/events, and exported state                             |
| `GraphRuntimeError`, `GraphRuntimeLimits`            | Structured runtime failures and runaway budget                                                                       |
| `ResourceSnapshotProvider`                           | Headless declared-resource snapshot adapter                                                                          |
| `GraphCheckpoint`, `CreateCheckpointOptions`         | One active bounded checkpoint plus callsite-keyed async policy barrier                                               |
| `checkpointableTask()`, `CheckpointableTaskAdapter`  | Owned async policy capture for pure/idempotent restart, state-machine resume, durable reconnect, and typed fallback  |
| `CheckpointPolicyError`                              | Typed invalid-callsite, unsupported-policy, reject, materialization, and wait-timeout failures                       |
| `SaveService`, `PersistentCheckpointRecord`          | Storage-agnostic async checkpoint-entry persistence contract and checksummed envelope                                |
| `CheckpointMigrationRegistry`                        | Registered plan-fingerprint migration before persistent scoped resume                                                |
| `registerCustomComponentRuntimeAdapters()`           | Runtime adapters for project component Get/Set/Add/Remove nodes                                                      |
| `createFoundationRuntimeRegistry()`                  | Public-service runtime composition for graph-owned and injected subsystem adapters                                   |
| `createDeterministicResourceSnapshotProvider()`      | Declared variable/seeded-random checkpoint snapshot boundary                                                         |

### `@haku/pool` — `packages/pool/src/index.ts`

| Export                                                                                                   | Purpose                                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EntityPool`, `PoolHandle`, `PoolRegistry`                                                               | Deterministic pooled leases, generational handles, and pool lookup                        |
| `EntityPoolComponent`, `EntityPoolSchema`, `registerPoolComponents()`, `createEntityPoolFromComponent()` | Prefab-backed serializable configuration and injected runtime prefab composition          |
| `PoolRuntimeScope`, `PoolLifecycleParticipant`, `EntityPool.registerParticipant()`                       | Task cancellation, reverse cleanup, flags, and removable late external-resource lifecycle |
| `createGraphPoolParticipant()`                                                                           | Destroy/recreate graph runtimes at lease boundaries                                       |
| `createPoolSdk()`                                                                                        | General prewarm/acquire/release/release-all/clear/metrics service API                     |
| `registerPoolNodeContracts()`, `registerPoolRuntimeAdapters()`                                           | Six general pool graph nodes with bounded checkpoint metadata and effect records          |

### `@haku/ui` — `packages/ui/src/index.ts`

| Export                                                      | Purpose                                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `UIDocumentSchema`, `UIElementSchema`, `UIElementRefSchema` | Strict UUID-addressed UI asset and typed element reference read gates                         |
| `UI_DOCUMENT_ASSET_DESCRIPTOR`, `registerUIAssetTypes()`    | UI asset registration and image-reference dependency closure                                  |
| `UIDocumentInstance`                                        | React-free native DOM mount, mutation, events, themes, and lifecycle                          |
| `UIService`                                                 | Registered/mounted document ownership and public text/visibility/enabled/theme/event boundary |
| `createUISdk()`                                             | Custom Node SDK surface over `UIService`                                                      |
| `UI_GRAPH_CONTRACTS`, `registerUINodeContracts()`           | Set Text/Visibility/Enabled/Theme contracts with bounded UI effects                           |
| `registerUIRuntimeAdapters()`                               | Runtime adapter dispatch through the injected public service                                  |

### `@haku/audio` — `packages/audio/src/index.ts`

| Export                                                                                  | Purpose                                                                                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AudioClip`, `AudioSourceSchema`, `AudioSourceComponent`                                | Local binary clip metadata and strict serializable source component                                       |
| `AUDIO_CLIP_ASSET_DESCRIPTOR`, `registerAudioAssetTypes()`, `registerAudioComponents()` | Audio asset/component composition and dependency closure                                                  |
| `AudioBackend`, `HeadlessAudioBackend`, `AudioRuntime`                                  | Replaceable backend contract, deterministic headless mixer, typed unlock/pause state, and voice ownership |
| `AudioLifecycleError`                                                                   | Typed unlock/pause/resume rejection with the prior runtime state retained                                 |
| `AudioService`, `createAudioSdk()`                                                      | Public unlock, playback, bus, pause, listener, and owner cleanup boundary                                 |
| `AUDIO_GRAPH_CONTRACTS`, `registerAudioNodeContracts()`                                 | Play/Stop/Set Bus Volume/Set Bus Muted metadata with bounded audio effects                                |
| `registerAudioRuntimeAdapters()`                                                        | Runtime adapter dispatch through the injected public service                                              |
| `AudioSourceInstance`, `createAudioPoolParticipant()`                                   | Activation and pool-owned voice lifecycle                                                                 |

### `@haku/audio-web` — `packages/audio-web/src/index.ts`

| Export                                       | Purpose                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `WebAudioBackend`, `createWebAudioBackend()` | Gesture-gated Web Audio decoding, buses, spatial/listener graph, pause, and disposal |

### `@haku/storage` — `packages/storage/src/index.ts`

| Export                                                                                                              | Purpose                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ISaveStorage`, `SaveSlotRecord`, `ReplayArtifactRecord`                                                            | Async typed local save and separate replay namespaces                               |
| `InMemorySaveStorage`, `IndexedDbSaveStorage`                                                                       | Defensive expected-revision backends with estimates and typed failures              |
| `SaveStorageConflictError`, `SaveStorageQuotaError`, `SaveStorageSerializationError`, `SaveStorageUnavailableError` | Stable storage failure contract                                                     |
| `SaveReplicationAdapter`, `NoReplicationAdapter`, `PlatformManagedReplicationAdapter`                               | Honest none/explicit/platform-managed capability union                              |
| `MockExplicitReplicationAdapter`                                                                                    | Revision/conflict, rate/size limit, and optional finite numeric-stat contract proof |
| `SaveSlotCheckpointService`, `createSaveSlotData()`                                                                 | Graph `SaveService` adapter preserving game and sibling checkpoint data             |

### `@haku/platform` — `packages/platform/src/index.ts`

| Export                                                            | Purpose                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `PlatformAdapter`, `PlatformCapabilities`, `PlatformAuthProvider` | Provider-neutral capability/lifecycle/auth boundary                          |
| `PlatformRuntimeControls`                                         | Narrow simulation pause, input enable, and audio pause callbacks             |
| `BrowserPlatformAdapter`                                          | Distinct visibility/focus lifecycle and deterministic composed pause reasons |

### `@haku/serializer` — `packages/serializer/src/index.ts`

| Export                                                                                               | Purpose                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `loadSceneDocument(input, { expandPrefabs?, prefabAssets, componentRegistry })`                      | JSON → `World`                       |
| `saveSceneDocument(world, metadata, prototypes, renderSettings, physicsSettings, componentRegistry)` | **Write gate** → `SceneDocument`     |
| `registerSerializedAssetTypes(registry)`                                                             | Scene/prefab descriptor contribution |
| `roundtripSceneDocument(doc, componentRegistry)`                                                     | Test helper                          |
| `validateSceneDocument`                                                                              | Re-export from schema                |

**Node only:** `@haku/serializer/node` — [`node.ts`](../packages/serializer/src/node.ts) —
`loadSceneFromPath(path, componentRegistry)`.

### `@haku/engine` — full API — `packages/engine/src/index.ts`

| Export                                                                     | Purpose                                                               |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `Engine`, `EngineOptions`, `EngineFeatureFlags`, `ENGINE_SCHEDULER_POLICY` | Scheduled game loop — [`engine.ts`](../packages/engine/src/engine.ts) |
| `SceneLoader.load(path)`, `SceneLoader.fromDocument(doc)`                  | HTTP load + validate                                                  |
| `ThreeRenderBackend`, `RenderSyncSystem`                                   | Render pipeline                                                       |
| `createMaterial`, `createMeshFromRenderer`, `updateMeshMaterial`, …        | Mesh factory                                                          |
| `setModelAssetResolver`, `setModelResourceResolver`, `clearModelCache`     | glTF loading hooks                                                    |
| `setHakuLogSink`, `sceneLog`, `modelLogError`, …                           | Structured logging                                                    |
| `createEnginePoolParticipant()`                                            | Immediate render/physics reconciliation on pool lifecycle             |

### `@haku/engine/runtime` — games only — `packages/engine/src/runtime.ts`

| Export                                                          | Purpose               |
| --------------------------------------------------------------- | --------------------- |
| `Engine`, `SceneLoader`                                         | Minimal bootstrap     |
| `projectPathToUrl`, `relativeToAssetsDir`, `DEFAULT_ASSETS_DIR` | Re-export from schema |

**Playground pattern:** [`apps/playground/src/main.ts`](../apps/playground/src/main.ts)

### `@haku/build` — `packages/build/src/index.ts`

| Export                                                                               | Purpose                                                                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `createBrowserProjectIndex`, `generateBrowserProjectTooling`                         | Shared `tsconfig.json`, engine/project/Node SDK declarations, and Monaco/VS Code file map |
| `buildBrowserProject`, `BrowserProjectTrustMode`, `BrowserProjectCapabilityManifest` | Trust and requested-capability gate before compilation                                    |
| `TypeScriptLanguageClient`, `BrowserBundlerClient`                                   | Lazy typed local Worker RPC clients                                                       |
| `analyzeTypeScriptProject`                                                           | TypeScript diagnostics scoped to requested source paths                                   |
| `BrowserProjectBundles`                                                              | Separate browser-safe gameplay and editor-extension outputs                               |
| `createBrowserStaticExport()`                                                        | Validate/close an in-memory project and rewrite root HTML/local runtime assets            |
| `createBrowserStaticExportZip()`                                                     | Deterministic stored ZIP with safe paths and portable regular-file modes                  |
| `BrowserStaticExportClient`                                                          | Lazy dedicated Worker RPC client for local static runtime compilation                     |

### `@haku/editor` — `packages/editor/src/index.ts`

| Export                                                      | Purpose                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `EditorApp`, `EditorLayout`                                 | React root                                                                                      |
| `useEditorStore`                                            | Zustand state                                                                                   |
| `projectService`                                            | Project read/write — [`project-service.ts`](../packages/editor/src/services/project-service.ts) |
| `globalCommandBus`, `executeCommand`                        | Undo + world commands                                                                           |
| `BrowserProjectWorkspace`                                   | Conflict-safe source buffers, disk baselines, fork, and explicit conflict resolution            |
| `CodeWorkspacePanel`, `ProjectCodeWorkspacePanel`           | Code tab workflow and project/browser tooling composition                                       |
| `DefaultCodeEditorProvider`, `createLazyCodeEditorProvider` | Replaceable lazy Monaco boundary                                                                |
| `createPlaySandbox`                                         | Disposable opaque-origin iframe Play transport with timeout/Stop cleanup                        |
| `openProjectInExternalVsCode`                               | External VS Code URI launch for an absolute local project path                                  |

**Not exported publicly (internal):** `commitSceneEdit` — import from `commands/scene-history.js` inside editor package only.

### `@haku/create` — `packages/create/src/index.ts`

| Export                       | Purpose                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| `createHakuProject(options)` | Scaffold external game                                        |
| CLI                          | `create-haku` bin — [`cli.ts`](../packages/create/src/cli.ts) |

---

## Read / write rules

### Scene document (`.scene.json`)

```
READ:  file → JSON.parse → validateSceneDocument() → loadSceneDocument()
WRITE: world + metadata → saveSceneDocument() → JSON.stringify → projectService.saveScene()
```

| Step                | API                                                                                                  | Package                |
| ------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------- |
| Validate only       | `validateSceneDocument(unknown)`                                                                     | `@haku/schema`         |
| Hydrate world       | `loadSceneDocument(doc, { expandPrefabs, prefabAssets, componentRegistry })`                         | `@haku/serializer`     |
| Serialize           | `saveSceneDocument(world, metadata, prototypes, renderSettings, physicsSettings, componentRegistry)` | `@haku/serializer`     |
| HTTP load (runtime) | `loadProjectPrefabAssets(manifest)` → `SceneLoader.load(url, fetch, prefabAssets)`                   | `@haku/engine/runtime` |
| Push to engine      | `engine.loadWorld(world, prototypes, prefabAssets, renderSettings, activeCameraId)`                  | `@haku/engine`         |
| Live edit (no save) | `engine.setWorld(world)`                                                                             | `@haku/engine`         |

**Example scene:** [`examples/minimal.scene.json`](../examples/minimal.scene.json)

### Project manifest (`haku.project.json`)

```json
{
  "schemaVersion": 1,
  "name": "my-game",
  "entryScene": {
    "$ref": "10000000-0000-4000-8000-000000000001",
    "type": "20000000-0000-4000-8000-000000000001"
  },
  "assetsDir": "public/assets",
  "scriptsDir": "scripts",
  "assets": [
    {
      "id": "10000000-0000-4000-8000-000000000001",
      "type": "20000000-0000-4000-8000-000000000001",
      "path": "scenes/menu.scene.json",
      "dependencies": []
    }
  ]
}
```

Paths are relative to `assetsDir`; UUIDs are identity. Moving an asset updates only its
manifest `path`. Parse with `validateProjectManifest()`. Playground:
[`apps/playground/haku.project.json`](../apps/playground/haku.project.json).

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

| Storage                 | Read                                 | Write                                                                      |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| Native FS (Chrome/Edge) | `nativeProjectStore.readText()`      | `nativeProjectStore.writeText()` after `ensureWritePermission()`           |
| Virtual (folder picker) | `browserProjectStore.readText()`     | `browserProjectStore.writeText()` (in-memory)                              |
| All paths               | **`projectService`** — do not bypass | [`project-service.ts`](../packages/editor/src/services/project-service.ts) |

### Asset / model loading

```
MeshRenderer.modelAsset.$ref
  → ProjectAssetIndex resolves UUID to a manifest path
  → projectService.resolveModelAsset(id)
  → setModelAssetResolver (editor wires this)
  → loadModelTemplate(id) in engine
```

Log categories: `modelLog`, `gltf.load.failed` — [`model-loader.ts`](../packages/engine/src/model-loader.ts).

### Logs

Append-only project log: `logs/haku.log` via `projectService.appendProjectLog()`.

---

## Migrations & schema compatibility

> No separate migration tool — **Zod preprocess + defaults** at load time.  
> **`schemaVersion` must be `1`** — other versions throw.
>
> This describes the current implementation. The approved engine-game transition is a
> deliberate breaking replacement of all available repository assets and APIs, without a
> compatibility layer or migration tool. After that stage lands, replace this section with
> the new current contract rather than preserving both paths.

| Legacy input                           | Migration (automatic)                                        | Where                                                                                 |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Scene without `renderSettings`         | Inject `defaultRenderSettings()`                             | `SceneDocumentSchema` preprocess — [`index.ts`](../packages/schema/src/index.ts)      |
| Material without `materialType`        | Default to `standard`                                        | `MeshMaterialSchema` preprocess — [`material.ts`](../packages/schema/src/material.ts) |
| Legacy inline material on MeshRenderer | Normalized via `normalizeMeshRenderer()`                     | [`mesh.ts`](../packages/schema/src/mesh.ts)                                           |
| Spot light `angle` / `penumbra`        | Mapped to `outerAngle` / `innerAngle`                        | `SpotLightDataSchema` + `spotToThreeCone()`                                           |
| `schemaVersion: 2+`                    | **Rejected** — implement `v1 → v2` in serializer when needed | `IMPLEMENTATION_PLAN.md` §5.5                                                         |

**Future migration rule (locked):** bump `schemaVersion`, add function in `@haku/serializer`, keep preprocess for one version back.

**Do not** hand-edit migration logic in editor — centralize in schema preprocess or serializer.

---

## Limitations (do not work around silently)

| Limitation                    | Detail                                          | Doc                                    |
| ----------------------------- | ----------------------------------------------- | -------------------------------------- |
| No backend / auth / DB        | Local-first browser app                         | [`edge-cases.md`](./edge-cases.md)     |
| No React in engine/playground | ESLint enforced                                 | [`architecture.md`](./architecture.md) |
| No Three.js in core/schema    | Pure data layer                                 | `eslint.config.js`                     |
| `schemaVersion` only `1`      | v2 not implemented                              | serializer tests                       |
| Live-state-preserving hot reload | Deferred; Play is disposable and restartable | development plan deferred backlog |
| Instancing/batching           | Stub hooks only                                 | `RENDER_PLAN.md`                       |
| ECS                           | Out of scope                                    | `IMPLEMENTATION_PLAN.md` §10           |
| File System Access            | Chrome/Edge native write; others use virtual FS | MDN link below                         |
| Play undo                     | Disabled in play mode                           | `editor-store.ts`                      |

---

## Official documentation (pinned versions)

> Versions from `package.json`. **Use these URLs — do not assume newer Three/React APIs.**

### Three.js `^0.171.0`

| Topic                      | URL                                                                    |
| -------------------------- | ---------------------------------------------------------------------- |
| Docs index                 | https://threejs.org/docs/                                              |
| Manual                     | https://threejs.org/manual/                                            |
| WebGLRenderer              | https://threejs.org/docs/#api/en/renderers/WebGLRenderer               |
| Object3D / Scene graph     | https://threejs.org/docs/#api/en/core/Object3D                         |
| MeshStandardMaterial       | https://threejs.org/docs/#api/en/materials/MeshStandardMaterial        |
| DirectionalLight + shadows | https://threejs.org/docs/#api/en/lights/shadows/DirectionalLightShadow |
| GLTFLoader (examples)      | https://threejs.org/docs/#examples/en/loaders/GLTFLoader               |
| TransformControls (editor) | https://threejs.org/docs/#examples/en/controls/TransformControls       |
| OrbitControls (editor)     | https://threejs.org/docs/#examples/en/controls/OrbitControls           |
| EffectComposer / post      | https://threejs.org/manual/en/post-processing.html                     |
| Render targets             | https://threejs.org/manual/en/rendertargets.html                       |
| WebGPU / TSL (future only) | https://threejs.org/manual/en/webgpurenderer                           |

### React `^18.3.1`

| Topic      | URL                                         |
| ---------- | ------------------------------------------- |
| React docs | https://react.dev/                          |
| useEffect  | https://react.dev/reference/react/useEffect |
| memo       | https://react.dev/reference/react/memo      |

### State & UI

| Lib                    | Version | URL                                                                   |
| ---------------------- | ------- | --------------------------------------------------------------------- |
| Zustand                | ^5.0    | https://zustand.docs.pmnd.rs/getting-started/introduction             |
| react-resizable-panels | ^2.1    | https://github.com/bvaughn/react-resizable-panels/blob/main/README.md |

### Validation & language

| Lib                 | Version | URL                                  |
| ------------------- | ------- | ------------------------------------ |
| Zod                 | ^3.25   | https://zod.dev/                     |
| Zod `.preprocess()` |         | https://zod.dev/?id=preprocess       |
| TypeScript          | ^5.7    | https://www.typescriptlang.org/docs/ |

### Build & test

| Lib                          | Version | URL                         |
| ---------------------------- | ------- | --------------------------- |
| Vite                         | ^6      | https://vite.dev/guide/     |
| Vitest                       | ^2.1    | https://vitest.dev/guide/   |
| pnpm workspaces              | 9.15    | https://pnpm.io/workspaces  |
| React Flow (`@xyflow/react`) | ^12.11  | https://reactflow.dev/learn |

### Web platform (editor I/O)

| Topic                        | URL                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| File System Access API       | https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API                           |
| `showDirectoryPicker`        | https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker                       |
| `webkitdirectory` fallback   | https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/webkitdirectory                      |
| Fetch API                    | https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API                                        |
| Web Workers                  | https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API                                  |
| Worker `postMessage()`       | https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage                               |
| `import.meta` URL resolution | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import.meta           |
| URL constructor              | https://developer.mozilla.org/en-US/docs/Web/API/URL/URL                                          |
| Blob                         | https://developer.mozilla.org/en-US/docs/Web/API/Blob                                             |
| `URL.createObjectURL()`      | https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static                       |
| `URL.revokeObjectURL()`      | https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static                       |
| Anchor `download`            | https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download                       |
| IndexedDB API                | https://www.w3.org/TR/IndexedDB/                                                                  |
| `IDBTransaction`             | https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction                                   |
| Storage quotas and eviction  | https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria |
| Page Visibility API          | https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API                              |

### Browser build and archive formats

| Topic                                     | URL                                                         |
| ----------------------------------------- | ----------------------------------------------------------- |
| esbuild browser/WASM API                  | https://esbuild.github.io/api/#running-in-the-browser       |
| esbuild in-memory output (`write: false`) | https://esbuild.github.io/api/#write                        |
| esbuild public path                       | https://esbuild.github.io/api/#public-path                  |
| PKWARE ZIP APPNOTE                        | https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT |

### Web Audio

| Topic                            | URL                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| Autoplay and user activation     | https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay                    |
| `AudioContext.resume()`          | https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume                  |
| `AudioContext.suspend()`         | https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/suspend                 |
| `BaseAudioContext.state`         | https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state               |
| `GainNode`                       | https://developer.mozilla.org/en-US/docs/Web/API/GainNode                             |
| `AudioBufferSourceNode`          | https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode                |
| `AudioScheduledSourceNode.ended` | https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/ended_event |
| `AudioListener`                  | https://developer.mozilla.org/en-US/docs/Web/API/AudioListener                        |
| Web Audio resume algorithm       | https://webaudio.github.io/web-audio-api/#dom-audiocontext-resume                     |
| Web Audio suspend algorithm      | https://webaudio.github.io/web-audio-api/#dom-audiocontext-suspend                    |
| Web Audio GainNode               | https://webaudio.github.io/web-audio-api/#gainnode                                    |

### Editor/platform references

These references inform implemented editor tooling, generic platform contracts, and later
provider-specific adapters.

| Topic                            | URL                                                                 |
| -------------------------------- | ------------------------------------------------------------------- |
| Monaco Editor                    | https://github.com/microsoft/monaco-editor                          |
| TypeScript Compiler API          | https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API |
| esbuild browser API              | https://esbuild.github.io/api/#running-in-the-browser               |
| Yandex Games player data         | https://yandex.com/dev/games/doc/en/sdk/sdk-player                  |
| Poki HTML5 SDK / cloud gamesaves | https://sdk.poki.com/html5                                          |
| Poki SDK lifecycle               | https://sdk.poki.com/sdk-documentation                              |

### Rapier `@dimforge/rapier3d-compat` ^0.19.3

> **Use for `@haku/physics-rapier` and raycast vehicle work.**
> Haku implements a **custom raycast vehicle** on the abstract `@haku/physics` layer (`stepRaycastVehicle`). Align with Rapier docs and the references below — not any third-party reference game's physics API.

| Topic                                                       | URL                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Docs index**                                              | https://rapier.rs/docs/                                                      |
| JavaScript getting started                                  | https://rapier.rs/docs/user_guides/javascript/getting_started                |
| Rigid-body dynamics                                         | https://rapier.rs/docs/user_guides/javascript/rigid_body_forces_and_impulses |
| Ray casting                                                 | https://rapier.rs/docs/user_guides/javascript/scene_queries_ray_casting      |
| Colliders                                                   | https://rapier.rs/docs/user_guides/javascript/colliders                      |
| **Three.js — Rapier vehicle controller (official example)** | https://threejs.org/examples/physics_rapier_vehicle_controller.html          |
| **Custom raycast vehicle (reference implementation)**       | https://sketches.isaacmason.com/sketch/rapier/custom-raycast-vehicle         |
| rapier.js (npm / upstream)                                  | https://github.com/dimforge/rapier.js                                        |

**Force adapter rule:** Rapier force/torque accumulators persist until reset, but the abstract `@haku/physics` contract is one-step. `RapierPhysicsBackend.step()` resets both after integration so it matches Stub; impulse semantics remain immediate and unchanged.

**Composition rule:** `@haku/engine` production code depends only on `@haku/physics`. Application composition roots that select a concrete backend may depend on `@haku/physics-rapier`; this includes editor Play mode (`packages/editor/src/viewport/play-mode-physics.ts`) and playground/app factories. Keep Rapier types and construction out of engine core.

**Agent rule — physics tuning:** Implement suspension, friction, engine, and steering using **Rapier docs + Isaac Mason sketch + Play-mode validation**. Do **not** copy numeric settings from the reference game’s physics runtime — those values target a different solver and are not portable. The reference is useful for **player-facing goals** (arcade RWD feel, jump height, speed caps, camera behavior), not for 1:1 parameter transfer.

---

## Key source files (deep links)

| Task                             | File                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Add component schema             | `packages/schema/src/index.ts`                                                   |
| Material registry                | `packages/schema/src/material.ts`                                                |
| Render settings schema           | `packages/schema/src/render-settings.ts`                                         |
| World / hierarchy                | `packages/core/src/world.ts`                                                     |
| Component registry               | `packages/core/src/components.ts`                                                |
| Load/save scene                  | `packages/serializer/src/index.ts`                                               |
| Engine loop                      | `packages/engine/src/engine.ts`                                                  |
| Render backend                   | `packages/engine/src/render-backend.ts`                                          |
| Entity → Object3D                | `packages/engine/src/render-sync/render-sync-system.ts`                          |
| Apply render settings            | `packages/engine/src/render/apply-render-settings.ts`                            |
| Material factories               | `packages/engine/src/mesh-factory.ts`                                            |
| glTF loader                      | `packages/engine/src/model-loader.ts`                                            |
| Raycast vehicle solver           | `packages/physics/src/raycast-vehicle-simulation.ts`                             |
| Rapier physics backend           | `packages/physics-rapier/src/rapier-backend.ts`                                  |
| Vehicle controller (drive/steer) | `packages/engine/src/systems/vehicle-controller-system.ts`                       |
| Editor store                     | `packages/editor/src/store/editor-store.ts`                                      |
| Undo / commit                    | `packages/editor/src/commands/scene-history.ts`                                  |
| World commands                   | `packages/editor/src/commands/world-commands.ts`                                 |
| Viewport + engine lifecycle      | `packages/editor/src/panels/ViewportPanel.tsx`                                   |
| Inspector                        | `packages/editor/src/panels/InspectorPanel.tsx`                                  |
| Visual Component Type dialog     | `packages/editor/src/components/CustomComponentTypeDialog.tsx`                   |
| Component extension host         | `packages/editor/src/extensions/editor-extension-host.ts`                        |
| Sandboxed custom widget          | `packages/editor/src/extensions/SandboxedCustomWidget.tsx`                       |
| Project I/O                      | `packages/editor/src/services/project-service.ts`                                |
| Runtime DOM UI                   | `packages/ui/src/ui-document-instance.ts`, `ui-service.ts`                       |
| Visual UI authoring              | `packages/editor/src/ui/UIDocumentEditorPanel.tsx`, `ui-authoring-session.ts`    |
| Headless audio runtime           | `packages/audio/src/index.ts`                                                    |
| Web Audio backend                | `packages/audio-web/src/index.ts`                                                |
| AudioSource Inspector/preview    | `packages/editor/src/components/AudioSourceFields.tsx`, `audio/audio-preview.ts` |
| Playground audio diagnostic      | `apps/playground/src/audio-diagnostic.ts`                                        |
| Cross-service graph diagnostic   | `apps/playground/src/cross-service-diagnostic.ts`                                |
| Isolated M10f browser entry      | `apps/playground/m10f-diagnostic.html`, `apps/playground/vite.m10f.config.ts`    |
| Create templates                 | `packages/create/templates/`                                                     |
| CI check                         | `scripts/check.sh`                                                               |

---

## Examples & templates

| Resource                     | Path                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| Minimal valid scene          | [`examples/minimal.scene.json`](../examples/minimal.scene.json) |
| Bounce Run proving game      | [`apps/bounce-run`](../apps/bounce-run) — engine-only           |
| Diagnostic catalog          | [`apps/playground`](../apps/playground) — engine-only           |
| External game template       | `packages/create/templates/`                                    |
| Serializer tests (roundtrip) | `packages/serializer/src/index.test.ts`                         |
| Schema legacy tests          | `packages/schema/src/index.test.ts`, `render-settings.test.ts`  |

---

## Commands

```bash
pnpm install && pnpm build
pnpm test
pnpm --filter @haku/bounce-run dev
pnpm --filter @haku/bounce-run build
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
