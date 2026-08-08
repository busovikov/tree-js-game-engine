# Engine improvement through Bounce Run: final full-MVP state

> Final baseline verified on 2026-08-08 through M14. The isolated repository and release audit ran
> at committed HEAD `43bdd61`; the completion and final handoff commits record the documentation
> closure. Stable contracts live in
> [node-graph-architecture.md](./node-graph-architecture.md), and the completed milestone map and
> measured evidence live in
> [engine-game-development-plan.md](./engine-game-development-plan.md).

## Outcome

The engine-improvement program and the agreed Bounce Run MVP are complete. Haku now provides a
browser-first engine/editor platform that can author, run, test, save, and export a polished small
3D game. Bounce Run is the engine-only proving application: it uses public `@haku/*` APIs and does
not depend on the editor, React, QA code, a CDN, or a runtime server.

The final generic export is a deterministic static ZIP with root HTML and relative local paths. It
runs after extraction below an arbitrary nested path on a simple HTTP server in the user's Chrome.

## Implemented system

```text
Project assets and source
  -> @haku/schema + @haku/assets + @haku/serializer
  -> @haku/core World and EngineScheduler
       -> one fixed-step accumulator and deterministic frame/fixed phases
       -> @haku/graph compiler plans
       -> @haku/graph-runtime instances, queues, effects, checkpoints, and rewind
       -> @haku/physics abstraction + application-selected Rapier backend
       -> @haku/pool entity reuse and lifecycle cleanup
       -> @haku/ui React-free production DOM UI
       -> @haku/audio + @haku/audio-web
       -> @haku/storage + @haku/platform
  -> @haku/engine runtime composition and Three.js presentation

Browser editor
  -> React authoring shell and undoable commands
  -> local File System Access / virtual projects
  -> graph, custom type/component, UI, audio, and code authoring
  -> lazy React Flow and Monaco adapters
  -> local TypeScript/esbuild Workers and trust/capability gates
  -> disposable opaque-origin Play sandbox
  -> @haku/build deterministic static ZIP export

Bounce Run
  -> start / active / paused / game-over / immediate-restart loop
  -> desktop action input, Rapier bounce/controller, forward camera
  -> deterministic reachable infinite route + universal pooling
  -> difficulty variants, scoring, bonus, local high score
  -> DOM HUD, audio, presentation effects, seed/replay, and QA evidence
```

## Package and application baseline

| Surface                                 | Final responsibility                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `@haku/schema`                          | Base IDs, scene envelopes, shared serializable primitives, and relative project paths.                             |
| `@haku/assets`                          | UUID manifests, descriptors, registries, typed references, and dependency closure.                                 |
| `@haku/core`                            | World/entity/component lifecycle and the sole multi-phase scheduler.                                               |
| `@haku/serializer`                      | Registry-driven scene, prefab, and project serialization.                                                          |
| `@haku/graph`                           | Graph assets, types, node/effect contracts, diagnostics, compiler, and plans.                                      |
| `@haku/graph-runtime`                   | Deterministic execution, domains, queues, structured async work, trace, checkpoint, rewind, and persistence hooks. |
| `@haku/physics`, `@haku/physics-rapier` | Replaceable physics contracts and the selected browser Rapier implementation.                                      |
| `@haku/pool`                            | Prefab-backed deterministic generational entity pools and lifecycle integrations.                                  |
| `@haku/ui`                              | Strict UI assets, accessible React-free DOM rendering, services, SDK, and graph nodes.                             |
| `@haku/audio`, `@haku/audio-web`        | DOM-free audio model/runtime and gesture-gated Web Audio backend.                                                  |
| `@haku/storage`, `@haku/platform`       | Async local saves, replay artifacts, replication contracts, and browser lifecycle/capabilities.                    |
| `@haku/build`                           | Browser-local indexing, trusted build Workers, diagnostics, and deterministic static ZIP export.                   |
| `@haku/engine`                          | Public runtime composition and Three.js presentation without editor or React dependencies.                         |
| `@haku/editor`                          | Browser authoring UI, project service, provider adapters, sandboxed Play, and export workflow.                     |
| `@haku/create`                          | Standalone engine-only scaffold with relative production output and local-link support.                            |
| `apps/playground`                       | Engine diagnostic catalog; not the shipped game.                                                                   |
| `apps/editor`                           | Editor application shell.                                                                                          |
| `apps/bounce-run`                       | Complete public-API-only proving game and production release target.                                               |

## Full-MVP capability state

| Capability            | State and evidence                                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Asset/component model | Complete for MVP: universal UUID manifest, decentralized registries, custom component types, prefab closure, lifecycle, and roundtrip coverage.                                                        |
| Scheduler and graphs  | Complete for MVP: one scheduler; compiler/interpreter domains; typed nodes/effects; structured concurrency; trace; checkpoint/rewind; persistence and cross-service nodes.                             |
| Browser authoring     | Complete for MVP: local project source/assets, graph and visual type/component/UI authoring, shared declarations, lazy code/canvas providers, trust gates, and sandboxed Play.                         |
| Physics and pooling   | Complete for MVP: abstract/Rapier bodies, colliders, events, queries, controllers, lifecycle cleanup, and deterministic prefab-backed pooling.                                                         |
| UI and audio          | Complete for MVP: accessible production DOM HUD, visual authoring, headless/Web Audio separation, buses, gesture unlock, graph/service bindings, and cleanup.                                          |
| Storage and platform  | Complete for MVP: async slots, IndexedDB, replay artifacts, expected revisions, honest replication modes, and browser lifecycle/pause/input/audio controls.                                            |
| Replay and QA         | Complete for MVP: fixed-tick action recording, state hashes, deterministic replay, structured observations/assertions/reports, long-run counters, and browser workflow evidence.                       |
| Production export     | Complete for MVP: local Worker build, deterministic portable ZIP, relative nested-base paths, reachable dependency closure, diagnostics, and authoritative editor/QA/CDN/server exclusions.            |
| Bounce Run            | Complete: polished full loop, input, controlled bounce, camera, reachable deterministic route, variants/difficulty, score/bonus/save, audio/effects, replay, stabilization, and responsive desktop UI. |

## Final verification baseline

The final isolated audit used a detached worktree at committed HEAD `43bdd61`, generated the
ignored 159-file playground manifest, and restored the generator's six tracked Isaac scenes before
and after verification.

| Command or check                 | Final evidence                                                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed for all 22 workspaces.                                                                                               |
| `pnpm lint`                      | Passed with no ESLint findings.                                                                                             |
| `pnpm typecheck`                 | Passed all 21 runnable projects after the established clean-worktree repacks.                                               |
| Focused M14 release gate         | 5 files / 17 tests passed: bundle budget, real static ZIP, production QA boundary, generic ZIP, and release/create surface. |
| `pnpm test`                      | 208 files / 838 tests passed; 1 file / 8 tests skipped.                                                                     |
| `pnpm build`                     | Passed all 21 runnable projects. Bounce Run emitted the entry and Rapier chunks within explicit budgets.                    |
| `pnpm depcruise`                 | 608 modules / 1,202 dependencies, no new violations; five known violations ignored.                                         |
| `./scripts/check.sh`             | Repeated install/build/test and finished `OK: all checks passed` after the playground bundle audit.                         |
| `git diff --check`               | Passed in the detached audit and for the owned completion documents.                                                        |

There is no configured root formatter. Prettier is therefore not represented as a configured
repository gate. The owned final documentation files pass focused Prettier checks; the optional
repo-wide Prettier check retains the established 507-file baseline and was not used to mass-reformat
unrelated or protected files.

## Create and release proof

A fresh `@haku/create` local-link project installed, typechecked, and built 167 modules. Its output
uses relative paths and contains no editor, QA, CDN, or runtime-server coupling.

The final Bounce Run production build emitted:

- `assets/index-DrKu2EzJ.js` — 994.85 kB minified / 261.43 kB gzip;
- `assets/rapier-runtime-CKC5f6tm.js` — 2,235.46 kB minified / 829.87 kB gzip;
- 3,230.31 kB / 1,091.30 kB total JavaScript, within the explicit 3.5 MB / 1.2 MB ceilings;
- largest-chunk results within the 2.25 MB / 850 kB ceilings.

The generic writer produced a deterministic 3,248,308-byte stored archive with SHA-256
`3f1ee897d16936b1f8c9217d65a6bd42c23c5028d020fd317b53d5be920c2a35`. Its seven `0644`
entries have fixed 1980 timestamps: root HTML, both reachable JavaScript chunks, platform prefab,
main scene, HUD document, and favicon. `unzip -t` passed.

A simple server below `/deployments/preview/final/` recorded one HTTP 200 for every archive entry
and no external-origin or root `/assets` request. After the tab was finalized, Chrome made one
implicit same-origin root `/favicon.ico` request that returned 404 despite the declared nested SVG;
this cleanup-only behavior is retained as evidence rather than hidden.

The user Chrome extension completed Start, left/right input, pause, resume, game over, and immediate
restart. At `1600x900` and `900x1200`, canvas and HUD bounds exactly matched the viewport and the
document had no overflow. The QA global was `undefined`, no QA DOM bridge existed, and the fresh
console contained only Rapier's established initialization deprecation warning.

## Known limitations and deferred work

- Fresh clean worktrees currently need three successive forced frozen-lockfile repacks as
  `file:` dependency declaration layers become available. This is packaging-order debt, not a
  runtime regression.
- The installed Chrome extension surface has measured 30 Hz cadence and cannot validate the 60 Hz
  rendering target. Committed scheduler tests retain fixed 60 Hz simulation and bounded catch-up;
  M11's measured 8.3 ms 60 Hz baseline remains authoritative.
- Chrome extension automation cannot represent durable key holds precisely, exposes no reliable
  `requestfailed` stream or forced-GC/heap telemetry, and may exceed its 30-second control window on
  full live-game snapshots. Targeted DOM checks, server logs, deterministic replay, and bounded
  ownership counters provide the retained evidence.
- Rapier prints its upstream initialization deprecation warning. Its deliberate production chunk
  also triggers Vite's generic 500 kB advisory while remaining within the measured explicit budget.
- Browser evidence proves successful audio unlock and visible state transitions, not subjective
  loudness or mix quality. Brief bonus/fail effects can evade screenshot capture and remain covered
  by deterministic lifecycle/integration tests.
- Mobile/touch input, real Poki/Yandex adapters, Safari/Firefox qualification, advanced graph/code
  debugging, advanced audio tooling, moving/destructible platforms, and the later rendering roadmap
  remain genuinely deferred as listed in the execution plan.

No push, pull request, or history rewrite was performed for the engine-improvement program.
