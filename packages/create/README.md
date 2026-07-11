# @haku/create

Scaffold standalone haku game projects.

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
