import { describe, expect, it } from 'vitest'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioSourceComponent,
} from '@haku/audio'
import {
  SCENE_ASSET_TYPE,
  assetId,
  assetRef,
  dependencyClosure,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import { createEngineAssetRegistry } from './asset-registry.js'
import { createEngineComponentRegistry } from './components.js'

const sceneId = assetId('10000000-0000-4000-8000-000000000041')
const clipId = assetId('10000000-0000-4000-8000-000000000042')

describe('engine audio composition', () => {
  it('registers Audio Clip assets and AudioSource components at production roots', () => {
    const descriptor = createEngineAssetRegistry().require(AUDIO_CLIP_ASSET_TYPE)

    expect(descriptor.name).toBe('Audio Clip')
    expect(descriptor.schema.parse(new Uint8Array([82, 73, 70, 70]))).toEqual(
      new Uint8Array([82, 73, 70, 70]),
    )
    expect(descriptor.dependencies(new Uint8Array([1]))).toEqual([])
    expect(
      createEngineComponentRegistry().require(AudioSourceComponent.id),
    ).toBe(AudioSourceComponent)
  })

  it('keeps a local Audio Clip in the entry-scene dependency closure', () => {
    const manifest = validateProjectManifest({
      schemaVersion: 1,
      name: 'Local audio composition',
      entryScene: assetRef(sceneId, SCENE_ASSET_TYPE),
      assetsDir: 'public/assets',
      scriptsDir: 'scripts',
      assets: [
        {
          id: sceneId,
          type: SCENE_ASSET_TYPE,
          path: 'scenes/main.scene.json',
          dependencies: [assetRef(clipId, AUDIO_CLIP_ASSET_TYPE)],
        },
        {
          id: clipId,
          type: AUDIO_CLIP_ASSET_TYPE,
          path: 'audio/jump.wav',
          dependencies: [],
        },
      ],
    })

    validateProjectAssetComposition(manifest, createEngineAssetRegistry())
    expect(
      dependencyClosure(manifest, [manifest.entryScene]).map((entry) => ({
        id: entry.id,
        path: entry.path,
      })),
    ).toEqual([
      { id: clipId, path: 'audio/jump.wav' },
      { id: sceneId, path: 'scenes/main.scene.json' },
    ])
    expect(manifest.assets.every((entry) => !entry.path.includes('://'))).toBe(true)
  })
})
