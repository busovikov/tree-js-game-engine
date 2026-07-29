import { describe, expect, it } from 'vitest'
import {
  compileGraph,
  createBuiltinTypeRegistry,
  createFoundationNodeRegistry,
} from '@haku/graph'
import { registerUINodeContracts } from '@haku/ui'
import { createBounceRunSessionGraph } from './session-graph.js'

describe('Bounce Run session graph', () => {
  it('owns start, active, game-over, restart, and UI transitions in a compilable graph', () => {
    const registry = createFoundationNodeRegistry([
      registerUINodeContracts,
    ])
    const graph = createBounceRunSessionGraph(registry)

    expect(graph.graph.metadata).toMatchObject({
      orchestration: 'graph',
      states: ['start', 'active', 'game-over'],
      transitions: [
        'start->active',
        'active->game-over',
        'game-over->active',
      ],
      ui: ['start', 'session', 'game-over'],
    })

    const result = compileGraph(graph, {
      types: createBuiltinTypeRegistry(),
      nodes: registry,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.plan).toBeDefined()
  })
})
