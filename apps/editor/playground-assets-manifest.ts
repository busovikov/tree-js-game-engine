import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

const IGNORED_NAMES = new Set(['.DS_Store', 'manifest.json'])

export async function scanPlaygroundAssets(assetsRoot: string): Promise<string[]> {
  const files: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_NAMES.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        files.push(relative(assetsRoot, fullPath).split('\\').join('/'))
      }
    }
  }

  await walk(assetsRoot)
  return files.sort((a, b) => a.localeCompare(b))
}

export async function writePlaygroundAssetsManifest(assetsRoot: string): Promise<string[]> {
  const { writeFile } = await import('node:fs/promises')
  const files = await scanPlaygroundAssets(assetsRoot)
  await writeFile(join(assetsRoot, 'manifest.json'), `${JSON.stringify({ files }, null, 2)}\n`)
  return files
}

export function playgroundAssetsManifestPlugin(assetsRoot: string): Plugin {
  return {
    name: 'playground-assets-manifest',
    async buildStart() {
      await writePlaygroundAssetsManifest(assetsRoot)
    },
    configureServer(server) {
      server.watcher.add(assetsRoot)

      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/assets/manifest.json') {
          next()
          return
        }

        try {
          const files = await scanPlaygroundAssets(assetsRoot)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ files }))
        } catch (error) {
          next(error)
        }
      })
    },
  }
}
