export const AUDIO_BUSES = ['master', 'music', 'sfx', 'ui'] as const

export type AudioBus = (typeof AUDIO_BUSES)[number]
export type AudioCategoryBus = Exclude<AudioBus, 'master'>
export type AudioVoiceId = string

export interface AudioClip {
  readonly id: string
  readonly durationSeconds: number
}

export interface AudioPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface AudioSource {
  readonly clip: string
  readonly bus: AudioCategoryBus
  readonly loop: boolean
  readonly volume: number
  readonly playbackRate: number
  readonly spatial: AudioPosition | null
}

export interface AudioVoiceRequest extends AudioSource {
  readonly clipData: AudioClip
}

export interface AudioBackend {
  startVoice(request: AudioVoiceRequest): AudioVoiceId
  stopVoice(voiceId: AudioVoiceId): void
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
  readonly active: boolean
}

export class HeadlessAudioBackend implements AudioBackend {
  private readonly voices = new Map<AudioVoiceId, HeadlessAudioVoice>()
  private nextVoiceId = 1
  private releases = 0

  get activeVoiceCount(): number {
    return [...this.voices.values()].filter((voice) => voice.active).length
  }

  get releasedVoiceCount(): number {
    return this.releases
  }

  startVoice(request: AudioVoiceRequest): AudioVoiceId {
    const id = `headless-audio-voice-${this.nextVoiceId++}`
    this.voices.set(id, {
      id,
      clipId: request.clipData.id,
      route: [request.bus, 'master'],
      loop: request.loop,
      volume: request.volume,
      playbackRate: request.playbackRate,
      spatial: request.spatial,
      active: true,
    })
    return id
  }

  stopVoice(voiceId: AudioVoiceId): void {
    const voice = this.voices.get(voiceId)
    if (!voice || !voice.active) return
    this.voices.set(voiceId, { ...voice, active: false })
    this.releases += 1
  }

  inspectVoice(voiceId: AudioVoiceId): HeadlessAudioVoice {
    const voice = this.voices.get(voiceId)
    if (!voice) throw new Error(`Unknown audio voice: ${voiceId}`)
    return voice
  }

  dispose(): void {
    for (const voice of this.voices.values()) this.stopVoice(voice.id)
  }
}

export class AudioRuntime {
  private readonly clips = new Map<string, AudioClip>()
  private readonly activeVoices = new Set<AudioVoiceId>()
  private disposed = false

  constructor(private readonly backend: AudioBackend) {}

  registerClip(clip: AudioClip): void {
    this.assertUsable()
    this.clips.set(clip.id, clip)
  }

  play(source: AudioSource): AudioVoiceId {
    this.assertUsable()
    const clip = this.clips.get(source.clip)
    if (!clip) throw new Error(`Unknown audio clip: ${source.clip}`)
    const voiceId = this.backend.startVoice({ ...source, clipData: clip })
    this.activeVoices.add(voiceId)
    return voiceId
  }

  stop(voiceId: AudioVoiceId): void {
    if (!this.activeVoices.delete(voiceId)) return
    this.backend.stopVoice(voiceId)
  }

  dispose(): void {
    if (this.disposed) return
    for (const voiceId of this.activeVoices) this.backend.stopVoice(voiceId)
    this.activeVoices.clear()
    this.backend.dispose()
    this.clips.clear()
    this.disposed = true
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Audio runtime is disposed')
  }
}
