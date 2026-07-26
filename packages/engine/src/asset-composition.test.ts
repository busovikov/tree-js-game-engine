import { describe, expect, it } from 'vitest'
import {
  AssetDiagnosticError,
  AssetRegistry,
  MODEL_ASSET_TYPE,
  PREFAB_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  TEXTURE_ASSET_TYPE,
  assetId,
  assetRef,
  registerBuiltinAssetTypes,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import { registerSerializedAssetTypes } from '@haku/serializer'
import { GRAPH_ASSET_TYPE } from '@haku/graph'
import { createEngineAssetRegistry } from './asset-registry.js'

const sceneId = assetId('10000000-0000-4000-8000-000000000031')
const modelId = assetId('10000000-0000-4000-8000-000000000032')

describe('production asset registry composition', () => {
  it('assembles concrete scene, prefab, graph, model, and texture descriptors', () => {
    const registry = createEngineAssetRegistry()

    expect(registry.require(SCENE_ASSET_TYPE).name).toBe('Scene')
    expect(registry.require(PREFAB_ASSET_TYPE).name).toBe('Prefab')
    expect(registry.require(GRAPH_ASSET_TYPE).name).toBe('Graph')
    expect(registry.require(MODEL_ASSET_TYPE).name).toBe('Model')
    expect(registry.require(TEXTURE_ASSET_TYPE).name).toBe('Texture')

    const scene = registry.require(SCENE_ASSET_TYPE).schema.parse({
      schemaVersion: 1,
      metadata: { name: 'Descriptor scene' },
      entities: [],
      prototypes: {
        model: {
          id: 'model',
          mode: 'mesh',
          sourceAsset: assetRef(modelId, MODEL_ASSET_TYPE),
        },
      },
    })
    expect(registry.require(SCENE_ASSET_TYPE).dependencies(scene)).toEqual([
      assetRef(modelId, MODEL_ASSET_TYPE),
    ])
    expect(registry.require(MODEL_ASSET_TYPE).schema.parse(new Uint8Array([1]))).toEqual(
      new Uint8Array([1]),
    )
  })

  it('reports a missing serialized contributor through the production contract', () => {
    const registry = new AssetRegistry()
    registerBuiltinAssetTypes(registry)

    expect(() => registry.require(SCENE_ASSET_TYPE)).toThrowError(
      expect.objectContaining({
        diagnostics: [expect.objectContaining({ code: 'asset-type.unknown-id' })],
      }),
    )
  })

  it('reports duplicate contributors through the production contract', () => {
    const registry = createEngineAssetRegistry()

    expect(() => registerSerializedAssetTypes(registry)).toThrowError(
      expect.objectContaining({
        diagnostics: [expect.objectContaining({ code: 'asset-type.duplicate-id' })],
      }),
    )
  })

  it('reports entry-scene type mismatches through the production assembly', () => {
    const manifest = validateProjectManifest({
      schemaVersion: 1,
      name: 'Wrong entry type',
      entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
      assetsDir: 'public/assets',
      scriptsDir: 'scripts',
      assets: [
        {
          id: sceneId,
          type: MODEL_ASSET_TYPE,
          path: 'models/not-a-scene.glb',
          dependencies: [],
        },
      ],
    })

    expect(() =>
      validateProjectAssetComposition(manifest, createEngineAssetRegistry()),
    ).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: 'asset.type-mismatch',
            assetId: sceneId,
            expectedType: SCENE_ASSET_TYPE,
            actualType: MODEL_ASSET_TYPE,
          }),
        ],
      }),
    )
  })

  it('keeps structured asset errors inspectable', () => {
    expect(
      () => validateProjectAssetComposition(
        validateProjectManifest({
          schemaVersion: 1,
          name: 'Missing entry',
          entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
          assetsDir: 'public/assets',
          scriptsDir: 'scripts',
          assets: [],
        }),
        createEngineAssetRegistry(),
      ),
    ).toThrow(AssetDiagnosticError)
  })
})
