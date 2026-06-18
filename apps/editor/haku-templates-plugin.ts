import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Plugin } from 'vite'

const templatesDir = resolve(__dirname, '../../packages/create/templates')

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json'
  if (path.endsWith('.html')) return 'text/html; charset=utf-8'
  if (path.endsWith('.ts')) return 'text/typescript; charset=utf-8'
  if (path.endsWith('.gitignore')) return 'text/plain; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) copyDir(srcPath, destPath)
    else cpSync(srcPath, destPath)
  }
}

export function hakuTemplatesPlugin(): Plugin {
  return {
    name: 'haku-templates',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0]
        if (!pathname?.startsWith('/haku-templates/')) {
          next()
          return
        }

        const relativePath = pathname.slice('/haku-templates/'.length)
        if (!relativePath || relativePath.includes('..')) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        try {
          const filePath = join(templatesDir, relativePath)
          const content = readFileSync(filePath)
          res.statusCode = 200
          res.setHeader('Content-Type', contentType(relativePath))
          res.end(content)
        } catch {
          next()
        }
      })
    },
    closeBundle() {
      const outDir = join(resolve(__dirname, 'dist'), 'haku-templates')
      if (existsSync(templatesDir)) {
        copyDir(templatesDir, outDir)
      }
    },
  }
}

export const HAKU_TEMPLATE_PATHS = [
  'haku.project.json',
  '.haku/editor.json',
  'package.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  '.gitignore',
  'src/main.ts',
  'scripts/player.ts',
  'public/assets/scenes/menu.scene.json',
] as const
