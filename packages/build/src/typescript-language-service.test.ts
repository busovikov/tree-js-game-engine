import { describe, expect, it } from 'vitest'
import { analyzeTypeScriptProject } from './typescript-language-service.js'

describe('browser TypeScript language service', () => {
  it('uses generated declarations for semantic analysis and completions', () => {
    const source = `import type { CustomNode } from '@haku/node-sdk'
const node: CustomNode = { run() {}, reset() {} }
node.run()`
    const result = analyzeTypeScriptProject({
      files: {
        '.haku/generated/node-sdk.d.ts':
          "declare module '@haku/node-sdk' { export interface CustomNode { run(): void; reset(): void } }",
        'src/node.ts': source,
      },
      completions: {
        path: 'src/node.ts',
        position: source.lastIndexOf('node.run') + 'node.'.length,
      },
    })

    expect(result.diagnostics).toEqual([])
    expect(result.completions).toEqual(expect.arrayContaining(['reset', 'run']))
  })

  it('returns a typed semantic diagnostic for invalid project source', () => {
    const result = analyzeTypeScriptProject({
      files: {
        'src/node.ts': 'const speed: string = 42',
      },
    })

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        path: 'src/node.ts',
        severity: 'error',
        message: expect.stringContaining("Type 'number' is not assignable to type 'string'"),
      }),
    ])
  })

  it('keeps the whole project for resolution but diagnoses only requested paths', () => {
    const result = analyzeTypeScriptProject({
      files: {
        'src/gameplay.ts': 'export const speed = 3',
        'src/unrelated.ts': 'const broken: string = 42',
      },
      diagnosticPaths: ['src/gameplay.ts'],
    })

    expect(result.diagnostics).toEqual([])
  })
})
