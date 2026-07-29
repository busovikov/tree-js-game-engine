import { describe, expect, it } from 'vitest'
import { entityId } from '@haku/core'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioRuntime,
  AudioSourceInstance,
  HeadlessAudioBackend,
  audioClip,
  createAudioPoolParticipant,
} from './index.js'

const clip = audioClip('a0000000-0000-4000-8000-000000000003', undefined, 1)
const clipReference = { $ref: clip.id, type: AUDIO_CLIP_ASSET_TYPE }

describe('audio activation and ownership lifecycle', () => {
  it('starts autoplay only while active and releases owned voices on deactivation', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    const instance = new AudioSourceInstance(runtime, 'audio-entity', {
      clip: clipReference,
      bus: 'sfx',
      autoplay: true,
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })

    expect(backend.activeVoiceCount).toBe(0)
    instance.activate()
    expect(backend.activeVoiceCount).toBe(1)
    instance.deactivate()
    expect(backend.activeVoiceCount).toBe(0)

    instance.activate()
    expect(backend.activeVoiceCount).toBe(1)
    instance.destroy()
    expect(backend.activeVoiceCount).toBe(0)
  })

  it('removes completed one-shots from runtime ownership', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    const voice = runtime.play(
      {
        clip: clipReference,
        bus: 'ui',
        loop: false,
        volume: 1,
        playbackRate: 1,
        spatial: null,
      },
      'menu',
    )

    backend.finishVoice(voice)

    expect(runtime.activeVoiceCount).toBe(0)
    expect(backend.activeVoiceCount).toBe(0)
  })

  it('releases audio through the existing pool lifecycle participant boundary', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    const root = entityId('pool-root')
    runtime.play(
      {
        clip: clipReference,
        bus: 'sfx',
        loop: true,
        volume: 1,
        playbackRate: 1,
        spatial: null,
      },
      root.value,
    )
    const participant = createAudioPoolParticipant(runtime)

    participant.onPoolLifecycle({
      action: 'release',
      pool: 'effects',
      root,
      entities: [root],
      generation: 1,
      scope: {} as never,
    })

    expect(backend.activeVoiceCount).toBe(0)
    expect(runtime.activeVoiceCount).toBe(0)
  })
})
