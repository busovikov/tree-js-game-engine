/**
 * @vitest-environment happy-dom
 */
import {
  HeadlessAudioBackend,
  type AudioClip,
  type AudioVoiceId,
  type AudioVoiceRequest,
} from '@haku/audio'
import { describe, expect, it } from 'vitest'
import {
  createAudioDiagnostic,
  type PlaygroundAudioBackend,
} from './audio-diagnostic.js'

class DiagnosticBackend extends HeadlessAudioBackend implements PlaygroundAudioBackend {
  readonly events: string[] = []
  readonly started: AudioVoiceId[] = []

  async unlock(): Promise<void> {
    this.events.push('unlock')
  }

  async loadClip(_clip: AudioClip): Promise<void> {
    this.events.push('decode')
  }

  override startVoice(
    request: AudioVoiceRequest,
    onEnded: () => void,
  ): AudioVoiceId {
    const voice = super.startVoice(request, onEnded)
    this.started.push(voice)
    this.events.push(request.loop ? 'loop' : 'one-shot')
    return voice
  }
}

describe('M10c playground audio diagnostic', () => {
  it('proves gesture unlock, playback controls, spatial state, and cleanup visibly', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const backend = new DiagnosticBackend()
    const diagnostic = createAudioDiagnostic(host, () => backend)

    ;(host.querySelector('[data-audio-action="one-shot"]') as HTMLButtonElement).click()
    await flushAsyncEvents()
    expect(host.dataset.audioUnlocked).toBe('true')
    expect(backend.events.slice(0, 3)).toEqual(['unlock', 'decode', 'one-shot'])

    ;(host.querySelector('[data-audio-action="loop"]') as HTMLButtonElement).click()
    await flushAsyncEvents()
    expect(host.dataset.audioLooping).toBe('true')

    ;(host.querySelector('[data-audio-action="pause"]') as HTMLButtonElement).click()
    await flushAsyncEvents()
    expect(host.dataset.audioPaused).toBe('true')
    ;(host.querySelector('[data-audio-action="mute"]') as HTMLButtonElement).click()
    expect(host.dataset.audioMuted).toBe('true')
    ;(host.querySelector('[data-audio-action="spatial"]') as HTMLButtonElement).click()
    expect(host.dataset.audioSpatial).toBe('true')

    backend.finishVoice(backend.started[0]!)
    ;(host.querySelector('[data-audio-action="stop-loop"]') as HTMLButtonElement).click()
    await flushAsyncEvents()
    expect(host.dataset.audioActiveVoices).toBe('0')

    diagnostic.destroy()
    expect(host.childElementCount).toBe(0)
    host.remove()
  })
})

async function flushAsyncEvents(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve()
}
