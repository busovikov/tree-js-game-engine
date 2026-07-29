import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, normalize, resolve, sep } from 'node:path'
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
  if (fullPath !== root && !fullPath.startsWith(`${root}${sep}`)) return null
  return fullPath
}

export async function writeTargetTextFile(
  targetRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const filePath = resolveTargetFile(targetRoot, relativePath)
  if (!filePath || filePath === normalize(resolve(targetRoot))) {
    throw new Error('Invalid target path')
  }
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

async function collectTargetWorkspaceFiles(
  targetRoot: string,
  relativeDirectory: string,
  files: Record<string, string>,
): Promise<void> {
  const directoryPath = resolveTargetFile(targetRoot, relativeDirectory)
  if (!directoryPath) return
  let entries
  try {
    entries = await readdir(directoryPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `${relativeDirectory}/${entry.name}`.replace(/^\/+/, '')
    if (entry.isDirectory()) {
      await collectTargetWorkspaceFiles(targetRoot, relativePath, files)
    } else if (/\.[cm]?tsx?$/.test(entry.name)) {
      const filePath = resolveTargetFile(targetRoot, relativePath)
      if (filePath) files[relativePath] = await readFile(filePath, 'utf8')
    }
  }
}

export async function scanTargetWorkspaceFiles(
  targetRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const files: Record<string, string> = {}
  await collectTargetWorkspaceFiles(targetRoot, '.haku/generated', files)
  await collectTargetWorkspaceFiles(targetRoot, 'src', files)
  const indexPath = resolveTargetFile(targetRoot, 'index.html')
  if (indexPath) {
    try {
      files['index.html'] = await readFile(indexPath, 'utf8')
    } catch {
      // Projects without a static-export shell can still use the Code workspace.
    }
  }
  const tsconfigPath = resolveTargetFile(targetRoot, 'tsconfig.json')
  if (tsconfigPath) {
    try {
      files['tsconfig.json'] = await readFile(tsconfigPath, 'utf8')
    } catch {
      // A target without tsconfig is valid; the editor generates one.
    }
  }
  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
  )
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

  if (pathname === '/__haku/dev/workspace.json') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ files: await scanTargetWorkspaceFiles(targetRoot) }))
    return true
  }

  if (pathname === '/__haku/dev/file') {
    const relativePath = req.headers['x-haku-file-path']
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      res.statusCode = 400
      res.end('Missing X-Haku-File-Path header')
      return true
    }

    if (req.method === 'GET') {
      const filePath = resolveTargetFile(targetRoot, relativePath)
      if (!filePath || filePath === normalize(resolve(targetRoot))) {
        res.statusCode = 400
        res.end('Invalid target path')
        return true
      }
      try {
        const stats = statSync(filePath)
        if (!stats.isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return true
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.setHeader('X-Haku-Last-Modified', String(stats.mtimeMs))
        res.setHeader('X-Haku-File-Size', String(stats.size))
        res.end(await readFile(filePath, 'utf8'))
      } catch {
        res.statusCode = 404
        res.end('Not found')
      }
      return true
    }

    if (req.method === 'PUT') {
      await writeTargetTextFile(targetRoot, relativePath, await readRequestBody(req))
      res.statusCode = 204
      res.end()
      return true
    }

    res.statusCode = 405
    res.end('Method not allowed')
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
