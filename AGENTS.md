# @haku Agent Guide

Monorepo for the @haku browser game engine and editor.

## Agent workflow (read first on every new task)

- **One task = one new chat** — do not pile unrelated work into an old session.
- **Do not load the whole project** — grep/read only files the task needs (see `docs/agent-workflow.md`).
- **Context:** relevant docs + source files + acceptance criteria only.

Full rules: [`docs/agent-workflow.md`](docs/agent-workflow.md)

**Reference-driven cycle:** [`docs/reference-driven-cycle.md`](docs/reference-driven-cycle.md) — skill `@reference-driven-cycle` (orchestrator builds target project from reference repo).

**Engine improvement through Bounce Run:** start with
[`docs/autonomous-engine-game-agent.md`](docs/autonomous-engine-game-agent.md), then follow
[`docs/engine-game-development-plan.md`](docs/engine-game-development-plan.md). Every
semantic stage uses a fresh sub-agent and
[`docs/stage-handoff.md`](docs/stage-handoff.md); the stable gameplay graph contract is
[`docs/node-graph-architecture.md`](docs/node-graph-architecture.md).

**Skills** (`.agents/skills/`) reference all `docs/` files — see `docs/README.md` § Agent skills.

**Cursor rules** (`.cursor/rules/`) — auto-loaded: `haku-agent.mdc`, `haku-reference-driven.mdc`, `haku-editor.mdc`, `haku-engine.mdc`.

## Source of truth

- **Agent docs:** `docs/README.md` — index (`agent-workflow`, `techstack`, `architecture`, `edge-cases`, `ui-kit`, `links`)
- Architecture and phases: `IMPLEMENTATION_PLAN.md`
- Rendering stack roadmap: `RENDER_PLAN.md` (RenderSettings, RenderGraph, materials, shadows, post FX)
- Current engine-improvement architecture and milestones:
  `docs/node-graph-architecture.md` + `docs/engine-game-development-plan.md`
- Package boundaries: engine/playground never depend on editor or React

For the engine-improvement program, later user decisions in the program documents supersede
conflicting historical decisions in `IMPLEMENTATION_PLAN.md`. Breaking changes are allowed,
but all repository consumers must be fixed in the same stage; do not add compatibility or
migration layers for the current transition.

## Layout

```
packages/schema       @haku/schema — Zod scene document v1
packages/core         @haku/core — IWorld, components, systems
packages/serializer   @haku/serializer — load/save scenes
packages/engine       @haku/engine — Three.js runtime
packages/editor       @haku/editor — React editor UI
packages/create       @haku/create — external game scaffolder
apps/playground       reference game (engine only)
apps/editor           editor shell
```

The target package expansion is defined in
[`docs/node-graph-architecture.md`](docs/node-graph-architecture.md). Do not create target
packages ahead of their milestone.

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @haku/playground dev
pnpm --filter @haku/editor-app dev
```
