import { describe, expect, it, vi } from 'vitest'
import {
  AUDIO_CLIP_ASSET_TYPE,
  audioClip,
  type AudioBackend,
  type AudioClip,
} from '@haku/audio'
import { EditorAudioPreview, type UnlockableAudioBackend } from './audio-preview.js'

const clip = audioClip(
  'a0000000-0000-4000-8000-000000000051',
  new Uint8Array([82, 73, 70, 70]),
)
const source = {
  clip: { $ref: clip.id, type: AUDIO_CLIP_ASSET_TYPE },
  bus: 'sfx' as const,
  loop: true,
  volume: 0.5,
  playbackRate: 1,
  spatial: null,
}

function backend(events: string[]): UnlockableAudioBackend {
  return {
    unlock: vi.fn(async () => {
      events.push('unlock')
    }),
    loadClip: vi.fn(async () => {
      events.push('decode')
    }),
    startVoice: vi.fn(() => {
      events.push('play')
      return 'preview-voice'
    }),
    updateVoice: vi.fn(),
    stopVoice: vi.fn(() => events.push('stop')),
    setBusState: vi.fn(),
    setListenerPose: vi.fn(),
    setPaused: vi.fn(),
    dispose: vi.fn(() => events.push('dispose')),
  } satisfies AudioBackend & Pick<UnlockableAudioBackend, 'unlock' | 'loadClip'>
}

describe('EditorAudioPreview', () => {
  it('unlocks in the caller gesture before loading local bytes and decoding', async () => {
    const events: string[] = []
    const previewBackend = backend(events)
    const loadClip = vi.fn(async (): Promise<AudioClip> => {
      events.push('load-bytes')
      return clip
    })
    const preview = new EditorAudioPreview(loadClip, () => previewBackend)

    await preview.unlock()
    expect(events).toEqual(['unlock'])
    await preview.playUnlocked(source)

    expect(events).toEqual(['unlock', 'load-bytes', 'decode', 'play'])
    preview.stop()
    expect(events.slice(-2)).toEqual(['stop', 'dispose'])
  })
})
