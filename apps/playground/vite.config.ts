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
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
  },
})
