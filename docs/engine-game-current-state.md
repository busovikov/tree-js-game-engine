# Engine improvement through Bounce Run: current-state audit

> Baseline verified on 2026-07-26 at commit `d8e74a1`. This document records what exists
> before the engine-improvement program starts. Target contracts live in
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
  -> @haku/core World (scene graph + plain-data components)
  -> ordered ISystem.update(world, frameDt)
       -> PhysicsWorldSystem owns its fixed-step accumulator
       -> other systems use numeric order
  -> RenderSyncSystem
  -> ThreeRenderBackend / render-only RenderGraph

Browser editor
  -> React + Zustand + command history
  -> ProjectService (native File System Access or virtual project)
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
| Entity and component model   | **Partial**               | `World`, stable entity UUIDs, hierarchy, queries, plain component data, package-owned schemas, and composition-root registries exist. No `activeSelf`/`activeInHierarchy` or project custom components.                                    |
| Prefabs                      | **Ready for current v1**  | Prefabs are standalone manifest assets referenced by typed UUID, with component-ID overrides and load-time expansion. Deep override paths and nested variants remain intentionally deferred.                                               |
| Asset system                 | **Ready as a foundation** | Universal UUID manifests, typed references, package-contributed descriptors, structured diagnostics, path-independent identity, and deterministic dependency closure exist. Static export remains a later milestone.                     |
| Runtime scheduler            | **Partial**               | Systems are sorted by numeric `order`. `PhysicsWorldSystem` owns a bounded fixed-step accumulator and interpolation. There are no named phases, shared scheduler queues, pause/single-step contract, or fixed-domain graph execution.    |
| Gameplay node system         | **Absent**                | The existing `RenderGraph` orchestrates render passes only. There is no gameplay graph asset, compiler, dataflow, flow/event execution, node registry, or node editor.                                                                   |
| Script/custom-node runtime   | **Absent**                | `ScriptRef` has schema/editor presence, but no runtime executor or safe SDK. The create template contains only a future-facing stub.                                                                                                     |
| Rapier integration           | **Ready as a foundation** | Abstract and Rapier packages support dynamic/static/kinematic bodies, CCD, layers, material properties, multiple worlds, joints, and debug rendering. Gameplay bindings and graph effects still need to be designed.                     |
| Collision and trigger events | **Ready as a foundation** | Collision/trigger events and contact manifolds are supported; editor Play mode exposes contact buffers. No graph event bindings or landing/bounce controller exists.                                                                     |
| Physics queries              | **Ready as a foundation** | Raycast, shapecast, and overlap exist in the abstract API and Rapier backend. Node/Custom Node SDK bindings are absent.                                                                                                                  |
| Input                        | **Partial**               | Keyboard/pointer `InputManager` produces action-like vehicle inputs and has attach/detach/enable lifecycle. It is vehicle-shaped rather than a general provider/action registry; no replay injection or future mobile provider boundary. |
| Object pooling               | **Absent**                | No universal pool component, system, entity activation contract, baseline reset, or lifecycle hooks.                                                                                                                                     |
| Runtime DOM UI               | **Absent**                | Editor UI is React. Production games have no serializable UI document, DOM renderer, UI service, or visual UI editor.                                                                                                                    |
| Audio                        | **Absent**                | No audio asset, component, backend abstraction, mixer, Web Audio implementation, or graph API was found.                                                                                                                                 |
| Save/storage                 | **Absent**                | Project file persistence exists, but no save-game storage, IndexedDB backend, replication adapter, slots, or graph API.                                                                                                                  |
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
| Numeric system `order`          | One named, multi-phase `EngineScheduler` owning frame/fixed time             |
| Physics system owns accumulator | Scheduler commands exactly one physics step per fixed substep                |
| Render-only graph               | Separate typed gameplay graph compiler and interpreter                       |
| `ScriptRef` stub                | Custom Node SDK, custom components, behavior graphs, and typed project code  |
| World always active             | `activeSelf` plus computed `activeInHierarchy`                               |
| No runtime pooling              | Package-level pool built on entity activation and baseline reset             |
| Editor React UI only            | Separate production DOM UI subsystem and UI assets                           |
| Project I/O only                | Save storage, replication, platform capabilities, and persistent checkpoints |
| Toolchain outside browser       | Browser-local TypeScript/bundling in Workers and sandboxed Play instances    |

## Confirmed risks

- **Central refactor risk:** scheduler ownership changes the engine loop and every existing
  physics/controller consumer. It must be an isolated early stage with parity tests.
- **Graph-runtime risk:** checkpoint, async policy, effects, and multi-domain execution are
  fundamental contracts. They cannot be added as editor-only conveniences after gameplay.
- **Browser toolchain risk:** TypeScript, bundling, custom code, and sandbox messaging must
  remain local without requiring a daemon or sending project files to Haku servers.
- **Isolation risk:** trusted project code still must not receive editor DOM or file handles.
  Editor customization therefore needs its own declarative and sandboxed extension APIs.
- **Persistent checkpoint risk:** graph and node versions can invalidate save data. Explicit
  checkpoint migration plus a safe fallback entry are mandatory.
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
