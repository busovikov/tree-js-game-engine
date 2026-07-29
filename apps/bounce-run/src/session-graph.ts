import {
  FOUNDATION_GRAPH_IDS,
  type GraphAsset,
  type GraphCallsite,
  type NodeRegistry,
} from '@haku/graph'

const id = (value: number): string =>
  `b1100000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const BOUNCE_RUN_SESSION_IDS = {
  graph: id(1),
  nodes: {
    start: id(10),
  },
} as const

function callsites(
  registry: NodeRegistry,
  nodeType: string,
  firstId: number,
): GraphCallsite[] {
  return registry.require(nodeType).contract.ports.map((port, index) => ({
    id: id(firstId + index),
    port: port.id,
    kind: port.kind,
    direction: port.direction,
    ...((port.kind === 'data' || port.kind === 'event')
      ? { type: port.type }
      : {}),
  })) as GraphCallsite[]
}

export function createBounceRunSessionGraph(
  registry: NodeRegistry,
): GraphAsset {
  return {
    schemaVersion: 1,
    graph: {
      id: BOUNCE_RUN_SESSION_IDS.graph,
      name: 'Bounce Run session orchestration',
      nodes: [{
        id: BOUNCE_RUN_SESSION_IDS.nodes.start,
        type: FOUNDATION_GRAPH_IDS.onStart.nodeType,
        version: '1',
        callsites: callsites(
          registry,
          FOUNDATION_GRAPH_IDS.onStart.nodeType,
          100,
        ),
        properties: {},
        layout: { x: 0, y: 0, label: 'Start session flow' },
        domain: 'FrameGameplay',
      }],
      connections: [],
      publicInterface: { ports: [] },
      metadata: {
        orchestration: 'graph',
        states: ['start', 'active', 'game-over'],
        transitions: [
          'start->active',
          'active->game-over',
          'game-over->active',
        ],
        ui: ['start', 'session', 'game-over'],
      },
    },
  }
}
