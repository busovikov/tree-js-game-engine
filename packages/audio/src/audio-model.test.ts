import { describe, expect, it } from 'vitest'
import { AssetRegistry } from '@haku/assets'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AUDIO_SOURCE_COMPONENT_TYPE_ID,
  AudioSourceSchema,
  registerAudioAssetTypes,
} from './index.js'

describe('audio model', () => {
  it('registers binary AudioClip assets without path or network dependencies', () => {
    const registry = new AssetRegistry()
    registerAudioAssetTypes(registry)
    const descriptor = registry.require(AUDIO_CLIP_ASSET_TYPE)
    const bytes = new Uint8Array([82, 73, 70, 70])

    expect(descriptor.name).toBe('Audio Clip')
    expect(descriptor.schema.parse(bytes)).toBe(bytes)
    expect(descriptor.dependencies(bytes)).toEqual([])
  })

  it('parses an AudioSource with safe defaults and a typed clip reference', () => {
    const source = AudioSourceSchema.parse({
      clip: {
        $ref: 'a0000000-0000-4000-8000-000000000001',
        type: AUDIO_CLIP_ASSET_TYPE,
      },
    })

    expect(source).toMatchObject({
      bus: 'sfx',
      loop: false,
      autoplay: false,
      volume: 1,
      playbackRate: 1,
      spatial: null,
      muted: false,
    })
    expect(AUDIO_SOURCE_COMPONENT_TYPE_ID).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects the wrong asset type and unsafe numeric controls', () => {
    expect(() =>
      AudioSourceSchema.parse({
        clip: {
          $ref: 'a0000000-0000-4000-8000-000000000001',
          type: '20000000-0000-4000-8000-000000000001',
        },
        volume: 2,
        playbackRate: 0,
      }),
    ).toThrow()
  })
})
