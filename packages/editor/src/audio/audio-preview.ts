import {
  AudioRuntime,
  type AudioBackend,
  type AudioClip,
  type AudioSource,
  type AudioVoiceId,
} from '@haku/audio'
import { createWebAudioBackend } from '@haku/audio-web'

export interface UnlockableAudioBackend extends AudioBackend {
  unlock(): Promise<void>
  loadClip(clip: AudioClip): Promise<void>
}

export class EditorAudioPreview {
  private runtime: AudioRuntime | null = null
  private unlockedBackend: UnlockableAudioBackend | null = null

  constructor(
    private readonly loadClip: (source: AudioSource['clip']) => Promise<AudioClip>,
    private readonly createBackend: () => UnlockableAudioBackend = createWebAudioBackend,
  ) {}

  async unlock(): Promise<void> {
    this.stop()
    const backend = this.createBackend()
    this.unlockedBackend = backend
    try {
      await backend.unlock()
    } catch (error) {
      this.unlockedBackend = null
      backend.dispose()
      throw error
    }
  }

  async playUnlocked(source: AudioSource): Promise<AudioVoiceId> {
    const backend = this.unlockedBackend
    if (!backend) throw new Error('Audio preview is not unlocked')
    this.unlockedBackend = null
    try {
      const clip = await this.loadClip(source.clip)
      await backend.loadClip(clip)
      const runtime = new AudioRuntime(backend)
      runtime.registerClip(clip)
      this.runtime = runtime
      return runtime.play(source, 'editor-audio-preview')
    } catch (error) {
      backend.dispose()
      throw error
    }
  }

  async play(source: AudioSource): Promise<AudioVoiceId> {
    await this.unlock()
    return this.playUnlocked(source)
  }

  stop(): void {
    this.runtime?.dispose()
    this.runtime = null
    this.unlockedBackend?.dispose()
    this.unlockedBackend = null
  }
}
