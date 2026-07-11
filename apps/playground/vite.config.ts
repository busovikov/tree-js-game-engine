import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    target: 'es2022',
  },
  resolve: {
    alias: {
      '@haku/engine': resolve(__dirname, '../../packages/engine/src'),
      '@haku/core': resolve(__dirname, '../../packages/core/src'),
      '@haku/schema': resolve(__dirname, '../../packages/schema/src'),
      '@haku/serializer': resolve(__dirname, '../../packages/serializer/src'),
      '@haku/physics': resolve(__dirname, '../../packages/physics/src'),
      '@haku/physics-rapier': resolve(__dirname, '../../packages/physics-rapier/src'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
  },
})
