import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { playgroundAssetsManifestPlugin } from './playground-assets-manifest.js'
import { hakuTemplatesPlugin } from './haku-templates-plugin.js'
import { hakuTargetProjectPlugin } from './haku-target-project-plugin.js'

const playgroundAssetsRoot = resolve(__dirname, '../playground/public/assets')

export default defineConfig({
  plugins: [
    react(),
    playgroundAssetsManifestPlugin(playgroundAssetsRoot),
    hakuTargetProjectPlugin(),
    hakuTemplatesPlugin(),
  ],
  resolve: {
    alias: {
      '@haku/editor': resolve(__dirname, '../../packages/editor/src'),
      '@haku/engine': resolve(__dirname, '../../packages/engine/src'),
      '@haku/core': resolve(__dirname, '../../packages/core/src'),
      '@haku/schema': resolve(__dirname, '../../packages/schema/src'),
      '@haku/serializer': resolve(__dirname, '../../packages/serializer/src'),
      '@haku/physics': resolve(__dirname, '../../packages/physics/src'),
      '@haku/physics-rapier': resolve(__dirname, '../../packages/physics-rapier/src'),
    },
  },
  server: {
    port: 5174,
    fs: { allow: ['../..'] },
  },
  publicDir: resolve(__dirname, '../playground/public'),
})
