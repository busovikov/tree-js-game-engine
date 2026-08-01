import { describe, expect, it } from 'vitest'
import {
  AudioRuntime,
  AudioLifecycleError,
  HeadlessAudioBackend,
  AUDIO_CLIP_ASSET_TYPE,
  audioClip,
  type AudioSource,
} from './index.js'

const jumpClip = audioClip('a0000000-0000-4000-8000-000000000001', undefined, 0.4)
const musicClip = audioClip('a0000000-0000-4000-8000-000000000002', undefined, 12)
const clipRef = (id: typeof jumpClip.id) => ({ $ref: id, type: AUDIO_CLIP_ASSET_TYPE })

describe('AudioRuntime', () => {
  it('owns typed idempotent unlock and pause transitions without accepting backend failures', async () => {
    class ControlledBackend extends HeadlessAudioBackend {
      unlockCalls = 0
      pauseCalls = 0
      failure: Error | null = new Error('gesture rejected')

      override async unlock(): Promise<void> {
        this.unlockCalls += 1
        if (this.failure) {
          const failure = this.failure
          this.failure = null
          throw failure
        }
      }

      override async setPaused(paused: boolean): Promise<void> {
        this.pauseCalls += 1
        await super.setPaused(paused)
      }
    }
    const backend = new ControlledBackend()
    const runtime = new AudioRuntime(backend)

    await expect(runtime.unlock()).rejects.toBeInstanceOf(AudioLifecycleError)
    expect(runtime.inspectLifecycle()).toEqual({ unlocked: false, paused: false })
    await runtime.unlock()
    await runtime.unlock()
    expect(backend.unlockCalls).toBe(2)
    expect(runtime.inspectLifecycle()).toEqual({ unlocked: true, paused: false })

    await runtime.setPaused(true)
    await runtime.setPaused(true)
    await runtime.setPaused(false)
    await runtime.setPaused(false)
    expect(backend.pauseCalls).toBe(2)
  })

  it('routes one-shot and looping sources through Master plus their category buses', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)
    runtime.registerClip(musicClip)

    const oneShot: AudioSource = {
      clip: clipRef(jumpClip.id),
      bus: 'sfx',
      loop: false,
      volume: 0.75,
      playbackRate: 1.25,
      spatial: null,
    }
    const looping: AudioSource = {
      clip: clipRef(musicClip.id),
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
      clip: clipRef(jumpClip.id),
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
      clip: clipRef(jumpClip.id),
      bus: 'sfx',
      loop: false,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })
    runtime.play({
      clip: clipRef(musicClip.id),
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

  it('applies Master and category bus volume/mute plus global pause to active voices', async () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)
    const voice = runtime.play({
      clip: clipRef(jumpClip.id),
      bus: 'sfx',
      loop: true,
      volume: 0.8,
      playbackRate: 1,
      spatial: null,
    })

    runtime.setBusVolume('master', 0.5)
    runtime.setBusVolume('sfx', 0.25)
    expect(backend.inspectVoice(voice).effectiveVolume).toBeCloseTo(0.1)

    runtime.setBusMuted('sfx', true)
    expect(backend.inspectVoice(voice).effectiveVolume).toBe(0)

    runtime.setBusMuted('sfx', false)
    await runtime.setPaused(true)
    expect(backend.inspectVoice(voice).paused).toBe(true)
    await runtime.setPaused(false)
    expect(backend.inspectVoice(voice).paused).toBe(false)
  })

  it('updates local volume, playback rate, and spatial position without replacing the voice', () => {
    const backend = new HeadlessAudioBackend()
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(jumpClip)
    const voice = runtime.play({
      clip: clipRef(jumpClip.id),
      bus: 'sfx',
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: { x: 0, y: 0, z: 0 },
    })

    runtime.updateVoice(voice, {
      volume: 0.4,
      playbackRate: 1.5,
      spatial: { x: 2, y: 3, z: -4 },
    })

    expect(backend.inspectVoice(voice)).toMatchObject({
      id: voice,
      volume: 0.4,
      playbackRate: 1.5,
      spatial: { x: 2, y: 3, z: -4 },
    })
  })

  it('rejects unknown clips and invalid runtime controls', () => {
    const runtime = new AudioRuntime(new HeadlessAudioBackend())

    expect(() =>
      runtime.play({
        clip: clipRef(jumpClip.id),
        bus: 'sfx',
        loop: false,
        volume: 1,
        playbackRate: 1,
        spatial: null,
      }),
    ).toThrow(`Unknown audio clip: ${jumpClip.id}`)
    expect(() => runtime.setBusVolume('master', Number.NaN)).toThrow(
      'Audio volume must be a finite number from 0 to 1',
    )
  })
})
