export type BrowserStaticExportContents = string | Uint8Array

export interface BrowserStaticExportInputFile {
  readonly path: string
  readonly contents: BrowserStaticExportContents
}

export interface BrowserStaticExportRequest {
  readonly entryHtmlPath: string
  readonly files: readonly BrowserStaticExportInputFile[]
  readonly manifest?: ProjectManifest
  /**
   * Worker-produced ESM. When omitted, the entry source is already-valid JavaScript and is
   * used directly; browser callers compile TypeScript in BrowserStaticExportClient first.
   */
  readonly compiledEntry?: string
}

export interface BrowserStaticExportResult {
  readonly files: ReadonlyMap<string, BrowserStaticExportContents>
}

export type BrowserStaticExportSourceKind = 'graph' | 'type' | 'code' | 'ui'

export interface BrowserStaticExportSourceLocation {
  readonly kind: BrowserStaticExportSourceKind
  readonly path: string
  readonly line?: number
  readonly column?: number
  readonly graphId?: string
  readonly nodeId?: string
  readonly typeId?: string
  readonly uiDocumentId?: string
  readonly uiElementId?: string
}

export interface BrowserStaticExportDiagnostic {
  readonly code: 'build.failed' | 'export.invalid' | 'trust.untrusted-code'
  readonly severity: 'error'
  readonly message: string
  readonly source?: BrowserStaticExportSourceLocation
}

export type BrowserStaticExportWorkerResult =
  | {
      readonly ok: true
      readonly files: ReadonlyMap<string, BrowserStaticExportContents>
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly BrowserStaticExportDiagnostic[]
    }

const ENTRY_OUTPUT_PATH = 'assets/runtime.js'
const TEXT_DECODER = new TextDecoder()

function normalizeProjectPath(path: string): string {
  const normalized: string[] = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (normalized.length === 0) {
        throw new Error(`Path escapes the project boundary: ${path}`)
      }
      normalized.pop()
      continue
    }
    normalized.push(segment)
  }
  if (normalized.length === 0) throw new Error(`Invalid project path: ${path}`)
  return normalized.join('/')
}

function directory(path: string): string {
  const separator = path.lastIndexOf('/')
  return separator === -1 ? '' : path.slice(0, separator)
}

function relativePath(fromFile: string, toFile: string): string {
  const from = directory(fromFile).split('/').filter(Boolean)
  const to = toFile.split('/').filter(Boolean)
  while (from[0] === to[0]) {
    from.shift()
    to.shift()
  }
  const relative = `${from.map(() => '..').join('/')}${from.length > 0 && to.length > 0 ? '/' : ''}${to.join('/')}`
  return relative.startsWith('.') ? relative : `./${relative}`
}

function resolveLocalReference(reference: string, importer: string): string | null {
  if (/^(?:data|blob):/i.test(reference) || reference.startsWith('#')) return null
  if (/^(?:https?:)?\/\//i.test(reference)) {
    throw new Error(`Remote URL is not allowed in a static export: ${reference}`)
  }
  const base = reference.startsWith('/') ? '' : directory(importer)
  return normalizeProjectPath(`${base}/${reference.split(/[?#]/, 1)[0] ?? ''}`)
}

function text(contents: BrowserStaticExportContents): string {
  return typeof contents === 'string' ? contents : TEXT_DECODER.decode(contents)
}

function outputPath(path: string): string {
  return path.startsWith('public/') ? path.slice('public/'.length) : path
}

function moduleEntryPath(html: string, htmlPath: string): string {
  const scriptPattern =
    /<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["']([^"']+)["'])[^>]*><\/script>/i
  const match = scriptPattern.exec(html)
  if (!match?.[1]) {
    throw new Error(`Static export HTML has no module entry: ${htmlPath}`)
  }
  const resolved = resolveLocalReference(match[1], htmlPath)
  if (!resolved) throw new Error(`Static export module entry must be a local file: ${match[1]}`)
  return resolved
}

export function browserStaticExportEntryPath(
  request: BrowserStaticExportRequest,
): string {
  const htmlPath = normalizeProjectPath(request.entryHtmlPath)
  const htmlFile = request.files.find(
    (file) => normalizeProjectPath(file.path) === htmlPath,
  )
  if (!htmlFile) throw new Error(`Static export file not found: ${htmlPath}`)
  return moduleEntryPath(text(htmlFile.contents), htmlPath)
}

function replaceModuleEntry(html: string): string {
  return html.replace(
    /<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["'][^"']+["'])[^>]*><\/script>/i,
    (tag) =>
      tag.replace(
        /(\bsrc\s*=\s*["'])[^"']+(["'])/i,
        `$1${relativePath('index.html', ENTRY_OUTPUT_PATH)}$2`,
      ),
  )
}

interface LocalReference {
  readonly value: string
  readonly start: number
  readonly end: number
}

function codeAssetReferences(code: string): readonly LocalReference[] {
  const output: LocalReference[] = []
  const pattern =
    /new\s+URL\s*\(\s*(["'])([^"']+)\1\s*,\s*import\.meta\.url\s*\)/g
  for (const match of code.matchAll(pattern)) {
    const value = match[2]
    const whole = match[0]
    const index = match.index
    if (value === undefined || whole === undefined || index === undefined) continue
    const offset = whole.indexOf(value)
    output.push({
      value,
      start: index + offset,
      end: index + offset + value.length,
    })
  }
  return output
}

function rewriteCodeAssets(
  code: string,
  entryPath: string,
  files: ReadonlyMap<string, BrowserStaticExportContents>,
): { code: string; assets: readonly string[] } {
  const references = codeAssetReferences(code)
  const assets: string[] = []
  let output = ''
  let cursor = 0
  for (const reference of references) {
    const resolved = resolveLocalReference(reference.value, entryPath)
    if (!resolved) continue
    const path = files.has(resolved)
      ? resolved
      : files.has(`public/${resolved}`)
        ? `public/${resolved}`
        : resolved
    if (!files.has(path)) throw new Error(`Static export file not found: ${resolved}`)
    assets.push(path)
    output += code.slice(cursor, reference.start)
    output += relativePath(ENTRY_OUTPUT_PATH, outputPath(path))
    cursor = reference.end
  }
  output += code.slice(cursor)
  return { code: output, assets }
}

export async function createBrowserStaticExport(
  request: BrowserStaticExportRequest,
): Promise<BrowserStaticExportResult> {
  const files = new Map<string, BrowserStaticExportContents>()
  for (const file of request.files) {
    const path = normalizeProjectPath(file.path)
    if (files.has(path)) throw new Error(`Duplicate static export file: ${path}`)
    files.set(path, file.contents)
  }

  const htmlPath = normalizeProjectPath(request.entryHtmlPath)
  const htmlContents = files.get(htmlPath)
  if (htmlContents === undefined) throw new Error(`Static export file not found: ${htmlPath}`)
  const html = text(htmlContents)
  const entryPath = moduleEntryPath(html, htmlPath)
  const entryContents = files.get(entryPath)
  if (entryContents === undefined) throw new Error(`Static export file not found: ${entryPath}`)

  const rewritten = rewriteCodeAssets(
    request.compiledEntry ?? text(entryContents),
    entryPath,
    files,
  )
  const output = new Map<string, BrowserStaticExportContents>()
  output.set('index.html', replaceModuleEntry(html))
  output.set(ENTRY_OUTPUT_PATH, rewritten.code)
  for (const path of [...new Set(rewritten.assets)].sort()) {
    output.set(outputPath(path), files.get(path)!)
  }
  if (request.manifest) {
    for (const asset of dependencyClosure(request.manifest, [request.manifest.entryScene])) {
      const path = normalizeProjectPath(`${request.manifest.assetsDir}/${asset.path}`)
      const contents = files.get(path)
      if (contents === undefined) throw new Error(`Static export file not found: ${path}`)
      output.set(outputPath(path), contents)
    }
  }
  return { files: output }
}
import {
  dependencyClosure,
  type ProjectManifest,
} from '@haku/assets'
