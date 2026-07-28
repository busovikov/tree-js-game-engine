import { describe, expect, it } from 'vitest'
import {
  CustomComponentTypeAssetSchema,
  createCustomComponentDefinition,
} from './custom-component-type.js'

const speedTypeAsset = {
  schemaVersion: 1,
  id: '42000000-0000-4000-8000-000000000001',
  name: 'Movement',
  version: 1,
  fields: [
    {
      name: 'speed',
      type: 'number',
      default: 6,
    },
  ],
} as const

describe('custom component type assets', () => {
  it('compiles a visual asset into a deterministic registry definition', () => {
    const asset = CustomComponentTypeAssetSchema.parse(speedTypeAsset)
    const first = createCustomComponentDefinition(asset)
    const second = createCustomComponentDefinition(
      CustomComponentTypeAssetSchema.parse(speedTypeAsset),
    )

    expect(first.id).toBe(speedTypeAsset.id)
    expect(first.name).toBe(speedTypeAsset.name)
    expect(first.version).toBe(speedTypeAsset.version)
    expect(first.defaults?.()).toEqual({ speed: 6 })
    expect(first.schema.parse({})).toEqual({ speed: 6 })
    expect(first.schema.parse({ speed: 9 })).toEqual({ speed: 9 })
    expect(() => first.schema.parse({ speed: 'fast' })).toThrow()
    expect(JSON.parse(JSON.stringify(first.defaults?.()))).toEqual({ speed: 6 })
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fingerprint).toMatch(/^haku-component-v1-/)
  })

  it('projects declarative Inspector and asset-reference metadata', () => {
    const definition = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000002',
      name: 'Trail',
      version: 1,
      behaviorGraph: {
        $ref: '10000000-0000-4000-8000-000000000082',
        type: '20000000-0000-4000-8000-000000000007',
      },
      typescriptBehavior: {
        exportName: 'accelerateMovers',
        domain: 'FixedGameplay',
        query: ['42000000-0000-4000-8000-000000000002'],
        reads: ['component:42000000-0000-4000-8000-000000000002'],
        writes: ['component:42000000-0000-4000-8000-000000000002'],
        effects: ['world.write'],
        commands: ['set'],
      },
      editorExtension: {
        gizmoProvider: 'speed-radius',
        customWidget: 'speed-slider',
      },
      inspector: { category: 'Gameplay', description: 'Trail controls' },
      fields: [
        {
          name: 'intensity',
          type: 'number',
          default: 1,
          inspector: { label: 'Intensity', min: 0, max: 2, step: 0.1 },
        },
        {
          name: 'texture',
          type: 'asset-ref',
          assetType: '20000000-0000-4000-8000-000000000004',
          optional: true,
        },
      ],
    })

    expect(definition.inspector).toEqual({
      category: 'Gameplay',
      description: 'Trail controls',
      fields: [
        {
          name: 'intensity',
          type: 'number',
          label: 'Intensity',
          min: 0,
          max: 2,
          step: 0.1,
          optional: false,
        },
        {
          name: 'texture',
          type: 'asset-ref',
          label: 'texture',
          optional: true,
        },
      ],
    })
    expect(definition.references).toEqual([
      {
        path: 'texture',
        assetType: '20000000-0000-4000-8000-000000000004',
        optional: true,
      },
    ])
    expect(definition.behavior).toEqual({
      graph: {
        $ref: '10000000-0000-4000-8000-000000000082',
        type: '20000000-0000-4000-8000-000000000007',
      },
      typescript: {
        exportName: 'accelerateMovers',
        domain: 'FixedGameplay',
        query: ['42000000-0000-4000-8000-000000000002'],
        reads: ['component:42000000-0000-4000-8000-000000000002'],
        writes: ['component:42000000-0000-4000-8000-000000000002'],
        effects: ['world.write'],
        commands: ['set'],
      },
    })
    expect(definition.editorExtension).toEqual({
      gizmoProvider: 'speed-radius',
      customWidget: 'speed-slider',
    })
  })
})
