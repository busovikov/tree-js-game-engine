import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export default {
  test: {
    include: [
      'packages/**/src/**/*.test.ts',
      'packages/**/src/**/*.test.tsx',
      'apps/**/src/**/*.test.ts',
      'apps/**/src/**/*.test.tsx',
    ],
  },
  resolve: {
    alias: {
      '@haku/schema': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/schema/src'),
      '@haku/assets': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/assets/src'),
      '@haku/build': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/build/src'),
      '@haku/graph': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/graph/src'),
      '@haku/graph-runtime': join(
        fileURLToPath(new URL('.', import.meta.url)),
        'packages/graph-runtime/src',
      ),
      '@haku/pool': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/pool/src'),
      '@haku/core': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/core/src'),
      '@haku/serializer': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/serializer/src'),
      '@haku/engine': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/engine/src'),
      '@haku/physics': join(fileURLToPath(new URL('.', import.meta.url)), 'packages/physics/src'),
      '@haku/physics-rapier': join(
        fileURLToPath(new URL('.', import.meta.url)),
        'packages/physics-rapier/src',
      ),
    },
  },
}
