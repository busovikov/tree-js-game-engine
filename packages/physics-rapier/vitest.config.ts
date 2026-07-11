import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@haku/physics': join(
        fileURLToPath(new URL('.', import.meta.url)),
        '../physics/src',
      ),
    },
  },
})
