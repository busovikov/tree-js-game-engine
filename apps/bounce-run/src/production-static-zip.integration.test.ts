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
import { dirname, join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateProjectManifest } from '@haku/assets'
import { createBrowserStaticExportZip } from '@haku/build'
import { loadProjectPrefabAssets } from '@haku/engine'
import { projectPathToUrl } from '@haku/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import projectAsset from '../haku.project.json'
import { loadBounceRunUIDocument } from './ui-document.js'

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPOSITORY_ROOT = join(APP_ROOT, '../..')
const DIST_ROOT = join(APP_ROOT, 'dist')
const NESTED_ARCHIVE_PATH = 'deployments/preview/v1'

let temporaryRoot: string
let extractedRoot: string
let archivePath: string
let archive: Uint8Array
let productionFiles: Map<string, Uint8Array>

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
  return [
    ...html.matchAll(
      /<(?:script|link|img|source|audio|video)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi,
    ),
  ].map((match) => match[1]!)
}

function storedEntryMetadata(zip: Uint8Array): Array<{
  path: string
  dosTime: number
  dosDate: number
}> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const decoder = new TextDecoder()
  const entries: Array<{ path: string; dosTime: number; dosDate: number }> = []
  let offset = 0
  while (view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    entries.push({
      path: decoder.decode(zip.subarray(nameStart, nameStart + nameLength)),
      dosTime: view.getUint16(offset + 10, true),
      dosDate: view.getUint16(offset + 12, true),
    })
    offset = nameStart + nameLength + extraLength + compressedSize
  }
  return entries
}

function centralUnixModes(zip: Uint8Array): number[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const endOffset = zip.byteLength - 22
  const modes: number[] = []
  let offset = view.getUint32(endOffset + 16, true)
  while (view.getUint32(offset, true) === 0x02014b50) {
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    modes.push(view.getUint32(offset + 38, true) >>> 16)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return modes
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

    productionFiles = emittedFiles(DIST_ROOT)
    archive = createBrowserStaticExportZip(productionFiles)
    archivePath = join(temporaryRoot, 'bounce-run.zip')
    writeFileSync(archivePath, archive)
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
      const resolvedPath = resolve(extractedRoot, url)
      expect(resolvedPath.startsWith(`${extractedRoot}${sep}`)).toBe(true)
      expect(statSync(resolvedPath).isFile()).toBe(true)
    }
  })

  it('declares a relative favicon instead of requesting the server root implicitly', () => {
    const html = readFileSync(join(extractedRoot, 'index.html'), 'utf8')
    const faviconUrl = html.match(
      /<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']([^"']+)["']/i,
    )?.[1]

    expect(faviconUrl).toBe('./favicon.svg')
    expect(statSync(resolve(extractedRoot, faviconUrl!)).isFile()).toBe(true)
  })

  it('resolves the production scene, prefab, and HUD below the nested archive root', async () => {
    const manifest = validateProjectManifest(projectAsset)
    const requestedUrls = [projectPathToUrl(`${manifest.assetsDir}/scenes/main.scene.json`)]
    const recordMissingRequest = async (path: string) => {
      requestedUrls.push(path)
      return { ok: false, json: async () => ({}) }
    }

    await expect(loadProjectPrefabAssets(manifest, recordMissingRequest)).rejects.toThrow(
      'Failed to load prefab asset',
    )
    await expect(loadBounceRunUIDocument(recordMissingRequest)).rejects.toThrow(
      'Failed to load Bounce Run HUD',
    )

    expect(requestedUrls).toEqual([
      './assets/scenes/main.scene.json',
      './assets/prefabs/platform.prefab.json',
      './assets/ui/hud.ui.json',
    ])
  })

  it('contains only the reachable emitted production inventory', () => {
    const entries = storedEntryMetadata(archive).map(({ path }) => path)

    expect(entries).toEqual([
      'index.html',
      expect.stringMatching(/^assets\/index-[A-Za-z0-9_-]+\.js$/),
      'assets/prefabs/platform.prefab.json',
      'assets/scenes/main.scene.json',
      'assets/ui/hud.ui.json',
      'favicon.svg',
    ])
    expect(entries).toEqual([
      'index.html',
      ...[...productionFiles.keys()].filter((path) => path !== 'index.html').sort(),
    ])
    for (const path of entries) {
      expect(path).toBe(posix.normalize(path))
      expect(path).not.toMatch(/^(?:\/|.*(?:^|\/)\.\.(?:\/|$))/)
      expect(path).not.toMatch(/(?:^|\/)(?:src|node_modules|\.haku|\.vite)(?:\/|$)/)
      expect(path).not.toMatch(/\.(?:[cm]?tsx?|map|d\.ts)$/)
    }
  })

  it('is deterministic and portable and passes unzip integrity validation', () => {
    const integrity = spawnSync('unzip', ['-t', archivePath], { encoding: 'utf8' })
    expect(integrity.status, `${integrity.stdout}\n${integrity.stderr}`).toBe(0)
    expect(integrity.stdout).toContain('No errors detected')

    const metadata = storedEntryMetadata(archive)
    expect(metadata.every(({ dosTime }) => dosTime === 0)).toBe(true)
    expect(metadata.every(({ dosDate }) => dosDate === 0x0021)).toBe(true)
    expect(centralUnixModes(archive)).toEqual(metadata.map(() => 0o100644))
    expect(createBrowserStaticExportZip(new Map([...productionFiles].reverse()))).toEqual(archive)
  })

  it('contains no external runtime URL or production-only exclusion markers', () => {
    const textFiles = [...productionFiles.entries()]
      .filter(([path]) => /\.(?:html|css|js|json)$/.test(path))
      .map(([, contents]) => new TextDecoder().decode(contents))
      .join('\n')

    expect(textFiles).not.toMatch(
      /(?:src|href)=["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|(?:fetch|import)\(\s*["'](?:https?:)?\/\//i,
    )
    for (const marker of [
      '@haku/editor',
      '@xyflow/react',
      'react-dom',
      'monaco-editor',
      'InspectorPanel',
      'UIDocumentEditorPanel',
      'SandboxedCustomWidget',
      'haku-inspector',
      '__HAKU_BOUNCE_RUN_QA_V1__',
      'hakuBounceRunConsoleCollector',
      'hakuBounceRunFetchCollector',
      'hakuBounceRunQaDomBridge',
      'sourceMappingURL',
      'esbuild.wasm',
      '/@vite/client',
      'cdn.jsdelivr.net',
      'unpkg.com',
    ]) {
      expect(textFiles, `production archive contains ${marker}`).not.toContain(marker)
    }
  })
})
