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
├── package.json
├── playwright.config.ts
├── helpers/
│   └── target-project.ts   # route target assets + demo scene / drive smoke
├── tests/
│   ├── add-collider.spec.ts
│   ├── t01-9-collider-authoring.spec.ts
│   ├── t01-19-chase-camera.spec.ts
│   ├── t01-21-respawn.spec.ts
│   └── t01-39-vehicle-smoke.spec.ts
└── README.md
```

Optional: root `pnpm` script `editor:pw` that delegates to this folder.

**T01.39 tier B/C:** `helpers/target-project.ts` intercepts `/assets/*` so **File → Demo Scene** loads the target `playground.scene.json` + GLBs from `HAKU_TARGET_PATH`. Play mode smoke uses **▶ Play** + `keyboard.down('w')`. Iteration 2 adds chase-camera orbit (`mouse.down/move/up` on canvas) and respawn (`w` drive off edge + `r` manual reset).

**Bootstrap:** First `TARGET_BUILD` subagent (or orchestrator once) scaffolds this folder if missing. No Notion task — part of agent pass setup.

### Review screenshots (mandatory for editor-visible work)

Before moving a task to **Review**, if the user can verify in editor:

1. Extend e2e test (or add `tests/review-<task-id>.spec.ts`) with `page.screenshot()` at key steps
2. Save PNGs to `review-artifacts/<TASK_ID>/` (e.g. `01-inspector-collider.png`, `02-play-mode.png`)
3. **Attach screenshots to the Notion task** (comment drag-drop or page embed)
4. List artifact paths + screenshot filenames in Review handoff comment

```typescript
await page.screenshot({ path: 'review-artifacts/T01.4/01-collider-inspector.png', fullPage: false })
```

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

**T01.39 smoke:**

```bash
cd .agents/tools/editor-playwright
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm exec playwright test tests/t01-39-vehicle-smoke.spec.ts
```

| Step | Selector / action |
| ---- | ----------------- |
| Load M1 scene (via routed assets) | File → Demo Scene |
| Select vehicle | `.haku-hierarchy-row` with text `Vehicle` |
| Play mode | `getByRole('button', { name: /Play/ })` |
| Drive smoke | `keyboard.down('w')` × 3s |
| Chase orbit | `mouse.move` canvas center → `mouse.down` → `mouse.move` +120/−40 → `mouse.up` |
| Fall respawn | `keyboard.down('w')` × 4.5s (drive off edge) |
| Manual respawn | `keyboard.press('r')` |

---

## Related

- [reference-driven-cycle.md](../reference-driven-cycle.md)
- [raycast-vehicle/DECISIONS_LOG.md](./raycast-vehicle/DECISIONS_LOG.md) AD-08
- [raycast-vehicle/MASTER_PLAN.md](./raycast-vehicle/MASTER_PLAN.md) — E10 target content
