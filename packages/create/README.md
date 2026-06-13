# @haku/create

Scaffold standalone haku game projects.

## Usage

```bash
# From monorepo (local dev)
pnpm --filter @haku/create exec create-haku ../my-game --name my-game

# With local engine link
pnpm --filter @haku/create exec create-haku ../my-game --engine-version "file:../tree-js-projects/packages/engine"
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
