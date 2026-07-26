import { describe, expect, it } from 'vitest'
import { AssetRegistry, assetId, assetRef } from '@haku/assets'
import {
  GRAPH_ASSET_DESCRIPTOR,
  GRAPH_ASSET_TYPE,
  registerGraphAssetTypes,
} from './index.js'

describe('graph asset descriptor', () => {
  it('contributes graph assets without requiring serializer or engine registration', () => {
    const registry = new AssetRegistry()

    registerGraphAssetTypes(registry)

    expect(registry.require(GRAPH_ASSET_TYPE)).toBe(GRAPH_ASSET_DESCRIPTOR)
  })

  it('reports deterministic asset dependencies from graph properties', () => {
    const dependency = assetId('40000000-0000-4000-8000-000000000010')
    const parsed = GRAPH_ASSET_DESCRIPTOR.schema.parse({
      schemaVersion: 1,
      graph: {
        id: '40000000-0000-4000-8000-000000000001',
        name: 'Dependency graph',
        nodes: [
          {
            id: '40000000-0000-4000-8000-000000000002',
            type: '40000000-0000-4000-8000-000000000003',
            version: '1',
            callsites: [],
            properties: {
              second: assetRef(dependency),
              first: assetRef(dependency),
            },
            layout: { x: 0, y: 0 },
          },
        ],
        connections: [],
        publicInterface: { ports: [] },
        metadata: {},
      },
    })

    expect(GRAPH_ASSET_DESCRIPTOR.dependencies(parsed)).toEqual([
      assetRef(dependency),
    ])
  })
})
