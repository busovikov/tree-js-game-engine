import { describe, expect, it } from 'vitest'
import {
  NodeRegistry,
  type ExecutionPlanNode,
} from '@haku/graph'
import {
  NodeRuntimeRegistry,
  type NodeExecutionRequest,
  type NodeExecutionResult,
} from '@haku/graph-runtime'
import {
  AUDIO_CLIP_ASSET_TYPE,
  AUDIO_GRAPH_CONTRACTS,
  AudioRuntime,
  AudioService,
  HeadlessAudioBackend,
  audioClip,
  createAudioSdk,
  registerAudioNodeContracts,
  registerAudioRuntimeAdapters,
} from './index.js'

const CLIP_ID = 'a0000000-0000-4000-8000-000000000021'
const clip = audioClip(CLIP_ID, undefined, 0.4)
const source = {
  clip: { $ref: clip.id, type: AUDIO_CLIP_ASSET_TYPE },
  bus: 'sfx' as const,
  loop: false,
  volume: 0.75,
  playbackRate: 1,
  spatial: null,
}

function request(
  nodeType: string,
  properties: Readonly<Record<string, unknown>>,
  inputs: Readonly<Record<string, unknown>> = {},
): NodeExecutionRequest {
  const node: ExecutionPlanNode = {
    id: 'a0000000-0000-4000-8000-000000000022',
    nodeType,
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: 0,
    typeArguments: {},
    properties,
    reads: [],
    writes: [{ resource: 'audio', scope: 'static' }],
    effects: ['audio'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    instanceId: 'a0000000-0000-4000-8000-000000000023',
    graphId: 'a0000000-0000-4000-8000-000000000024',
    node,
    phase: 'FrameGameplay',
    tickNumber: 7,
    frameNumber: 9,
    snapshot: {
      id: 1,
      key: 'audio-snapshot',
      phase: 'FrameGameplay',
      tickNumber: 7,
      frameNumber: 9,
      resourceVersions: {},
    },
    signal: new AbortController().signal,
    getParameter: () => undefined,
    readResource: () => undefined,
    readData: (portId) => inputs[portId],
    readNodeRef: () => undefined,
    runSubgraph: () => ({ instanceId: 'child', outputs: {} }),
    spawnChild: (task) => task(new AbortController().signal),
  }
}

function createService(): {
  readonly backend: HeadlessAudioBackend
  readonly service: AudioService
} {
  const backend = new HeadlessAudioBackend()
  const runtime = new AudioRuntime(backend)
  runtime.registerClip(clip)
  return { backend, service: new AudioService(runtime) }
}

describe('audio service, SDK, and graph boundaries', () => {
  it('plays and stops through the public service and Custom Node SDK', () => {
    const { backend, service } = createService()
    const sdk = createAudioSdk(service)

    const serviceVoice = service.play(source)
    const sdkVoice = sdk.play({ ...source, bus: 'ui' })

    expect(backend.inspectVoice(serviceVoice).route).toEqual(['sfx', 'master'])
    expect(backend.inspectVoice(sdkVoice).route).toEqual(['ui', 'master'])

    sdk.stop(serviceVoice)
    service.stop(sdkVoice)
    expect(backend.activeVoiceCount).toBe(0)
  })

  it('declares four bounded audio-only mutation contracts', () => {
    const registry = new NodeRegistry()
    registerAudioNodeContracts(registry)

    expect(registry.all()).toHaveLength(4)
    for (const definition of registry.all()) {
      expect(definition.contract).toMatchObject({
        capabilities: ['audio'],
        writes: [{ resource: 'audio', scope: 'static' }],
        effects: ['audio'],
        checkpoint: 'safe',
        checkpointScope: 'bounded',
      })
    }
  })

  it('adapts play, stop, volume, and mute through stable audio effect records', () => {
    const { backend, service } = createService()
    const runtimes = new NodeRuntimeRegistry()
    registerAudioRuntimeAdapters(runtimes, service)

    const playContract = AUDIO_GRAPH_CONTRACTS.play
    const playRequest = request(playContract.nodeType, source)
    const firstPlay = runtimes.require(playContract.nodeType, '1').execute(
      playRequest,
    ) as NodeExecutionResult
    const repeatedPlay = runtimes.require(playContract.nodeType, '1').execute(
      playRequest,
    ) as NodeExecutionResult
    const firstVoice = firstPlay.data?.[playContract.ports.voice] as string
    const repeatedVoice = repeatedPlay.data?.[playContract.ports.voice] as string

    expect(firstPlay.effects).toMatchObject([{ kind: 'audio.play' }])
    expect(repeatedPlay.effects?.[0]?.id).toBe(firstPlay.effects?.[0]?.id)

    const volumeContract = AUDIO_GRAPH_CONTRACTS.setBusVolume
    const volumeResult = runtimes.require(volumeContract.nodeType, '1').execute(
      request(
        volumeContract.nodeType,
        { bus: 'sfx' },
        { [volumeContract.ports.value]: 0.25 },
      ),
    ) as NodeExecutionResult
    expect(volumeResult.effects).toMatchObject([{ kind: 'audio.set-bus-volume' }])
    expect(backend.inspectVoice(firstVoice).effectiveVolume).toBeCloseTo(0.1875)

    const muteContract = AUDIO_GRAPH_CONTRACTS.setBusMuted
    const muteResult = runtimes.require(muteContract.nodeType, '1').execute(
      request(
        muteContract.nodeType,
        { bus: 'sfx' },
        { [muteContract.ports.value]: true },
      ),
    ) as NodeExecutionResult
    expect(muteResult.effects).toMatchObject([{ kind: 'audio.set-bus-muted' }])
    expect(backend.inspectVoice(firstVoice).effectiveVolume).toBe(0)

    const stopContract = AUDIO_GRAPH_CONTRACTS.stop
    const stopResult = runtimes.require(stopContract.nodeType, '1').execute(
      request(
        stopContract.nodeType,
        {},
        { [stopContract.ports.voice]: repeatedVoice },
      ),
    ) as NodeExecutionResult
    expect(stopResult.effects).toMatchObject([{ kind: 'audio.stop' }])
    expect(backend.inspectVoice(repeatedVoice).active).toBe(false)
  })

  it('fails explicitly for unknown voices and invalid bus controls', () => {
    const { service } = createService()

    expect(() => service.stop('missing-voice')).toThrow(
      'Unknown active audio voice: missing-voice',
    )
    expect(() => service.setBusVolume('invalid' as never, 0.5)).toThrow(
      'Unknown audio bus: invalid',
    )
    expect(() => service.setBusMuted('invalid' as never, true)).toThrow(
      'Unknown audio bus: invalid',
    )
    expect(() => service.setBusVolume('master', 2)).toThrow(
      'Audio volume must be a finite number from 0 to 1',
    )
  })
})
