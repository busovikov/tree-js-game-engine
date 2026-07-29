import { createBrowserStaticExport } from '@haku/build/browser-static-export'

export interface CrossServiceStaticExportReport {
  readonly files: readonly string[]
  readonly runtime: string
}

export async function runCrossServiceStaticExportFixture(): Promise<CrossServiceStaticExportReport> {
  const result = await createBrowserStaticExport({
    entryHtmlPath: 'index.html',
    files: [
      {
        path: 'index.html',
        contents: '<script type="module" src="./src/main.js"></script>',
      },
      {
        path: 'src/main.js',
        contents:
          'document.body.dataset.m10fExport = new URL("../assets/m10f-ready.txt", import.meta.url).href;',
      },
      {
        path: 'assets/m10f-ready.txt',
        contents: 'M10f cross-service export ready',
      },
      {
        path: 'assets/unreachable.txt',
        contents: 'must not ship',
      },
    ],
  })
  const runtime = result.files.get('assets/runtime.js')
  if (typeof runtime !== 'string') {
    throw new Error('M10f static export did not emit a text runtime')
  }
  return {
    files: [...result.files.keys()].sort(),
    runtime,
  }
}
