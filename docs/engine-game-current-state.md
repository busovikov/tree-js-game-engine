# Engine improvement through Bounce Run: current-state audit

> Baseline verified on 2026-07-26 at commit `d8e74a1`; current claims are updated through
> M07. Target contracts live in
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

Browser editor
  -> React + Zustand + command history
  -> ProjectService (native File System Access or virtual project)
  -> graph asset create/open/save + Haku-owned authoring commands
  -> lazy replaceable React Flow canvas, compiler diagnostics, and Play trace/port values
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
| Entity and component model   | **Ready as a foundation** | `World`, stable entity UUIDs, hierarchy, active-state propagation, inactive-aware queries, deterministic component lifecycle hooks, plain component data, package-owned schemas, and composition-root registries exist. Project custom components remain deferred. |
| Prefabs                      | **Ready for current v1**  | Prefabs are standalone manifest assets referenced by typed UUID, with component-ID overrides and load-time expansion. Deep override paths and nested variants remain intentionally deferred.                                               |
| Asset system                 | **Ready as a foundation** | Universal UUID manifests, typed references, package-contributed descriptors, structured diagnostics, path-independent identity, and deterministic dependency closure exist. Static export remains a later milestone.                     |
| Runtime scheduler            | **Ready as a foundation** | `EngineScheduler` owns named frame/fixed phases, deterministic local ordering and typed queued commands, bounded fixed-step catch-up, tick/frame numbering, interpolation alpha, pause, and single-step. `@haku/graph-runtime` enters every domain through this scheduler and owns no second loop. |
| Gameplay node system         | **Ready as a foundation**  | `@haku/graph` provides strict graph assets, registered types/nodes/effects, generics, diagnostics, checkpoint scope/taint and async-liveness metadata, and deterministic plans. `@haku/graph-runtime` adds instances, lazy snapshots, flow/event queues, scoped async work, tracing, bounded checkpoint/rewind, all seven async policies, effect reconciliation, and persistent checkpoint hooks. The M07 editor adds Haku-owned graph authoring, lazy replaceable canvas integration, compiler/checkpoint diagnostics, and Play trace/port values. |
| Script/custom-node runtime   | **Partial**                | Metadata-only Custom Node declarations are paired with type/version-bound runtime adapters behind a replaceable `ExecutionBackend`. Browser project-code compilation and sandboxing remain M08. |
| Rapier integration           | **Ready as a foundation** | Abstract and Rapier packages support dynamic/static/kinematic bodies, CCD, layers, material properties, multiple worlds, joints, and debug rendering. Gameplay bindings and graph effects still need to be designed.                     |
| Collision and trigger events | **Ready as a foundation** | Collision/trigger events and contact manifolds are supported; editor Play mode exposes contact buffers. No graph event bindings or landing/bounce controller exists.                                                                     |
| Physics queries              | **Ready as a foundation** | Raycast, shapecast, and overlap exist in the abstract API and Rapier backend. Node/Custom Node SDK bindings are absent.                                                                                                                  |
| Input                        | **Partial**               | Keyboard/pointer `InputManager` produces action-like vehicle inputs and has attach/detach/enable lifecycle. It is vehicle-shaped rather than a general provider/action registry; no replay injection or future mobile provider boundary. |
| Object pooling               | **Partial foundation**    | Entity activation and deterministic lifecycle hooks exist. The universal pool component/system, authored baseline reset, capacity policy, and integrations remain deferred.                                                             |
| Runtime DOM UI               | **Absent**                | Editor UI is React. Production games have no serializable UI document, DOM renderer, UI service, or visual UI editor.                                                                                                                    |
| Audio                        | **Absent**                | No audio asset, component, backend abstraction, mixer, Web Audio implementation, or graph API was found.                                                                                                                                 |
| Save/storage                 | **Partial foundation**    | M06 defines storage-agnostic async `SaveService` checkpoint entries, checksummed/fingerprinted records, migrations, and per-graph fallback. Save-slot ownership, IndexedDB, replication, platform adapters, and graph service nodes remain M10d/M10f. |
| Platform integration         | **Absent**                | No generic `PlatformAdapter` or capability model for Yandex/Poki-style lifecycle and save behavior.                                                                                                                                      |
| Seeded random                | **Absent**                | A seeded demo description exists, but no general seeded RNG service or replay contract was found.                                                                                                                                        |
| Replay/QA harness            | **Absent**                | There are tests and debug helpers, but no tick-action recorder, state hashes, replay artifact, or structured browser QA session report.                                                                                                  |
| Tests                        | **Ready as a foundation** | Unit/integration coverage exists across core, schema, serializer, physics, engine, editor, and apps. Playwright/export gates and the new graph/generator suites are absent.                                                              |
| Browser-only project editing | **Partial**               | Chrome File System Access supports local projects; built-in demos use a virtual project. In-browser TypeScript service, bundler Worker, trust model, code editor providers, and local ZIP export are absent.                             |
| Production export            | **Absent**                | Vite applications can be built conventionally, but there is no editor function that resolves reachable assets and downloads a self-contained static HTML5 ZIP.                                                                           |
| Rendering                    | **Ready and evolving**    | Three.js backend, RenderSync, shadows/settings, render targets, post pipeline, and render-only RenderGraph exist. Bounce Run should use the backend offered by Haku and preserve the render roadmap boundaries.                          |

## Current versus remaining target

| Current contract                | Target contract                                                              |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Named multi-phase scheduler     | Graph flow/events now use every existing frame/fixed domain                  |
| Scheduler-owned accumulator     | Graph runtime adds no loop or accumulator                                    |
| Typed gameplay graph compiler   | Graph authoring, diagnostics, and shared editor/headless diagnostic execution are implemented |
| Runtime adapter boundary        | Add browser project-code compilation and sandboxing in M08                   |
| Hierarchy activation foundation | Build pooling and graph lifecycle integrations on the existing contract      |
| No runtime pooling              | Package-level pool built on entity activation and baseline reset             |
| Editor React UI only            | Separate production DOM UI subsystem and UI assets                           |
| Checkpoint persistence hooks    | Add save-slot storage, replication, and platform capabilities in M10d        |
| Toolchain outside browser       | Browser-local TypeScript/bundling in Workers and sandboxed Play instances    |

## Confirmed risks

- **Scheduler integration risk:** the central scheduler refactor is complete; later graph,
  replay, and checkpoint work must reuse its phases, fixed tick, and typed queues rather
  than create a second loop or accumulator.
- **Graph-runtime risk:** multi-domain execution, structured task ownership, checkpoint
  policies, rewind, effect reconciliation, and persistence hooks now have headless coverage.
  M07 exposes the same compiler/runtime diagnostic plan in editor Play and the playground;
  later tooling must preserve that shared-plan boundary.
- **Browser toolchain risk:** TypeScript, bundling, custom code, and sandbox messaging must
  remain local without requiring a daemon or sending project files to Haku servers.
- **Isolation risk:** trusted project code still must not receive editor DOM or file handles.
  Editor customization therefore needs its own declarative and sandboxed extension APIs.
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
registries, scheduler, browser project toolchain, UI/audio/storage/export services, and
pooling must be proven as engine facilities before Bounce Run becomes the integration
driver.
