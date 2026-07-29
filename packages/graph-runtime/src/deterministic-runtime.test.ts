import { describe, expect, it } from 'vitest'
import { DETERMINISTIC_GRAPH_CONTRACTS } from '@haku/graph'
import {
  NodeRuntimeRegistry,
  createGraphVariableStore,
  createSeededRandomService,
  registerDeterministicRuntimeAdapters,
  type NodeExecutionRequest,
} from './index.js'

function execute(
  registry: NodeRuntimeRegistry,
  contract: {
    readonly nodeType: string
    readonly ports: Readonly<Record<string, string>>
  },
  values: Readonly<Record<string, unknown>> = {},
  properties: Readonly<Record<string, unknown>> = {},
) {
  return registry.require(contract.nodeType, '1').execute({
    instanceId: 'instance',
    node: { id: 'node', nodeType: contract.nodeType, version: '1', properties },
    tickNumber: 1,
    frameNumber: 2,
    readData: (portId) => values[portId],
  } as NodeExecutionRequest)
}

describe('deterministic foundation runtime', () => {
  it('stores cloned variable values and rejects missing keys', () => {
    const variables = createGraphVariableStore()
    const random = createSeededRandomService(123)
    const registry = new NodeRuntimeRegistry()
    registerDeterministicRuntimeAdapters(registry, { variables, random })
    const set = DETERMINISTIC_GRAPH_CONTRACTS.setVariable
    const get = DETERMINISTIC_GRAPH_CONTRACTS.getVariable
    const value = { score: 3 }

    execute(registry, set, { [set.ports.value]: value }, { key: 'score' })
    value.score = 9

    expect(execute(registry, get, {}, { key: 'score' })).toEqual({
      data: { [get.ports.value]: { score: 3 } },
    })
    expect(() => execute(registry, get, {}, { key: 'missing' })).toThrow(
      'Unknown graph variable: missing',
    )
  })

  it('keeps seeded random deterministic across checkpoint capture and restore', () => {
    const first = createSeededRandomService(0x12345678)
    const second = createSeededRandomService(0x12345678)

    expect(first.next()).toBe(second.next())
    const checkpoint = first.capture()
    const expected = [first.next(), first.next()]
    first.restore(checkpoint)
    expect([first.next(), first.next()]).toEqual(expected)
    expect(() => first.restore({ state: -1 })).toThrow()
  })

  it('executes finite multiplication, dot product, and random range nodes', () => {
    const registry = new NodeRuntimeRegistry()
    registerDeterministicRuntimeAdapters(registry, {
      variables: createGraphVariableStore(),
      random: createSeededRandomService(7),
    })
    const multiply = DETERMINISTIC_GRAPH_CONTRACTS.multiply
    const dot = DETERMINISTIC_GRAPH_CONTRACTS.dotVec3
    const random = DETERMINISTIC_GRAPH_CONTRACTS.randomNumber

    expect(execute(registry, multiply, {
      [multiply.ports.a]: 4,
      [multiply.ports.b]: 2.5,
    })).toEqual({ data: { [multiply.ports.result]: 10 } })
    expect(execute(registry, dot, {
      [dot.ports.a]: [1, 2, 3],
      [dot.ports.b]: [4, 5, 6],
    })).toEqual({ data: { [dot.ports.result]: 32 } })
    const result = execute(registry, random, {
      [random.ports.min]: 10,
      [random.ports.max]: 20,
    })
    const value = (result as { data: Record<string, number> }).data[
      random.ports.value
    ]!
    expect(value).toBeGreaterThanOrEqual(10)
    expect(value).toBeLessThan(20)
    expect(result).toMatchObject({
      effects: [{ kind: 'random.seeded' }],
    })
    expect(() => execute(registry, random, {
      [random.ports.min]: 2,
      [random.ports.max]: 2,
    })).toThrow('Random range maximum must be greater than minimum')
  })
})
