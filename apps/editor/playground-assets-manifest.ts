import { appendFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const ASSETS_DIR = 'public/assets'
const IGNORED_NAMES = new Set(['.DS_Store', 'manifest.json'])
const IMPORT_PATH_HEADER = 'x-haku-asset-path'

function relativeToAssetsDir(assetPath: string): string | null {
  const normalized = assetPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const prefix = `${ASSETS_DIR}/`
  if (!normalized.startsWith(prefix)) return null
  return normalized.slice(prefix.length) || null
}

function resolveAssetWritePath(assetsRoot: string, assetPath: string): string | null {
  const relativePath = relativeToAssetsDir(assetPath)
  if (!relativePath || relativePath.includes('..')) return null

  const fullPath = normalize(join(assetsRoot, relativePath))
  if (!fullPath.startsWith(normalize(assetsRoot))) return null
  return fullPath
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

async function handleAssetImport(
  assetsRoot: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  const assetPath = req.headers[IMPORT_PATH_HEADER]
  if (typeof assetPath !== 'string' || !assetPath) {
    res.statusCode = 400
    res.end('Missing X-Haku-Asset-Path header')
    return
  }

  const fullPath = resolveAssetWritePath(assetsRoot, assetPath)
  if (!fullPath) {
    res.statusCode = 400
    res.end('Invalid asset path')
    return
  }

  const body = await readRequestBody(req)
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, body)

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ path: assetPath, bytes: body.byteLength }))
}

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
  const playgroundRoot = resolve(assetsRoot, '../..')
  const playgroundLogPath = join(playgroundRoot, 'logs/haku.log')

  return {
    name: 'playground-assets-manifest',
    async buildStart() {
      await writePlaygroundAssetsManifest(assetsRoot)
    },
    configureServer(server) {
      server.watcher.add(assetsRoot)

      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]

        if (pathname === '/__haku/assets/import') {
          try {
            await handleAssetImport(assetsRoot, req, res)
          } catch (error) {
            res.statusCode = 500
            res.end(error instanceof Error ? error.message : 'Import failed')
          }
          return
        }

        if (pathname === '/__haku/log/append' && req.method === 'POST') {
          try {
            const body = await readRequestBody(req)
            await mkdir(dirname(playgroundLogPath), { recursive: true })
            await appendFile(playgroundLogPath, body)
            res.statusCode = 204
            res.end()
          } catch (error) {
            res.statusCode = 500
            res.end(error instanceof Error ? error.message : 'Log append failed')
          }
          return
        }

        if (pathname !== '/assets/manifest.json') {
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
