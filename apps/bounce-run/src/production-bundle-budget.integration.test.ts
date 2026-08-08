import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = join(APP_ROOT, '../..')
const DIST_ROOT = join(APP_ROOT, 'dist')
const TOTAL_MINIFIED_LIMIT = 3_500_000
const TOTAL_GZIP_LIMIT = 1_200_000
const PRODUCTION_EXCLUSIONS = [
  'haku:bounce-run:qa-harness:v1',
  'haku:bounce-run:qa-report:v1',
  'haku:bounce-run:qa-observations:v1',
  'haku:bounce-run:qa-replay:v1',
  '__HAKU_BOUNCE_RUN_QA_V1__',
  'hakuBounceRunConsoleCollector',
  'hakuBounceRunFetchCollector',
  'hakuBounceRunQaDomBridge',
  '@haku/editor',
  '@xyflow/react',
  'react-dom',
  'monaco-editor',
  'InspectorPanel',
  'UIDocumentEditorPanel',
  'SandboxedCustomWidget',
  'haku-inspector',
  'sourceMappingURL',
  'esbuild.wasm',
  '/@vite/client',
  'cdn.jsdelivr.net',
  'unpkg.com',
] as const

function moduleScriptPaths(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+\.js)["']/gi)]
    .map((match) => match[1]!)
    .map((path) => posix.normalize(path.replace(/^\.\//, '')))
}

function importedJavaScriptPaths(source: string, importer: string): string[] {
  const imports = [
    ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+\.js)["']/g),
    ...source.matchAll(/\bimport\s*["']([^"']+\.js)["']/g),
  ]
  return imports.map((match) => posix.normalize(posix.join(posix.dirname(importer), match[1]!)))
}

describe('Bounce Run production bundle budget', () => {
  it('splits the reachable runtime within measured production budgets and exclusions', () => {
    const build = spawnSync('pnpm', ['--filter', '@haku/bounce-run', 'build'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0)

    const assetsDirectory = join(DIST_ROOT, 'assets')
    const chunks = new Map(
      readdirSync(assetsDirectory)
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => {
          const path = `assets/${name}`
          return [path, readFileSync(join(assetsDirectory, name))] as const
        }),
    )
    const inventory = [...chunks].map(([path, contents]) => {
      const gzipBytes = gzipSync(contents).byteLength
      return `${path}: ${(contents.byteLength / 1_000).toFixed(2)} kB / ${(gzipBytes / 1_000).toFixed(2)} kB gzip`
    })
    const reachable = new Set(moduleScriptPaths(readFileSync(join(DIST_ROOT, 'index.html'), 'utf8')))
    const pending = [...reachable]
    while (pending.length > 0) {
      const path = pending.shift()!
      const contents = chunks.get(path)
      expect(contents, `HTML/import graph references missing JavaScript ${path}`).toBeDefined()
      for (const importedPath of importedJavaScriptPaths(contents!.toString('utf8'), path)) {
        if (!reachable.has(importedPath)) {
          reachable.add(importedPath)
          pending.push(importedPath)
        }
      }
    }

    expect([...reachable].sort(), 'every emitted JavaScript chunk must be reachable').toEqual([
      ...chunks.keys(),
    ])
    expect(
      reachable.size,
      `production runtime must have at least two reachable chunks\n${inventory.join('\n')}`,
    ).toBeGreaterThanOrEqual(2)

    const totalMinified = [...chunks.values()].reduce((total, contents) => total + contents.byteLength, 0)
    const totalGzip = [...chunks.values()].reduce(
      (total, contents) => total + gzipSync(contents).byteLength,
      0,
    )
    expect(totalMinified, inventory.join('\n')).toBeLessThanOrEqual(TOTAL_MINIFIED_LIMIT)
    expect(totalGzip, inventory.join('\n')).toBeLessThanOrEqual(TOTAL_GZIP_LIMIT)

    for (const [path, contents] of chunks) {
      const source = contents.toString('utf8')
      for (const marker of PRODUCTION_EXCLUSIONS) {
        expect(source, `${path} contains production exclusion ${marker}`).not.toContain(marker)
      }
      expect(source, `${path} contains a remote runtime URL`).not.toMatch(
        /(?:fetch|import)\(\s*["'](?:https?:)?\/\//i,
      )
    }
  }, 60_000)
})
