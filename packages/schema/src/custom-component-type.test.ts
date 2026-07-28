import { describe, expect, it } from 'vitest'
import { CustomComponentTypeAssetSchema } from './index.js'

const componentTypeId = '42000000-0000-4000-8000-000000000010'

describe('CustomComponentTypeAssetSchema', () => {
  it('parses declarative primitive and reference fields with Inspector metadata', () => {
    const asset = CustomComponentTypeAssetSchema.parse({
      schemaVersion: 1,
      id: componentTypeId,
      name: 'Mover',
      version: 2,
      fields: [
        {
          name: 'speed',
          type: 'number',
          default: 4,
          inspector: { label: 'Speed', min: 0, step: 0.25 },
        },
        { name: 'enabled', type: 'boolean', default: true },
        {
          name: 'target',
          type: 'entity-ref',
          optional: true,
        },
        {
          name: 'trail',
          type: 'asset-ref',
          assetType: '20000000-0000-4000-8000-000000000003',
          optional: true,
        },
      ],
    })

    expect(asset.fields[0]).toMatchObject({
      name: 'speed',
      type: 'number',
      default: 4,
    })
    expect(asset.fields[2]).toMatchObject({ optional: true })
    expect(JSON.parse(JSON.stringify(asset))).toEqual(asset)
  })

  it('rejects duplicate fields and invalid numeric metadata/defaults', () => {
    expect(() =>
      CustomComponentTypeAssetSchema.parse({
        schemaVersion: 1,
        id: componentTypeId,
        name: 'Broken',
        version: 1,
        fields: [
          { name: 'speed', type: 'number', default: 2 },
          { name: 'speed', type: 'number', default: 3 },
        ],
      }),
    ).toThrow(/Duplicate field/)

    expect(() =>
      CustomComponentTypeAssetSchema.parse({
        schemaVersion: 1,
        id: componentTypeId,
        name: 'Broken',
        version: 1,
        fields: [
          {
            name: 'speed',
            type: 'number',
            default: -1,
            inspector: { min: 0 },
          },
        ],
      }),
    ).toThrow(/default/)
  })
})
