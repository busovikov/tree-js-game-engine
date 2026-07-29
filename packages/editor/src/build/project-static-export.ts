import {
  BrowserStaticExportClient,
  createBrowserStaticExportZip,
  type BrowserStaticExportDiagnostic,
  type BrowserStaticExportRequest,
  type BrowserStaticExportWorkerResult,
} from '@haku/build'
import {
  dependencyClosure,
  type ProjectManifest,
} from '@haku/assets'
import type { BrowserProjectTrustMode } from '@haku/build'
import { downloadStaticExportZip } from './static-export-download.js'

export interface StaticExportCodeWorkspace {
  listFiles(): readonly string[]
  readText(path: string): string
}

export interface StaticExportProjectService {
  getRoot(): string | null
  getManifest(): ProjectManifest | null
  getTrustMode(): BrowserProjectTrustMode
  getCodeWorkspace(): StaticExportCodeWorkspace | null
  openCodeWorkspace(): Promise<StaticExportCodeWorkspace>
  readProjectFile(path: string): Promise<string | Uint8Array>
}

export interface StaticExportClient {
  export(request: BrowserStaticExportRequest): Promise<BrowserStaticExportWorkerResult>
  dispose(): void
}

export interface ProjectStaticExportOptions {
  readonly exportClient?: StaticExportClient
  readonly download?: (bytes: Uint8Array, fileName: string) => void
}

export type ProjectStaticExportResult =
  | {
      readonly ok: true
      readonly bytes: Uint8Array
      readonly fileName: string
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly BrowserStaticExportDiagnostic[]
    }

function archiveFileName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${normalized || 'haku-game'}.zip`
}

function isExportSource(path: string, assetsDir: string): boolean {
  if (path === 'index.html') return true
  if (path === assetsDir || path.startsWith(`${assetsDir}/`)) return false
  if (path.startsWith('.haku/')) return false
  return /\.(?:[cm]?[jt]sx?|css|html)$/i.test(path)
}

export async function collectProjectStaticExportRequest(
  service: StaticExportProjectService,
): Promise<BrowserStaticExportRequest> {
  const manifest = service.getManifest()
  if (!service.getRoot() || !manifest) throw new Error('No project open')
  const workspace = service.getCodeWorkspace() ?? (await service.openCodeWorkspace())
  const files: BrowserStaticExportRequest['files'][number][] = []
  for (const path of workspace.listFiles().filter((candidate) =>
    isExportSource(candidate, manifest.assetsDir),
  )) {
    files.push({ path, contents: workspace.readText(path) })
  }
  if (!files.some((file) => file.path === 'index.html')) {
    throw new Error('Static export requires index.html at the project root.')
  }
  for (const asset of dependencyClosure(manifest, [manifest.entryScene])) {
    const path = `${manifest.assetsDir.replace(/\/+$/, '')}/${asset.path}`
    files.push({ path, contents: await service.readProjectFile(path) })
  }
  return { entryHtmlPath: 'index.html', files, manifest }
}

export async function exportProjectAsStaticZip(
  service: StaticExportProjectService,
  options: ProjectStaticExportOptions = {},
): Promise<ProjectStaticExportResult> {
  if (service.getTrustMode() === 'imported-untrusted') {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'trust.untrusted-code',
          severity: 'error',
          message: 'Imported project code must be trusted before it can be exported.',
        },
      ],
    }
  }

  const client = options.exportClient ?? new BrowserStaticExportClient()
  try {
    const request = await collectProjectStaticExportRequest(service)
    const result = await client.export(request)
    if (!result.ok) return result
    const bytes = createBrowserStaticExportZip(result.files)
    const fileName = archiveFileName(request.manifest?.name ?? service.getRoot() ?? 'haku-game')
    ;(options.download ?? downloadStaticExportZip)(bytes, fileName)
    return { ok: true, bytes, fileName, diagnostics: [] }
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: 'export.invalid',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  } finally {
    client.dispose()
  }
}
