import { describe, expect, it } from 'vitest'
import { EngineScheduler } from '@haku/core'
import {
  namedType,
  NUMBER_TYPE,
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  type ExecutionBackend,
  type NodeExecutionRequest,
} from './index.js'

const uid = (value: number): string =>
  `45100000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const PARAMETER = uid(1)
const OUTPUT = uid(2)
const EVENT = uid(3)
const SOURCE = uid(101)
const CONSUMER = uid(102)
const INSPECTOR = uid(103)
const SOURCE_OUT = uid(201)
const CONSUMER_IN = uid(202)

function runtimeNode(
  id: string,
  order: number,
): GraphExecutionPlan['nodes'][number] {
  return {
    id,
    nodeType: uid(order + 500),
    version: '1',
    kind: 'builtin',
    domain: 'FixedGameplay',
    order,
    typeArguments: {},
    properties: {},
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    exportedState: id === SOURCE
      ? [{ name: 'last', type: namedType(NUMBER_TYPE) }]
      : [],
    checkpoint: { eligible: true, causalChain: [] },
  }
}

function dataPlan(): GraphExecutionPlan {
  return {
    schemaVersion: 1,
    graphId: uid(900),
    registryFingerprint: 'runtime-test-registry',
    planFingerprint: 'runtime-test-plan',
    nodes: [
      runtimeNode(SOURCE, 0),
      runtimeNode(CONSUMER, 1),
      runtimeNode(INSPECTOR, 2),
    ],
    connections: [
      {
        id: uid(301),
        kind: 'data',
        operation: 'data-dependency',
        from: { node: SOURCE, callsite: SOURCE_OUT },
        to: { node: CONSUMER, callsite: CONSUMER_IN },
      },
    ],
    publicInterface: {
      ports: [
        {
          id: PARAMETER,
          name: 'Speed',
          kind: 'data',
          direction: 'input',
          type: namedType(NUMBER_TYPE),
        },
        {
          id: OUTPUT,
          name: 'Observed',
          kind: 'data',
          direction: 'output',
          type: namedType(NUMBER_TYPE),
        },
        {
          id: EVENT,
          name: 'Observed event',
          kind: 'event',
          direction: 'output',
          type: namedType(NUMBER_TYPE),
        },
      ],
    },
    subgraphs: [],
    checkpointEligible: true,
  }
}

describe('GraphInstance data and public API', () => {
  it('evaluates lazy data once against a stable snapshot and invalidates on parameter changes', () => {
    const scheduler = new EngineScheduler()
    const plan = dataPlan()
    const events: unknown[] = []
    let sourceEvaluations = 0
    const backend: ExecutionBackend = {
      execute(request: NodeExecutionRequest) {
        if (request.node.id === SOURCE) {
          sourceEvaluations += 1
          const value = request.getParameter(PARAMETER)
          return {
            data: { [SOURCE_OUT]: value },
            exportedState: { last: value },
          }
        }
        if (request.node.id === CONSUMER) {
          const first = request.readData(CONSUMER_IN)
          instance.setParameter(PARAMETER, 2)
          const second = request.readData(CONSUMER_IN)
          return {
            publicOutputs: { [OUTPUT]: [first, second] },
            publicEvents: { [EVENT]: first },
          }
        }
        return {
          publicOutputs: {
            [OUTPUT]: request.readNodeRef({ node: SOURCE }, 'last'),
          },
        }
      },
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan,
      registryFingerprint: plan.registryFingerprint,
      scheduler,
      backend,
    })
    instance.setParameter(PARAMETER, 1)
    instance.subscribe(EVENT, (value) => events.push(value))

    instance.start(CONSUMER)

    expect(instance.getOutput(OUTPUT)).toEqual([1, 1])
    expect(events).toEqual([1])
    expect(sourceEvaluations).toBe(1)

    instance.start(CONSUMER)
    expect(instance.getOutput(OUTPUT)).toEqual([2, 2])
    expect(events).toEqual([1, 2])
    expect(sourceEvaluations).toBe(2)

    instance.start(INSPECTOR)
    expect(instance.getOutput(OUTPUT)).toBe(2)
  })

  it('rejects unknown public ports and NodeRefs outside the current instance', () => {
    const scheduler = new EngineScheduler()
    const plan = dataPlan()
    const backend: ExecutionBackend = {
      execute(request) {
        if (request.node.id === INSPECTOR) {
          request.readNodeRef({ node: uid(999) }, 'last')
        }
        return {}
      },
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan,
      registryFingerprint: plan.registryFingerprint,
      scheduler,
      backend,
    })

    expect(() => instance.setParameter(uid(999), 1)).toThrow(
      'Unknown public input',
    )
    expect(() => instance.start(INSPECTOR)).toThrow(
      'NodeRef target is not in graph instance',
    )
  })
})
