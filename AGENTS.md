# @haku Agent Guide

Monorepo for the @haku browser game engine and editor.

## Agent workflow (read first on every new task)

- **One task = one new chat** — do not pile unrelated work into an old session.
- **Do not load the whole project** — grep/read only files the task needs (see `docs/agent-workflow.md`).
- **Context:** relevant docs + source files + acceptance criteria only.

Full rules: [`docs/agent-workflow.md`](docs/agent-workflow.md)

**Notion TODO:** [`docs/notion.md`](docs/notion.md) — anchor task URL in chat; comment + status every pass; Done after commit.  
**Notion create ticket:** [`docs/notion-create-task.md`](docs/notion-create-task.md) — skill `@notion-create-task`.  
**Reference-driven cycle:** [`docs/reference-driven-cycle.md`](docs/reference-driven-cycle.md) — skill `@reference-driven-cycle` (orchestrator builds target project from reference repo).

**Skills** (`.agents/skills/`) reference all `docs/` files — see `docs/README.md` § Agent skills.

**Cursor rules** (`.cursor/rules/`) — auto-loaded: `haku-agent.mdc`, `haku-notion.mdc`, `haku-notion-ship.mdc`, `haku-notion-create-task.mdc`, `haku-reference-driven.mdc`, `haku-editor.mdc`, `haku-engine.mdc`.

**On commit:** `haku-notion-ship.mdc` → Notion comment + **Done** (ask task URL if new chat).

## Source of truth

- **Agent docs:** `docs/README.md` — index (`agent-workflow`, `techstack`, `architecture`, `edge-cases`, `ui-kit`, `links`)
- Architecture and phases: `IMPLEMENTATION_PLAN.md`
- Rendering stack roadmap: `RENDER_PLAN.md` (RenderSettings, RenderGraph, materials, shadows, post FX)
- Package boundaries: engine/playground never depend on editor or React

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

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @haku/playground dev
pnpm --filter @haku/editor-app dev
```
