import {
  BinaryAssetSchema,
  type AssetTypeDescriptor,
} from '@haku/assets'
import type { ComponentDefinition, ComponentRegistry } from '@haku/core'
import type { PoolLifecycleParticipant } from '@haku/pool'
import {
  AssetIdSchema,
  AssetRefSchema,
  assetTypeId,
  componentTypeId,
  type AssetId,
  type AssetRef,
} from '@haku/schema'
import { z } from 'zod'

export const AUDIO_CLIP_ASSET_TYPE = assetTypeId('20000000-0000-4000-8000-000000000010')
export const AUDIO_SOURCE_COMPONENT_TYPE_ID = componentTypeId(
  '40000000-0000-4000-8000-000000000025',
)

export const AUDIO_BUSES = ['master', 'music', 'sfx', 'ui'] as const

export type AudioBus = (typeof AUDIO_BUSES)[number]
export type AudioCategoryBus = Exclude<AudioBus, 'master'>
export type AudioVoiceId = string

export interface AudioClip {
  readonly id: AssetId
  readonly bytes?: Uint8Array
  readonly durationSeconds?: number
}

export const AudioPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict()
export type AudioPosition = z.infer<typeof AudioPositionSchema>

export interface AudioSource {
  readonly clip: AssetRef<typeof AUDIO_CLIP_ASSET_TYPE>
  readonly bus: AudioCategoryBus
  readonly loop: boolean
  readonly autoplay?: boolean
  readonly volume: number
  readonly playbackRate: number
  readonly spatial: AudioPosition | null
  readonly muted?: boolean
}

export interface AudioVoiceRequest extends AudioSource {
  readonly clipData: AudioClip
}

export interface AudioVoiceUpdate {
  readonly volume?: number
  readonly playbackRate?: number
  readonly spatial?: AudioPosition | null
  readonly muted?: boolean
}

export interface AudioBusState {
  readonly volume: number
  readonly muted: boolean
}

export interface AudioBackend {
  startVoice(request: AudioVoiceRequest, onEnded: () => void): AudioVoiceId
  updateVoice(voiceId: AudioVoiceId, update: AudioVoiceUpdate): void
  stopVoice(voiceId: AudioVoiceId): void
  setBusState(bus: AudioBus, state: AudioBusState): void
  setPaused(paused: boolean): void
  dispose(): void
}

export interface HeadlessAudioVoice {
  readonly id: AudioVoiceId
  readonly clipId: string
  readonly route: readonly [AudioCategoryBus, 'master']
  readonly loop: boolean
  readonly volume: number
  readonly playbackRate: number
  readonly spatial: AudioPosition | null
  readonly muted: boolean
  readonly effectiveVolume: number
  readonly paused: boolean
  readonly active: boolean
}

export class HeadlessAudioBackend implements AudioBackend {
  private readonly voices = new Map<AudioVoiceId, HeadlessAudioVoice>()
  private readonly endedCallbacks = new Map<AudioVoiceId, () => void>()
  private readonly buses = new Map<AudioBus, AudioBusState>(
    AUDIO_BUSES.map((bus) => [bus, { volume: 1, muted: false }]),
  )
  private nextVoiceId = 1
  private releases = 0
  private paused = false

  get activeVoiceCount(): number {
    return [...this.voices.values()].filter((voice) => voice.active).length
  }

  get releasedVoiceCount(): number {
    return this.releases
  }

  startVoice(request: AudioVoiceRequest, onEnded: () => void): AudioVoiceId {
    const id = `headless-audio-voice-${this.nextVoiceId++}`
    const voice = {
      id,
      clipId: request.clipData.id,
      route: [request.bus, 'master'],
      loop: request.loop,
      volume: request.volume,
      playbackRate: request.playbackRate,
      spatial: request.spatial,
      muted: request.muted ?? false,
      effectiveVolume: 0,
      paused: this.paused,
      active: true,
    } satisfies HeadlessAudioVoice
    this.voices.set(id, this.withEffectiveVolume(voice))
    this.endedCallbacks.set(id, onEnded)
    return id
  }

  updateVoice(voiceId: AudioVoiceId, update: AudioVoiceUpdate): void {
    const voice = this.requireVoice(voiceId)
    this.voices.set(voiceId, this.withEffectiveVolume({ ...voice, ...update }))
  }

  stopVoice(voiceId: AudioVoiceId): void {
    const voice = this.voices.get(voiceId)
    if (!voice || !voice.active) return
    this.voices.set(voiceId, { ...voice, active: false })
    this.endedCallbacks.delete(voiceId)
    this.releases += 1
  }

  finishVoice(voiceId: AudioVoiceId): void {
    const voice = this.requireVoice(voiceId)
    if (!voice.active) return
    const onEnded = this.endedCallbacks.get(voiceId)
    this.voices.set(voiceId, { ...voice, active: false })
    this.endedCallbacks.delete(voiceId)
    this.releases += 1
    onEnded?.()
  }

  setBusState(bus: AudioBus, state: AudioBusState): void {
    this.buses.set(bus, state)
    this.refreshVoices()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    for (const [id, voice] of this.voices) {
      this.voices.set(id, { ...voice, paused })
    }
  }

  inspectVoice(voiceId: AudioVoiceId): HeadlessAudioVoice {
    return this.requireVoice(voiceId)
  }

  dispose(): void {
    for (const voice of this.voices.values()) this.stopVoice(voice.id)
  }

  private requireVoice(voiceId: AudioVoiceId): HeadlessAudioVoice {
    const voice = this.voices.get(voiceId)
    if (!voice) throw new Error(`Unknown audio voice: ${voiceId}`)
    return voice
  }

  private refreshVoices(): void {
    for (const [id, voice] of this.voices) {
      this.voices.set(id, this.withEffectiveVolume(voice))
    }
  }

  private withEffectiveVolume(voice: HeadlessAudioVoice): HeadlessAudioVoice {
    const category = this.buses.get(voice.route[0])!
    const master = this.buses.get('master')!
    return {
      ...voice,
      effectiveVolume:
        voice.muted || category.muted || master.muted
          ? 0
          : voice.volume * category.volume * master.volume,
    }
  }
}

export class AudioRuntime {
  private readonly clips = new Map<string, AudioClip>()
  private readonly activeVoices = new Set<AudioVoiceId>()
  private readonly voiceOwners = new Map<AudioVoiceId, string>()
  private readonly ownerVoices = new Map<string, Set<AudioVoiceId>>()
  private readonly buses = new Map<AudioBus, AudioBusState>(
    AUDIO_BUSES.map((bus) => [bus, { volume: 1, muted: false }]),
  )
  private disposed = false

  constructor(private readonly backend: AudioBackend) {}

  get activeVoiceCount(): number {
    return this.activeVoices.size
  }

  registerClip(clip: AudioClip): void {
    this.assertUsable()
    this.clips.set(clip.id, clip)
  }

  play(source: AudioSource, owner?: string): AudioVoiceId {
    this.assertUsable()
    validateVolume(source.volume)
    validatePlaybackRate(source.playbackRate)
    const clip = this.clips.get(source.clip.$ref)
    if (!clip) throw new Error(`Unknown audio clip: ${source.clip.$ref}`)
    let voiceId = ''
    voiceId = this.backend.startVoice(
      { ...source, clipData: clip },
      () => this.removeVoiceOwnership(voiceId),
    )
    this.activeVoices.add(voiceId)
    if (owner !== undefined) {
      this.voiceOwners.set(voiceId, owner)
      const voices = this.ownerVoices.get(owner) ?? new Set<AudioVoiceId>()
      voices.add(voiceId)
      this.ownerVoices.set(owner, voices)
    }
    return voiceId
  }

  stop(voiceId: AudioVoiceId): void {
    if (!this.activeVoices.has(voiceId)) return
    this.backend.stopVoice(voiceId)
    this.removeVoiceOwnership(voiceId)
  }

  stopOwner(owner: string): void {
    for (const voiceId of [...(this.ownerVoices.get(owner) ?? [])]) this.stop(voiceId)
  }

  updateVoice(voiceId: AudioVoiceId, update: AudioVoiceUpdate): void {
    this.assertActiveVoice(voiceId)
    if (update.volume !== undefined) validateVolume(update.volume)
    if (update.playbackRate !== undefined) validatePlaybackRate(update.playbackRate)
    this.backend.updateVoice(voiceId, update)
  }

  setBusVolume(bus: AudioBus, volume: number): void {
    this.assertUsable()
    validateVolume(volume)
    const state = { ...this.buses.get(bus)!, volume }
    this.buses.set(bus, state)
    this.backend.setBusState(bus, state)
  }

  setBusMuted(bus: AudioBus, muted: boolean): void {
    this.assertUsable()
    const state = { ...this.buses.get(bus)!, muted }
    this.buses.set(bus, state)
    this.backend.setBusState(bus, state)
  }

  setPaused(paused: boolean): void {
    this.assertUsable()
    this.backend.setPaused(paused)
  }

  dispose(): void {
    if (this.disposed) return
    for (const voiceId of this.activeVoices) this.backend.stopVoice(voiceId)
    this.activeVoices.clear()
    this.voiceOwners.clear()
    this.ownerVoices.clear()
    this.backend.dispose()
    this.clips.clear()
    this.disposed = true
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Audio runtime is disposed')
  }

  private assertActiveVoice(voiceId: AudioVoiceId): void {
    this.assertUsable()
    if (!this.activeVoices.has(voiceId)) throw new Error(`Unknown active audio voice: ${voiceId}`)
  }

  private removeVoiceOwnership(voiceId: AudioVoiceId): void {
    this.activeVoices.delete(voiceId)
    const owner = this.voiceOwners.get(voiceId)
    if (owner === undefined) return
    this.voiceOwners.delete(voiceId)
    const voices = this.ownerVoices.get(owner)
    voices?.delete(voiceId)
    if (voices?.size === 0) this.ownerVoices.delete(owner)
  }
}

export const AudioSourceSchema = z
  .object({
    clip: AssetRefSchema.refine(
      (reference) => reference.type === AUDIO_CLIP_ASSET_TYPE,
      'AudioSource clip must reference an Audio Clip asset',
    ),
    bus: z.enum(['music', 'sfx', 'ui']).default('sfx'),
    loop: z.boolean().default(false),
    autoplay: z.boolean().default(false),
    volume: z.number().finite().min(0).max(1).default(1),
    playbackRate: z.number().finite().positive().default(1),
    spatial: AudioPositionSchema.nullable().default(null),
    muted: z.boolean().default(false),
  })
  .strict()

export type AudioSourceData = z.infer<typeof AudioSourceSchema>

export const AudioSourceComponent = {
  id: AUDIO_SOURCE_COMPONENT_TYPE_ID,
  name: 'AudioSource',
  schema: AudioSourceSchema,
  defaults: () =>
    AudioSourceSchema.parse({
      clip: {
        $ref: '00000000-0000-4000-8000-000000000000',
        type: AUDIO_CLIP_ASSET_TYPE,
      },
    }),
  references: [{ path: 'clip', assetType: AUDIO_CLIP_ASSET_TYPE }],
} satisfies ComponentDefinition<AudioSourceData>

export const AUDIO_CLIP_ASSET_DESCRIPTOR = {
  type: AUDIO_CLIP_ASSET_TYPE,
  name: 'Audio Clip',
  schema: BinaryAssetSchema,
  dependencies: () => [],
} satisfies AssetTypeDescriptor<Uint8Array>

export function registerAudioAssetTypes(registry: {
  register<T>(descriptor: AssetTypeDescriptor<T>): void
}): void {
  registry.register(AUDIO_CLIP_ASSET_DESCRIPTOR)
}

export function registerAudioComponents(registry: ComponentRegistry): void {
  registry.register(AudioSourceComponent)
}

export function audioClip(
  id: unknown,
  bytes?: Uint8Array,
  durationSeconds?: number,
): AudioClip {
  return {
    id: AssetIdSchema.parse(id),
    ...(bytes ? { bytes } : {}),
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  }
}

function validateVolume(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('Audio volume must be a finite number from 0 to 1')
  }
}

function validatePlaybackRate(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Audio playback rate must be a finite positive number')
  }
}

export class AudioSourceInstance {
  private active = false
  private destroyed = false

  constructor(
    private readonly runtime: AudioRuntime,
    private readonly owner: string,
    private readonly source: AudioSource,
  ) {}

  activate(): void {
    if (this.destroyed) throw new Error('Audio source instance is destroyed')
    if (this.active) return
    this.active = true
    if (this.source.autoplay) this.runtime.play(this.source, this.owner)
  }

  play(): AudioVoiceId {
    if (!this.active || this.destroyed) throw new Error('Audio source instance is inactive')
    return this.runtime.play(this.source, this.owner)
  }

  deactivate(): void {
    if (!this.active) return
    this.runtime.stopOwner(this.owner)
    this.active = false
  }

  destroy(): void {
    if (this.destroyed) return
    this.deactivate()
    this.destroyed = true
  }
}

export function createAudioPoolParticipant(
  runtime: AudioRuntime,
): PoolLifecycleParticipant {
  return {
    onPoolLifecycle(event) {
      if (event.action === 'acquire') return
      for (const entity of event.entities) runtime.stopOwner(entity.value)
    },
  }
}
