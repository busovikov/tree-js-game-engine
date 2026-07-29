import { describe, expect, it } from 'vitest'
import {
  AUDIO_GRAPH_CONTRACTS,
  registerAudioNodeContracts,
} from '@haku/audio'
import {
  POOL_GRAPH_CONTRACTS,
  registerPoolNodeContracts,
} from '@haku/pool'
import {
  UI_GRAPH_CONTRACTS,
  registerUINodeContracts,
} from '@haku/ui'
import {
  DETERMINISTIC_GRAPH_CONTRACTS,
  FOUNDATION_GRAPH_IDS,
  NUMBER_TYPE,
  SERVICE_GRAPH_CONTRACTS,
  STRING_TYPE,
  compileGraph,
  createBuiltinTypeRegistry,
  createFoundationNodeRegistry,
  namedType,
  type GraphAsset,
  type GraphCallsite,
  type NodeRegistry,
} from './index.js'

const uid = (value: number): string =>
  `74400000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const IDS = {
  graph: uid(1),
  pool: uid(2),
  document: uid(3),
  element: uid(4),
  nodes: {
    start: uid(10),
    branch: uid(11),
    random: uid(12),
    pool: uid(13),
    ui: uid(14),
    audio: uid(15),
    save: uid(16),
    platform: uid(17),
  },
} as const

function callsites(
  registry: NodeRegistry,
  nodeType: string,
  firstId: number,
  genericType = namedType(STRING_TYPE),
): GraphCallsite[] {
  return registry.require(nodeType).contract.ports.map((port, index) => ({
    id: uid(firstId + index),
    port: port.id,
    kind: port.kind,
    direction: port.direction,
    ...((port.kind === 'data' || port.kind === 'event')
      ? { type: port.type.kind === 'generic' ? genericType : port.type }
      : {}),
  })) as GraphCallsite[]
}

function node(
  registry: NodeRegistry,
  id: string,
  nodeType: string,
  firstCallsiteId: number,
  domain: NonNullable<GraphAsset['graph']['nodes'][number]['domain']>,
  properties: Record<string, unknown> = {},
): GraphAsset['graph']['nodes'][number] {
  return {
    id,
    type: nodeType,
    version: '1',
    callsites: callsites(registry, nodeType, firstCallsiteId),
    properties,
    layout: { x: firstCallsiteId, y: 0 },
    domain,
  }
}

function endpoint(
  graphNode: GraphAsset['graph']['nodes'][number],
  port: string,
): { node: string; callsite: string } {
  return {
    node: graphNode.id,
    callsite: graphNode.callsites.find((item) => item.port === port)!.id,
  }
}

function boundedFoundationGraph(registry: NodeRegistry): GraphAsset {
  const start = node(
    registry,
    IDS.nodes.start,
    FOUNDATION_GRAPH_IDS.onStart.nodeType,
    100,
    'FrameGameplay',
  )
  const branch = node(
    registry,
    IDS.nodes.branch,
    FOUNDATION_GRAPH_IDS.branch.nodeType,
    110,
    'FrameGameplay',
  )
  const random = node(
    registry,
    IDS.nodes.random,
    DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.nodeType,
    120,
    'FrameGameplay',
  )
  const pool = node(
    registry,
    IDS.nodes.pool,
    POOL_GRAPH_CONTRACTS.acquire.nodeType,
    130,
    'FixedGameplay',
    { poolId: IDS.pool },
  )
  const ui = node(
    registry,
    IDS.nodes.ui,
    UI_GRAPH_CONTRACTS.setText.nodeType,
    140,
    'Presentation',
    { documentId: IDS.document, elementId: IDS.element },
  )
  const audio = node(
    registry,
    IDS.nodes.audio,
    AUDIO_GRAPH_CONTRACTS.setBusVolume.nodeType,
    150,
    'FrameGameplay',
    { bus: 'ui' },
  )
  const save = node(
    registry,
    IDS.nodes.save,
    SERVICE_GRAPH_CONTRACTS.saveValue.nodeType,
    160,
    'FrameGameplay',
    { key: 'm10f.catalog' },
  )
  const platform = node(
    registry,
    IDS.nodes.platform,
    SERVICE_GRAPH_CONTRACTS.hasPlatformCapability.nodeType,
    170,
    'FrameGameplay',
    { capability: 'audio' },
  )

  return {
    schemaVersion: 1,
    graph: {
      id: IDS.graph,
      name: 'M10f bounded cross-service foundation',
      nodes: [start, branch, random, pool, ui, audio, save, platform],
      connections: [
        {
          id: uid(200),
          from: endpoint(start, FOUNDATION_GRAPH_IDS.onStart.ports.next),
          to: endpoint(branch, FOUNDATION_GRAPH_IDS.branch.ports.flowIn),
        },
        {
          id: uid(201),
          from: endpoint(
            platform,
            SERVICE_GRAPH_CONTRACTS.hasPlatformCapability.ports.available,
          ),
          to: endpoint(branch, FOUNDATION_GRAPH_IDS.branch.ports.condition),
        },
        {
          id: uid(202),
          from: endpoint(branch, FOUNDATION_GRAPH_IDS.branch.ports.whenTrue),
          to: endpoint(pool, POOL_GRAPH_CONTRACTS.acquire.ports.flowIn),
        },
        {
          id: uid(203),
          from: endpoint(pool, POOL_GRAPH_CONTRACTS.acquire.ports.flowOut),
          to: endpoint(ui, UI_GRAPH_CONTRACTS.setText.ports.flowIn),
        },
        {
          id: uid(204),
          from: endpoint(ui, UI_GRAPH_CONTRACTS.setText.ports.flowOut),
          to: endpoint(audio, AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.flowIn),
        },
        {
          id: uid(205),
          from: endpoint(
            random,
            DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.ports.value,
          ),
          to: endpoint(audio, AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.value),
        },
        {
          id: uid(206),
          from: endpoint(audio, AUDIO_GRAPH_CONTRACTS.setBusVolume.ports.flowOut),
          to: endpoint(save, SERVICE_GRAPH_CONTRACTS.saveValue.ports.flowIn),
        },
      ],
      publicInterface: { ports: [] },
      metadata: { bounded: true },
    },
  }
}

describe('cross-service foundation catalog integration', () => {
  it('compiles one deterministic catalog with explicit crossings, effects, and checkpoint causes', () => {
    const registry = createFoundationNodeRegistry([
      registerPoolNodeContracts,
      registerUINodeContracts,
      registerAudioNodeContracts,
    ])
    const result = compileGraph(boundedFoundationGraph(registry), {
      types: createBuiltinTypeRegistry(),
      nodes: registry,
    })

    expect(result.diagnostics).toEqual([])
    expect(registry.all()).toHaveLength(35)
    expect(registry.fingerprint()).toBe(
      'haku-registry-v1-0d438213',
    )
    expect(
      result.plan?.connections
        .filter((connection) => connection.operation === 'queue-flow')
        .map((connection) => connection.id),
    ).toEqual([uid(202), uid(203), uid(204)])
    expect([
      ...new Set(result.plan?.nodes.flatMap((item) => item.effects)),
    ].sort()).toEqual([
      'audio',
      'platform',
      'pool',
      'random.seeded',
      'storage.write',
      'ui',
    ])
    expect(
      result.plan?.nodes.find(
        (item) => item.nodeType === SERVICE_GRAPH_CONTRACTS.saveValue.nodeType,
      )?.checkpoint,
    ).toEqual({
      eligible: false,
      causalChain: ['node Save Value', 'checkpoint policy unsafe'],
    })
    expect(
      result.plan?.nodes.find(
        (item) =>
          item.nodeType ===
          SERVICE_GRAPH_CONTRACTS.hasPlatformCapability.nodeType,
      )?.checkpoint,
    ).toEqual({
      eligible: false,
      causalChain: [
        'node Has Platform Capability',
        'checkpoint policy conditional',
      ],
    })
    expect(
      registry.require(SERVICE_GRAPH_CONTRACTS.saveValue.nodeType).contract
        .asyncCheckpointPolicies,
    ).toEqual(['wait', 'reject'])
    expect(
      registry.require(SERVICE_GRAPH_CONTRACTS.loadValue.nodeType).contract
        .asyncCheckpointPolicies,
    ).toEqual(['materialized', 'reject'])
  })
})
