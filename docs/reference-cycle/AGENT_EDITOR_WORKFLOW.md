# Agent Editor Workflow — Playwright

**Status:** Active for reference-driven cycle  
**Not a platform epic** — agent tooling only, not @haku product scope.

---

## Principle

**Playwright is how subagents operate the editor** during `TARGET_BUILD` tasks. It is **not** a feature to ship in engine/editor and **not** tracked as platform tasks on the Iterative dev board.

| Playwright is | Playwright is not |
| ------------- | ----------------- |
| Agent workflow tool for scene assembly | E09 / platform deliverable |
| Used by subagents in shell scripts | User-facing editor feature |
| Dev dependency + scripts under `.agents/` | Part of `@haku/editor` API |
| Documented flows for orchestrator handoff | Milestone exit criteria by itself |

---

## Location

```
.agents/tools/editor-playwright/
├── package.json          # @playwright/test (dev only)
├── playwright.config.ts
├── scripts/
│   ├── open-project.ts   # launch editor-app + open target path
│   ├── import-assets.ts
│   ├── assemble-scene.ts # place entities, save scene JSON
│   ├── enter-play-mode.ts
│   └── drive-smoke.ts    # keyboard simulation
└── README.md             # selectors, env vars, troubleshooting
```

Optional: root `pnpm` script `editor:pw` that delegates to this folder.

**Bootstrap:** First `TARGET_BUILD` subagent (or orchestrator once) scaffolds this folder if missing. No Notion task — part of agent pass setup.

---

## Flows (AD-08 — agent must be able to)

Subagents use these flows when building target content (T01.37–T01.41):

| Tier | Flow | When |
| ---- | ---- | ---- |
| **A** | Scaffold target → open editor → import GLBs → save scene | T01.37–T01.38 |
| **B** | Place level, lights, camera, vehicle prefab → play mode loads | T01.39 |
| **C** | Keyboard drive smoke test in play mode | T01.39 verification |
| **D** | Full scene assembly + optional screenshot diff vs reference | T01.41 polish |

---

## Subagent rules (`TARGET_BUILD`)

1. **Prefer Playwright** over manual `commitSceneEdit` file hacks when editor UI exists.
2. If Playwright tooling missing → create minimal `.agents/tools/editor-playwright/` in same pass (scoped commit allowed in monorepo on platform branch).
3. Document selectors used in pass summary + Notion comment.
4. Fallback: direct scene JSON edit only when Playwright blocked (comment reason).

---

## Environment

| Variable | Purpose |
| -------- | ------- |
| `HAKU_TARGET_PATH` | Absolute path to target project |
| `HAKU_EDITOR_URL` | Default `http://localhost:5174` (editor-app dev) |
| `HAKU_PLATFORM_ROOT` | Monorepo root |

Editor must be running (`pnpm --filter @haku/editor-app dev`) or started by Playwright fixture.

### Bootstrap status

Minimal harness lives at `.agents/tools/editor-playwright/`:

```bash
pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

First test: `tests/add-collider.spec.ts` — File → Demo Scene → select entity → Add Collider → Save.

Set `HAKU_SKIP_WEB_SERVER=1` when the dev server is already running.

---

## Related

- [reference-driven-cycle.md](../reference-driven-cycle.md)
- [raycast-vehicle/DECISIONS_LOG.md](./raycast-vehicle/DECISIONS_LOG.md) AD-08
- [raycast-vehicle/MASTER_PLAN.md](./raycast-vehicle/MASTER_PLAN.md) — E10 target content
