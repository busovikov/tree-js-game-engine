# Editor Playwright Harness

Agent workflow tooling for driving `@haku/editor-app` during reference-driven `TARGET_BUILD` tasks.

**AD-09:** Vehicle/M1 verification uses the **target project** (`HAKU_TARGET_PATH`), not Demo Scene.

## Setup

```bash
cd /Users/pavel/work/tree-js-projects/.agents/tools/editor-playwright
pnpm install
pnpm exec playwright install chromium
```

## Run tests

From playwright folder (required — do not run from `$HOME`):

```bash
cd /Users/pavel/work/tree-js-projects/.agents/tools/editor-playwright
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm exec playwright test tests/t01-39-vehicle-smoke.spec.ts
```

Or helper script from anywhere:

```bash
/Users/pavel/work/tree-js-projects/.agents/tools/editor-playwright/scripts/run-target-smoke.sh
```

From monorepo root with config path:

```bash
cd /Users/pavel/work/tree-js-projects
pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

With an already-running dev server:

```bash
HAKU_SKIP_WEB_SERVER=1 HAKU_TARGET_PATH=~/work/tmp-js-game-project \
  pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

## Manual editor + target project

Terminal 1:

```bash
cd /Users/pavel/work/tree-js-projects
HAKU_TARGET_PATH=~/work/tmp-js-game-project pnpm --filter @haku/editor-app dev
```

Terminal 2 (or browser) — **quote URL in zsh**:

```bash
open 'http://localhost:5174/?hakuOpenTarget=1'
```

Alternative: File → Open Project → `~/work/tmp-js-game-project`

## Vehicle physics log (target project)

Play mode writes NDJSON to **`<HAKU_TARGET_PATH>/.haku/vehicle-physics.ndjson`** (not browser console).

| Action | Path / API |
| ------ | ---------- |
| Log file | `.haku/vehicle-physics.ndjson` in open target project |
| Dev HTTP | `GET/POST/DELETE /__haku/dev/vehicle-log` (editor vite, `HAKU_TARGET_PATH` set) |
| Playwright read | `helpers/vehicle-log-file.ts` → `readVehicleLogFile()` |

```bash
tail -f ~/work/tmp-js-game-project/.haku/vehicle-physics.ndjson
```

## Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `HAKU_TARGET_PATH` | `~/work/tmp-js-game-project` | Target game project path |
| `HAKU_EDITOR_URL` | `http://localhost:5174` | Editor dev server URL |
| `HAKU_SKIP_WEB_SERVER` | unset | Skip auto-starting editor-app dev |

## Selectors

| Action | Selector |
| ------ | -------- |
| Open target (Playwright) | `openTargetProject` → `/?hakuOpenTarget=1` |
| Add Collider | `[data-testid="add-component-collider"]` |
| Hierarchy row | `.haku-hierarchy-row` |
| Save scene | File → Save |
| Play mode | `getByRole('button', { name: /Play/ })` |

## Troubleshooting

- **`EPERM scandir ~/.Trash`** — run `pnpm` from monorepo or `.agents/tools/editor-playwright`, not from `$HOME`.
- **`zsh: no matches found: http://...?...`** — wrap URL in single quotes: `'http://localhost:5174/?hakuOpenTarget=1'`.
- **`pnpm install` at monorepo root** before first run.
