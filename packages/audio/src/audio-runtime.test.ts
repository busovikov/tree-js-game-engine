import { describe, expect, it } from 'vitest'
import {
  AudioRuntime,
  HeadlessAudioBackend,
  type AudioClip,
  type AudioSource,
} from './index.js'

const jumpClip: AudioClip = {
  id: 'a0000000-0000-4000-8000-000000000001',
  durationSeconds: 0.4,
}

const musicClip: AudioClip = {
  id: 'a0000000-0000-4000-8000-000000000002',
  durationSeconds: 12,
}

describe('AudioRuntime', () => {
  it('routes one-shot and looping sources through Master plus their category buses', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)
    runtime.registerClip(musicClip)

    const oneShot: AudioSource = {
      clip: jumpClip.id,
      bus: 'sfx',
      loop: false,
      volume: 0.75,
      playbackRate: 1.25,
      spatial: null,
    }
    const looping: AudioSource = {
      clip: musicClip.id,
      bus: 'music',
      loop: true,
      volume: 0.5,
      playbackRate: 1,
      spatial: null,
    }

    const oneShotVoice = runtime.play(oneShot)
    const loopingVoice = runtime.play(looping)

    expect(backend.inspectVoice(oneShotVoice)).toMatchObject({
      clipId: jumpClip.id,
      route: ['sfx', 'master'],
      loop: false,
      volume: 0.75,
      playbackRate: 1.25,
    })
    expect(backend.inspectVoice(loopingVoice)).toMatchObject({
      clipId: musicClip.id,
      route: ['music', 'master'],
      loop: true,
      volume: 0.5,
      playbackRate: 1,
    })
  })

  it('routes UI sources through the UI and Master buses', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)

    const voice = runtime.play({
      clip: jumpClip.id,
      bus: 'ui',
      loop: false,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })

    expect(backend.inspectVoice(voice).route).toEqual(['ui', 'master'])
  })

  it('releases every active voice during cleanup', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)
    runtime.registerClip(musicClip)

    runtime.play({
      clip: jumpClip.id,
      bus: 'sfx',
      loop: false,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })
    runtime.play({
      clip: musicClip.id,
      bus: 'music',
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })

    runtime.dispose()

    expect(backend.activeVoiceCount).toBe(0)
    expect(backend.releasedVoiceCount).toBe(2)
  })
})
