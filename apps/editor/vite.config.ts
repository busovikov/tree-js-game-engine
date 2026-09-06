import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { playgroundAssetsManifestPlugin } from './playground-assets-manifest.js'
import { hakuTemplatesPlugin } from './haku-templates-plugin.js'
import { hakuTargetProjectPlugin } from './haku-target-project-plugin.js'

const playgroundAssetsRoot = resolve(__dirname, '../playground/public/assets')

export function createEditorViteConfig(targetPath = process.env.HAKU_TARGET_PATH): UserConfig {
  const hasTargetProject = Boolean(targetPath?.trim())

  return {
    plugins: [
      react(),
      ...(hasTargetProject ? [] : [playgroundAssetsManifestPlugin(playgroundAssetsRoot)]),
      hakuTargetProjectPlugin(),
      hakuTemplatesPlugin(),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@haku/editor': resolve(__dirname, '../../packages/editor/src'),
        '@haku/build': resolve(__dirname, '../../packages/build/src'),
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
    publicDir: hasTargetProject ? false : resolve(__dirname, '../playground/public'),
  }
}

export default defineConfig(createEditorViteConfig())
