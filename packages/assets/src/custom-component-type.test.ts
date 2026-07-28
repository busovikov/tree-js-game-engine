import { describe, expect, it } from 'vitest'
import {
  AssetRegistry,
  CUSTOM_COMPONENT_TYPE_ASSET_DESCRIPTOR,
  CUSTOM_COMPONENT_TYPE_ASSET_TYPE,
  assetId,
  registerBuiltinAssetTypes,
} from './index.js'

describe('custom component type asset descriptor', () => {
  it('registers the visual asset type and reports referenced default assets', () => {
    const registry = new AssetRegistry()
    registerBuiltinAssetTypes(registry)
    const descriptor = registry.require(CUSTOM_COMPONENT_TYPE_ASSET_TYPE)
    const referencedAssetId = assetId(
      '22000000-0000-4000-8000-000000000010',
    )
    const asset = descriptor.schema.parse({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000010',
      name: 'Trail Owner',
      version: 1,
      fields: [
        {
          name: 'trail',
          type: 'asset-ref',
          assetType: '20000000-0000-4000-8000-000000000003',
          optional: false,
          default: {
            $ref: referencedAssetId,
            type: '20000000-0000-4000-8000-000000000003',
          },
        },
      ],
    })

    expect(descriptor).toBe(CUSTOM_COMPONENT_TYPE_ASSET_DESCRIPTOR)
    expect(descriptor.dependencies(asset)).toEqual([
      expect.objectContaining({ $ref: referencedAssetId }),
    ])
  })
})
