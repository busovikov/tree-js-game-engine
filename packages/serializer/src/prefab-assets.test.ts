import { describe, expect, it } from 'vitest'
import {
  AssetDiagnosticError,
  AssetRegistry,
  MODEL_ASSET_TYPE,
  PREFAB_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  assetId,
  assetRef,
  dependencyClosure,
  registerBuiltinAssetTypes,
  validateProjectManifest,
} from '@haku/assets'
import { PrefabInstanceComponent } from '@haku/core'
import { createEngineComponentRegistry } from '@haku/engine'
import { validateSceneDocument, type PrefabDefinition } from '@haku/schema'
import { loadSceneDocument, roundtripSceneDocument } from './index.js'

const prefabAssetId = assetId('10000000-0000-4000-8000-000000000041')
const sceneId = assetId('10000000-0000-4000-8000-000000000042')

const prefab: PrefabDefinition = {
  entities: [
    {
      id: 'b0000000-0000-4000-8000-000000000001',
      name: 'Trunk',
      parent: null,
      components: [
        {
          type: '40000000-0000-4000-8000-000000000001',
          data: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        },
      ],
    },
  ],
}

function scene(prefabType = PREFAB_ASSET_TYPE) {
  return validateSceneDocument({
    schemaVersion: 1,
    metadata: { name: 'Prefab asset scene' },
    entities: [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        name: 'Instance',
        parent: null,
        components: [
          {
            type: PrefabInstanceComponent.id,
            data: { prefab: assetRef(prefabAssetId, prefabType) },
          },
        ],
      },
    ],
  })
}

describe('manifest prefab assets', () => {
  it('roundtrips typed UUID references and expands injected prefab assets', () => {
    const componentRegistry = createEngineComponentRegistry()
    const document = scene()
    const prefabAssets = new Map([[prefabAssetId, prefab]])

    const collapsed = roundtripSceneDocument(document, componentRegistry)
    expect(collapsed.entities[0]!.components[0]!.data).toEqual({
      prefab: assetRef(prefabAssetId, PREFAB_ASSET_TYPE),
    })

    const expanded = loadSceneDocument(document, {
      componentRegistry,
      prefabAssets,
    })
    expect(expanded.getAllEntities()).toHaveLength(2)
  })

  it('includes prefab assets in deterministic manifest dependency closure', () => {
    const manifest = validateProjectManifest({
      schemaVersion: 1,
      name: 'Prefab closure',
      entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
      assetsDir: 'public/assets',
      scriptsDir: 'scripts',
      assets: [
        {
          id: sceneId,
          type: SCENE_ASSET_TYPE,
          path: 'scenes/main.scene.json',
          dependencies: [assetRef(prefabAssetId, PREFAB_ASSET_TYPE)],
        },
        {
          id: prefabAssetId,
          type: PREFAB_ASSET_TYPE,
          path: 'prefabs/tree.prefab.json',
          dependencies: [],
        },
      ],
    })

    expect(dependencyClosure(manifest, [manifest.entryScene]).map((entry) => entry.id)).toEqual([
      prefabAssetId,
      sceneId,
    ])
  })

  it('reports unknown prefab assets with structured diagnostics', () => {
    expect(() =>
      loadSceneDocument(scene(), {
        componentRegistry: createEngineComponentRegistry(),
        prefabAssets: new Map(),
      }),
    ).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({ code: 'asset.unknown-id', assetId: prefabAssetId }),
        ],
      }),
    )
  })

  it('reports a missing prefab descriptor contributor', () => {
    const registry = new AssetRegistry()
    registerBuiltinAssetTypes(registry)

    expect(() => registry.require(PREFAB_ASSET_TYPE)).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: 'asset-type.unknown-id',
            expectedType: PREFAB_ASSET_TYPE,
          }),
        ],
      }),
    )
  })

  it('reports prefab reference type mismatches with structured diagnostics', () => {
    try {
      loadSceneDocument(scene(MODEL_ASSET_TYPE), {
        componentRegistry: createEngineComponentRegistry(),
        prefabAssets: new Map([[prefabAssetId, prefab]]),
      })
      throw new Error('Expected prefab type mismatch')
    } catch (error) {
      expect(error).toBeInstanceOf(AssetDiagnosticError)
      expect((error as AssetDiagnosticError).diagnostics).toEqual([
        expect.objectContaining({
          code: 'asset.type-mismatch',
          assetId: prefabAssetId,
          expectedType: PREFAB_ASSET_TYPE,
          actualType: MODEL_ASSET_TYPE,
        }),
      ])
    }
  })
})
