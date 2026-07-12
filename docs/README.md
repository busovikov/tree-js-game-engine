# @haku — Agent Documentation

> **Audience:** AI agents and developers working on the @haku monorepo.  
> **New task?** New chat → read [agent-workflow.md](./agent-workflow.md) first.

## Quick map

| Document | When to read |
| -------- | ------------ |
| **[agent-workflow.md](./agent-workflow.md)** | **Every new task** — context rules, search strategy, done criteria |
| **[reference-driven-cycle.md](./reference-driven-cycle.md)** | **Build game from reference** — orchestrator, subagents, iterative board |
| [techstack.md](./techstack.md) | Choosing libraries, build tools, or package dependencies |
| [architecture.md](./architecture.md) | System design, data flow, package boundaries |
| [edge-cases.md](./edge-cases.md) | Failures, empty states, validation, security — **not happy-path only** |
| [ui-kit.md](./ui-kit.md) | Editor UI patterns, components, how to add inspector fields |
| [links.md](./links.md) | **Canonical refs** — official docs, internal API, read/write rules, migrations |

## Agent skills (`.agents/skills/`)

Skills are updated to use `docs/` — load skill + relevant doc together:

| Skill | Uses docs |
| ----- | --------- |
| `reference-driven-cycle` | `reference-driven-cycle.md` — orchestrator; subagent: `reference-driven-subagent` |
| `reference-driven-subagent` | `reference-driven-cycle.md` |
| `source-driven-development` | `links`, `techstack` |
| `test-driven-development` | `edge-cases`, test paths in packages |
| `git-workflow-and-versioning` | `agent-workflow` |
| `three-best-practices`, `threejs-*` | `links`, `architecture`, `RENDER_PLAN` |

## Cursor rules

Auto-loaded in Cursor (`.cursor/rules/`):

| Rule | Scope |
| ---- | ----- |
| `haku-agent.mdc` | Always — workflow, docs map, boundaries |
| `haku-reference-driven.mdc` | Always — reference-driven orchestrator trigger |
| `haku-editor.mdc` | `packages/editor/**` |
| `haku-engine.mdc` | engine, playground, core, schema |

## Source of truth (repo root)

| File | Role |
| ---- | ---- |
| `AGENTS.md` | Short agent guide — package layout, commands |
| `IMPLEMENTATION_PLAN.md` | Phases, locked architectural decisions, scene format |
| `RENDER_PLAN.md` | Rendering roadmap (RenderSettings, shadows, post FX) |
| `README.md` | Human quick start |

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm --filter @haku/playground dev
pnpm --filter @haku/editor-app dev
./scripts/check.sh   # CI-style check
```

## Hard rules (do not violate)

1. **Engine/playground never depend on editor or React.**
2. **Component data lives in `IWorld`** — Three.js objects are derived by `RenderSyncSystem`, not stored in components.
3. **All editor mutations go through `commitSceneEdit`** (undo/redo) or `globalCommandBus`.
4. **Entity IDs are UUID v4 strings** — never array indices.
5. **Do not revisit locked decisions** in `IMPLEMENTATION_PLAN.md` §2 unless the user explicitly asks.
