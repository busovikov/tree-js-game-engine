# Autonomous engine development through Bounce Run

> Primary operating instruction for the autonomous implementation program. The user's main
> goal is the development of reusable Haku engine capabilities. Bounce Run is the proving
> project. Read this together with
> [node-graph-architecture.md](./node-graph-architecture.md),
> [engine-game-development-plan.md](./engine-game-development-plan.md), and
> [stage-handoff.md](./stage-handoff.md).

## Mission

Develop Haku into a browser-first game engine/editor capable of authoring, running, testing,
saving, and exporting a polished small 3D game. Do this by building Bounce Run 3D as an
integration driver, not by adding game-local substitutes for missing engine features.

The completed result includes the full agreed MVP. A narrow vertical slice is a milestone,
not permission to declare the mission complete.

## Authority and autonomy

- Work autonomously until the full goal and all acceptance criteria are complete.
- Use branch `engine-improvement-based-on-game-creation` exactly.
- Use local Git only. Make granular thematic commits after green stage checks.
- Never push, create a PR, rewrite history, or add commit trailers.
- Breaking changes are allowed across every `@haku/*` package and file format.
- Do not implement compatibility branches or migration tools for the current transition.
- When a breaking change is made, immediately fix every available scene, prefab, template,
  demo, app, test, document, and downstream package in the affected stage.
- Keep completed increments consistent and buildable; do not leave the repository halfway
  between formats.
- Preserve unrelated user changes. Work granularly to avoid overlap.
- Stop only for an objective external blocker, data-loss risk, missing secret/authority, or
  irreconcilable product decision after safe alternatives are exhausted.

Each semantic stage must run in a separate sub-agent under
[stage-handoff.md](./stage-handoff.md). At 80% context use, or earlier when accurate
completion is at risk, produce a handoff and continue with a fresh sub-agent.

## Sources of truth

Use this priority:

1. explicit user decisions encoded in this document and node architecture;
2. the milestone plan and stage acceptance criteria;
3. current architecture/API docs and actual source;
4. rendering roadmap for rendering-specific decisions;
5. official documentation for pinned/current dependencies.

The original Downloads instruction is historical input and must not be edited. It does not
override later decisions. `IMPLEMENTATION_PLAN.md` is a baseline plan; its old locked
decisions are superseded where this program says otherwise.

## Development principles

For each gameplay need:

1. use an existing public capability when suitable;
2. compose existing general nodes;
3. improve graph composition or an existing general node;
4. add a reusable node through the Node SDK;
5. implement reusable state/lifecycle as an engine component/service;
6. keep complex algorithms in typed TypeScript modules called by nodes;
7. extend an official API when the module otherwise needs private engine imports;
8. change core only when a proven cross-subsystem invariant requires it.

Graphs own gameplay orchestration and rules. Engine services own reusable behavior.
TypeScript modules own algorithms such as reachability, generation, replay analysis, and QA
logic. Do not force complex mathematics into unreadable visual graphs, and do not bypass the
graph platform when a missing general capability should be implemented there.

Whenever Bounce Run reveals a graph-system deficiency, fix the graph system immediately.
The runtime foundation must be production quality from its first released form. Expected
future growth is in editor features, new nodes, and new declared capabilities—not recurring
replacement of the interpreter's execution semantics.

## Product and browser constraints

- Required browser: the user's installed Chrome only.
- Use the rendering backend Haku provides; do not impose a new backend requirement.
- Haku Editor is an autonomous browser application. No mandatory CLI, Node.js installation,
  or local daemon is allowed for authoring.
- Projects live in user-selected local folders through Chrome File System Access.
- Project source, assets, diagnostics, build products, and Play state never upload to Haku
  servers.
- Built-in playground projects are read-only; users can fork them to a local project.
- Custom TypeScript nodes, types, components, behaviors, and editor extensions are authored
  in the same browser editor.
- Play mode executes in a disposable isolated iframe or user tab, never in the editor's DOM
  context.
- A generic production export is a self-contained static HTML5 site and downloadable ZIP:
  root `index.html`, relative paths, local JS/CSS/assets, no CDN/server logic, and no editor
  or QA code. It must work after extraction under a simple static HTTP server; `file://` is
  not required.
- Poki/Yandex SDK implementations and browser support beyond Chrome are not MVP
  requirements. Their documented constraints inform the platform/storage interfaces.
- Desktop web input is required. Mobile controls are deferred, but input architecture must
  accept a future separate mobile/touch provider without gameplay changes.

## Dependency policy

The agent may select dependencies autonomously when they:

- use a permissive license (MIT, BSD, Apache-2.0, or compatible);
- are browser-first ESM and do not require a runtime server;
- solve infrastructure rather than own Haku's domain model;
- stay behind a replaceable adapter when large;
- are lazily loaded when editor-heavy;
- do not enter production game exports unless required by the game;
- have bundle/startup impact measured and licenses recorded.

The initial graph canvas provider is React Flow. The initial code editor provider is
lazy-loaded Monaco, with a basic external VS Code provider and shared generated `.d.ts`
index. Both are replaceable. Their data models must not leak into Haku runtime contracts.

## Engine systems required by the MVP

The dependency-ordered plan implements:

- universal UUID asset manifest and registry for every asset type;
- decentralized component/type registries and visual custom component creation;
- `activeSelf`/`activeInHierarchy`, lifecycle, and a reusable entity pool;
- one multi-phase scheduler owning fixed time and physics stepping;
- typed flow/event and dependency-data gameplay graphs;
- graph compiler, plan interpreter, effects/capabilities, structured concurrency, tracing,
  checkpoint/rewind, persistence, migrations, and async checkpoint policies;
- browser graph, type, component, UI, code, and extension authoring;
- replaceable code/canvas providers and generated TypeScript indexing;
- production DOM UI assets/renderer with a visual UI editor;
- Web Audio subsystem with asset/component/mixer/spatial/headless support;
- asynchronous save storage, IndexedDB, replication and platform adapter contracts;
- browser-local build Worker and generic static HTML5 ZIP export;
- seeded RNG, replay, deterministic headless testing, Playwright Chrome E2E, metrics, and
  browser-agent QA support.

See [node-graph-architecture.md](./node-graph-architecture.md) for stable contracts.

## Pool requirements

The pool is an engine component/system, never a Bounce Run-local collection. Pooled entities
remain in `IWorld`, deactivate hierarchically, reset serializable state from an authored
baseline, and use lifecycle hooks to clean runtime resources. It supports template
`AssetId`, prewarm, capacity and exhaustion policy, acquire/release/release-all/clear,
metrics, graph nodes, and SDK access. Physics colliders, audio, tasks, events, and graph
instances must not stay active while pooled.

## UI, audio, storage, and platform requirements

UI uses separate UUID-addressed UI assets and `UIDocumentInstance`. Production rendering is
accessible DOM over the game canvas and does not depend on React. MVP elements include
container, text, button, image, flex layout, sizing/anchors, styles/themes, visibility,
interaction states, typed UI references/events, and multi-size desktop preview.

Audio includes `AudioClip`, `AudioSource`, `IAudioBackend`, Web Audio and headless backends,
Master/Music/SFX/UI buses, spatial/non-spatial sound, one-shots, loop, volume, playback
rate, autoplay unlock, pause, settings, lifecycle cleanup, graph nodes, Inspector, and
preview.

Save APIs are asynchronous and split:

- `ISaveStorage` stores local typed slots/records;
- `ISaveReplicationAdapter` describes none, explicit, or platform-managed replication;
- `PlatformAdapter` owns auth, lifecycle, ads, pause/input/audio, and related capabilities.

Generic HTML5 uses IndexedDB with no replication. Mock explicit and platform-managed
adapters and contract tests prove extensibility. Yandex-style explicit storage supports
pull/push/flush, rate/size capability limits, revisions, and optional numeric stats.
Poki-style storage is platform-managed browser-storage replication and must not expose fake
manual sync/conflict APIs. Unsupported operations are explicit capabilities, not silent
no-ops.

## Bounce Run proving project

Create `apps/bounce-run` as a complete engine-only game. Keep `apps/playground` as the
diagnostic catalog and add small scenes for general engine features. Bounce Run opens as a
normal local Haku project and uses public APIs only.

The game is a polished, publishable small browser game with a consistent stylized
low-poly/procedural look, not a technical gray-box. It includes:

- start, session, pause, game over, immediate restart, responsive desktop UI;
- A/D or arrows for lateral input, R restart, Escape pause;
- automatic forward movement and predictable controlled bounce;
- Rapier dynamic sphere, sphere collider, CCD, low restitution;
- reusable ground-contact and bounce controllers with exactly one landing/bounce event;
- smooth forward-looking camera;
- deterministic infinite platform generation and universal pooling;
- safe start, increasing difficulty, normal/wide/narrow/bounce platforms;
- at least one reachable route at all times, with optional risky alternatives;
- score, one reachable bonus, local high score, audio, effects, and visual polish;
- seed, replay, debug session evidence, and export.

The route generator is a pure deterministic module. It uses a fast analytic reachability
envelope plus deterministic trajectory simulation for boundary candidates, bounded
candidate attempts, a guaranteed fallback, and a decision log. It never creates an
impossible mandatory jump. Massive headless generation tests cover many seeds without
starting Three.js or Rapier; integration tests periodically compare the solver with Rapier.

Mobile input, moving/destructible platforms, and platform-specific publishing adapters are
not part of this MVP.

## QA model

The primary QA player is the autonomous agent using the real game in Chrome through normal
buttons, keyboard, pointer, and UI. Do not ship an in-game AI bot as a product feature.

A dev-only QA harness supports the agent with:

- seed selection;
- action recording by fixed tick;
- deterministic replay and state hashes;
- structured observations and assertions;
- graph, pool, object, FPS, memory, and scheduler metrics;
- console/runtime/network error collection;
- session and bug report export.

Headless runners scale generator and replay checks but do not replace real browser sessions.
QA harness code is excluded from production export. Every reproducible defect gets seed,
replay, root-cause analysis, and a regression test.

## Quality gates

After each increment run checks proportional to the affected packages. Every milestone
boundary includes:

- format/lint/type checks;
- unit and integration tests;
- affected package and dependent builds;
- schema/asset roundtrips;
- relevant graph compiler/runtime golden tests;
- scheduler determinism, checkpoint, replay, and generator tests when available;
- Playwright Chrome E2E for user-visible workflows;
- console/network error inspection;
- autonomous browser play for gameplay stages;
- production export from a clean directory and simple static server;
- bundle assertions excluding editor, React Flow, Monaco, QA, and compiler source metadata.

Use a benchmark harness. Measure baselines before setting hard thresholds after the first
working Bounce Run vertical slice. Immediate invariants are fixed 60 Hz simulation, bounded
catch-up, no sustained object/memory growth, inactive entities excluded from normal updates,
lazy editor modules, nonblocking build Worker, Play cleanup, and clean production bundles.

## Documentation discipline

For every stage, update public APIs, architecture, links, deferred backlog, and handoff
evidence in the same commit. Record why an algorithm remains TypeScript or becomes a node.
Do not claim roadmap items are implemented.

Use the stage plan as the live backlog. Do not scatter architectural TODOs through runtime
code when they belong in the documented deferred section.

## Completion condition

The mission is complete only when all milestones and full-MVP criteria in
[engine-game-development-plan.md](./engine-game-development-plan.md) are satisfied, all
repository checks are green, the generic ZIP runs from a clean simple static server in
Chrome, the agent can play it through the real browser, the game is visually coherent, and
the final documentation accurately distinguishes implemented behavior from remaining
deferred work.
