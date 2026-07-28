import * as esbuild from 'esbuild-wasm'
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url'
import {
  browserSafeRuntimeModule,
  resolveBrowserProjectImport,
} from './browser-bundle.js'
import type { BrowserBundleRequest } from './browser-worker-clients.js'
import type { BrowserProjectBundles } from './browser-project-tooling.js'

interface WorkerRequest {
  readonly id: number
  readonly method: 'build'
  readonly value: BrowserBundleRequest
}

let initialized: Promise<void> | undefined

function ensureInitialized(): Promise<void> {
  initialized ??= esbuild.initialize({ wasmURL: wasmUrl, worker: false })
  return initialized
}

async function bundleEntry(
  entryPath: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  if (files[entryPath] === undefined) return 'export {}\n'
  const result = await esbuild.build({
    entryPoints: [entryPath],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    plugins: [
      {
        name: 'haku-local-project',
        setup(build) {
          build.onResolve({ filter: /.*/ }, ({ path, importer }) => {
            if (!importer) return { path, namespace: 'haku-project' }
            const resolved = resolveBrowserProjectImport(path, importer)
            if (browserSafeRuntimeModule(resolved)) {
              return { path: resolved, namespace: 'haku-browser-runtime' }
            }
            if (resolved.startsWith('@haku/')) return { path: resolved, external: true }
            return { path: resolved, namespace: 'haku-project' }
          })
          build.onLoad({ filter: /.*/, namespace: 'haku-project' }, ({ path }) => {
            const contents = files[path]
            if (contents === undefined) return { errors: [{ text: `File not found: ${path}` }] }
            return { contents, loader: path.endsWith('.tsx') ? 'tsx' : 'ts' }
          })
          build.onLoad({ filter: /.*/, namespace: 'haku-browser-runtime' }, ({ path }) => ({
            contents: browserSafeRuntimeModule(path) ?? '',
            loader: 'js',
          }))
        },
      },
    ],
  })
  return result.outputFiles?.[0]?.text ?? 'export {}\n'
}

async function buildBundles(request: BrowserBundleRequest): Promise<BrowserProjectBundles> {
  await ensureInitialized()
  const [gameplay, editorExtension] = await Promise.all([
    bundleEntry('src/gameplay.ts', request.files),
    bundleEntry('src/editor-extension.ts', request.files),
  ])
  return { gameplay, editorExtension }
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  void buildBundles(request.value)
    .then((value) => globalThis.postMessage({ id: request.id, ok: true, value }))
    .catch((error) =>
      globalThis.postMessage({
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    )
})
