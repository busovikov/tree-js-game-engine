import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@dimforge/rapier3d-compat/')) return 'rapier-runtime'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@haku/assets': resolve(__dirname, '../../packages/assets/src'),
      '@haku/core': resolve(__dirname, '../../packages/core/src'),
      '@haku/engine': resolve(__dirname, '../../packages/engine/src'),
      '@haku/graph': resolve(__dirname, '../../packages/graph/src'),
      '@haku/graph-runtime': resolve(__dirname, '../../packages/graph-runtime/src'),
      '@haku/pool': resolve(__dirname, '../../packages/pool/src'),
      '@haku/schema': resolve(__dirname, '../../packages/schema/src'),
      '@haku/serializer': resolve(__dirname, '../../packages/serializer/src'),
      '@haku/physics': resolve(__dirname, '../../packages/physics/src'),
      '@haku/physics-rapier': resolve(__dirname, '../../packages/physics-rapier/src'),
      '@haku/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    port: 5191,
    fs: { allow: ['../..'] },
  },
})
