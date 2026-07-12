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

**T01.39 tier B/C (AD-09):** `helpers/target-project.ts` → `openTargetProject(page)` opens the real target via `/?hakuOpenTarget=1` when editor dev server has `HAKU_TARGET_PATH` set. **Do not** use File → Demo Scene or route `menu.scene.json` to target assets. Play mode smoke uses **▶ Play** + `keyboard.down('w')`.

**Bootstrap:** First `TARGET_BUILD` subagent (or orchestrator once) scaffolds this folder if missing. No Notion task — part of agent pass setup.

### Review screenshots (mandatory for editor-visible work)

Before moving a task to **Review**, if the user can verify in editor:

1. Read **[M1_VERIFICATION.md](./raycast-vehicle/M1_VERIFICATION.md)** — define detailed AC before coding
2. Run **`tests/m1-vehicle-alignment.spec.ts`** — must pass (metrics + forward drive)
3. Extend e2e test (or add `tests/review-<task-id>.spec.ts`) with `page.screenshot()` at key steps
4. **Open every PNG** — if wheels detached, wrong drive direction, or body floating → **rework in same pass** (do not Review)
5. Save PNGs to `review-artifacts/<TASK_ID>/` (e.g. `01-inspector-collider.png`, `02-play-mode.png`)
6. **Attach screenshots to the Notion task** (comment drag-drop or page embed)
7. List artifact paths + screenshot filenames in Review handoff comment

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
| `HAKU_TARGET_PATH` | Absolute path to target project (required for Playwright vehicle tests) |
| `HAKU_EDITOR_URL` | Default `http://localhost:5174` (editor-app dev) |
| `HAKU_PLATFORM_ROOT` | Monorepo root |

Editor must be running with target path configured (from **monorepo root**):

```bash
cd /Users/pavel/work/tree-js-projects
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm --filter @haku/editor-app dev
```

Or use the helper script:

```bash
.agents/tools/editor-playwright/scripts/run-target-editor.sh
```

Open the target project in the browser — **quote the URL in zsh** (`?` is a glob character):

```bash
open 'http://localhost:5174/?hakuOpenTarget=1'
```

Paste the same quoted URL into the address bar if you open manually.

Or let Playwright start the webServer (passes `HAKU_TARGET_PATH` automatically).

### Bootstrap status

Minimal harness lives at `.agents/tools/editor-playwright/`:

```bash
pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

First test: `tests/add-collider.spec.ts` — File → Demo Scene → select entity → Add Collider → Save.

Set `HAKU_SKIP_WEB_SERVER=1` when the dev server is already running.

**T01.39 smoke** (must `cd` into playwright folder or use script — running `pnpm exec` from `$HOME` causes `EPERM scandir ~/.Trash`):

```bash
cd /Users/pavel/work/tree-js-projects/.agents/tools/editor-playwright
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm exec playwright test tests/t01-39-vehicle-smoke.spec.ts
```

Or:

```bash
.agents/tools/editor-playwright/scripts/run-target-smoke.sh
```

**M1 alignment gate (mandatory before Review for vehicle tasks):**

```bash
cd .agents/tools/editor-playwright
HAKU_SKIP_WEB_SERVER=1 HAKU_TARGET_PATH=~/work/tmp-js-game-project \
  HAKU_EDITOR_URL=http://localhost:5174 \
  pnpm exec playwright test tests/m1-vehicle-alignment.spec.ts
```

See [M1_VERIFICATION.md](./raycast-vehicle/M1_VERIFICATION.md) for thresholds and visual checklist.

### Troubleshooting

| Error | Cause | Fix |
| ----- | ----- | --- |
| `zsh: no matches found: http://...?hakuOpenTarget=1` | Unquoted `?` in zsh | Use `open 'http://localhost:5174/?hakuOpenTarget=1'` |
| `EPERM scandir '/Users/pavel/.Trash'` | `pnpm` run outside a package directory | `cd` to monorepo root or `.agents/tools/editor-playwright` first |
| `ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND` | Same — no `package.json` in cwd | Same |
| Target scene empty / Demo Scene | Opened playground instead of target | Set `HAKU_TARGET_PATH` **before** `editor-app dev`; use `?hakuOpenTarget=1` or File → Open Project |

| Step | Selector / action |
| ---- | ----------------- |
| Load M1 scene | `openTargetProject(page)` → `/?hakuOpenTarget=1` |
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
