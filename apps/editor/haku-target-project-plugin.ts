import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname, join, normalize, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { scanPlaygroundAssets } from './playground-assets-manifest.js'

/** Relative path inside the open target project (NDJSON, one record per line). */
export const HAKU_VEHICLE_LOG_RELATIVE_PATH = '.haku/vehicle-physics.ndjson'

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

function resolveTargetPath(): string | null {
  const raw = process.env.HAKU_TARGET_PATH?.trim()
  if (!raw) return null
  return resolve(raw.replace(/^~(?=$|\/)/, process.env.HOME ?? ''))
}

function resolveTargetFile(targetRoot: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/^\/+/, '').replace(/\\/g, '/')
  if (normalized.includes('..')) return null
  const fullPath = normalize(resolve(targetRoot, normalized))
  const root = normalize(resolve(targetRoot))
  if (!fullPath.startsWith(root)) return null
  return fullPath
}

function vehicleLogPath(targetRoot: string): string {
  return join(targetRoot, HAKU_VEHICLE_LOG_RELATIVE_PATH)
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sendFile(res: ServerResponse, filePath: string): void {
  const body = readFileSync(filePath)
  const ext = extname(filePath).toLowerCase()
  res.statusCode = 200
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
  res.end(body)
}

async function handleDevRequest(
  targetRoot: string,
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (pathname === '/__haku/dev/vehicle-log') {
    const logPath = vehicleLogPath(targetRoot)
    await mkdir(join(targetRoot, '.haku'), { recursive: true })

    if (req.method === 'GET') {
      try {
        const content = await readFile(logPath, 'utf8')
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
        res.end(content)
      } catch {
        res.statusCode = 404
        res.end('')
      }
      return true
    }

    if (req.method === 'DELETE') {
      await writeFile(logPath, '')
      res.statusCode = 204
      res.end()
      return true
    }

    if (req.method === 'POST') {
      const body = await readRequestBody(req)
      if (!body.trim()) {
        res.statusCode = 400
        res.end('Empty body')
        return true
      }
      await appendFile(logPath, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
      res.statusCode = 204
      res.end()
      return true
    }

    res.statusCode = 405
    res.end('Method not allowed')
    return true
  }

  if (pathname === '/__haku/dev/info') {
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        rootName: basename(targetRoot),
        targetPath: targetRoot,
      }),
    )
    return true
  }

  if (pathname === '/__haku/dev/project.json') {
    sendFile(res, join(targetRoot, 'haku.project.json'))
    return true
  }

  if (pathname === '/__haku/dev/assets/manifest.json') {
    const assetsRoot = join(targetRoot, 'public/assets')
    const files = await scanPlaygroundAssets(assetsRoot)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ files }))
    return true
  }

  if (pathname.startsWith('/__haku/dev/assets/')) {
    const assetsRelative = pathname.slice('/__haku/dev/assets/'.length)
    const filePath = resolveTargetFile(targetRoot, join('public/assets', assetsRelative))
    if (!filePath) {
      res.statusCode = 400
      res.end('Invalid asset path')
      return true
    }
    try {
      if (!statSync(filePath).isFile()) {
        res.statusCode = 404
        res.end('Not found')
        return true
      }
      sendFile(res, filePath)
      return true
    } catch {
      res.statusCode = 404
      res.end('Not found')
      return true
    }
  }

  return false
}

/** Dev-only: serve TARGET_PATH project files when HAKU_TARGET_PATH is set. */
export function hakuTargetProjectPlugin(): Plugin {
  const targetRoot = resolveTargetPath()

  return {
    name: 'haku-target-project',
    configureServer(server) {
      if (!targetRoot) return

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const pathname = req.url?.split('?')[0]
        if (!pathname?.startsWith('/__haku/dev/')) {
          next()
          return
        }

        try {
          const handled = await handleDevRequest(targetRoot, pathname, req, res)
          if (!handled) {
            res.statusCode = 404
            res.end('Not found')
          }
        } catch (error) {
          res.statusCode = 500
          res.end(error instanceof Error ? error.message : 'Dev target request failed')
        }
      })
    },
  }
}
