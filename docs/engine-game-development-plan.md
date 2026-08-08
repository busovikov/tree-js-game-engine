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
| M10d | Save storage, replication, and platform contracts               | M09        | Complete                                 |
| M10e | Browser static export and ZIP                                   | M10b–M10d  | Complete                                 |
| M10f | Cross-service graph nodes and contract integration              | M10a–M10e  | Complete                                 |
| M11  | Bounce Run vertical slice                                       | M10f       | Complete                                 |
| M12  | Generator, seed/replay, QA harness, and automated browser tests | M11        | Complete                                 |
| M13  | Full gameplay, polish, saves, audio, and stabilization          | M12        | Complete                                 |
| M14  | Final export, quality audit, and documentation                  | M13        | Complete                                 |

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

- [x] Add async `ISaveStorage`, IndexedDB, in-memory backend, typed slots/records, atomic
      writes, quotas/errors, and separate replay artifacts.
- [x] Add replication modes `none`, `explicit`, and `platform-managed` plus honest
      capability queries.
- [x] Add `PlatformAdapter` lifecycle/auth/pause/input/audio capability boundary.
- [x] Mock explicit adapter supports revisions, conflicts, rate/size limits, and optional
      numeric stats.
- [x] Mock platform-managed adapter exposes no fake pull/push/flush/conflict API.
- [x] Persistent graph checkpoints roundtrip through save slots and migration/fallback.

Implemented in M10d: `@haku/storage` provides defensive async in-memory and IndexedDB save
slots, a separate replay store, atomic expected-revision writes, browser quota estimates,
typed failures, honest replication-mode unions, and explicit mock limits/stats.
`SaveSlotCheckpointService` preserves game and sibling data while graph-runtime owns
migration and per-graph fallback. `@haku/platform` owns capability/auth/lifecycle contracts
and composes visibility/platform pause with real simulation, input, and audio controls.
The production playground proved persistent IndexedDB revisions, retained payload after a
stale conflict, real estimate values, honest capabilities, and localhost-only resources in
the user's Chrome. Chrome control could not reliably trigger a real hidden-tab transition;
the visibility/focus distinction remains covered by deterministic adapter tests.

## M10e — Browser static export and ZIP

Scope and acceptance:

- [x] Browser Worker compiles the entry project and transitive reachable assets locally.
- [x] Editor downloads a ZIP containing root `index.html` and all local relative assets.
- [x] Export has no CDN, server API, editor, React Flow, Monaco, QA harness, unused graph
      source/compiler, or editor-extension bundle.
- [x] Extracted output runs from a clean basic static HTTP server under nested base paths.
- [x] Build errors navigate back to graph/type/code/UI source locations.

Implemented in M10e: `@haku/build` validates an in-memory project closure, rewrites local
module-relative assets, resolves manifest dependencies, compiles a tree-shaken/minified
runtime with esbuild-wasm in a dedicated Worker, and creates a deterministic stored ZIP
with portable file modes. `@haku/editor` exposes trusted-project export from the File menu,
reads workspace sources plus only the reachable manifest asset closure, downloads the Blob
locally, and routes structured graph/type/code/UI diagnostics back to the matching
workspace and source location.
User-Chrome proof extracted the archive under a nested deployment path, loaded only the
root page, runtime, and reachable asset with 200 responses, and produced no warnings or
errors.

## M10f — Cross-service graph nodes and contract integration

Scope and acceptance:

- [x] Add lifecycle, variables, control, math/vector, transform, component, prefab, pool,
      physics query/event/body, seeded random, UI, audio, save, platform capability, debug, and
      assertion node foundations as real use cases require.
- [x] Nodes use public services, declare domains/effects/checkpoint behavior, and have tests.
- [x] Complex algorithms remain typed modules behind registered nodes.
- [x] A playground integration scene proves UI/audio/save/pool/graph/export together.
- [x] Documentation shows exactly where a new agent adds a type, node, capability, editor
      widget, or subsystem binding.

Implemented in M10f: graph-owned foundation, deterministic, world, and service registrars
compose with pool, UI, and audio registrars through one deterministic catalog. Matching
runtime composition injects only public services, preserves scheduler queue crossings and
async checkpoint policies, and snapshots only declared variable/seeded-random resources.
The isolated playground diagnostic proves real pool reuse, DOM UI mutation, audio effect and
gesture unlock, save roundtrip, platform capability, graph trace/effects, and a bounded
browser static export without loading the editor or project manifest.

## M11 — Bounce Run vertical slice

Scope:

- create `apps/bounce-run` as an engine-only local project;
- graph-driven start/session/game-over/restart and UI;
- desktop action input, dynamic ball, landing tracker, controlled bounce, lateral controller,
  follow camera, a small pooled platform sequence, basic visual identity.

Acceptance:

- [x] A/D and arrows control lateral movement; R restarts; Escape pauses.
- [x] Rapier sphere uses CCD and produces one bounce event per valid landing.
- [x] Bounce height is predictable at 60 and 30 FPS and across multi-substep frames.
- [x] Side/edge contacts do not produce double landing.
- [x] Session rules and UI orchestration are graphs, not app-local system shortcuts.
- [x] Public APIs only; no editor/React dependency.
- [x] Real Chrome agent can start, play, fail, and restart without console errors.
- [x] Initial performance baselines are recorded and budgets proposed.

Evidence and provisional budgets from the first working slice:

- Chrome at `http://127.0.0.1:5191/` reported an average `8.3 ms` frame over the rolling
  30-frame HUD sample (`120 FPS` on the test display), with `16` live entities and a fixed
  `6/6` active/total platform pool. Start, collision-driven play, pause, resume, end-of-track
  failure, and restart completed without application console errors.
- The production Vite build is `3,168.09 kB` minified and `1,075.24 kB` gzip in one JavaScript
  chunk. The engine remains the dominant dependency; splitting and final export audit remain
  M14 work.
- Final M11 repository gates passed from a detached clean worktree at `479d764`: `pnpm test`
  passed 189 test files and 739 tests with 8 skipped; `pnpm build` passed all 21 runnable
  workspace projects after the documented clean-worktree `file:` dependency repacks;
  `pnpm depcruise` found no new violations across 572 modules and 1,109 dependencies; and
  `./scripts/check.sh` passed its build, test, and playground bundle audit. The ignored
  playground asset manifest was generated only in that worktree and the generator's six
  tracked scene rewrites were restored there before and after the gates.
- The Chrome session proved the named start/play/pause/resume/fail/restart flow and visible
  sustained bouncing, but did not directly measure lateral displacement. A/D, arrow bindings,
  and deterministic lateral response are covered by focused tests; M12's public observation
  API and replay-backed browser automation will provide measured browser displacement evidence.
- Until longer M13/M14 runs establish hard device tiers, the M11 budgets are: rolling average
  frame time at or below `16.7 ms` (provisional alert ceiling `25 ms`), exactly six platform
  pool records with no expansion, at most `16` entities for this finite slice, no application
  console errors, and a production JavaScript ceiling of `3.5 MB` minified / `1.2 MB` gzip.
  Fixed simulation remains `60 Hz` with at most three catch-up substeps; memory-growth budgets
  intentionally wait for the M13 long-run route.

## M12 — Generator, seed/replay, QA harness, and automation

Scope:

- deterministic pure generator and reachability solver;
- guaranteed main route plus optional alternatives;
- pool-backed infinite route and decision log;
- fixed-tick action recording, replay, hashes, structured observations/assertions;
- Playwright Chrome E2E, browser-agent reports, mass-seed and Rapier comparison suites.

Acceptance:

- [x] Same seed/config produces identical route decisions.
- [x] Every generated sequence has at least one reachable path and deterministic fallback.
- [x] Safe start and difficulty margins are tested.
- [x] Many headless sequences finish without intersections, invalid gaps, missing routes, or
      unbounded attempts.
- [x] Replay either matches state hashes or reports exact divergence.
- [x] QA uses public action/observation APIs and cannot mutate game state directly.
- [x] Browser E2E covers start, input, pause, game over, restart, resize, and console errors.
- [x] QA harness is absent from production export.

M12 route, infinite-pool, and replay slice evidence: `9bc30a6`, `fc35d55`, `38d9d6e`,
`a4d02ab`, `c516491`, `7143dd9`, `cbb1202`, `296679c`, `482586c`, `519b5fa`,
`ee60b05`, `264882c`, `87dbf28`, `8bc0d10`, `da1f1ef`, `c471dc3`, `d20a34d`,
`b3115b1`, `abc9c89`, `e9fd8ed`, `369144c`, `dfd597c`, `d92279d`, `e01745e`,
and `57548f7` add the
side-effect-free seeded generator, fixed-step analytic reachability envelope, decreasing but
non-zero safety margins, center-to-center chained landing continuity, full candidate/selection
logs, bounded candidate attempts, horizon-stable prefixes for infinite extension, and a
deterministic zero-attempt fallback. The runtime now uses an eight-instance public `EntityPool`
window with initializer-before-activation placement, exact box geometry/collider dimensions,
bounded acquire/release/reuse, append-only pure decision prefixes, and deterministic reset and
dispose. Focused Vitest coverage validates invalid configuration, contained exhaustion, three
disjoint eight-slot windows, stable entity reuse, route continuity, platform intersection
rejection, and 256 seeds × 128 platforms without route validation issues or attempt overflow. A
headless Rapier comparison locks the analytic same-height landing to the collision-event tick and
forward position used by the current 60 Hz controller. User-Chrome smoke verified generated track
rendering and restart at `pool 6/8` with no console errors. The public core now provides immutable
versioned fixed-tick recordings and canonical key-sorted UTF-8 FNV-1a hashes with explicit rejection
of non-finite, cyclic, sparse, and unsupported values. A headless Bounce Run integration records
180 public action snapshots from `EngineScheduler` fixed ticks while applying the current ball
controller, reproduces all 180 hashes, and reports a tick-73 action tamper with the exact expected
and actual hashes without mutating the artifact. Public core observation primitives now clone and
deep-freeze finite plain JSON-shaped values, reject executable/accessor/symbol/BigInt/cyclic/sparse
or non-plain data without invoking it, and evaluate immutable `eq`/`ne`/`lt`/`lte`/`gt`/`gte`
results by guarded dot/array paths. The Bounce Run adapter exposes one versioned fixed-tick snapshot
containing only session, ball, bounded route, and pool data from public read methods; focused tests
prove source changes and direct snapshot writes cannot mutate one another. The existing graph
`Assert` node remains the public boolean flow assertion rather than being duplicated. Bounce Run
now composes cloned, deeply frozen version-1 session reports from one recording, bounded ordered
observation/assertion evidence, and bounded runtime/console error records. Bug reports add strict
defect and root-cause fields, and canonical key-sorted UTF-8 serialization round-trips to identical
plain data with insertion-order-independent bytes. Malformed versions, replay metadata, tick
ranges/order, assertion references/results, error records, executable/accessor/cyclic/non-finite
values, and excess histories are rejected transactionally. A dependency-injected data-only harness
now subscribes to public fixed-tick/action/observation and runtime/console/network diagnostic ports,
deduplicates and bounds ordered browser evidence, composes those immutable reports, and exposes no
world/entity/pool/physics mutation handle. The Bounce Run browser bootstrap loads a removable
versioned read/action-only global and DOM bridge only through Vite's static
`import.meta.env.DEV` branch and dynamic import. An executable regression runs the real production
build with `NODE_ENV=production`, requires unique harness/report/observation/replay and browser-hook
sentinels at their sources, and proves every sentinel, collector, and global bridge is absent from
all emitted JavaScript. User-Chrome smoke on an agent-owned server recorded lateral action and
public observation displacement from `x 0.000` to `x 1.069` by tick 39, showed pause through Escape,
composed 139-tick session and bug artifacts with zero collected diagnostics, and found no console
errors beyond the established Rapier initialization warning.

M12 Chrome workflow evidence `40af2b6` and `2438c55` preserves a key press released before the
next frame for exactly one action-map snapshot and commits the bounded immutable user-Chrome matrix
at `docs/evidence/m12-browser-workflow-report.v1.json`. Six real Chrome-extension
`locator.press('KeyD')` events across fixed intervals moved the public DEV observation from
`x 0.000` at tick 24 to `x 0.220` at tick 57; the existing public action port separately proved
multi-tick lateral control to `x 2.242`. DEV and production both covered visible start,
pause with a stable tick, UI resume, deterministic game over, immediate restart, and 1280×720 plus
1600×900 resize. Production contained no DEV QA DOM hooks, and both runs had no unexpected console
diagnostics beyond the exact Rapier initialization warning. The installed `tab.playwright` surface
exposes only combined `locator.press`, not separate keyboard down/up, and exposes no
`requestfailed` event stream. One physical sustained-key hold and authoritative production
failed-request collection therefore remain unproved external-tooling risks; neither extension API
is required by the written Browser E2E acceptance row, and no substitute evidence is claimed for
them.

M12 is Complete at `ffcc687` after the final detached clean-worktree audit. The committed bounded
Chrome report validates as immutable version-1 evidence, and the real production-build regression
passes with all four authoritative QA source sentinels present and all eight production QA
sentinels absent from the single emitted Bounce Run JavaScript bundle. Focused report and
production-boundary coverage passed 2 files / 4 tests. Full gates passed: `pnpm lint`; `pnpm
typecheck` across all 21 runnable workspace projects; `pnpm test` with 201 passed files and 1
skipped, 801 passed tests and 8 skipped; `pnpm build` across all 21 runnable projects after the
documented clean-worktree `file:` dependency repacks; `pnpm depcruise` across 597 modules and 1,157
dependencies with no new violations and 5 known violations ignored; and `./scripts/check.sh` with
its repeated full build, the same 201-file/801-test passing suite, and `OK: all checks passed` from
the playground production bundle audit. The ignored 159-file playground manifest was generated
only in the detached worktree, all six generator-touched tracked scenes were explicitly restored,
and the tracked-clean worktree was removed after verification.

## M13 — Full gameplay, polish, saves, audio, and stabilization

Scope:

- normal/wide/narrow/bounce platforms, difficulty curve, score, one reachable bonus;
- local high score, pause/restart lifecycle, complete UI/audio/effects;
- polished stylized procedural look, readable platform language, camera, particles/trail;
- long-run pool/object/memory/FPS tests and regression fixes.

Acceptance:

- [x] Full agreed gameplay loop is understandable within seconds and visually coherent.
- [x] Difficulty reduces safety margins but never removes all reachable routes.
- [x] Bonus is reachable, sensor-safe, pooled, and cannot score twice.
- [x] High score persists locally through the universal save API.
- [x] Audio unlock/pause/settings/pool cleanup work.
- [x] No sustained active-object or memory growth in long runs.
- [x] Every found reproducible bug has seed/replay and regression coverage.
- [x] Chrome resize and 30 FPS simulation behavior remain correct.

M13 generator evidence (complete):

- The pure seeded route contract now emits typed `normal`, `wide`, `narrow`, and `bounce`
  descriptors with explicit dimensions and standard/boost launch behavior. Fixed validated
  difficulty bands own deterministic weights and non-increasing non-zero safety margins; the
  mandatory route retains bounded candidate attempts and deterministic fallback.
- Optional bonus generation uses an RNG stream separate from platform decisions and selects only
  among transitions available at the configured minimum route length. Therefore increasing the
  horizon cannot rewrite an existing platform, decision, or bonus prefix for the same seed/config.
- A configured long-enough route emits exactly one sensor descriptor on a solver-sampled flight
  trajectory. Analytic validation proves lateral reachability, clearance from the mandatory
  center-line ball collider path, and no intersection with any platform; disabled and too-short
  routes emit none.
- Focused generator/reachability/Rapier comparison tests pass 15/15. The mass generator case covers
  256 seeds × 128 platforms with exact variant dimensions, mandatory reachability, one configured
  bonus, no platform/bonus intersections, and bounded platform/bonus attempts. All 18 Bounce Run
  test files pass 69/69 tests, including the real production QA-boundary build.
- This slice does not materialize variant behavior or the bonus in the runtime, pool a bonus sensor,
  award score, or claim the unchecked bonus/full-gameplay acceptance rows above.

M13 runtime variant/bonus evidence (complete):

- One fixed-seed integration RED used four explicit one-hot difficulty bands and an enabled bonus.
  It failed first because active platform leases exposed no descriptor, confirming that the prior
  runtime remained normal-only. The same test now proves descriptor identity, variant dimensions,
  launch behavior, Box geometry parameters, and Collider half-extents for the full active window.
- The platform route and dedicated bonus `EntityPool` remain bounded and reuse authored instances.
  Acquire initializers materialize serializable component data before the public pool activates and
  reconciles a lease. Bonus leases use a Rapier trigger-sphere Collider matching the pure descriptor
  and release on collection, behind-window eviction, reset, and dispose.
- `LandingTracker`'s existing top-contact, downward-speed, and fixed-tick guards remain the only
  landing boundary. The landing system resolves the contacted pooled platform descriptor and queues
  its exact standard/boost height once through the existing ball controller; a focused integration
  case proves the 3.6-unit boost and rejects the repeated enter in the same tick.
- Bonus collection consumes only public trigger-enter events, verifies the current ball/sensor
  overlap against current world transforms to reject stale post-reuse events, and atomically claims
  the active route lease before invoking the session score entry. Duplicate enters cannot find a
  second active lease; reset clears claims, while paused/game-over sessions reject collection.
- Score ownership is the existing graph variable store and existing Get/Add/Set node composition.
  Start/restart graph entries clear it, the bonus entry adds once, and `session.score()` plus dev-only
  QA observation v2 expose a read without a second app-side mutable score.
- Focused Bounce Run plus public pool/physics/graph verification passed 24 files / 111 tests. Bounce
  Run typecheck and production build passed. In user Chrome on an agent-owned Vite server, the first
  window visibly showed distinct platform dimensions and the yellow bonus sensor, runtime QA showed
  bounded pool metrics and readable score, and the console contained only the established Rapier
  initialization deprecation warning. The browser run did not collect the bonus, so once-only score
  and boost-height claims rely on the focused integration evidence above rather than visual evidence.

M13 score HUD and local-save evidence (complete):

- The mandatory happy-dom integration RED mounted the real authored Bounce Run HUD and public
  in-memory save storage before any production change. It passed the existing transition case and
  failed the new case at the first `Score 0` lookup because the authored HUD had no score element.
- The production HUD now exposes accessible live current/best score text. Explicit pure `Format
Number` nodes feed public UI Set Text nodes; no app code mutates score DOM. Interpreter executions
  now advance declared resource revisions after successful writes, so a later same-tick execution
  cannot reuse stale graph-variable data while the current execution retains its frozen snapshot.
- Ordinary progress uses the existing top/downward/once-per-tick landing event and the current
  mandatory platform lease index. Graph variables plus Greater Than, Branch, Add, Get, and Set own
  the forward-only rule and reset state. Repeated landings, side contacts, backwards indices, and a
  reused pooled entity ID cannot score twice; the pooled bonus remains a separate graph entry.
- The versioned `bounce-run.high-score.v1` slot loads asynchronously through `ISaveStorage`;
  missing or malformed data defaults to zero. Fail writes only a strictly higher safe integer with
  expected revision. One safe conflict retry is bounded; conflict, quota, and operation rejections
  preserve the prior readable value and reject with their public typed error after the session has
  entered game-over. A fresh runtime reads the same committed value, restart clears only current
  score, and destroy does not cancel an already-started storage write.
- Generic browser composition probes public IndexedDB before session initialization and uses no
  replication or `localStorage`. Only typed IndexedDB unavailability selects an in-memory fallback,
  and the start UI states honestly that the best score then lasts only for the current tab.
- Affected graph/UI/storage plus all Bounce Run verification passed 53 files / 200 tests. Bounce Run
  typecheck and production build passed (198 Vite modules; only the established chunk-size
  advisory). User Chrome on the agent-owned `127.0.0.1:5192` showed `Score 0` and `Best 0` on start
  and restart, zero QA diagnostics, and only the established Rapier warning. The centered normal run
  did not reach a scored landing, so route increment and non-zero reload persistence rely on the
  focused integration evidence; no QA score/storage backdoor was added or used.

M13 production audio evidence (complete):

- The mandatory real-HUD integration RED was committed before production composition and failed
  first because `audio-composition.js` did not exist. Its GREEN path uses the public audio graph,
  service, backend, and pool lifecycle APIs with a controllable backend and a real `EntityPool`
  lease; rejected unlock/pause/resume transitions surface `AudioLifecycleError` and preserve the
  prior retryable state.
- The Start activation calls and awaits the public unlock chain immediately from the DOM activation
  callback before reset, session transition, UI click SFX, or music. The runtime owns idempotent
  unlock/pause state, so repeated pause/resume requests do not duplicate backend transitions.
- Landing, bonus, fail, and transition UI SFX are authored Play Audio nodes on the session graph.
  Forward-only route scoring remains the landing dedupe boundary. One procedural local WAV loop is
  owned as music and retained as a singleton across restart; no clip uses a CDN or runtime request.
- Authored Master/Music/SFX/UI volumes and mute state execute through public graph bus nodes. Four
  accessible HUD controls use public UI activation/text contracts, remain available while paused,
  remember volume when unmuted, and reject non-finite/out-of-range volume inputs.
- `createAudioPoolParticipant()` is registered through the universal pool lifecycle boundary.
  Release, reacquire, clear, and composition disposal stop all voices for every pooled entity and
  unregister the late participant, leaving no owner handles or subscriptions behind.
- Affected Bounce Run, audio, audio-web, pool, graph, graph-runtime, and UI verification passed 58
  files / 224 tests. Audio/audio-web/pool builds, Bounce Run typecheck, and the 200-module production
  build passed; only the established Vite chunk advisory appeared.
- User Chrome on agent-owned `127.0.0.1:5193` proved Start without an autoplay error, Escape pause,
  Resume, Master/Music mute controls, restart with retained settings, and zero QA diagnostics. The
  console contained only the established Rapier initialization warning. Browser evidence is UI and
  read-only state observation; no claim of subjectively hearing sound is made. The agent server was
  stopped after the run.

M13 bounded presentation effects evidence (complete):

- The mandatory integration RED was committed before production effects code and failed at module
  collection because `effects-composition.js` did not exist. Its GREEN path uses a real `World`,
  real platform and bonus `EntityPool` leases, the accepted `LandingTracker` result, the atomic bonus
  claim boundary, and the once-only failure system. Duplicate same-tick landings, side contacts,
  stale bonus overlaps, and repeated failure updates emit no duplicate presentation request.
- `@haku/engine` now owns a typed `PresentationEffectsService` and replaceable backend contract.
  Requests contain only positions, colors, shapes, durations, sizes, and optional entity ownership;
  no Three object enters world, schema, pool, or app state. The production Three backend owns 18
  reusable burst meshes plus one trail Points object, a fixed 12-request ring, 28 trail samples,
  three shared burst geometries/materials, and one shared trail geometry/material. Its Presentation
  update uses preallocated slots/buffers, reuses the oldest visual when saturated, and disposes each
  shared GPU resource once.
- Bounce Run composes cyan landing rings, gold pickup sparks, a coral fail pulse, and a pale cyan
  fixed-capacity trail through typed methods. The trail samples in `LateUpdate`, advances only for a
  positive scheduler delta, interpolates samples at a fixed temporal interval, expires by elapsed
  time, and clears on fail/restart/dispose. Two removable pool lifecycle subscriptions clear
  lease-owned bursts on release/clear and unregister on composition disposal.
- Runtime platform materialization now reinforces the existing dimension language with distinct
  cyan normal, green wide, orange narrow, and purple low-roughness bounce styling. Bonus gold and the
  orange ball/pale trail remain contrasting without textures, remote assets, or extra render loops.
- The focused integration drives 100 accepted landing effect requests and 20 complete
  restart/release/reacquire cycles. Active bursts remain at or below 8 in the controllable backend,
  trail points at or below 12, queue at or below 16, and every cycle returns to zero active/queued
  effects, trail samples, and owned handles with exactly two live pool subscriptions; disposal
  leaves zero subscriptions and render objects. Engine failure/disposal tests cover invalid budgets,
  paused updates, queued/active owner cleanup, and idempotent Three disposal.
- All 20 Bounce Run test files pass 76/76 tests. Focused engine/pool/graph/runtime verification passes
  33 files / 119 tests; engine build, Bounce Run typecheck, and the 202-module production build pass
  at 3,230.66 kB minified / 1,093.76 kB gzip with only the established chunk-size advisory. User
  Chrome on agent-owned `127.0.0.1:5194` visibly
  showed the four platform colors/shapes, contrasting ball/trail, zero QA diagnostics, and the same
  `pool 6/8` read-only counter after restart. The natural run reached game over, but neither its brief
  fail burst nor a bonus pickup was captured visually, so those visual claims rely on focused tests.
  The console contained only the established Rapier warning, and the agent server was stopped.

M13 long-run stabilization evidence (complete):

- The mandatory stabilization RED was committed before production fixes. It runs a real `World`,
  Rapier backend, unified scheduler, fixed-capacity platform and bonus pools, Bounce session graph,
  public audio/UI services, and the controllable presentation backend for seed `0x13_06`. After 120
  warm ticks it drives 72,000 fixed ticks, 1,500 route transition/reset pairs, and 100 accepted
  fail/reset/restart cycles with a fixed-tick lateral action schedule. The first RED lacked a public
  scheduler ownership snapshot; after that narrow seam was added, the run exposed 8,328 retained
  graph trace records against the 4,096 budget.
- `EngineScheduler.metrics()` now exposes only registered-system and queued-command counts.
  `GraphInstance` now validates a configurable trace capacity, overwrites it circularly, preserves
  chronological reads and monotonic sequence IDs, and defaults to 4,096 records. Targeted graph RED
  coverage failed with 21 records against a five-record test capacity before the bounded fix.
- The GREEN long run reaches tick 72,120 and at least 10,000 platform acquisitions and releases.
  Platform and bonus totals/active counts, world entities, scheduler systems, effect subscriptions,
  queued commands, active/queued bursts, trail samples, owned handles, and headless render objects
  return exactly to their warm baselines. Disposal leaves zero subscriptions/effect handles/render
  objects and only the authored ball entity. The deterministic replay and the two stabilization
  defects, plus the earlier accepted-failure trail regression, are recorded in
  `docs/evidence/m13-stabilization-replay.v1.json`.
- A 600-frame 60 FPS reference and 300-frame 30 FPS admission produce the same 600 fixed-tick state
  hashes. Maximum fixed steps are one and two respectively, both below the three-step limit; fail
  effects exist at 0.5 seconds and expire at 0.8 seconds under both schedules. An irregular
  half-tick/half-tick/200 ms sequence admits `[0, 1, 3]` steps and reports only the bounded 150 ms
  overflow as dropped time.
- Dev-only QA observation v3 exposes immutable world, scheduler, bonus-pool, effect, subscription,
  and render-object counters; production export remains free of the QA boundary. In user Chrome on
  agent-owned `127.0.0.1:5196`, 1600×900, 900×1200, and 720×1280 viewports each produced exact
  canvas backing/CSS and HUD bounds with no document overflow and visible controls. Three visible
  `Run again` activations returned to the same 21 entities, bonus 1/1, queue zero, and two
  subscriptions; each game-over cleared 28 trail samples to zero and diagnostics stayed zero.
- Chrome's non-standard `performance.memory` sample was unavailable through the extension isolation
  boundary, so this stage makes no precise browser heap or forced-GC claim. Exact bounded ownership
  counters and repeated warm plateaus are the authoritative retained-growth evidence, consistent
  with Chrome guidance that heap snapshots contain GC noise and must be interpreted by retained/live
  plateaus rather than a universal threshold. The console contained only the established Rapier
  initialization warning. Focused stabilization/engine/pool/graph/replay verification passed 10
  files / 37 tests; affected QA verification passed 3 files / 29 tests and Bounce Run typecheck
  passed. The full-repository completion gates are recorded by the isolated audit below.

M13 final isolated acceptance audit (complete):

- The complete gameplay-loop row is backed by the combined committed Chrome runs: Start, active
  play, pause/resume, game over, immediate restart, responsive current/best score HUD, audio state
  controls, distinct normal/wide/narrow/bounce silhouettes and colors, contrasting bonus/ball/trail,
  and stable visible ownership counters. Audio evidence proves unlock and state transitions, not
  subjective audibility; the brief fail burst and bonus pickup remain focused-test evidence rather
  than captured browser frames.
- Difficulty and route safety are backed by the pure 256-seed × 128-platform mass generator run:
  all configured non-zero margins are non-increasing, every mandatory transition is reachable, and
  bounded fallback preserves a route. The runtime variant/bonus integration proves that those
  descriptors materialize through the public pools, while the focused bonus, save, and audio suites
  own the reachable once-only bonus, universal-save high score, and unlock/pause/settings/cleanup
  rows.
- The no-growth row is backed by the real Rapier/scheduler/graph/pool/audio/UI/effects run at tick
  72,120, 1,500 transition/reset pairs, at least 10,000 acquisitions and releases, and 100 accepted
  fail/restart cycles. Platform/bonus/world/scheduler/effect/subscription/handle/render counters
  return exactly to their warm baselines and disposal leaves zero subscriptions, handles, and render
  objects. Chrome `performance.memory` remained unavailable through the extension boundary, so no
  precise heap-byte, forced-GC, or device-tier claim is made; bounded counters and repeated warm
  plateaus are the retained-growth evidence.
- The reproducible-defect row is backed by the versioned replay artifact for seed `0x13_06`: missing
  scheduler ownership observation, the 8,328-entry unbounded session trace, and accepted-failure
  trail retention each name their first failure, root cause, and regression path. The artifact
  validates at SHA-256 `87da25be86694005d2e200438bd606f68409063e1e38817b0be0e403f1ea7e5a`.
- Resize/cadence parity is backed by identical 600-tick hashes for 600 frames at 60 FPS and 300
  frames at 30 FPS, bounded one/two-step admission, equal 0.5-second fail visibility and 0.8-second
  expiry, plus exact canvas/CSS/HUD bounds without overflow at 1600×900, 900×1200, and 720×1280.
  No browser rerun was needed because the isolated audit found no browser-specific regression after
  the committed Chrome session.
- Detached committed-HEAD gates passed: `pnpm lint`; `pnpm typecheck` for 21 runnable projects; the
  focused stabilization gate at 10 files / 37 tests; evidence parsing; `pnpm test` at 205 files and
  824 tests passed with 1 file and 8 tests skipped; `pnpm build` for 21 runnable projects; and
  `pnpm depcruise` across 604 modules / 1,185 dependencies with five known violations ignored.
  `./scripts/check.sh` repeated the build, 205-file/824-test suite, and playground production bundle
  audit and ended `OK`. The real Bounce Run production-boundary regression built 202 modules and
  excluded all eight authoritative DEV-QA sentinels. Only established Rapier deprecation and Vite
  chunk-size advisories appeared.
- The repository defines no root formatting script. A diagnostic, non-configured
  `pnpm exec prettier --check .` reported the existing 507-file repository baseline; no file was
  rewritten and this is not represented as a passing configured format gate. Fresh-worktree
  `file:` dependency copies required three successive forced frozen repacks after dependency-layer
  builds; the intermediate missing-declaration failures were packaging order, not source
  regressions, and the final build/typecheck were green.

## M14 — Final export, quality audit, and documentation

Acceptance:

- [x] Full repository format/lint/typecheck/test/build gates pass.
- [x] Playwright and browser-agent sessions pass against a clean production export.
- [x] ZIP extracts and runs from a simple static server with no external requests.
- [x] Bundle boundaries are proven.
- [x] Performance budgets are documented against measured baselines.
- [x] Current capability matrix, public API links, package graph, examples, create templates,
      and user documentation describe the final implementation.
- [x] Deferred backlog contains only genuinely deferred work.
- [x] Final handoff lists all local commits and known residual risks; no push is performed.

Static ZIP evidence (M14-01): the real Bounce Run Vite production output now uses Vite's relative
base and the shared project-path resolver emits document-relative runtime asset URLs. The generic
`@haku/build` writer archived only root `index.html`, one hashed runtime module, the reachable
prefab/scene/HUD JSON files, and the declared favicon. The six-entry stored archive passed
`unzip -t`, deterministic byte/order checks, fixed DOS timestamps, portable `0644` modes, safe-path
checks, static external-URL scans, and the existing authoritative production exclusion regression.
A clean extraction served below `/deployments/preview/v1/` returned HTTP 200 for only its nested
HTML, JS, prefab, scene, HUD, and favicon during page load; no CDN or external origin was requested.
The user-Chrome extension loaded the archive with no DEV QA bridge, exercised
start/pause/resume/game-over/restart, and retained exact canvas/HUD bounds without overflow at
`900×1200` and `1600×900`. Its fresh console contained no error and only the established Rapier
initialization deprecation warning. M14-02 below completes the combined Playwright/browser-agent
row against the split extracted runtime.

Bundle and measured performance evidence (M14-02): the mandatory production-budget RED built
with `NODE_ENV=production` and failed on the prior single reachable
`assets/index-BkpFlw_4.js` at `3,231.33 kB` minified / `1,093.90 kB` gzip. Vite 6 now uses one
deliberate Rollup `manualChunks` function for the resolved `@dimforge/rapier3d-compat` package,
following Vite's documented [chunking strategy](https://v6.vite.dev/guide/build#chunking-strategy)
and Rollup's [manual chunk contract and side-effect warning](https://rollupjs.org/configuration-options/#output-manualchunks).
The extracted runtime has exactly two reachable JavaScript files: entry
`index-DrKu2EzJ.js` at `994.85/261.43 kB` minified/gzip and
`rapier-runtime-CKC5f6tm.js` at `2,235.46/829.87 kB`. The entry statically imports the Rapier
chunk and Vite emits its relative `modulepreload`, consistent with Vite's
[relative-base preload semantics](https://v6.vite.dev/config/build-options#build-modulepreload).
Total JavaScript is `3,230.31/1,091.30 kB`, still below the `3.5 MB/1.2 MB` ceilings. The
largest chunk fell `30.82%` minified and `24.14%` gzip from the single-chunk baseline; the
measured largest-chunk budgets are therefore `2.25 MB` minified and `850 kB` gzip. Regression
coverage traverses the HTML/import graph, rejects orphan chunks, requires exactly one named
Rapier boundary and one owner of its vendor sentinel, scans every chunk for all QA,
editor/compiler/server/CDN exclusions, and keeps the generic static ZIP exact emitted closure.

The user Chrome extension loaded the extracted build below `/deployments/preview/v2/`; server
page-load logs recorded HTTP 200 for the HTML, both chunks, prefab, scene, HUD, and favicon and
no external origin. `tab.playwright` exercised Start, ArrowLeft/ArrowRight input, pause, resume,
game over, immediate restart, and exact no-overflow canvas/HUD resizing at `1600x900` and
`900x1200`. The QA global remained `undefined`, no QA DOM bridge existed, and the console
contained only the established Rapier initialization deprecation warning. Five warm public HUD
samples at ticks `169/337/508/621/790` all reported `33.3 ms / 30 FPS`, `21` entities, and a
bounded platform pool at `6-7/8`. This installed Chrome-extension surface therefore crossed the
`25 ms` alert and cannot validate the `<=16.7 ms` 60 Hz target: `requestAnimationFrame` cadence
[generally follows the display/surface refresh rate](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
and no forbidden standalone runner was substituted. The applicable 60 Hz baseline remains the
M11 measured `8.3 ms`; its hard target remains `<=16.7 ms`, with `25 ms` as the alert ceiling.
Committed M13 scheduler evidence remains authoritative for fixed `60 Hz`, one/two steps at
60/30 FPS and at most three catch-up steps, while its stabilization run owns bounded
effects/subscriptions/render objects. Production exposed only entity, pool, tick, frame-time,
and FPS telemetry, so no hidden effect counter was invented. No precise heap-byte budget is
claimed: [`performance.memory` is non-standard, deprecated, and unreliable](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory),
and bounded ownership counters plus repeated warm plateaus remain the retained-growth contract.

Final audit evidence (M14-04): detached committed HEAD `43bdd61` passed the frozen install for all
22 workspaces, configured ESLint, typecheck and build for all 21 runnable projects, the focused
M14 release gate (5 files / 17 tests), the full suite (208 passed files / 838 passed tests, with
1 file / 8 tests skipped), dependency cruising (608 modules / 1,202 dependencies, five known
violations ignored and no new violation), and `./scripts/check.sh` through its repeated build,
suite, and playground bundle audit. The clean `file:` package graph required the established three
forced frozen-lockfile repacks as declaration layers became available; its intermediate failures
were packaging order, not source regressions. The repository still has no configured root format
script. Only the owned completion documents were checked with Prettier; the optional repo-wide
check retains the established 507-file baseline and no mass reformat was attempted.

A fresh local-link `@haku/create` project installed, typechecked, and built 167 modules into a
relative static site with no editor, QA, CDN, or server coupling. The final generic stored ZIP was
recreated from the clean Bounce Run production build at SHA-256
`3f1ee897d16936b1f8c9217d65a6bd42c23c5028d020fd317b53d5be920c2a35`: seven deterministic
`0644` entries with fixed 1980 timestamps, root HTML, the reachable entry and Rapier chunks, the
prefab, scene, HUD, and favicon. `unzip -t` passed. A nested simple static server recorded exactly
seven page-load HTTP 200 requests, no external origin and no root `/assets`; Chrome later made one
implicit root `/favicon.ico` 404 during tab cleanup.

The final user-Chrome extension session repeated Start, ArrowLeft/ArrowRight input, pause, resume,
game over, and immediate restart. Canvas, HUD, and document bounds matched `1600x900` and
`900x1200` without overflow; the QA global remained `undefined` and no QA DOM bridge existed. The
fresh console contained only Rapier's established initialization deprecation warning. The
extension reset once after a full post-start snapshot exceeded its 30-second control window; the
same tab was recovered and targeted checks completed. This reinforces the documented extension
cadence, key-hold, request-failure, and heap-telemetry limitations rather than indicating a game
regression. M14 and the full agreed MVP are complete; the final handoff owns the chronological
commit inventory and residual-risk record, and no push was performed.

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
