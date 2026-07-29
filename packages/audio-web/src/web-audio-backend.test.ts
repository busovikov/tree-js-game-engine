import { describe, expect, it } from 'vitest'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AudioRuntime,
  audioClip,
} from '@haku/audio'
import { WebAudioBackend } from './index.js'

class FakeAudioParam {
  value = 1

  setValueAtTime(value: number): void {
    this.value = value
  }
}

class FakeAudioNode {
  readonly connections: FakeAudioNode[] = []
  disconnected = false

  connect(target: FakeAudioNode): FakeAudioNode {
    this.connections.push(target)
    return target
  }

  disconnect(): void {
    this.disconnected = true
  }
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam()
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null
  loop = false
  readonly playbackRate = new FakeAudioParam()
  onended: (() => void) | null = null
  started = false
  stopped = false

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
    this.onended?.()
  }
}

class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = 'equalpower'
  distanceModel: DistanceModelType = 'inverse'
  refDistance = 1
  maxDistance = 10_000
  rolloffFactor = 1
  readonly positionX = new FakeAudioParam()
  readonly positionY = new FakeAudioParam()
  readonly positionZ = new FakeAudioParam()
}

class FakeAudioListener {
  readonly positionX = new FakeAudioParam()
  readonly positionY = new FakeAudioParam()
  readonly positionZ = new FakeAudioParam()
  readonly forwardX = new FakeAudioParam()
  readonly forwardY = new FakeAudioParam()
  readonly forwardZ = new FakeAudioParam()
  readonly upX = new FakeAudioParam()
  readonly upY = new FakeAudioParam()
  readonly upZ = new FakeAudioParam()
}

class FakeAudioContext {
  readonly destination = new FakeAudioNode()
  readonly listener = new FakeAudioListener()
  readonly gains: FakeGainNode[] = []
  readonly sources: FakeBufferSourceNode[] = []
  readonly panners: FakePannerNode[] = []
  readonly decodedInputs: ArrayBuffer[] = []
  currentTime = 4
  state: AudioContextState = 'suspended'
  resumeCalls = 0
  suspendCalls = 0
  closeCalls = 0
  suspendError: Error | null = null
  resumeError: Error | null = null

  createGain(): GainNode {
    const node = new FakeGainNode()
    this.gains.push(node)
    return node as unknown as GainNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeBufferSourceNode()
    this.sources.push(node)
    return node as unknown as AudioBufferSourceNode
  }

  createPanner(): PannerNode {
    const node = new FakePannerNode()
    this.panners.push(node)
    return node as unknown as PannerNode
  }

  async decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    this.decodedInputs.push(bytes)
    return { duration: 1 } as AudioBuffer
  }

  async resume(): Promise<void> {
    this.resumeCalls += 1
    if (this.resumeError) {
      const error = this.resumeError
      this.resumeError = null
      throw error
    }
    this.state = 'running'
  }

  async suspend(): Promise<void> {
    this.suspendCalls += 1
    if (this.suspendError) {
      const error = this.suspendError
      this.suspendError = null
      throw error
    }
    this.state = 'suspended'
  }

  async close(): Promise<void> {
    this.closeCalls += 1
    this.state = 'closed'
  }
}

const clipId = 'a0000000-0000-4000-8000-000000000004'
const clip = audioClip(clipId, new Uint8Array([82, 73, 70, 70]))
const clipReference = { $ref: clip.id, type: AUDIO_CLIP_ASSET_TYPE }

describe('WebAudioBackend', () => {
  it('decodes in-memory clip bytes and requires an explicit unlock before resuming', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)

    await backend.loadClip(clip)
    expect(context.decodedInputs).toHaveLength(1)
    expect(context.resumeCalls).toBe(0)

    await backend.unlock()
    expect(context.resumeCalls).toBe(1)
    expect(backend.unlocked).toBe(true)
  })

  it('routes spatial playback through a PannerNode and updates modern AudioParam positions', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)
    await backend.loadClip(clip)
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)

    const voice = runtime.play({
      clip: clipReference,
      bus: 'sfx',
      loop: true,
      volume: 0.7,
      playbackRate: 1.2,
      spatial: { x: 1, y: 2, z: 3 },
    })
    runtime.updateVoice(voice, {
      playbackRate: 0.8,
      spatial: { x: -2, y: 4, z: 8 },
    })

    expect(context.sources[0]).toMatchObject({
      loop: true,
      started: true,
      playbackRate: { value: 0.8 },
    })
    expect(context.panners[0]).toMatchObject({
      panningModel: 'HRTF',
      positionX: { value: -2 },
      positionY: { value: 4 },
      positionZ: { value: 8 },
    })
    expect(context.panners[0]?.connections[0]).toBe(context.gains[4])
  })

  it('suspends globally, resumes only after unlock, and releases nodes on cleanup', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)
    await backend.loadClip(clip)
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    runtime.play({
      clip: clipReference,
      bus: 'music',
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })

    await runtime.setPaused(true)
    await runtime.setPaused(false)
    expect(context.suspendCalls).toBe(1)
    expect(context.resumeCalls).toBe(0)

    await backend.unlock()
    await runtime.setPaused(true)
    await runtime.setPaused(false)
    expect(context.resumeCalls).toBe(2)

    runtime.dispose()
    expect(context.sources[0]?.stopped).toBe(true)
    expect(context.closeCalls).toBe(1)
  })

  it('releases naturally ended one-shots and restores local volume after unmute', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)
    await backend.loadClip(clip)
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    const voice = runtime.play({
      clip: clipReference,
      bus: 'sfx',
      loop: false,
      volume: 0.6,
      playbackRate: 1,
      spatial: null,
    })

    runtime.updateVoice(voice, { muted: true })
    expect(context.gains[4]?.gain.value).toBe(0)
    runtime.updateVoice(voice, { volume: 0.35 })
    expect(context.gains[4]?.gain.value).toBe(0)
    runtime.updateVoice(voice, { muted: false })
    expect(context.gains[4]?.gain.value).toBe(0.35)

    context.sources[0]?.onended?.()
    expect(runtime.activeVoiceCount).toBe(0)
    expect(context.sources[0]?.disconnected).toBe(true)
    expect(context.gains[4]?.disconnected).toBe(true)
  })

  it('updates listener pose through AudioParams and rejects spatial-mode transitions', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)
    await backend.loadClip(clip)
    const runtime = new AudioRuntime(backend)
    runtime.registerClip(clip)
    runtime.setListenerPose({
      position: { x: 3, y: 4, z: 5 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    })

    expect(context.listener).toMatchObject({
      positionX: { value: 3 },
      positionY: { value: 4 },
      positionZ: { value: 5 },
      forwardX: { value: 0 },
      forwardY: { value: 0 },
      forwardZ: { value: -1 },
      upX: { value: 0 },
      upY: { value: 1 },
      upZ: { value: 0 },
    })

    const spatialVoice = runtime.play({
      clip: clipReference,
      bus: 'sfx',
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: { x: 0, y: 0, z: 0 },
    })
    const flatVoice = runtime.play({
      clip: clipReference,
      bus: 'ui',
      loop: true,
      volume: 1,
      playbackRate: 1,
      spatial: null,
    })

    expect(() => runtime.updateVoice(spatialVoice, { spatial: null })).toThrow(
      'Cannot change an active spatial voice to non-spatial',
    )
    expect(() =>
      runtime.updateVoice(flatVoice, { spatial: { x: 1, y: 0, z: 0 } }),
    ).toThrow('Cannot change an active non-spatial voice to spatial')
  })

  it('surfaces suspend and resume promise failures without accepting the transition', async () => {
    const context = new FakeAudioContext()
    const backend = new WebAudioBackend(context as unknown as AudioContext)
    const runtime = new AudioRuntime(backend)

    context.suspendError = new Error('suspend denied')
    await expect(runtime.setPaused(true)).rejects.toThrow('suspend denied')
    await runtime.setPaused(true)

    await backend.unlock()
    context.resumeError = new Error('resume denied')
    await expect(runtime.setPaused(false)).rejects.toThrow('resume denied')
    await runtime.setPaused(false)

    expect(context.suspendCalls).toBe(2)
    expect(context.resumeCalls).toBe(2)
  })

  it('fails explicitly when bytes are absent or playback was not decoded', async () => {
    const backend = new WebAudioBackend(new FakeAudioContext() as unknown as AudioContext)
    const missingBytes = audioClip(clipId)

    await expect(backend.loadClip(missingBytes)).rejects.toThrow('has no in-memory bytes')
    expect(() =>
      backend.startVoice(
        {
          clip: clipReference,
          clipData: missingBytes,
          bus: 'ui',
          loop: false,
          volume: 1,
          playbackRate: 1,
          spatial: null,
        },
        () => {},
      ),
    ).toThrow('is not decoded')
  })
})
