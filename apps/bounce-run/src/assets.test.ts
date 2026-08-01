import {
  PREFAB_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import { createEngineAssetRegistry, SceneLoader } from '@haku/engine'
import { assetId, PrefabDefinitionSchema, SceneDocumentSchema } from '@haku/schema'
import { describe, expect, it } from 'vitest'
import projectAsset from '../haku.project.json'
import platformAsset from '../public/assets/prefabs/platform.prefab.json'
import sceneAsset from '../public/assets/scenes/main.scene.json'
import uiAsset from '../public/assets/ui/hud.ui.json'
import { loadBounceRunUIDocument } from './ui-document.js'

describe('Bounce Run authored assets', () => {
  it('compose into a scene with a CCD ball, pooled platforms, and HUD', async () => {
    const manifest = validateProjectManifest(projectAsset)
    const assets = validateProjectAssetComposition(manifest, createEngineAssetRegistry()).index
    const prefab = PrefabDefinitionSchema.parse(platformAsset)
    const scene = SceneDocumentSchema.parse(sceneAsset)
    const loaded = SceneLoader.fromDocument(
      scene,
      new Map([[assetId('b1500000-0000-4000-8000-000000000002'), prefab]]),
    )

    expect(assets.path(manifest.entryScene, SCENE_ASSET_TYPE)).toBe('scenes/main.scene.json')
    expect(
      assets.path(
        {
          $ref: assetId('b1500000-0000-4000-8000-000000000002'),
          type: PREFAB_ASSET_TYPE,
        },
        PREFAB_ASSET_TYPE,
      ),
    ).toBe('prefabs/platform.prefab.json')
    expect(loaded.world.getAllEntities()).toHaveLength(4)
    expect(
      scene.entities
        .flatMap((entity) => entity.components)
        .some(
          (component) =>
            component.type === '40000000-0000-4000-8000-000000000010' &&
            (component.data as { ccdEnabled?: boolean }).ccdEnabled === true,
        ),
    ).toBe(true)
    expect(prefab.entities).toHaveLength(2)
    const uiDocument = await loadBounceRunUIDocument(async () => ({
      ok: true,
      json: async () => uiAsset,
    }))
    expect(uiDocument.elements).toHaveLength(21)
    expect(uiDocument.events).toHaveLength(7)
  })
})
