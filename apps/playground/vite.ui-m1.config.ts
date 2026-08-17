import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist/ui-m1',
    emptyOutDir: true,
    rollupOptions: { input: resolve(__dirname, 'ui-m1-runtime.html') },
  },
  server: {
    port: 41731,
    strictPort: true,
    fs: { allow: ['../..'] },
  },
})
