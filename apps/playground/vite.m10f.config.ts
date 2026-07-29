import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname),
  publicDir: false,
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'm10f-diagnostic.html'),
    },
  },
  optimizeDeps: {
    entries: ['m10f-diagnostic.html'],
  },
  resolve: {
    alias: {
      '@haku/core': resolve(__dirname, '../../packages/core/src'),
      '@haku/pool': resolve(__dirname, '../../packages/pool/src'),
      '@haku/schema': resolve(__dirname, '../../packages/schema/src'),
    },
  },
  server: {
    fs: { allow: ['../..'] },
  },
})
