# @haku/create

Scaffold standalone, engine-only Haku game projects. Generated games import public APIs from
`@haku/engine/runtime` and `@haku/assets`; they do not depend on the editor, React, QA code,
CDNs, or a runtime server.

## Usage

```bash
# From monorepo (local dev) — parent dir + project name
pnpm --filter @haku/create run create-haku -- ../my-game-parent --name my-game

# With local engine link (auto-wires schema, core, serializer, physics via pnpm overrides)
pnpm --filter @haku/create run create-haku -- .. --name my-game \
  --engine-version "file:/absolute/path/to/tree-js-projects/packages/engine"
```

## API

```typescript
import { createHakuProject } from '@haku/create'

await createHakuProject({
  targetDir: '../',
  name: 'my-game',
  engineVersion: 'file:../tree-js-projects/packages/engine',
})
```

## Generated project

The scaffold keeps project asset URLs and Vite's production base relative, so the result can
be hosted below any path. `haku.project.json` is the UUID asset inventory, `src/main.ts` is the
public runtime composition root, and `scripts/` holds project TypeScript algorithms used by
graphs or component behaviors.

```bash
cd my-game
pnpm typecheck
pnpm dev
pnpm build
pnpm preview
```

`pnpm build` writes `dist/`. Serve that directory with a simple static HTTP server; `file://`
is not a supported deployment target. Runtime URLs stay relative and the scaffold has no
editor, QA, CDN, or server-side coupling.
