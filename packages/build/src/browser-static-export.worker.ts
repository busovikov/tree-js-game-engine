import * as esbuild from 'esbuild-wasm'
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url'
import {
  browserSafeRuntimeModule,
  resolveBrowserProjectImport,
} from './browser-bundle.js'
import {
  browserStaticExportEntryPath,
  createBrowserStaticExport,
  type BrowserStaticExportDiagnostic,
  type BrowserStaticExportRequest,
  type BrowserStaticExportSourceKind,
  type BrowserStaticExportWorkerResult,
} from './browser-static-export.js'

interface WorkerRequest {
  readonly id: number
  readonly method: 'export'
  readonly value: BrowserStaticExportRequest
}

interface BuildMessage {
  readonly text?: string
  readonly location?: {
    readonly file?: string
    readonly line?: number
    readonly column?: number
  } | null
}

let initialized: Promise<void> | undefined

function ensureInitialized(): Promise<void> {
  initialized ??= esbuild.initialize({ wasmURL: wasmUrl, worker: false })
  return initialized
}

function sourceKind(path: string): BrowserStaticExportSourceKind {
  if (path.endsWith('.graph.json')) return 'graph'
  if (path.endsWith('.ui.json')) return 'ui'
  if (path.endsWith('.component.json') || path.endsWith('.type.json')) return 'type'
  return 'code'
}

function diagnostic(message: BuildMessage): BrowserStaticExportDiagnostic {
  const path = message.location?.file
  return {
    code: 'build.failed',
    severity: 'error',
    message: message.text ?? 'Browser static export failed.',
    source: path
      ? {
          kind: sourceKind(path),
          path,
          line: message.location?.line,
          column:
            message.location?.column === undefined
              ? undefined
              : message.location.column + 1,
        }
      : undefined,
  }
}

function failureDiagnostics(error: unknown): readonly BrowserStaticExportDiagnostic[] {
  const messages =
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray(error.errors)
      ? (error.errors as BuildMessage[])
      : []
  if (messages.length > 0) return messages.map(diagnostic)
  return [
    {
      code: 'export.invalid',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
    },
  ]
}

async function compileEntry(request: BrowserStaticExportRequest): Promise<string> {
  await ensureInitialized()
  const entryPath = browserStaticExportEntryPath(request)
  const files = new Map(
    request.files.map((file) => [
      file.path.replace(/^\/+/, '').replace(/\\/g, '/'),
      file.contents,
    ]),
  )
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    outfile: 'assets/runtime.js',
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    treeShaking: true,
    plugins: [
      {
        name: 'haku-static-export',
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path, importer }) => {
            if (!importer) return { path, namespace: 'haku-export-project' }
            const resolved = resolveBrowserProjectImport(path, importer)
            if (browserSafeRuntimeModule(resolved)) {
              return { path: resolved, namespace: 'haku-export-runtime' }
            }
            if (resolved.startsWith('@haku/')) {
              return {
                errors: [
                  {
                    text: `Public runtime module is unavailable to this export: ${resolved}`,
                  },
                ],
              }
            }
            return { path: resolved, namespace: 'haku-export-project' }
          })
          build.onLoad(
            { filter: /.*/, namespace: 'haku-export-project' },
            ({ path }) => {
              const contents = files.get(path)
              if (contents === undefined) {
                return { errors: [{ text: `File not found: ${path}` }] }
              }
              if (typeof contents !== 'string') {
                return {
                  errors: [{ text: `Binary file cannot be imported as code: ${path}` }],
                }
              }
              return {
                contents,
                loader: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.jsx') ? 'jsx' : 'ts',
              }
            },
          )
          build.onLoad(
            { filter: /.*/, namespace: 'haku-export-runtime' },
            ({ path }) => ({
              contents: browserSafeRuntimeModule(path) ?? '',
              loader: 'js',
            }),
          )
        },
      },
    ],
  })
  return result.outputFiles?.[0]?.text ?? 'export{};\n'
}

async function runExport(
  request: BrowserStaticExportRequest,
): Promise<BrowserStaticExportWorkerResult> {
  try {
    const compiledEntry = await compileEntry(request)
    const result = await createBrowserStaticExport({ ...request, compiledEntry })
    return { ok: true, files: result.files, diagnostics: [] }
  } catch (error) {
    return { ok: false, diagnostics: failureDiagnostics(error) }
  }
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  void runExport(request.value)
    .then((value) => globalThis.postMessage({ id: request.id, ok: true, value }))
    .catch((error) =>
      globalThis.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
})
