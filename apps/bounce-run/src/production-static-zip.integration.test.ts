import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBrowserStaticExportZip } from '@haku/build'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = join(APP_ROOT, '../..')
const DIST_ROOT = join(APP_ROOT, 'dist')
const NESTED_ARCHIVE_PATH = 'deployments/preview/v1'

let temporaryRoot: string
let extractedRoot: string

function emittedFiles(directory: string, root = directory): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const name of readdirSync(directory).sort()) {
    const absolutePath = join(directory, name)
    if (statSync(absolutePath).isDirectory()) {
      for (const [path, contents] of emittedFiles(absolutePath, root)) {
        files.set(path, contents)
      }
      continue
    }
    files.set(relative(root, absolutePath), readFileSync(absolutePath))
  }
  return files
}

function htmlAssetUrls(html: string): string[] {
  return [...html.matchAll(/<(?:script|link|img|source|audio|video)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
    .map((match) => match[1]!)
}

describe('Bounce Run production static ZIP', () => {
  beforeAll(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'haku-bounce-run-static-zip-'))
    extractedRoot = join(temporaryRoot, NESTED_ARCHIVE_PATH)
    mkdirSync(extractedRoot, { recursive: true })

    const build = spawnSync('pnpm', ['--filter', '@haku/bounce-run', 'build'], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: 'production' },
    })
    if (build.status !== 0) {
      throw new Error(`${build.stdout}\n${build.stderr}`)
    }

    const archivePath = join(temporaryRoot, 'bounce-run.zip')
    writeFileSync(archivePath, createBrowserStaticExportZip(emittedFiles(DIST_ROOT)))
    const extraction = spawnSync('unzip', ['-q', archivePath, '-d', extractedRoot], {
      encoding: 'utf8',
    })
    if (extraction.status !== 0) {
      throw new Error(`${extraction.stdout}\n${extraction.stderr}`)
    }
  }, 60_000)

  afterAll(() => {
    rmSync(temporaryRoot, { recursive: true, force: true })
  })

  it('keeps every emitted HTML asset URL inside the extracted nested archive root', () => {
    const html = readFileSync(join(extractedRoot, 'index.html'), 'utf8')
    const urls = htmlAssetUrls(html)

    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url, `${url} must be relative to the extracted archive root`).toMatch(/^\.\//)
    }
  })
})
