import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  AssetDiagnosticError,
  AssetRegistry,
  MODEL_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  assetId,
  assetRef,
  dependencyClosure,
  validateProjectManifest,
} from './index.js'

const sceneId = assetId('10000000-0000-4000-8000-000000000001')
const modelId = assetId('10000000-0000-4000-8000-000000000002')
const textureId = assetId('10000000-0000-4000-8000-000000000003')

function manifest() {
  return {
    schemaVersion: 1,
    name: 'Asset contracts',
    entryScene: assetRef(sceneId),
    assetsDir: 'public/assets',
    scriptsDir: 'scripts',
    assets: [
      {
        id: sceneId,
        type: SCENE_ASSET_TYPE,
        path: 'scenes/main.scene.json',
        dependencies: [assetRef(modelId)],
      },
      {
        id: modelId,
        type: MODEL_ASSET_TYPE,
        path: 'models/renamed.glb',
        dependencies: [assetRef(textureId)],
      },
      {
        id: textureId,
        type: '10000000-0000-4000-8000-000000000103',
        path: 'textures/albedo.png',
        dependencies: [],
      },
    ],
  }
}

describe('@haku/assets manifest contracts', () => {
  it('keeps references valid when only an asset path moves', () => {
    const before = validateProjectManifest(manifest())
    const moved = manifest()
    moved.assets[1]!.path = 'models/archive/renamed.glb'
    const after = validateProjectManifest(moved)

    expect(after.entryScene).toEqual(before.entryScene)
    expect(after.assets[0]!.dependencies).toEqual(before.assets[0]!.dependencies)
    expect(after.assets[1]!.id).toBe(before.assets[1]!.id)
  })

  it('reports duplicate asset IDs with structured diagnostics', () => {
    const input = manifest()
    input.assets.push({ ...input.assets[1]!, path: 'models/duplicate.glb' })

    expect(() => validateProjectManifest(input)).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: 'asset.duplicate-id',
            assetId: modelId,
            path: 'assets[3].id',
          }),
        ],
      }),
    )
  })

  it('reports unknown and type-mismatched IDs in the deterministic closure', () => {
    const input = manifest()
    input.assets[0]!.dependencies.push(
      assetRef(assetId('10000000-0000-4000-8000-000000000099'), MODEL_ASSET_TYPE),
    )
    input.assets[0]!.dependencies[0] = assetRef(modelId, SCENE_ASSET_TYPE)
    const parsed = validateProjectManifest(input)

    try {
      dependencyClosure(parsed, [parsed.entryScene])
      throw new Error('Expected dependency diagnostics')
    } catch (error) {
      expect(error).toBeInstanceOf(AssetDiagnosticError)
      expect((error as AssetDiagnosticError).diagnostics).toEqual([
        expect.objectContaining({
          code: 'asset.type-mismatch',
          assetId: modelId,
          expectedType: SCENE_ASSET_TYPE,
          actualType: MODEL_ASSET_TYPE,
        }),
        expect.objectContaining({
          code: 'asset.unknown-id',
          assetId: '10000000-0000-4000-8000-000000000099',
        }),
      ])
    }
  })

  it('returns a stable dependency-first closure independent of manifest order', () => {
    const first = validateProjectManifest(manifest())
    const reversedInput = manifest()
    reversedInput.assets.reverse()
    const reversed = validateProjectManifest(reversedInput)

    expect(dependencyClosure(first, [first.entryScene]).map((entry) => entry.id)).toEqual([
      textureId,
      modelId,
      sceneId,
    ])
    expect(dependencyClosure(reversed, [reversed.entryScene]).map((entry) => entry.id)).toEqual([
      textureId,
      modelId,
      sceneId,
    ])
  })

  it('rejects an empty/invalid manifest with structured validation diagnostics', () => {
    try {
      validateProjectManifest({})
      throw new Error('Expected validation diagnostics')
    } catch (error) {
      expect(error).toBeInstanceOf(AssetDiagnosticError)
      expect((error as AssetDiagnosticError).diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'manifest.invalid' })]),
      )
    }
  })
})

describe('@haku/assets registry', () => {
  it('rejects duplicate and unknown asset type descriptors', () => {
    const registry = new AssetRegistry()
    const descriptor = {
      type: MODEL_ASSET_TYPE,
      name: 'Model',
      schema: z.object({}),
      dependencies: () => [],
    }
    registry.register(descriptor)

    expect(() => registry.register(descriptor)).toThrowError(
      expect.objectContaining({
        diagnostics: [expect.objectContaining({ code: 'asset-type.duplicate-id' })],
      }),
    )
    expect(() => registry.require(SCENE_ASSET_TYPE)).toThrowError(
      expect.objectContaining({
        diagnostics: [expect.objectContaining({ code: 'asset-type.unknown-id' })],
      }),
    )
  })
})
