import { describe, expect, it } from 'vitest'
import {
  generateBrowserProjectTooling,
  type BrowserProjectIndexInput,
} from './browser-project-index.js'

const INPUT: BrowserProjectIndexInput = {
  engineDeclarations: 'export interface World { readonly id: string }',
  nodeSdkDeclarations: 'export interface CustomNode { run(): void }',
  assets: [{ id: 'asset-player', path: 'assets/player.glb', type: 'model' }],
  components: [
    {
      id: 'component-health',
      name: 'Health',
      fields: [
        { name: 'current', type: 'number' },
        { name: 'target', type: 'entity-ref', optional: true },
      ],
    },
  ],
  graphs: [{ id: 'graph-main', name: 'Main' }],
}

describe('browser project generated tooling files', () => {
  it('generates deterministic tsconfig and declarations shared by every editor', () => {
    const tooling = generateBrowserProjectTooling(INPUT)

    expect(JSON.parse(tooling.files['tsconfig.json']!)).toMatchObject({
      compilerOptions: {
        strict: true,
        module: 'ESNext',
        moduleResolution: 'Bundler',
        noEmit: true,
      },
      include: ['src/**/*.ts', '.haku/generated/**/*.d.ts'],
    })
    expect(tooling.files['.haku/generated/engine.d.ts']).toContain('interface World')
    expect(tooling.files['.haku/generated/node-sdk.d.ts']).toContain('interface CustomNode')
    expect(tooling.files['.haku/generated/project.d.ts']).toContain('"asset-player"')
    expect(tooling.files['.haku/generated/project.d.ts']).toContain('"component-health"')
    expect(tooling.files['.haku/generated/project.d.ts']).toContain(
      'readonly "current": number',
    )
    expect(tooling.files['.haku/generated/project.d.ts']).toContain(
      'export type ComponentData<T extends ComponentId> = ComponentDataById[T]',
    )
    expect(tooling.files['.haku/generated/project.d.ts']).toContain('"graph-main"')
    expect(tooling.monacoFiles).toBe(tooling.files)
    expect(tooling.vsCodeFiles).toBe(tooling.files)
  })

  it('escapes generated names instead of emitting invalid declaration source', () => {
    const tooling = generateBrowserProjectTooling({
      ...INPUT,
      components: [{ id: 'component-quote', name: 'Boss "Health"' }],
    })

    expect(tooling.files['.haku/generated/project.d.ts']).toContain('"Boss \\"Health\\""')
  })
})
