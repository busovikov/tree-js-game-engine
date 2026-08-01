import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioRuntime,
  AudioService,
  audioClip,
  createAudioPoolParticipant,
  type AudioBackend,
  type AudioBus,
  type AudioClip,
  type AudioSource,
  type AudioVoiceId,
} from '@haku/audio'
import type { EngineScheduler } from '@haku/core'
import type { EntityPool } from '@haku/pool'
import { assetId } from '@haku/schema'
import type { ISaveStorage } from '@haku/storage'
import type { UIService } from '@haku/ui'
import { createBounceRunSessionRuntime, type BounceRunSessionRuntime } from './session-runtime.js'
import { BOUNCE_RUN_UI_IDS } from './ui-document.js'

export const BOUNCE_RUN_AUDIO_CLIPS = {
  music: assetId('b1400000-0000-4000-8000-000000000001'),
  landing: assetId('b1400000-0000-4000-8000-000000000002'),
  bonus: assetId('b1400000-0000-4000-8000-000000000003'),
  fail: assetId('b1400000-0000-4000-8000-000000000004'),
  ui: assetId('b1400000-0000-4000-8000-000000000005'),
} as const

const authoredClip = (id: string, frequency: number, seconds: number): AudioClip =>
  audioClip(id, createToneWav(frequency, seconds), seconds)

export const BOUNCE_RUN_AUDIO_CLIP_DATA = [
  authoredClip(BOUNCE_RUN_AUDIO_CLIPS.music, 196, 1),
  authoredClip(BOUNCE_RUN_AUDIO_CLIPS.landing, 120, 0.08),
  authoredClip(BOUNCE_RUN_AUDIO_CLIPS.bonus, 740, 0.12),
  authoredClip(BOUNCE_RUN_AUDIO_CLIPS.fail, 90, 0.35),
  authoredClip(BOUNCE_RUN_AUDIO_CLIPS.ui, 520, 0.05),
] as const

const source = (
  clip: string,
  bus: 'music' | 'sfx' | 'ui',
  loop: boolean,
  volume: number,
): AudioSource => ({
  clip: { $ref: assetId(clip), type: AUDIO_CLIP_ASSET_TYPE },
  bus,
  loop,
  volume,
  playbackRate: 1,
  spatial: null,
})

export const BOUNCE_RUN_AUDIO_SOURCES = {
  music: source(BOUNCE_RUN_AUDIO_CLIPS.music, 'music', true, 0.45),
  landing: source(BOUNCE_RUN_AUDIO_CLIPS.landing, 'sfx', false, 0.7),
  bonus: source(BOUNCE_RUN_AUDIO_CLIPS.bonus, 'sfx', false, 0.85),
  fail: source(BOUNCE_RUN_AUDIO_CLIPS.fail, 'sfx', false, 0.8),
  ui: source(BOUNCE_RUN_AUDIO_CLIPS.ui, 'ui', false, 0.65),
} as const

export interface BounceRunAudioHooks {
  readonly start?: () => void
  readonly pause?: () => void
  readonly resume?: () => void
  readonly restart?: () => void
  readonly fail?: () => void
  readonly error?: (error: unknown) => void
}

export interface BounceRunAudioComposition {
  readonly session: BounceRunSessionRuntime
  initialize(): Promise<void>
  settled(): Promise<void>
  start(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  fail(): Promise<void>
  restart(): Promise<void>
  setBusVolume(bus: AudioBus, volume: number): void
  setBusMuted(bus: AudioBus, muted: boolean): void
  playOwnedBonus(owner: string): AudioVoiceId
  inspect(): {
    readonly activeVoices: number
    readonly ownedVoices: (owner: string) => number
  }
  dispose(): void
}

export function createBounceRunAudioComposition(options: {
  readonly scheduler: EngineScheduler
  readonly ui: UIService
  readonly storage: ISaveStorage
  readonly backend: AudioBackend
  readonly pooledOwners?: readonly EntityPool[]
  readonly hooks?: BounceRunAudioHooks
}): BounceRunAudioComposition {
  const runtime = new AudioRuntime(options.backend)
  for (const clip of BOUNCE_RUN_AUDIO_CLIP_DATA) runtime.registerClip(clip)
  const audio = new AudioService(runtime)
  const session = createBounceRunSessionRuntime({
    scheduler: options.scheduler,
    ui: options.ui,
    storage: options.storage,
    audio,
  })
  const participant = createAudioPoolParticipant(runtime)
  const unregisterParticipants = (options.pooledOwners ?? []).map((pool) =>
    pool.registerParticipant(participant),
  )
  let musicVoice: AudioVoiceId | null = null
  let pending = Promise.resolve()
  let disposed = false
  const busSettings = new Map<AudioBus, { volume: number; muted: boolean }>([
    ['master', { volume: 0.8, muted: false }],
    ['music', { volume: 0.55, muted: false }],
    ['sfx', { volume: 0.65, muted: false }],
    ['ui', { volume: 0.75, muted: false }],
  ])

  const ensureMusic = (): void => {
    if (musicVoice && runtime.hasVoice(musicVoice)) return
    musicVoice = audio.play(BOUNCE_RUN_AUDIO_SOURCES.music, 'bounce-run.music')
  }
  const stopMusic = (): void => {
    if (musicVoice && runtime.hasVoice(musicVoice)) audio.stop(musicVoice)
    musicVoice = null
  }
  const start = async (): Promise<void> => {
    if (session.state() !== 'start') return
    await audio.unlock()
    options.hooks?.start?.()
    session.start()
    ensureMusic()
  }
  const pause = async (): Promise<void> => {
    if (session.state() !== 'active') return
    await audio.setPaused(true)
    session.pause()
    options.hooks?.pause?.()
  }
  const resume = async (): Promise<void> => {
    if (session.state() !== 'paused') return
    await audio.setPaused(false)
    session.resume()
    options.hooks?.resume?.()
  }
  const fail = async (): Promise<void> => {
    if (session.state() !== 'active') return
    const persistence = session.fail()
    stopMusic()
    options.hooks?.fail?.()
    await persistence
  }
  const restart = async (): Promise<void> => {
    if (session.state() === 'start') return
    if (audio.inspectLifecycle().paused) await audio.setPaused(false)
    options.hooks?.restart?.()
    session.restart()
    ensureMusic()
  }
  const track = (operation: Promise<void>): void => {
    pending = operation
    void operation.catch((error: unknown) => options.hooks?.error?.(error))
  }
  const setBusVolume = (bus: AudioBus, volume: number): void => {
    session.setAudioBusVolume(bus, volume)
    busSettings.set(bus, { ...busSettings.get(bus)!, volume })
  }
  const setBusMuted = (bus: AudioBus, muted: boolean): void => {
    session.setAudioBusMuted(bus, muted)
    busSettings.set(bus, { ...busSettings.get(bus)!, muted })
  }
  const toggleBus = (bus: AudioBus, element: string, label: string): void => {
    const muted = !busSettings.get(bus)!.muted
    setBusMuted(bus, muted)
    options.ui.setText(
      { document: BOUNCE_RUN_UI_IDS.document, element },
      `${label} ${muted ? 'off' : 'on'}`,
    )
  }
  const unsubscribeUI = options.ui.subscribe((event) => {
    if (event.eventId === BOUNCE_RUN_UI_IDS.events.start) track(start())
    else if (event.eventId === BOUNCE_RUN_UI_IDS.events.resume) track(resume())
    else if (event.eventId === BOUNCE_RUN_UI_IDS.events.restart) track(restart())
    else if (event.eventId === BOUNCE_RUN_UI_IDS.events.toggleMasterAudio) {
      toggleBus('master', BOUNCE_RUN_UI_IDS.masterAudioButton, 'Master')
    } else if (event.eventId === BOUNCE_RUN_UI_IDS.events.toggleMusicAudio) {
      toggleBus('music', BOUNCE_RUN_UI_IDS.musicAudioButton, 'Music')
    } else if (event.eventId === BOUNCE_RUN_UI_IDS.events.toggleSfxAudio) {
      toggleBus('sfx', BOUNCE_RUN_UI_IDS.sfxAudioButton, 'SFX')
    } else if (event.eventId === BOUNCE_RUN_UI_IDS.events.toggleUIAudio) {
      toggleBus('ui', BOUNCE_RUN_UI_IDS.uiAudioButton, 'UI')
    }
  })

  return {
    session,
    initialize: async () => {
      await session.initialize()
    },
    settled: () => pending,
    start,
    pause,
    resume,
    fail,
    restart,
    setBusVolume,
    setBusMuted,
    playOwnedBonus: (owner) => audio.play(BOUNCE_RUN_AUDIO_SOURCES.bonus, owner),
    inspect: () => ({
      activeVoices: runtime.activeVoiceCount,
      ownedVoices: (owner) => runtime.ownedVoiceCount(owner),
    }),
    dispose: () => {
      if (disposed) return
      disposed = true
      unsubscribeUI()
      for (const unregister of unregisterParticipants) unregister()
      session.destroy()
      runtime.dispose()
    },
  }
}

function createToneWav(frequency: number, seconds: number): Uint8Array {
  const sampleRate = 8_000
  const samples = Math.max(1, Math.round(sampleRate * seconds))
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const text = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1)
      bytes[offset + index] = value.charCodeAt(index)
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
  view.setUint32(40, samples * 2, true)
  for (let index = 0; index < samples; index += 1) {
    const envelope = 1 - index / samples
    const value = Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * envelope * 0.2
    view.setInt16(44 + index * 2, Math.round(value * 0x7fff), true)
  }
  return bytes
}
