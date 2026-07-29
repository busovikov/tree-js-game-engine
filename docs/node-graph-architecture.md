# Gameplay node graph architecture

> Stable target contract for the engine-improvement program. Implementations may add node
> types and editor features, but must not weaken these runtime invariants. The current engine
> does not yet implement this system; see
> [engine-game-current-state.md](./engine-game-current-state.md).

## Goals

- Make visual graphs the primary gameplay orchestration language.
- Support event/flow execution and dependency-based data evaluation from v1.
- Keep the runtime headless, deterministic where declared, and independent of React/editor.
- Make new node types, data types, components, domains, and backends additive through
  registries and SDK contracts.
- Compile authoring JSON to a compact execution plan before runtime.
- Support atomic logical rewind and persistent graph resume without pretending to snapshot
  dynamic physics or arbitrary JavaScript.

## Target package boundaries

```text
@haku/schema          base IDs, envelopes, shared serializable primitives
@haku/assets          manifest, registry, dependency closure, loaders
@haku/core            IWorld, activation, lifecycle, scheduler contracts
@haku/serializer      registry-driven scene/project serialization
@haku/graph           graph assets, types, effects, compiler, plan contracts
@haku/graph-runtime   interpreter, instances, queues; checkpoint/rewind begins in M06
@haku/pool            EntityPool component and PoolSystem
@haku/ui              UI asset model and production DOM renderer
@haku/audio           audio contracts, assets, mixer, headless backend
@haku/audio-web       Web Audio backend
@haku/storage         saves, IndexedDB, replication contracts
@haku/platform        platform capability and lifecycle contracts
@haku/build           browser build/export contracts and implementation
@haku/engine          runtime composition without editor or React
@haku/editor          React authoring shell and replaceable UI adapters
```

`@haku/schema` no longer imports every subsystem schema. Each package owns its component and
asset schemas and registers descriptors at a composition root. Core/schema never import
Three.js, DOM, React, Web Audio, IndexedDB, or platform SDKs. Production games never depend
on `@haku/editor`, React Flow, or Monaco.

Project-wide render and physics settings remain in `@haku/schema` as shared serializable
fields of the base scene envelope. Render component schemas and helpers belong to
`@haku/engine`; physics component schemas and helpers belong to `@haku/physics`. This keeps
the scene envelope independent of runtime composition without turning subsystem component
schemas into compatibility exports.

## Universal IDs and assets

- Every asset type uses a stable UUID `AssetId`.
- Path, type, content metadata, and dependencies live in a universal project asset manifest.
- Scenes, prefabs, graphs, UI, types, components, models, textures, audio, and future assets
  reference UUIDs, never paths as identity.
- Renaming or moving a file changes the manifest path, not references.
- Missing, duplicate, unreachable, and type-mismatched references are compile diagnostics.
- Production export includes the transitive dependency closure of the entry project assets.
- Existing path-based assets are replaced in one breaking transition. No compatibility or
  migration layer is required for the current repository.

Graph definitions are separate `*.graph.json` assets. A `GraphInstance` component stores an
asset reference, public parameters, persistence policy, and instance identity. Runtime state
never pollutes the graph asset.

## Component registry and custom components

The base scene format stores a generic typed component envelope. Each subsystem or project
registers a `ComponentDefinition` containing:

- stable type UUID and display metadata;
- runtime schema and defaults;
- serialization and reference metadata;
- lifecycle, reads/writes, effects, and capability metadata;
- optional inspector and gizmo descriptors;
- version/fingerprint.

Unknown component types are load/compile errors. Custom `Component Type` assets can be
created visually in the browser editor and generate TypeScript declarations. Component data
is serializable plain data; runtime handles remain private to a subsystem.

Custom component gameplay can use:

- an attached behavior graph;
- a TypeScript `ComponentBehavior`, registered as a batch scheduler system with explicit
  domain, query, reads, writes, and effects;
- typed public component commands.

`Update` and `FixedUpdate` are allowed only through explicit scheduler-aware behaviors, not
hidden callbacks embedded in component data. Lifecycle hooks cover create, activate,
deactivate, destroy, pool acquire/release, and checkpoint restore.

Implemented in M09: one visual Component Type UUID is both component type and manifest asset
identity. Project registries load before scene hydration; scene and prefab manifest
dependencies include every custom component envelope so production dependency closure retains
the definition. The same definition produces strict runtime defaults/schema/reference
metadata, generated Inspector fields and declarations, graph Get/Set/Add/Remove contracts,
and one scheduler batch over the complete declared query. Inspector tracing invokes the real
core batch runner with a non-mutating preview callback; it proves the scheduler contract and
entity batch, but does not claim execution of the named project TypeScript export.

## Graph document and compiler

The graph JSON is the sole editable source of truth. It contains stable UUIDs for graph,
node instances, ports/callsites, public interface declarations, layout metadata, and node
properties. Compiled artifacts are build cache and are not committed.

Implemented in M04–M05: `@haku/graph` owns the strict graph/public-interface/callsite schemas,
graph asset descriptor, registered data and node contracts, structured diagnostics, and
headless compiler. Plans now retain the public interface and node runtime metadata required
by `@haku/graph-runtime`. Haku-owned layout metadata is plain JSON; React Flow state is
rejected even when nested in generic metadata. Plans contain no execution closures and are
invalid when their combined node/type registry fingerprint changes.

```text
Graph JSON
  -> schema validation
  -> node/type registry resolution
  -> type inference
  -> flow, data, domain, liveness, and cycle analysis
  -> capability/effect and checkpoint-scope analysis
  -> execution plan
  -> interpreter instance
```

The same compiler is used by the editor, Play mode, headless tests, and production export.
Play mode does not start a graph with compile errors. Production exports precompiled plans
and exclude the compiler/source metadata unless a project explicitly needs them. Registry
fingerprints prevent plans from running against incompatible node/type implementations.

Runtime v1 uses a plan interpreter behind an `ExecutionBackend` interface. A future
code-generation backend may be added without changing graph assets or the Node SDK.

## Type system

Graphs are statically typed before execution.

- Scalars: `bool`, `number`, `string`.
- Math: `vec2`, `vec3`, `quat`, `color`.
- References: `EntityRef`, `ComponentRef<T>`, `AssetRef<T>`, `SceneRef`, `GraphRef`,
  `PoolHandle`, and same-instance `NodeRef<TContract>`.
- Containers: `Array<T>`, typed maps where supported, `Option<T>`, and `Result<T,E>`.
- Project types: struct, enum, tagged union, and constrained aliases.
- User TypeScript types require a runtime schema; erased interfaces/classes alone cannot
  enter the registry.

Types can be created as visual `Data Type` assets or through a TypeScript schema API. Visual
types generate `.d.ts`; TypeScript-defined types derive their static type from the runtime
schema. Serialization, checkpoint safety, editor widget, and reference traversal are type
metadata.

No implicit incompatible conversions are allowed. Conversion uses explicit nodes. Generic
nodes use type inference, and unresolved types prevent a successful plan.

Execution connections are not data values:

- `flow` is control within an execution;
- `event<T>` is a scheduled typed signal;
- `trigger` is `event<void>` and stores no state.

## Node definition and Custom Node SDK

Every node type declares:

- stable UUID, version, category, description, and editor presentation metadata;
- typed flow/event/data ports and editable properties;
- allowed execution domains;
- capabilities, resources read, resources written, and external effects;
- sync/async execution contract;
- checkpoint and result-persistence policies;
- optional lifecycle, reconciliation, task serialization, and migration hooks.

Node definitions remain metadata-only and contain no executable callback. M05 adds
type/version-bound runtime adapters behind `ExecutionBackend`, lifecycle dispatch, queues,
declared resource snapshots, and structured task ownership without changing authoring
definitions.

Custom TypeScript nodes execute through a restricted `NodeExecutionContext`, not engine
internals. It exposes versioned world, assets, scene, scheduler, events, state, seeded random,
UI, audio, storage, platform, pool, and debug capabilities only when declared. Unknown
effects make a checkpoint ineligible.

A same-instance `NodeRef<TContract>` can read only explicitly exported state/output and never
creates a hidden execution edge. It cannot target a node in another graph instance.
Reusable execution uses a typed subgraph. Inter-graph communication uses public parameters,
read-only outputs, typed events, and `GraphInstance` references—not internal node references
or imperative “run node by ID”.

## One engine scheduler

The graph runtime does not create a second game loop. One `EngineScheduler` owns:

- frame time and the fixed-step accumulator;
- fixed timestep, bounded catch-up, pause, and single-step;
- named phases and deterministic order within a phase;
- typed cross-domain event/command queues;
- fixed tick numbering used by replay and tracing.

Implemented foundational phase shape (M03):

```text
FrameInput
AccumulateTime
repeat bounded fixed substeps:
  FixedInputSnapshot
  FixedPrePhysics
  PhysicsStep (exactly one)
  PostPhysics
  FixedGameplay
FrameGameplay
LateUpdate
Presentation
Render
```

Existing engine systems use phase plus local order. `PhysicsWorldSystem` no longer owns an
accumulator; the scheduler commands exactly one physics step per fixed substep. M05 graph
flow/event work enters every existing phase through the scheduler queue and owns no clock or
accumulator. Later service nodes use these explicit domains rather than adding a second loop.

Cross-domain calls are never synchronously reentrant. They enter typed queues with source
tick, source phase, stable sequence, and payload. Incoming action state is snapshotted for
fixed execution. Rewind removes queued work created after the checkpoint.

## Data and flow execution

Flow/event execution follows the compiled deterministic plan. Fan-out ordering is explicit.
Runtime limits detect runaway loops and event feedback.

Data graphs:

- evaluate by dependency order;
- are lazy and cached;
- invalidate on typed input/resource changes;
- see a stable input snapshot within an execution tick;
- cannot read a changing world invisibly during evaluation.

Structured concurrency is mandatory. An ordinary async flow node holds its branch until
completion. Child tasks belong to an explicit execution scope; detached/background work
requires a dedicated node/service with lifecycle, cancellation, effects, and checkpoint
metadata.

Implemented in M05: `GraphInstance` freezes public parameters and declared resource values
per execution snapshot, lazily caches data-node results by scheduler frame/tick plus typed
invalidation revisions, and exposes read-only declared state through same-instance
`NodeRef`. Subgraphs are compiled child plans with isolated public parameters/outputs.
Flow/event fan-out preserves plan order; cross-domain and all event work is scheduler queued.

## Diagnostics

The runtime emits structured errors and an execution trace with graph/node/callsite IDs,
phase, fixed tick, sequence, inputs/outputs where safe, effects, and task state. Compiler
diagnostics retain a complete causal chain, such as:

```text
Checkpoint -> subgraph -> query -> dynamic RigidBody read
```

Tracing hooks support the initial editor execution highlight and future breakpoints,
stepping, watches, profiler, and heatmap without changing execution semantics.

## Entity activation and pooling foundation

Every entity has:

- authored and serialized `activeSelf`;
- computed runtime `activeInHierarchy`.

Parent deactivation does not overwrite child `activeSelf`. Systems and queries ignore
inactive entities by default; diagnostic APIs can opt in. Render, physics, graphs, audio,
events, and UI honor hierarchy activity.

`@haku/pool` builds on this contract:

- `EntityPool` is a serializable configuration component referencing a template `AssetId`;
- `PoolSystem` owns private runtime instances and exposes handles/IDs through a public API;
- pooled entities remain in `IWorld` and deactivate at the instance root;
- an authored baseline snapshot resets serializable state;
- lifecycle hooks release/recreate physics, graph, audio, timers, subscriptions, and other
  runtime resources;
- acquire/release ordering is deterministic;
- prewarm, capacity, maximum, expansion/exhaustion policy, release-all, clear, metrics, graph
  nodes, and SDK bindings are universal—not Bounce Run code.

Implemented in M10a: the public `EntityPool` wraps a private `PoolSystem`; a
`pool/entity/generation` handle rejects stale or cross-pool releases. Baselines retain
schema-parsed component data, names, authored activity, and hierarchy, while release removes
runtime-added descendants/components and restores removed authored members. Lease scopes
abort tasks, dispose subscriptions/resources in reverse order, and clear flags. Graph
participants destroy and recreate instances, and the engine participant reconciles render
objects and physics bodies synchronously so reacquired bodies start with no retained velocity.
Future audio implementations use the same lifecycle participant boundary rather than adding
pool-specific ownership. Acquire/release/prewarm/release-all/clear nodes declare the bounded
`pool` resource and `pool` effect; metrics is a read-only checkpoint-safe node.
Runtime composition reads the registered `EntityPool` component, uses its owner entity UUID
as the pool service ID, and delegates its typed prefab reference to an injected asset resolver.

## Checkpoint and rewind

Each root graph instance has at most one active checkpoint. Creating a new one atomically
replaces the old one. It has an ID and diagnostic label.

### Scope and eligibility

A checkpoint contains only the limited transitive state scope proven by compiler analysis:

- graph and node instance state;
- entities/components the graph can mutate, including create/delete/activation effects;
- invoked subgraph state;
- public parameters and snapshot-safe live values;
- deterministic service state such as seeded RNG.

Direct or transitive dependence on dynamic-physics behavior rejects the checkpoint. The
mere presence of dynamic bodies elsewhere in the world does not. Dynamic-body reads,
velocities, contacts, physics queries that may include dynamic bodies, and unprovable world
queries taint the dependency chain. Rapier internal state is never snapshotted or replayed.

Unknown effects, unsafe runtime handles, or an unbounded mutable scope also reject the
checkpoint. Compiler and runtime both enforce eligibility.

Implemented in M06: compiled checkpoint metadata contains the bounded node/resource scope,
eligibility dependencies, and complete causal chains. Eligibility is checkpoint-local, so
an unrelated dynamic body does not taint independent logic.

### Atomic rewind

Rewind to an already created checkpoint completes within one engine tick:

```text
BeforeRewind
  -> cancel post-checkpoint work and clear affected queues
  -> restore limited scope
  -> recompute pure/derived data
  -> reconcile effectful subsystems without duplicating one-shot effects
  -> AfterRewind
```

Presentation is reconciled in the same tick. Physics is not restored; eligibility rules
prevent a promise of exact continuation where dynamic behavior mattered.

Implemented in M06: `GraphInstance` keeps one active checkpoint, records the scheduler queue
watermark, cancels its prior execution generation, removes only matching post-watermark
commands, restores the proven scope, recomputes derived resources, and reconciles stable
effect IDs between `BeforeRewind` and `AfterRewind`.

### Async checkpoint policies

The checkpoint node performs flow-dominance and async-liveness analysis. It automatically
lists potentially live transitive async dependencies in its Inspector and allows only
policies declared by each async node:

1. **Wait before checkpoint** — wait for completion and snapshot the safe result.
2. **Restart on restore** — persist inputs and rerun a pure/idempotent operation.
3. **Resume serialized task** — persist and restore a declared state machine.
4. **Reconnect to durable operation** — persist an operation ID and query its status.
5. **Use materialized result** — persist a completed snapshot-safe result without rerun.
6. **Cancel with typed fallback** — cancel and continue through compatible `Option`/`Result`
   output/flow.
7. **Reject checkpoint** — return a typed error when no safe policy exists.

Policies are stored against stable async callsite UUIDs and revalidated after graph edits.
Wait policies support timeout. Promise, callbacks, DOM objects, streams, and arbitrary
handles are never serialized.

Implemented in M06: checkpoint creation is an async barrier. Restart adapters declare
pure/idempotent safety and persisted inputs; resume adapters declare a state-machine ID and
serialized state; reconnect adapters persist a durable operation ID and status. Restored
work remains owned by the graph instance execution scope.

### Persistence and resume

Checkpoint creation in memory is immediate once its barrier is satisfied. Persistence is a
separate async operation through `SaveService`, with `memory-only`, `persist-automatically`,
and `persist-explicitly` policies. Persistent graph instances default to automatic local
persistence; cloud replication has a separate status.

On load:

1. load scene/assets and create graph instances without starting them;
2. load persistent checkpoints;
3. verify fingerprints, references, scope, and checksum;
4. apply a registered checkpoint migration when required;
5. restore state and recompute derived values;
6. call `OnResumeFromCheckpoint` instead of repeating `OnStart`.

Graph authors define checkpoint migration and a fallback entry. If migration cannot apply,
only the incompatible graph checkpoint falls back; the entire save slot remains usable.

Implemented in M06: the runtime defines only the async `SaveService` checkpoint-entry
contract. It does not implement IndexedDB, save-slot storage, replication, or platform
backends; those remain M10d. Persistent records carry plan, registry, scope, reference, and
checksum evidence, and registered migrations operate before scoped resume.

## Runtime DOM UI, services, and visual authoring

Implemented in M10b: `@haku/ui` owns a strict UI asset whose document, root container,
elements, events, and themes use stable UUIDs. A flat element table plus container child
references is validated for duplicates, missing children, multiple parents, cycles, and
unreachable elements. Image elements keep typed asset references; the registered asset
descriptor contributes those references to dependency closure and an injected resolver
produces runtime URLs.

`UIDocumentInstance` renders native `div`, `span`, `button`, and `img` elements without
React. Serializable flex layout, sizing, anchors, styles/themes, visibility, enabled/inert
state, labels, live regions, and image alt text become DOM state. The root is always a
positioned containing block, and text/visibility/enabled changes update existing nodes so
native focus and identity survive runtime mutation.

`UIService` owns registered and mounted documents. Typed activation events, the Custom Node
SDK, and Set Text/Visibility/Enabled/Theme graph adapters use only that public boundary.
Each graph mutation declares the bounded `ui` resource/capability/effect and emits a
checkpoint-visible effect record.

`@haku/editor` owns `UIAuthoringSession` and the React-only `UIDocumentEditorPanel`: visual
hierarchy, preview, Inspector, palette, three desktop viewport presets, selection, and
command undo/redo. Only the strict UI asset persists; selection and viewport choice remain
editor state. `ProjectService` creates, loads, and saves UI assets while refreshing manifest
metadata and dependencies. Built-in assets remain read-only, while writable projects use
the existing File System Access/dev-target stores.

M10b proves the current Vite production boundary, not M10e static ZIP export: playground
builds contain `@haku/ui` runtime code but exclude React, `@haku/editor`, visual authoring,
and editor Inspector implementations. M10e remains responsible for browser-built
self-contained ZIP output.

## Browser-only authoring and custom code

Haku Editor remains a web application. A project resides in a local folder selected through
Chrome File System Access. Source code, assets, diagnostics, bundles, and Play state are not
uploaded to Haku servers.

- TypeScript language service and browser bundler run locally in Workers.
- Custom gameplay and editor-extension code compile into separate bundles.
- Play mode runs in a disposable sandboxed iframe or separate tab via local Blob/message
  transport.
- Runtime never receives editor DOM or file handles.
- Built-in playground projects are read-only virtual projects and can be forked to disk.
- Generic static HTML5 ZIP export is built locally in the browser.

The code editor is a replaceable `CodeEditorProvider`. MVP uses lazy-loaded Monaco by
default and provides a basic external VS Code workflow. A shared indexing service generates
`tsconfig.json` and `.haku/generated/*.d.ts` for engine APIs, Custom Node SDK, project types,
assets, components, and graph contracts. Monaco and VS Code consume the same declarations.
The provider is selectable in user settings. MVP project code may import public `@haku/*`
APIs, relative local modules, and curated built-in browser-safe dependencies. Arbitrary npm
installation and remote URL imports are deferred.

Implemented in M08: `@haku/build` owns browser-safe project indexing, trust/capability
gating, TypeScript and esbuild Worker clients, and the separate gameplay/editor-extension
bundle contract. `@haku/editor` owns conflict-safe source buffers, generated declarations,
the replaceable lazy Monaco provider, external VS Code launch/reload, and disposable
sandboxed Play sessions. Built-in workspaces stay read-only until forked; imported
workspaces fail before compilation; local trusted Play receives a message port rather than
the editor DOM or file handles. The playground production bundle contains none of Monaco,
the TypeScript Worker, or the browser bundler.

The node canvas is a replaceable `GraphCanvasProvider`; MVP uses React Flow behind an
adapter. Haku owns graph documents, commands, validation, serialization, and undo/redo.
React Flow objects never become saved graph data.

Implemented in M07: `@haku/editor` owns `GraphAuthoringSession`, strict project graph
create/open/save, and every asset mutation through the existing command bus. The default
canvas adapter is a lazy editor-only chunk behind `GraphCanvasProvider`; shared provider
types do not import the adapter. `@haku/graph` and `@haku/graph-runtime` remain free of
React Flow, and the playground production bundle contains no React Flow marker.

## Trust and editor extensions

Projects have `built-in`, `local-trusted`, or `imported-untrusted` trust state.

- Untrusted custom gameplay/editor code is not compiled or executed.
- Trusted code receives only declared capabilities, such as network, local save, cloud save,
  audio, fullscreen, clipboard, external URL, or platform SDK.
- Trust never grants editor DOM access or file-system handles to gameplay runtime.
- A new sensitive capability requires explicit local approval for that project UUID.

Editor customization uses a separate Editor Extension API:

- declarative Inspector metadata and standard widgets;
- `GizmoProvider` drawing through constrained primitives and writing only undoable commands;
- sandboxed custom widgets;
- separate editor-only bundle excluded from production export.

Direct React/editor DOM access is not the component-extension contract. Dockable custom
panels and an extension marketplace are deferred.

Implemented in M09: trusted component extensions resolve only the bundled constrained
descriptor example. `GizmoProvider` receives entity/type/plain-data input and emits validated
line/sphere/box primitives; edits re-parse component data and enter command history. The
custom widget runs in an opaque-origin `sandbox="allow-scripts"` iframe with
`default-src 'none'` and accepts only a finite numeric `speed` patch. Imported-untrusted
behavior and editor extensions do not load bundles and render an unresolved/inert state.
Gameplay and editor-extension entrypoints are built separately, and production game scans
exclude editor-extension, widget, and Inspector markers.

## Editor v1 contract

Before Bounce Run begins, the graph editor supports:

- graph asset create/open/save;
- pan/zoom, selection, multi-select, node drag, typed connection creation;
- searchable palette, properties Inspector, delete, duplicate, copy/paste;
- undo/redo through Haku commands;
- subgraph interface inspection;
- compile/type/effect/checkpoint diagnostics and navigation;
- Play mode execution highlight and port values;
- protection from unsaved data loss.

Hot-state-preserving graph reload is not required; a safe instance restart is acceptable.

Implemented in M07: the Graph workspace provides the listed create/open/save, palette,
typed-connect, pan/zoom, selection, edit, command-history, diagnostics-navigation,
checkpoint Inspector, unsaved-change, trace-highlight, and port-value paths. The built-in
M07 diagnostic graph is compiled once per consumer with the shared registries; editor Play,
headless tests, and playground startup execute the same plan fingerprint through the same
runtime adapter.

## Extension checklist

When adding a node, type, component, domain, or capability:

1. own it in the correct package/project registry;
2. use stable UUID identity and version;
3. declare schemas, references, serialization, domains, reads/writes, effects, and
   checkpoint behavior;
4. add compiler positive and negative cases;
5. add runtime/headless tests where executable;
6. expose editor metadata without importing React into runtime;
7. update `.d.ts` generation and public documentation;
8. verify production dependency closure and bundle boundaries.

If a new feature requires patching interpreter internals rather than an existing registry or
backend interface, document the missing extension point before changing the stable runtime.
