import {
  BOOL_TYPE,
  DETERMINISTIC_GRAPH_CONTRACTS,
  FOUNDATION_GRAPH_IDS,
  STRING_TYPE,
  namedType,
  type GraphAsset,
  type GraphCallsite,
  type GraphNode,
  type NodeRegistry,
} from '@haku/graph'
import { UI_GRAPH_CONTRACTS } from '@haku/ui'
import { BOUNCE_RUN_UI_IDS } from './ui-document.js'

const id = (value: number): string =>
  `b1100000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const BOUNCE_RUN_SESSION_IDS = {
  graph: id(1),
  nodes: { start: id(10) },
  entries: {
    startSession: id(11),
    pauseSession: id(12),
    resumeSession: id(13),
    failSession: id(14),
    restartSession: id(15),
  },
  variables: {
    state: 'session.state',
    true: 'constant.true',
    false: 'constant.false',
    start: 'constant.state.start',
    active: 'constant.state.active',
    paused: 'constant.state.paused',
    gameOver: 'constant.state.game-over',
  },
} as const

function callsites(
  registry: NodeRegistry,
  nodeType: string,
  concreteGeneric?: string,
): GraphCallsite[] {
  return registry.require(nodeType).contract.ports.map((port) => ({
    id: port.id,
    port: port.id,
    kind: port.kind,
    direction: port.direction,
    ...(port.kind === 'data' || port.kind === 'event'
      ? {
          type:
            port.type.kind === 'generic' && concreteGeneric
              ? namedType(concreteGeneric)
              : port.type,
        }
      : {}),
  })) as GraphCallsite[]
}

export function createBounceRunSessionGraph(registry: NodeRegistry): GraphAsset {
  const nodes: GraphNode[] = []
  const connections: GraphAsset['graph']['connections'][number][] = []
  let nextNodeId = 100
  let nextConnectionId = 90_000

  const addNode = (
    type: string,
    properties: Record<string, string> = {},
    domain: GraphNode['domain'] = 'FrameGameplay',
    fixedId?: string,
    concreteGeneric?: string,
  ): GraphNode => {
    const node: GraphNode = {
      id: fixedId ?? id(nextNodeId++),
      type,
      version: '1',
      callsites: callsites(registry, type, concreteGeneric),
      properties,
      layout: { x: nodes.length * 24, y: nodes.length * 16 },
      domain,
    }
    nodes.push(node)
    return node
  }
  const callsite = (node: GraphNode, port: string): string => {
    const match = node.callsites.find((item) => item.port === port)
    if (!match) throw new Error(`Node ${node.id} has no port ${port}`)
    return match.id
  }
  const connect = (from: GraphNode, fromPort: string, to: GraphNode, toPort: string): void => {
    connections.push({
      id: id(nextConnectionId++),
      from: { node: from.id, callsite: callsite(from, fromPort) },
      to: { node: to.id, callsite: callsite(to, toPort) },
    })
  }
  const variable = (key: string, type: string): GraphNode =>
    addNode(
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.nodeType,
      { key },
      'FrameGameplay',
      undefined,
      type,
    )

  const constantTrue = variable(BOUNCE_RUN_SESSION_IDS.variables.true, BOOL_TYPE)
  const constantFalse = variable(BOUNCE_RUN_SESSION_IDS.variables.false, BOOL_TYPE)
  const stateSources = {
    start: variable(BOUNCE_RUN_SESSION_IDS.variables.start, STRING_TYPE),
    active: variable(BOUNCE_RUN_SESSION_IDS.variables.active, STRING_TYPE),
    paused: variable(BOUNCE_RUN_SESSION_IDS.variables.paused, STRING_TYPE),
    'game-over': variable(BOUNCE_RUN_SESSION_IDS.variables.gameOver, STRING_TYPE),
  } as const

  const transition = (
    state: keyof typeof stateSources,
    visibility: readonly [boolean, boolean, boolean, boolean],
    entryId: string,
  ): GraphNode => {
    const source = stateSources[state]
    const setState = addNode(
      DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType,
      { key: BOUNCE_RUN_SESSION_IDS.variables.state },
      'FrameGameplay',
      undefined,
      STRING_TYPE,
    )
    connect(
      source,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setState,
      DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.value,
    )

    let previous = setState
    const targets = [
      BOUNCE_RUN_UI_IDS.startPanel,
      BOUNCE_RUN_UI_IDS.hudPanel,
      BOUNCE_RUN_UI_IDS.pausePanel,
      BOUNCE_RUN_UI_IDS.gameOverPanel,
    ] as const
    targets.forEach((elementId, index) => {
      const setVisible = addNode(
        UI_GRAPH_CONTRACTS.setVisible.nodeType,
        { documentId: BOUNCE_RUN_UI_IDS.document, elementId },
        'FrameGameplay',
      )
      connect(
        previous,
        previous === setState
          ? DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowOut
          : UI_GRAPH_CONTRACTS.setVisible.ports.flowOut,
        setVisible,
        UI_GRAPH_CONTRACTS.setVisible.ports.flowIn,
      )
      connect(
        visibility[index] ? constantTrue : constantFalse,
        DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
        setVisible,
        UI_GRAPH_CONTRACTS.setVisible.ports.value,
      )
      previous = setVisible
    })
    const setText = addNode(
      UI_GRAPH_CONTRACTS.setText.nodeType,
      { documentId: BOUNCE_RUN_UI_IDS.document, elementId: BOUNCE_RUN_UI_IDS.stateText },
      'FrameGameplay',
    )
    connect(
      previous,
      UI_GRAPH_CONTRACTS.setVisible.ports.flowOut,
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.flowIn,
    )
    connect(
      source,
      DETERMINISTIC_GRAPH_CONTRACTS.getVariable.ports.value,
      setText,
      UI_GRAPH_CONTRACTS.setText.ports.value,
    )
    const entry = addNode(FOUNDATION_GRAPH_IDS.onStart.nodeType, {}, 'FrameGameplay', entryId)
    connect(
      entry,
      FOUNDATION_GRAPH_IDS.onStart.ports.next,
      setState,
      DETERMINISTIC_GRAPH_CONTRACTS.setVariable.ports.flowIn,
    )
    return entry
  }

  transition('start', [true, false, false, false], BOUNCE_RUN_SESSION_IDS.nodes.start)
  const startSession = transition(
    'active',
    [false, true, false, false],
    BOUNCE_RUN_SESSION_IDS.entries.startSession,
  )
  transition('paused', [false, false, true, false], BOUNCE_RUN_SESSION_IDS.entries.pauseSession)
  transition('active', [false, true, false, false], BOUNCE_RUN_SESSION_IDS.entries.resumeSession)
  transition('game-over', [false, false, false, true], BOUNCE_RUN_SESSION_IDS.entries.failSession)
  transition('active', [false, true, false, false], BOUNCE_RUN_SESSION_IDS.entries.restartSession)

  return {
    schemaVersion: 1,
    graph: {
      id: BOUNCE_RUN_SESSION_IDS.graph,
      name: 'Bounce Run session orchestration',
      nodes,
      connections,
      publicInterface: { ports: [] },
      metadata: {
        orchestration: 'graph',
        states: ['start', 'active', 'paused', 'game-over'],
        transitions: [
          'start->active',
          'active->paused',
          'paused->active',
          'active->game-over',
          'game-over->active',
        ],
        ui: ['start', 'session', 'game-over'],
        entryNodes: {
          start: startSession.id,
          pause: BOUNCE_RUN_SESSION_IDS.entries.pauseSession,
          resume: BOUNCE_RUN_SESSION_IDS.entries.resumeSession,
          fail: BOUNCE_RUN_SESSION_IDS.entries.failSession,
          restart: BOUNCE_RUN_SESSION_IDS.entries.restartSession,
        },
      },
    },
  }
}
