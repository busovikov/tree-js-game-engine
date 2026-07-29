# Engine improvement through Bounce Run: execution plan

> This is the live dependency-ordered backlog. Every milestone or lettered substage is a
> separate sub-agent assignment under [stage-handoff.md](./stage-handoff.md). The stable
> runtime contract is [node-graph-architecture.md](./node-graph-architecture.md).

## Definition of program done

The program is done only when:

- every required milestone below is complete;
- Bounce Run satisfies the full gameplay and presentation criteria;
- browser-only authoring can create custom types, nodes, components, behaviors, UI, assets,
  and a production export without a required local tool installation;
- generic static HTML5 ZIP runs from a clean simple HTTP server in Chrome;
- browser-agent play, Playwright, headless, integration, build, and bundle-boundary gates
  pass;
- no stage is left in a breaking transitional state;
- current documentation describes implemented behavior and the deferred backlog accurately.

## Stage operating contract

- Dispatch one semantic stage to one fresh sub-agent.
- Give it only the relevant docs, narrow source entrypoints, acceptance criteria, and latest
  handoff.
- Complete dependency stages sequentially. Parallelize only proven non-overlapping
  implementation scopes.
- End with verified local commits and a handoff. No push or PR.
- If context reaches 80%, create an early safe commit/handoff and continue with a fresh
  sub-agent.
- A stage may split into smaller commits, but it may not mix unrelated concerns.

## Milestone map

| ID   | Milestone                                                       | Depends on | Status                                   |
| ---- | --------------------------------------------------------------- | ---------- | ---------------------------------------- |
| M01  | Audit and target documentation                                  | —          | Complete with the documentation baseline |
| M02  | Asset IDs, manifests, and decentralized registries              | M01        | Complete                                 |
| M03  | World activation, lifecycle, and unified scheduler              | M02        | Complete                                 |
| M04  | Graph schema, type/effect system, and compiler                  | M03        | Complete                                 |
| M05  | Graph interpreter, domains, queues, and tracing                 | M04        | Complete                                 |
| M06  | Checkpoint, rewind, async policies, and persistence hooks       | M05        | Complete                                 |
| M07  | Minimal graph editor and diagnostic scene                       | M06        | Complete                                 |
| M08  | Browser project TypeScript/build/trust tooling                  | M07        | Complete                                 |
| M09  | Custom components and editor extensions                         | M08        | Complete                                 |
| M10a | Pool and activation integrations                                | M09        | Complete                                 |
| M10b | DOM UI runtime and visual UI editor                             | M09        | Complete                                 |
| M10c | Audio contracts, Web Audio, and editor support                  | M09        | Complete                                 |
| M10d | Save storage, replication, and platform contracts               | M09        | Pending                                  |
| M10e | Browser static export and ZIP                                   | M10b–M10d  | Pending                                  |
| M10f | Cross-service graph nodes and contract integration              | M10a–M10e  | Pending                                  |
| M11  | Bounce Run vertical slice                                       | M10f       | Pending                                  |
| M12  | Generator, seed/replay, QA harness, and automated browser tests | M11        | Pending                                  |
| M13  | Full gameplay, polish, saves, audio, and stabilization          | M12        | Pending                                  |
| M14  | Final export, quality audit, and documentation                  | M13        | Pending                                  |

## M01 — Audit and target documentation

Deliver:

- current capability matrix and current/target delta;
- autonomous instruction;
- stable graph architecture;
- this execution plan and deferred backlog;
- sub-agent handoff protocol and next-session prompt;
- consistent indexes and supersession notes.

Acceptance:

- [x] No runtime implementation is changed.
- [x] Original Downloads instruction is unchanged.
- [x] Current claims are supported by narrow source entrypoints.
- [x] Later user decisions supersede conflicting historical plans explicitly.
- [x] Documentation links and formatting are checked.

## M02 — Asset IDs, manifests, and decentralized registries

Scope:

- introduce universal UUID `AssetId` and project asset manifest;
- define asset type descriptors, dependency traversal, typed references, and diagnostics;
- reduce `@haku/schema` to base envelopes/shared types;
- move subsystem component schemas to their owning packages;
- assemble asset/type/component registries at composition roots;
- convert every repository scene, prefab, model/texture reference, project manifest, demo,
  create template, test fixture, editor path, and runtime consumer to the new format.

Acceptance:

- [x] Moving an asset path does not change its ID or break references.
- [x] All available repository assets use manifest UUIDs; no legacy path-reference branch.
- [x] Unknown/duplicate/type-mismatched IDs fail with structured diagnostics.
- [x] Serializer/editor/runtime use the same registries.
- [x] Dependency closure is deterministic and tested.
- [x] All repository builds/tests and existing demos are green after the breaking change.
- [x] Public docs and generated/example manifests match actual schemas.

## M03 — World activation, lifecycle, and unified scheduler

Scope:

- add `activeSelf` and derived `activeInHierarchy`;
- define hierarchy activation propagation, lifecycle ordering, and inactive query defaults;
- replace numeric-only engine scheduling with named phases plus local ordering;
- move fixed accumulator, catch-up, pause, single-step, and tick numbering to the scheduler;
- make physics execute exactly one step per fixed phase;
- migrate all existing physics, input, controller, camera, render-sync, and app consumers.

Acceptance:

- [x] Disabling a parent deactivates its subtree without mutating child `activeSelf`.
- [x] Normal systems, render, physics, events, and queries ignore inactive entities.
- [x] Scheduler phase order and cross-domain queue order are deterministic.
- [x] Fixed-domain systems run once per physics substep, including multi-substep frames.
- [x] Physics parity, interpolation, respawn, vehicle, camera, pause, and hitch tests pass.
- [x] No second accumulator or magic fractional order remains.
- [x] Single-step advances one fixed tick and produces one coherent presentation update.

## M04 — Graph schema, types/effects, and compiler

Scope:

- add `@haku/graph`;
- define graph, node/callsite, public interface, and subgraph assets;
- implement registered built-in/project data types and runtime schemas;
- model `flow`, `event<T>`, `trigger`, data ports, generics, references, Option/Result;
- implement node/type registries, type inference, domain checks, cycles, effects,
  capabilities, liveness, and execution-plan generation;
- expose a Custom Node definition SDK without executing nodes yet.

Acceptance:

- [x] Graph JSON roundtrips without UI-library objects.
- [x] Positive and negative golden tests cover types, generics, flow/data separation,
      domains, subgraphs, same-instance `NodeRef`, effects, and diagnostics.
- [x] User visual and TypeScript-schema types produce the same registry contract.
- [x] Compiler diagnostics contain exact node/port and causal chains.
- [x] Registry fingerprint is stable and invalidates incompatible plans.
- [x] Compiler is headless and imports neither React nor Three.js.

## M05 — Graph interpreter, domains, queues, and tracing

Scope:

- add `@haku/graph-runtime`;
- execute compiled flow/event and lazy dependency-data plans;
- integrate lifecycle and all scheduler domains;
- implement typed cross-domain queues and structured concurrency;
- support graph instances, public parameters/outputs/events, subgraphs, cancellation, and
  same-instance read-only `NodeRef`;
- add structured errors, runaway guards, execution traces, and headless adapters.

Acceptance:

- [x] Identical plans/inputs produce deterministic order and trace.
- [x] Data caching and invalidation use a stable tick snapshot.
- [x] Cross-domain work is asynchronous and never reentrant.
- [x] Async children cannot silently detach from their scope.
- [x] Stop/deactivate/destroy cancels owned tasks and subscriptions.
- [x] Headless execution covers lifecycle, subgraph, event fan-out, loops, errors, and
      cancellation.
- [x] Interpreter is replaceable through an execution-backend interface.

## M06 — Checkpoint, rewind, async policies, and persistence hooks

Scope:

- compute limited transitive state scopes and dynamic-physics taint;
- implement one active checkpoint per root graph instance;
- implement one-tick atomic rewind, derived recompute, and effect reconciliation;
- implement async-liveness/flow-dominance analysis and all seven policies;
- define persistent checkpoint records, checksums, fingerprints, migration, fallback entry,
  and SaveService integration contract.

Acceptance:

- [x] Independent logic can checkpoint while unrelated dynamic bodies exist.
- [x] Direct/transitive dynamic-physics dependencies are rejected with a causal chain.
- [x] Unknown effects and unprovable queries are rejected.
- [x] Rewind restores only the proven scope and removes post-checkpoint work in one tick.
- [x] Effectful nodes do not duplicate score/audio/events on restore.
- [x] Wait, restart, resume, reconnect, materialized, cancel-fallback, and reject policies
      each have contract and runtime tests.
- [x] Checkpoint Inspector metadata can enumerate dependencies and supported policies.
- [x] Persistent restore calls `OnResumeFromCheckpoint`; migration/fallback failure does not
      invalidate the entire save slot.

## M07 — Minimal graph editor and diagnostic scene

Scope:

- add replaceable `GraphCanvasProvider` and React Flow adapter;
- graph asset create/open/save, palette, typed ports, properties, pan/zoom, multi-select,
  delete/duplicate/copy/paste, commands, undo/redo, unsaved-change protection;
- compile/type/effect/checkpoint diagnostics and navigation;
- Play trace highlighting and port-value inspection;
- create a small playground diagnostic proving graph asset -> compiler -> runtime -> world.

Acceptance:

- [x] React Flow data never enters saved graph assets or runtime packages.
- [x] Every graph mutation is a Haku command and undoable.
- [x] Invalid connections are blocked before save and compiler diagnostics remain authoritative.
- [x] Checkpoint async choices and dynamic-physics rejection are visible in Inspector.
- [x] Diagnostic scene runs in editor Play and headless execution with the same plan.
- [x] React Flow is lazy and absent from game bundles.
- [x] Browser visual/interaction smoke and tests pass.

## M08 — Browser project TypeScript/build/trust tooling

Scope:

- local browser project workspace and file watcher;
- TypeScript language/index service and browser bundler in Workers;
- generated `tsconfig.json` and `.haku/generated/*.d.ts`;
- replaceable `CodeEditorProvider`, lazy Monaco, and basic external VS Code open/reload flow;
- separate gameplay/editor-extension bundles;
- disposable Play iframe/new-tab transport;
- built-in read-only projects plus fork-to-disk;
- built-in/local-trusted/imported-untrusted modes and capability manifest.

Acceptance:

- [x] A user creates and runs a custom node entirely in Chrome without CLI/Node/daemon.
- [x] Project source/assets never leave the local browser/file boundary.
- [x] Untrusted TypeScript/editor code never executes.
- [x] Trusted runtime still cannot access editor DOM or file handles.
- [x] Monaco and VS Code understand identical engine/project declarations.
- [x] External edits are detected and conflicts never overwrite silently.
- [x] A runaway/crashed Play instance can be destroyed without losing editor state.
- [x] Monaco, TS Worker, and bundler are lazy and absent from production games.

## M09 — Custom components and editor extensions

Scope:

- visual custom component/type assets;
- generated Inspector, TypeScript declarations, registry descriptors, and references;
- behavior graphs, scheduler-aware TypeScript batch behaviors, lifecycle, and component
  commands;
- declarative Inspector metadata, constrained `GizmoProvider`, and one sandboxed custom
  widget example.

Acceptance:

- [x] A component can be created, added to entities/prefabs, saved, loaded, graphed, and
      exported without changing engine packages.
- [x] Custom behavior declares domain/query/reads/writes/effects and is visible in tracing.
- [x] No hidden per-instance update loop is introduced.
- [x] Gizmo edits use undoable commands and cannot access editor DOM/Three.js internals.
- [x] Runtime and editor-extension code build into separate bundles.
- [x] Untrusted extensions are inert and visibly unresolved.

Implemented in M09: visual Component Type assets use their type UUID as manifest identity;
project-aware scene/prefab dependency collection retains their definitions in export closure.
Generated Inspector fields, TypeScript declarations, graph nodes, scheduler batch contracts,
undoable constrained gizmos, and opaque sandbox widgets share the project registry. Trusted
and untrusted UI states and the separate real Worker outputs were verified in Chrome; the
production playground bundle remains free of editor-extension, widget, and Inspector code.

## M10a — Pool and activation integrations

Scope and acceptance:

- [x] Add `@haku/pool`, `EntityPool`, private `PoolSystem`, handles, prewarm, capacity,
      maximum, expansion/exhaustion policies, acquire/release/release-all/clear, and metrics.
- [x] Baseline snapshot resets serializable state; lifecycle resets graph, physics, audio,
      tasks, subscriptions, and flags.
- [x] Inactive pool objects never render, collide, emit, update, or retain stale velocity.
- [x] Pool nodes/SDK are general and checkpoint effects are declared.
- [x] Playground diagnostic covers hierarchy, reset, exhaustion, cleanup, and long-run reuse.

Implemented in M10a: `@haku/pool` owns deterministic lease handles, authored hierarchy
baselines, bounded capacity policies, runtime scopes, general lifecycle participants, six
pool graph contracts/adapters, and checkpoint-visible pool effect records. Engine composition
registers the serializable prefab-backed configuration and synchronously reconciles render
and physics participation; graph runtimes are destroyed/recreated per lease. The playground
runs a 10,000-cycle headless reuse diagnostic without allocating beyond two instances.

## M10b — DOM UI runtime and visual UI editor

Scope and acceptance:

- [x] Add UUID-addressed UI assets and `UIDocumentInstance`.
- [x] Production DOM renderer has no React dependency.
- [x] Implement container/text/button/image, flex layout, sizing/anchors, styles/themes,
      visibility/interaction states, accessibility, typed references/events, and asset closure.
- [x] Visual hierarchy/preview/Inspector supports multiple desktop viewport sizes.
- [x] Graph/SDK changes UI through public service/events.
- [x] UI editor code is absent from production export.

Implemented in M10b: `@haku/ui` owns strict UUID-addressed UI assets, the React-free native
DOM renderer, asset closure, `UIService`, SDK bindings, and four bounded UI graph mutations.
`@haku/editor` adds command-based hierarchy/preview/Inspector authoring, undo/redo, three
desktop presets, and project manifest persistence. The playground visibly proves native
activation plus service/graph mutation, while production scans exclude React and editor UI.

## M10c — Audio contracts, Web Audio, and editor support

Scope and acceptance:

- [x] Add audio and Web Audio packages, `AudioClip`, `AudioSource`, backend/headless
      contracts, Master/Music/SFX/UI buses, spatial/non-spatial playback, one-shot, loop,
      volume, playback rate, and cleanup.
- [x] Autoplay unlock, global pause, local mute/volume, activation, pool, graph, and SDK
      lifecycle work.
- [x] Inspector and basic preview exist; headless and browser tests pass.
- [x] Audio assets resolve through manifest and export without network dependencies.

Implemented in M10c: `@haku/audio` owns strict Audio Clip/AudioSource data, the headless
mixer/runtime, Master/Music/SFX/UI routing, activation/pool cleanup, `AudioService`, SDK, and
bounded graph effects. `@haku/audio-web` owns decoding, modern listener/panner graphs,
gesture-gated unlock, pause/resume, natural completion, and disposal. Engine/editor
composition registers local binary audio assets and the AudioSource Inspector provides a
direct-click preview. The production playground proves the unlock and control lifecycle in
user Chrome with zero remote resources; automation proves browser state and voice cleanup,
not that a human heard the tone.

## M10d — Save storage, replication, and platform contracts

Scope and acceptance:

- [ ] Add async `ISaveStorage`, IndexedDB, in-memory backend, typed slots/records, atomic
      writes, quotas/errors, and separate replay artifacts.
- [ ] Add replication modes `none`, `explicit`, and `platform-managed` plus honest
      capability queries.
- [ ] Add `PlatformAdapter` lifecycle/auth/pause/input/audio capability boundary.
- [ ] Mock explicit adapter supports revisions, conflicts, rate/size limits, and optional
      numeric stats.
- [ ] Mock platform-managed adapter exposes no fake pull/push/flush/conflict API.
- [ ] Persistent graph checkpoints roundtrip through save slots and migration/fallback.

## M10e — Browser static export and ZIP

Scope and acceptance:

- [ ] Browser Worker compiles the entry project and transitive reachable assets locally.
- [ ] Editor downloads a ZIP containing root `index.html` and all local relative assets.
- [ ] Export has no CDN, server API, editor, React Flow, Monaco, QA harness, unused graph
      source/compiler, or editor-extension bundle.
- [ ] Extracted output runs from a clean basic static HTTP server under nested base paths.
- [ ] Build errors navigate back to graph/type/code/UI source locations.

## M10f — Cross-service graph nodes and contract integration

Scope and acceptance:

- [ ] Add lifecycle, variables, control, math/vector, transform, component, prefab, pool,
      physics query/event/body, seeded random, UI, audio, save, platform capability, debug, and
      assertion node foundations as real use cases require.
- [ ] Nodes use public services, declare domains/effects/checkpoint behavior, and have tests.
- [ ] Complex algorithms remain typed modules behind registered nodes.
- [ ] A playground integration scene proves UI/audio/save/pool/graph/export together.
- [ ] Documentation shows exactly where a new agent adds a type, node, capability, editor
      widget, or subsystem binding.

## M11 — Bounce Run vertical slice

Scope:

- create `apps/bounce-run` as an engine-only local project;
- graph-driven start/session/game-over/restart and UI;
- desktop action input, dynamic ball, landing tracker, controlled bounce, lateral controller,
  follow camera, a small pooled platform sequence, basic visual identity.

Acceptance:

- [ ] A/D and arrows control lateral movement; R restarts; Escape pauses.
- [ ] Rapier sphere uses CCD and produces one bounce event per valid landing.
- [ ] Bounce height is predictable at 60 and 30 FPS and across multi-substep frames.
- [ ] Side/edge contacts do not produce double landing.
- [ ] Session rules and UI orchestration are graphs, not app-local system shortcuts.
- [ ] Public APIs only; no editor/React dependency.
- [ ] Real Chrome agent can start, play, fail, and restart without console errors.
- [ ] Initial performance baselines are recorded and budgets proposed.

## M12 — Generator, seed/replay, QA harness, and automation

Scope:

- deterministic pure generator and reachability solver;
- guaranteed main route plus optional alternatives;
- pool-backed infinite route and decision log;
- fixed-tick action recording, replay, hashes, structured observations/assertions;
- Playwright Chrome E2E, browser-agent reports, mass-seed and Rapier comparison suites.

Acceptance:

- [ ] Same seed/config produces identical route decisions.
- [ ] Every generated sequence has at least one reachable path and deterministic fallback.
- [ ] Safe start and difficulty margins are tested.
- [ ] Many headless sequences finish without intersections, invalid gaps, missing routes, or
      unbounded attempts.
- [ ] Replay either matches state hashes or reports exact divergence.
- [ ] QA uses public action/observation APIs and cannot mutate game state directly.
- [ ] Browser E2E covers start, input, pause, game over, restart, resize, and console errors.
- [ ] QA harness is absent from production export.

## M13 — Full gameplay, polish, saves, audio, and stabilization

Scope:

- normal/wide/narrow/bounce platforms, difficulty curve, score, one reachable bonus;
- local high score, pause/restart lifecycle, complete UI/audio/effects;
- polished stylized procedural look, readable platform language, camera, particles/trail;
- long-run pool/object/memory/FPS tests and regression fixes.

Acceptance:

- [ ] Full agreed gameplay loop is understandable within seconds and visually coherent.
- [ ] Difficulty reduces safety margins but never removes all reachable routes.
- [ ] Bonus is reachable, sensor-safe, pooled, and cannot score twice.
- [ ] High score persists locally through the universal save API.
- [ ] Audio unlock/pause/settings/pool cleanup work.
- [ ] No sustained active-object or memory growth in long runs.
- [ ] Every found reproducible bug has seed/replay and regression coverage.
- [ ] Chrome resize and 30 FPS simulation behavior remain correct.

## M14 — Final export, quality audit, and documentation

Acceptance:

- [ ] Full repository format/lint/typecheck/test/build gates pass.
- [ ] Playwright and browser-agent sessions pass against a clean production export.
- [ ] ZIP extracts and runs from a simple static server with no external requests.
- [ ] Bundle boundaries are proven.
- [ ] Performance budgets are documented against measured baselines.
- [ ] Current capability matrix, public API links, package graph, examples, create templates,
      and user documentation describe the final implementation.
- [ ] Deferred backlog contains only genuinely deferred work.
- [ ] Final handoff lists all local commits and known residual risks; no push is performed.

## Required node categories by full MVP

The library grows from real stages rather than an upfront catalog, but the final engine must
cover the operations needed by:

- lifecycle, activation, scene/entity/component events;
- variables, branches, sequences, safe loops, timers, and structured concurrency;
- scalar/vector math and typed containers;
- Transform and typed component access/commands;
- prefab/assets/pool;
- physics events, contacts, raycast, shapecast, overlap, body velocity/force/impulse, layers;
- seeded random and weighted choice;
- UI, audio, save, platform capability, graph event/subgraph calls;
- debug, trace, metrics, assertions, and QA hooks.

No node may encode Bounce Run-specific rules.

## Deferred backlog

Deferred items are required extension points or documented future features, not part of this
MVP unless a stage proves them necessary.

### Graph editor

- minimap;
- comments/groups;
- reroute nodes;
- sophisticated auto-layout;
- breakpoint debugger;
- step into/over/out;
- watch expressions;
- profiler and execution heatmap;
- live-state-preserving hot reload;
- collaborative editing;
- advanced visual polish.

### Code editor and extensions

- Haku-owned code editor implementation;
- advanced refactorings and TypeScript debugger;
- VS Code extension (declarations/workspace support must work without it);
- arbitrary npm/browser package manager and offline package cache;
- dockable custom editor panels;
- extension marketplace.

### Audio

- effect chains;
- reverb zones;
- occlusion;
- streaming large tracks;
- waveform editor;
- advanced mixer UI;
- compression/transcoding pipeline.

### Input and platforms

- mobile/touch input provider and UI;
- real Yandex Games and Poki adapters;
- other platform SDK adapters;
- Safari/Firefox compatibility matrix;
- platform-specific bundle/ZIP budgets;
- ads, accounts, leaderboards, and network services.

### Gameplay and rendering

- moving and destructible platforms;
- multiplayer, combat, store, skins, and story;
- large external art production;
- WebGPU/TSL work remains governed by [`RENDER_PLAN.md`](../RENDER_PLAN.md);
- advanced render roadmap items not required by Bounce Run.

### Runtime/debug

- checkpoint history stack and arbitrary time-travel debugging;
- exact physical replay/snapshot;
- distributed/network-deterministic simulation;
- custom code-generation graph backend (the backend interface is required now);
- advanced spatial/ECS replacement.
