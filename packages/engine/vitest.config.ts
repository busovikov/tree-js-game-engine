import { defineConfig } from 'vitest/config'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@haku/schema': join(root, 'packages/schema/src'),
      '@haku/core': join(root, 'packages/core/src'),
      '@haku/serializer': join(root, 'packages/serializer/src'),
      '@haku/physics': join(root, 'packages/physics/src'),
    },
  },
})
