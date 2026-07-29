import {
  AUDIO_BUSES,
  type AudioBackend,
  type AudioBus,
  type AudioBusState,
  type AudioClip,
  type AudioListenerPose,
  type AudioPosition,
  type AudioVoiceId,
  type AudioVoiceRequest,
  type AudioVoiceUpdate,
} from '@haku/audio'

interface WebAudioVoice {
  readonly source: AudioBufferSourceNode
  readonly gain: GainNode
  readonly panner: PannerNode | null
  readonly onEnded: () => void
  volume: number
  muted: boolean
}

export class WebAudioBackend implements AudioBackend {
  private readonly decodedClips = new Map<string, AudioBuffer>()
  private readonly busNodes = new Map<AudioBus, GainNode>()
  private readonly voices = new Map<AudioVoiceId, WebAudioVoice>()
  private nextVoiceId = 1
  private isUnlocked = false
  private paused = false
  private disposed = false

  constructor(private readonly context: AudioContext) {
    const master = context.createGain()
    master.connect(context.destination)
    this.busNodes.set('master', master)
    for (const bus of AUDIO_BUSES) {
      if (bus === 'master') continue
      const node = context.createGain()
      node.connect(master)
      this.busNodes.set(bus, node)
    }
  }

  get unlocked(): boolean {
    return this.isUnlocked
  }

  async loadClip(clip: AudioClip): Promise<void> {
    this.assertUsable()
    if (!clip.bytes) throw new Error(`Audio clip ${clip.id} has no in-memory bytes`)
    const bytes = clip.bytes.slice().buffer
    const decoded = await this.context.decodeAudioData(bytes)
    this.decodedClips.set(clip.id, decoded)
  }

  /**
   * Must be called directly from an audible-preview user gesture. It deliberately does not
   * install synthetic listeners or attempt to bypass the browser autoplay policy.
   */
  async unlock(): Promise<void> {
    this.assertUsable()
    if (!this.paused && this.context.state !== 'running') await this.context.resume()
    this.isUnlocked = true
  }

  startVoice(request: AudioVoiceRequest, onEnded: () => void): AudioVoiceId {
    this.assertUsable()
    const buffer = this.decodedClips.get(request.clipData.id)
    if (!buffer) throw new Error(`Audio clip ${request.clipData.id} is not decoded`)

    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = request.loop
    source.playbackRate.setValueAtTime(request.playbackRate, this.context.currentTime)

    const gain = this.context.createGain()
    gain.gain.setValueAtTime(request.muted ? 0 : request.volume, this.context.currentTime)
    const panner = request.spatial ? this.createPanner(request.spatial) : null
    if (panner) source.connect(panner).connect(gain)
    else source.connect(gain)
    gain.connect(this.requireBusNode(request.bus))

    const id = `web-audio-voice-${this.nextVoiceId++}`
    const voice = {
      source,
      gain,
      panner,
      onEnded,
      volume: request.volume,
      muted: request.muted ?? false,
    }
    this.voices.set(id, voice)
    source.onended = () => this.finishVoice(id)
    source.start()
    return id
  }

  updateVoice(voiceId: AudioVoiceId, update: AudioVoiceUpdate): void {
    const voice = this.requireVoice(voiceId)
    if (update.spatial !== undefined) {
      if (update.spatial === null && voice.panner !== null) {
        throw new Error('Cannot change an active spatial voice to non-spatial')
      }
      if (update.spatial !== null && voice.panner === null) {
        throw new Error('Cannot change an active non-spatial voice to spatial')
      }
    }
    if (update.volume !== undefined || update.muted !== undefined) {
      if (update.volume !== undefined) voice.volume = update.volume
      if (update.muted !== undefined) voice.muted = update.muted
      voice.gain.gain.setValueAtTime(
        voice.muted ? 0 : voice.volume,
        this.context.currentTime,
      )
    }
    if (update.playbackRate !== undefined) {
      voice.source.playbackRate.setValueAtTime(update.playbackRate, this.context.currentTime)
    }
    if (update.spatial !== undefined) {
      if (update.spatial && voice.panner) this.setPannerPosition(voice.panner, update.spatial)
    }
  }

  stopVoice(voiceId: AudioVoiceId): void {
    const voice = this.voices.get(voiceId)
    if (!voice) return
    this.voices.delete(voiceId)
    voice.source.onended = null
    voice.source.stop()
    this.disconnectVoice(voice)
  }

  setBusState(bus: AudioBus, state: AudioBusState): void {
    const value = state.muted ? 0 : state.volume
    this.requireBusNode(bus).gain.setValueAtTime(value, this.context.currentTime)
  }

  setListenerPose(pose: AudioListenerPose): void {
    this.assertUsable()
    const listener = this.context.listener
    this.setPositionParams(listener, pose.position)
    listener.forwardX.setValueAtTime(pose.forward.x, this.context.currentTime)
    listener.forwardY.setValueAtTime(pose.forward.y, this.context.currentTime)
    listener.forwardZ.setValueAtTime(pose.forward.z, this.context.currentTime)
    listener.upX.setValueAtTime(pose.up.x, this.context.currentTime)
    listener.upY.setValueAtTime(pose.up.y, this.context.currentTime)
    listener.upZ.setValueAtTime(pose.up.z, this.context.currentTime)
  }

  async setPaused(paused: boolean): Promise<void> {
    this.assertUsable()
    if (paused === this.paused) return
    if (paused) {
      await this.context.suspend()
    } else if (this.isUnlocked) {
      await this.context.resume()
    }
    this.paused = paused
  }

  dispose(): void {
    if (this.disposed) return
    for (const voiceId of [...this.voices.keys()]) this.stopVoice(voiceId)
    for (const node of this.busNodes.values()) node.disconnect()
    this.busNodes.clear()
    this.decodedClips.clear()
    this.disposed = true
    void this.context.close()
  }

  private createPanner(position: AudioPosition): PannerNode {
    const panner = this.context.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 1
    panner.maxDistance = 10_000
    panner.rolloffFactor = 1
    this.setPannerPosition(panner, position)
    return panner
  }

  private setPannerPosition(panner: PannerNode, position: AudioPosition): void {
    panner.positionX.setValueAtTime(position.x, this.context.currentTime)
    panner.positionY.setValueAtTime(position.y, this.context.currentTime)
    panner.positionZ.setValueAtTime(position.z, this.context.currentTime)
  }

  private setPositionParams(
    target: Pick<AudioListener, 'positionX' | 'positionY' | 'positionZ'>,
    position: AudioPosition,
  ): void {
    target.positionX.setValueAtTime(position.x, this.context.currentTime)
    target.positionY.setValueAtTime(position.y, this.context.currentTime)
    target.positionZ.setValueAtTime(position.z, this.context.currentTime)
  }

  private finishVoice(voiceId: AudioVoiceId): void {
    const voice = this.voices.get(voiceId)
    if (!voice) return
    this.voices.delete(voiceId)
    this.disconnectVoice(voice)
    voice.onEnded()
  }

  private disconnectVoice(voice: WebAudioVoice): void {
    voice.source.disconnect()
    voice.panner?.disconnect()
    voice.gain.disconnect()
  }

  private requireVoice(voiceId: AudioVoiceId): WebAudioVoice {
    const voice = this.voices.get(voiceId)
    if (!voice) throw new Error(`Unknown Web Audio voice: ${voiceId}`)
    return voice
  }

  private requireBusNode(bus: AudioBus): GainNode {
    const node = this.busNodes.get(bus)
    if (!node) throw new Error(`Unknown Web Audio bus: ${bus}`)
    return node
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Web Audio backend is disposed')
  }
}

export function createWebAudioBackend(): WebAudioBackend {
  if (typeof AudioContext === 'undefined') {
    throw new Error('Web Audio API is not available')
  }
  return new WebAudioBackend(new AudioContext())
}
