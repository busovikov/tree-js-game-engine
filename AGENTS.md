# @haku Agent Guide

Monorepo for the @haku browser game engine and editor.

## Source of truth

- Architecture and phases: `IMPLEMENTATION_PLAN.md` (copy from project docs)
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
