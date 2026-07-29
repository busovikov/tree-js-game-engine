import { describe, expect, it } from 'vitest'
import { runCrossServiceStaticExportFixture } from './cross-service-static-export.js'

describe('M10f bounded static export fixture', () => {
  it('exports only the local runtime and reachable diagnostic asset', async () => {
    const result = await runCrossServiceStaticExportFixture()

    expect(result.files).toEqual([
      'assets/m10f-ready.txt',
      'assets/runtime.js',
      'index.html',
    ])
    expect(result.runtime).toContain(
      'new URL("./m10f-ready.txt", import.meta.url)',
    )
  })
})
