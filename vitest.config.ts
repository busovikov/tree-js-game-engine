import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default {
  test: {
    include: ['packages/**/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@haku/schema': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/schema/src'),
      '@haku/core': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/core/src'),
      '@haku/serializer': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/serializer/src'),
      '@haku/engine': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/engine/src'),
      '@haku/physics': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/physics/src'),
    },
  },
}
