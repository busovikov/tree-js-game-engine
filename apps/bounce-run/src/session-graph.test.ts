import { describe, expect, it } from 'vitest'
import {
  DETERMINISTIC_GRAPH_CONTRACTS,
  compileGraph,
  createBuiltinTypeRegistry,
  createFoundationNodeRegistry,
} from '@haku/graph'
import { UI_GRAPH_CONTRACTS, registerUINodeContracts } from '@haku/ui'
import { BOUNCE_RUN_SESSION_IDS, createBounceRunSessionGraph } from './session-graph.js'

describe('Bounce Run session graph', () => {
  it('owns start, active, game-over, restart, and UI transitions in a compilable graph', () => {
    const registry = createFoundationNodeRegistry([registerUINodeContracts])
    const graph = createBounceRunSessionGraph(registry)

    expect(graph.graph.metadata).toMatchObject({
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
    })

    const nodeTypes = graph.graph.nodes.map((node) => node.type)
    expect(nodeTypes).toContain(DETERMINISTIC_GRAPH_CONTRACTS.setVariable.nodeType)
    expect(nodeTypes).toContain(UI_GRAPH_CONTRACTS.setVisible.nodeType)
    expect(nodeTypes).toContain(UI_GRAPH_CONTRACTS.setText.nodeType)
    expect(graph.graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining(Object.values(BOUNCE_RUN_SESSION_IDS.entries)),
    )
    expect(graph.graph.connections.length).toBeGreaterThan(20)

    const result = compileGraph(graph, {
      types: createBuiltinTypeRegistry(),
      nodes: registry,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.plan).toBeDefined()
  })
})
