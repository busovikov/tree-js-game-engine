import { describe, expect, it } from 'vitest'
import { FOUNDATION_GRAPH_IDS } from '@haku/graph'
import {
  NodeRuntimeRegistry,
  registerFoundationRuntimeAdapters,
  type NodeExecutionRequest,
} from './index.js'

function execute(
  registry: NodeRuntimeRegistry,
  nodeType: string,
  values: Readonly<Record<string, unknown>> = {},
) {
  return registry.require(nodeType, '1').execute({
    node: { id: 'foundation-node', nodeType, version: '1', properties: {} },
    readData: (portId) => values[portId],
  } as NodeExecutionRequest)
}

describe('foundation runtime adapters', () => {
  it('dispatches lifecycle and boolean control flow through stable ports', () => {
    const registry = new NodeRuntimeRegistry()
    registerFoundationRuntimeAdapters(registry)

    expect(execute(registry, FOUNDATION_GRAPH_IDS.onStart.nodeType)).toEqual({
      flow: [FOUNDATION_GRAPH_IDS.onStart.ports.next],
    })
    expect(execute(registry, FOUNDATION_GRAPH_IDS.branch.nodeType, {
      [FOUNDATION_GRAPH_IDS.branch.ports.condition]: true,
    })).toEqual({
      flow: [FOUNDATION_GRAPH_IDS.branch.ports.whenTrue],
    })
    expect(execute(registry, FOUNDATION_GRAPH_IDS.branch.nodeType, {
      [FOUNDATION_GRAPH_IDS.branch.ports.condition]: false,
    })).toEqual({
      flow: [FOUNDATION_GRAPH_IDS.branch.ports.whenFalse],
    })
  })

  it('evaluates finite scalar and vector addition without mutating inputs', () => {
    const registry = new NodeRuntimeRegistry()
    registerFoundationRuntimeAdapters(registry)
    const left = [1, 2, 3] as const
    const right = [4, 5, 6] as const

    expect(execute(registry, FOUNDATION_GRAPH_IDS.add.nodeType, {
      [FOUNDATION_GRAPH_IDS.add.ports.a]: 2,
      [FOUNDATION_GRAPH_IDS.add.ports.b]: 3,
    })).toEqual({
      data: { [FOUNDATION_GRAPH_IDS.add.ports.result]: 5 },
    })
    expect(execute(registry, FOUNDATION_GRAPH_IDS.addVec3.nodeType, {
      [FOUNDATION_GRAPH_IDS.addVec3.ports.a]: left,
      [FOUNDATION_GRAPH_IDS.addVec3.ports.b]: right,
    })).toEqual({
      data: { [FOUNDATION_GRAPH_IDS.addVec3.ports.result]: [5, 7, 9] },
    })
    expect(left).toEqual([1, 2, 3])
    expect(right).toEqual([4, 5, 6])
  })

  it('rejects invalid branch, non-finite scalar, and malformed vector inputs', () => {
    const registry = new NodeRuntimeRegistry()
    registerFoundationRuntimeAdapters(registry)

    expect(() => execute(registry, FOUNDATION_GRAPH_IDS.branch.nodeType, {
      [FOUNDATION_GRAPH_IDS.branch.ports.condition]: 'yes',
    })).toThrow()
    expect(() => execute(registry, FOUNDATION_GRAPH_IDS.add.nodeType, {
      [FOUNDATION_GRAPH_IDS.add.ports.a]: Number.POSITIVE_INFINITY,
      [FOUNDATION_GRAPH_IDS.add.ports.b]: 1,
    })).toThrow()
    expect(() => execute(registry, FOUNDATION_GRAPH_IDS.addVec3.nodeType, {
      [FOUNDATION_GRAPH_IDS.addVec3.ports.a]: [1, 2],
      [FOUNDATION_GRAPH_IDS.addVec3.ports.b]: [3, 4, 5],
    })).toThrow()
  })
})
