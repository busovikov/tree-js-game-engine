import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioRuntime,
  AudioService,
  audioClip,
  type AudioBackend,
  type AudioClip,
  type AudioVoiceId,
} from '@haku/audio'
import { createWebAudioBackend } from '@haku/audio-web'

const DIAGNOSTIC_CLIP_ID = 'a0000000-0000-4000-8000-000000000061'
const diagnosticClip = audioClip(DIAGNOSTIC_CLIP_ID, createDiagnosticWav())

export interface PlaygroundAudioBackend extends AudioBackend {
  unlock(): Promise<void>
  loadClip(clip: AudioClip): Promise<void>
}

export interface AudioDiagnostic {
  destroy(): void
}

export function createAudioDiagnostic(
  host: HTMLElement,
  createBackend: () => PlaygroundAudioBackend = createWebAudioBackend,
): AudioDiagnostic {
  let backend: PlaygroundAudioBackend | null = null
  let runtime: AudioRuntime | null = null
  let service: AudioService | null = null
  let loopVoice: AudioVoiceId | null = null
  let paused = false
  let muted = false
  let spatial = false
  let volume = 0.55

  Object.assign(host.style, {
    color: '#f5f7ff',
    background: '#171a2b',
    border: '1px solid #4fd1a5',
    borderRadius: '10px',
    padding: '14px',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '12px',
  })
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', 'M10c production audio diagnostic')
  host.innerHTML = `
    <strong style="display:block;color:#8ff0cf;font-size:16px;margin-bottom:8px">Production Web Audio</strong>
    <div data-audio-status role="status" style="margin-bottom:8px">Click a play control to unlock audio</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <button type="button" data-audio-action="one-shot">Unlock + one-shot</button>
      <button type="button" data-audio-action="loop">Start loop</button>
      <button type="button" data-audio-action="stop-loop">Stop loop</button>
      <button type="button" data-audio-action="pause">Pause</button>
      <button type="button" data-audio-action="mute">Mute</button>
      <button type="button" data-audio-action="spatial">Spatial: off</button>
    </div>
    <label style="display:flex;align-items:center;gap:8px">
      Volume
      <input data-audio-volume type="range" min="0" max="1" step="0.05" value="0.55" />
      <span data-audio-volume-value>55%</span>
    </label>
  `

  const status = host.querySelector<HTMLElement>('[data-audio-status]')!
  const pauseButton = host.querySelector<HTMLButtonElement>('[data-audio-action="pause"]')!
  const muteButton = host.querySelector<HTMLButtonElement>('[data-audio-action="mute"]')!
  const spatialButton = host.querySelector<HTMLButtonElement>('[data-audio-action="spatial"]')!
  const volumeInput = host.querySelector<HTMLInputElement>('[data-audio-volume]')!
  const volumeValue = host.querySelector<HTMLElement>('[data-audio-volume-value]')!

  const source = (loop: boolean) => ({
    clip: { $ref: diagnosticClip.id, type: AUDIO_CLIP_ASSET_TYPE },
    bus: 'sfx' as const,
    loop,
    autoplay: false,
    volume: 1,
    playbackRate: 1,
    spatial: spatial ? { x: 2, y: 0, z: -1 } : null,
    muted: false,
  })

  const renderState = (message: string): void => {
    host.dataset.audioUnlocked = backend ? 'true' : 'false'
    host.dataset.audioLooping = loopVoice ? 'true' : 'false'
    host.dataset.audioPaused = String(paused)
    host.dataset.audioMuted = String(muted)
    host.dataset.audioSpatial = String(spatial)
    host.dataset.audioActiveVoices = String(runtime?.activeVoiceCount ?? 0)
    status.textContent = `${message} · voices ${runtime?.activeVoiceCount ?? 0}`
    pauseButton.textContent = paused ? 'Resume' : 'Pause'
    muteButton.textContent = muted ? 'Unmute' : 'Mute'
    spatialButton.textContent = `Spatial: ${spatial ? 'on' : 'off'}`
    volumeValue.textContent = `${Math.round(volume * 100)}%`
  }

  const ensureReady = async (): Promise<void> => {
    if (backend && runtime && service) return
    const nextBackend = createBackend()
    backend = nextBackend
    try {
      // This is reached synchronously from a real click handler, before any file/network await.
      await nextBackend.unlock()
      await nextBackend.loadClip(diagnosticClip)
      const nextRuntime = new AudioRuntime(nextBackend)
      nextRuntime.registerClip(diagnosticClip)
      nextRuntime.setListenerPose({
        position: { x: 0, y: 0, z: 0 },
        forward: { x: 0, y: 0, z: -1 },
        up: { x: 0, y: 1, z: 0 },
      })
      runtime = nextRuntime
      service = new AudioService(nextRuntime)
      service.setBusVolume('sfx', volume)
      renderState('Audio unlocked')
    } catch (error) {
      nextBackend.dispose()
      backend = null
      renderState(error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  const run = (action: () => Promise<void>): void => {
    void action().catch((error) => {
      console.error('[haku] M10c audio diagnostic failed', error)
    })
  }

  host
    .querySelector<HTMLButtonElement>('[data-audio-action="one-shot"]')!
    .addEventListener('click', () =>
      run(async () => {
        await ensureReady()
        service!.play(source(false), 'playground-audio-one-shot')
        renderState(spatial ? 'Spatial one-shot playing' : 'One-shot playing')
      }),
    )
  host
    .querySelector<HTMLButtonElement>('[data-audio-action="loop"]')!
    .addEventListener('click', () =>
      run(async () => {
        await ensureReady()
        if (loopVoice) service!.stop(loopVoice)
        loopVoice = service!.play(source(true), 'playground-audio-loop')
        renderState(spatial ? 'Spatial loop playing' : 'Loop playing')
      }),
    )
  host
    .querySelector<HTMLButtonElement>('[data-audio-action="stop-loop"]')!
    .addEventListener('click', () =>
      run(async () => {
        if (loopVoice && service) service.stop(loopVoice)
        loopVoice = null
        renderState('Loop stopped')
      }),
    )
  pauseButton.addEventListener('click', () =>
    run(async () => {
      await ensureReady()
      await service!.setPaused(!paused)
      paused = !paused
      renderState(paused ? 'Globally paused' : 'Playback resumed')
    }),
  )
  muteButton.addEventListener('click', () => {
    if (!service) {
      renderState('Play once before changing mixer settings')
      return
    }
    muted = !muted
    service.setBusMuted('sfx', muted)
    renderState(muted ? 'SFX bus muted' : 'SFX bus unmuted')
  })
  spatialButton.addEventListener('click', () => {
    spatial = !spatial
    renderState(spatial ? 'Spatial playback enabled' : 'Non-spatial playback enabled')
  })
  volumeInput.addEventListener('input', () => {
    volume = Number(volumeInput.value)
    service?.setBusVolume('sfx', volume)
    renderState('SFX bus volume changed')
  })

  const refreshTimer = window.setInterval(() => {
    if (runtime) renderState(status.textContent?.split(' · voices ')[0] ?? 'Audio ready')
  }, 100)
  renderState('Click a play control to unlock audio')

  return {
    destroy() {
      window.clearInterval(refreshTimer)
      runtime?.dispose()
      if (!runtime) backend?.dispose()
      runtime = null
      backend = null
      service = null
      loopVoice = null
      host.replaceChildren()
    },
  }
}

function createDiagnosticWav(): Uint8Array {
  const sampleRate = 22_050
  const sampleCount = Math.floor(sampleRate * 0.18)
  const bytes = new Uint8Array(44 + sampleCount * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, sampleCount * 2, true)
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.max(0, 1 - index / sampleCount)
    const sample = Math.sin((index / sampleRate) * Math.PI * 2 * 440) * envelope
    view.setInt16(44 + index * 2, Math.round(sample * 0x4fff), true)
  }
  return bytes
}
