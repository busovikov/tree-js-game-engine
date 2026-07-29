# Engine improvement through Bounce Run: current-state audit

> Baseline verified on 2026-07-26 at commit `d8e74a1`; current claims are updated through
> M10c. Target contracts live in
> [node-graph-architecture.md](./node-graph-architecture.md) and execution order lives in
> [engine-game-development-plan.md](./engine-game-development-plan.md).

## Audit scope

The audit used the repository documentation and narrow source entrypoints rather than a
whole-repository source load:

- [`AGENTS.md`](../AGENTS.md), [`agent-workflow.md`](./agent-workflow.md),
  [`architecture.md`](./architecture.md), and [`links.md`](./links.md);
- relevant architecture, scene, editor, asset, render, and test sections in
  [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) and
  [`RENDER_PLAN.md`](../RENDER_PLAN.md);
- `packages/core/src/{types,world,components}.ts`;
- `packages/schema/src/index.ts` and `packages/serializer/src/index.ts`;
- `packages/engine/src/engine.ts`, `systems/physics-world-system.ts`,
  `input/input-manager.ts`, and `render/render-graph.ts`;
- `packages/physics/src/{types,capabilities,physics-world}.ts`;
- `packages/editor/src/services/project-service.ts` and
  `viewport/play-mode-physics.ts`.

The original instruction in
`/Users/pavel/Downloads/autonomous_threejs_engine_game_agent_instruction.md` was read but
not modified. The repository documents supersede it where the user made a later decision.

## Current engine map

```text
SceneDocument v1
  -> @haku/schema validation
  -> @haku/serializer
  -> @haku/core World (scene graph + plain-data components + hierarchy activity)
  -> EngineScheduler
       -> named frame/fixed phases with deterministic phase-local ordering
       -> sole fixed-step accumulator, pause, single-step, and tick numbering
       -> PhysicsWorldSystem performs exactly one step in PhysicsStep
  -> RenderSyncSystem in Presentation
  -> ThreeRenderBackend / render-only RenderGraph in Render
  -> @haku/audio AudioRuntime
       -> headless or Web Audio backend
       -> Master plus Music/SFX/UI buses, listener pose, activation/pool cleanup

Browser editor
  -> React + Zustand + command history
  -> ProjectService (native File System Access or virtual project)
  -> graph asset create/open/save + Haku-owned authoring commands
  -> lazy replaceable React Flow canvas, compiler diagnostics, and Play trace/port values
  -> conflict-safe TypeScript workspace + generated declarations
  -> local TypeScript/esbuild Workers + trust/capability gate
  -> lazy replaceable Monaco + disposable opaque-origin Play sandbox
  -> visual project Component Types + generated Inspector/graph/type contracts
  -> constrained gizmo primitives + opaque sandbox widgets + unresolved untrusted state
  -> local binary audio import + AudioSource Inspector/gesture preview
  -> same Engine for viewport and Play mode
  -> snapshot world on Play, restore on Stop
```

The strongest current architectural property is the separation of simulation data from
Three.js presentation. `IWorld` is the shared boundary between serializer, editor, engine,
and physics systems. App composition roots select Rapier; `@haku/engine` depends on the
abstract physics API.

## Capability matrix

Status meanings: **ready**, **partial**, **awkward**, **absent**, or **unverified**.

| Capability                   | Status                    | Current evidence and target gap                                                                                                                                                                                                          |
| ---------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scene documents              | **Ready for current v1**  | Zod validation, load/save, hierarchy, render/physics settings, and roundtrip tests exist. Target deliberately replaces the format; no compatibility layer is required.                                                                   |
| Entity and component model   | **Ready as a foundation** | `World`, stable entity UUIDs, hierarchy, active-state propagation, inactive-aware queries, deterministic component lifecycle hooks, plain component data, package/project registries, and visual Component Type assets exist. Project types survive scene/prefab save/load and export dependency closure. |
| Prefabs                      | **Ready for current v1**  | Prefabs are standalone manifest assets referenced by typed UUID, with component-ID overrides and load-time expansion. Deep override paths and nested variants remain intentionally deferred.                                               |
| Asset system                 | **Ready as a foundation** | Universal UUID manifests, typed references, package-contributed descriptors, structured diagnostics, path-independent identity, and deterministic dependency closure exist. Static export remains a later milestone.                     |
| Runtime scheduler            | **Ready as a foundation** | `EngineScheduler` owns named frame/fixed phases, deterministic local ordering and typed queued commands, bounded fixed-step catch-up, tick/frame numbering, interpolation alpha, pause, and single-step. `@haku/graph-runtime` enters every domain through this scheduler and owns no second loop. |
| Gameplay node system         | **Ready as a foundation**  | `@haku/graph` provides strict graph assets, registered types/nodes/effects, generics, diagnostics, checkpoint scope/taint and async-liveness metadata, and deterministic plans. `@haku/graph-runtime` adds instances, lazy snapshots, flow/event queues, scoped async work, tracing, bounded checkpoint/rewind, all seven async policies, effect reconciliation, and persistent checkpoint hooks. The M07 editor adds Haku-owned graph authoring, lazy replaceable canvas integration, compiler/checkpoint diagnostics, and Play trace/port values. |
| Script/custom-node runtime   | **Ready as a foundation**  | Metadata-only Custom Node declarations are paired with type/version-bound runtime adapters behind a replaceable `ExecutionBackend`. Browser-local TypeScript diagnostics and separate gameplay/editor-extension bundles are trust-gated. M09 adds scheduler batch behavior contracts, typed component commands, graph adapters, constrained gizmos, sandbox widgets, and visible inert untrusted state. Named project TypeScript exports are bundled but the Inspector trace is explicitly a non-mutating core-runner contract preview rather than export execution. |
| Rapier integration           | **Ready as a foundation** | Abstract and Rapier packages support dynamic/static/kinematic bodies, CCD, layers, material properties, multiple worlds, joints, and debug rendering. Gameplay bindings and graph effects still need to be designed.                     |
| Collision and trigger events | **Ready as a foundation** | Collision/trigger events and contact manifolds are supported; editor Play mode exposes contact buffers. No graph event bindings or landing/bounce controller exists.                                                                     |
| Physics queries              | **Ready as a foundation** | Raycast, shapecast, and overlap exist in the abstract API and Rapier backend. Node/Custom Node SDK bindings are absent.                                                                                                                  |
| Input                        | **Partial**               | Keyboard/pointer `InputManager` produces action-like vehicle inputs and has attach/detach/enable lifecycle. It is vehicle-shaped rather than a general provider/action registry; no replay injection or future mobile provider boundary. |
| Object pooling               | **Ready as a foundation** | `@haku/pool` provides prefab-backed serializable configuration, deterministic generational handles, authored hierarchy baselines, bounded growth/exhaustion policies, runtime scopes, graph/engine lifecycle integration, metrics, general SDK/nodes, and a 10,000-cycle playground diagnostic. |
| Runtime DOM UI               | **Ready as a foundation** | `@haku/ui` provides strict UUID UI assets, native semantic DOM rendering without React, typed events, public service/SDK/graph mutations, asset closure, and visible playground proof. The React editor adds hierarchy, preview, Inspector, undo/redo, three desktop presets, and project persistence. |
| Audio                        | **Ready as a foundation** | `@haku/audio` provides Audio Clip/AudioSource models, headless mixer/runtime, Master/Music/SFX/UI buses, one-shot/loop/spatial controls, listener pose, activation/pool cleanup, service/SDK/graph effects, and manifest closure. `@haku/audio-web` adds gesture-gated decoding/playback and deterministic disposal; the editor Inspector/preview and user-Chrome production diagnostic are verified. |
| Save/storage                 | **Partial foundation**    | M06 defines storage-agnostic async `SaveService` checkpoint entries, checksummed/fingerprinted records, migrations, and per-graph fallback. Save-slot ownership, IndexedDB, replication, platform adapters, and graph service nodes remain M10d/M10f. |
| Platform integration         | **Absent**                | No generic `PlatformAdapter` or capability model for Yandex/Poki-style lifecycle and save behavior.                                                                                                                                      |
| Seeded random                | **Absent**                | A seeded demo description exists, but no general seeded RNG service or replay contract was found.                                                                                                                                        |
| Replay/QA harness            | **Absent**                | There are tests and debug helpers, but no tick-action recorder, state hashes, replay artifact, or structured browser QA session report.                                                                                                  |
| Tests                        | **Ready as a foundation** | Unit/integration coverage exists across core, schema, serializer, physics, engine, editor, and apps. Playwright/export gates and the new graph/generator suites are absent.                                                              |
| Browser-only project editing | **Partial foundation**    | Chrome File System Access and dev-target persistence feed a conflict-safe source workspace. Generated declarations are shared by lazy Monaco and external VS Code; TypeScript/esbuild run locally in Workers; built-in/imported/local trust modes gate compilation; Play is disposable and DOM/file-handle isolated. Static ZIP export remains M10e. |
| Production export            | **Absent**                | Vite applications can be built conventionally, but there is no editor function that resolves reachable assets and downloads a self-contained static HTML5 ZIP.                                                                           |
| Rendering                    | **Ready and evolving**    | Three.js backend, RenderSync, shadows/settings, render targets, post pipeline, and render-only RenderGraph exist. Bounce Run should use the backend offered by Haku and preserve the render roadmap boundaries.                          |

## Current versus remaining target

| Current contract                | Target contract                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Named multi-phase scheduler     | Graph flow/events now use every existing frame/fixed domain                  |
| Scheduler-owned accumulator     | Graph runtime adds no loop or accumulator                                    |
| Typed gameplay graph compiler   | Graph authoring, diagnostics, and shared editor/headless diagnostic execution are implemented |
| Runtime adapter boundary        | Browser project-code compilation, sandboxed Play, and custom component/editor-extension adapters are implemented |
| Hierarchy activation foundation | Pooling and graph lifecycle integrations now reuse the existing contract      |
| Runtime entity pooling          | Package-level pool uses authored baseline reset and external resource lifecycle |
| Production/editor UI split      | React-free DOM UI runtime and separate React visual authoring are implemented |
| Headless/browser audio split    | DOM-free contracts plus Web Audio adapter, service/graph, editor preview, and local asset closure are implemented |
| Checkpoint persistence hooks    | Add save-slot storage, replication, and platform capabilities in M10d        |
| Browser-local code toolchain    | Separate gameplay/editor outputs and trust-gated component extensions are implemented; static ZIP export remains M10e |

## Confirmed risks

- **Scheduler integration risk:** the central scheduler refactor is complete; later graph,
  replay, and checkpoint work must reuse its phases, fixed tick, and typed queues rather
  than create a second loop or accumulator.
- **Graph-runtime risk:** multi-domain execution, structured task ownership, checkpoint
  policies, rewind, effect reconciliation, and persistence hooks now have headless coverage.
  M07 exposes the same compiler/runtime diagnostic plan in editor Play and the playground;
  later tooling must preserve that shared-plan boundary.
- **Browser toolchain risk:** TypeScript, bundling, custom code, and sandbox messaging are
  local and daemon-free; later extensions must preserve that boundary and the production
  bundle exclusion gate.
- **Runtime UI boundary risk:** UI documents now persist strict UUID references and the
  production renderer is React-free. Later export and platform work must mutate UI
  through `UIService` and must not move editor state or DOM handles into saved assets.
- **Audio boundary risk:** Web Audio state remains isolated in `@haku/audio-web`, while
  serialized audio data stays in `@haku/audio`. Later platform pause/export integration
  must preserve real-gesture unlock, local asset closure, and deterministic voice cleanup.
- **Isolation risk:** declarative gizmos and opaque sandbox widgets now keep project extensions
  away from editor DOM/file handles. Future extension features must preserve that constrained
  boundary; Inspector behavior tracing currently previews the declared batch contract and does
  not execute the named project TypeScript export.
- **Persistent checkpoint risk:** checksums, fingerprints, registered migration, and
  per-graph fallback are enforced. M10d storage implementations must preserve this contract
  without broadening a graph failure into whole-slot invalidation.
- **Physics/checkpoint risk:** dynamic-physics-dependent graph scopes cannot promise exact
  logical restore and must be rejected transitively.
- **Performance risk:** graph interpretation, inactive pooled entities, editor modules, build
  Workers, and Play cleanup need baselines before hard budgets are chosen.
- **Browser QA risk:** real Chrome interaction is essential but slow and visually fragile;
  deterministic tests and replay support it rather than replace it.
- **Scope risk:** the MVP includes the complete agreed engine platform and game, not a thin
  prototype. Dependency-ordered stages and granular commits are mandatory.

## Audit conclusion

Haku is a viable foundation: its world, serializer, editor mutation path, Three.js boundary,
and abstract Rapier integration should be extended rather than replaced. The target work is
nevertheless a platform expansion, not merely a game implementation. The graph runtime,
registries, scheduler, browser project toolchain, UI/audio services, and pooling are proven
engine facilities; storage/platform/export services and Bounce Run integration remain.
