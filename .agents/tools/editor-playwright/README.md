# Editor Playwright Harness

Agent workflow tooling for driving `@haku/editor-app` during reference-driven `TARGET_BUILD` tasks.

## Setup

```bash
cd .agents/tools/editor-playwright
pnpm install
pnpm exec playwright install chromium
```

## Run tests

From monorepo root (starts editor-app dev server automatically):

```bash
pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

With an already-running dev server:

```bash
HAKU_SKIP_WEB_SERVER=1 pnpm exec playwright test -c .agents/tools/editor-playwright/playwright.config.ts
```

## Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `HAKU_EDITOR_URL` | `http://localhost:5174` | Editor dev server URL |
| `HAKU_SKIP_WEB_SERVER` | unset | Skip auto-starting `pnpm --filter @haku/editor-app dev` |

## Selectors

| Action | Selector |
| ------ | -------- |
| Load demo scene | File → Demo Scene |
| Add Collider | `[data-testid="add-component-collider"]` |
| Hierarchy row | `.haku-hierarchy-row` (first entity) |
| Save scene | File → Save |

## Troubleshooting

- Ensure `pnpm install` at monorepo root first.
- Demo scene load fetches `/assets/manifest.json` — editor-app must serve playground public assets (vite `publicDir`).
- Playwright test mutates in-memory playground scene; refresh reloads from bundled JSON.
