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
  `45200000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const PARENT_CALL = uid(101)
const CHILD_ENTRY = uid(201)
const CHILD_PARAMETER = uid(301)
const CHILD_OUTPUT = uid(302)
const PARENT_OUTPUT = uid(303)
const SUBGRAPH_ASSET = uid(401)

function node(
  id: string,
  nodeType: string,
  kind: 'builtin' | 'subgraph',
): GraphExecutionPlan['nodes'][number] {
  return {
    id,
    nodeType,
    version: '1',
    kind,
    domain: 'FixedGameplay',
    order: 0,
    typeArguments: {},
    properties: {},
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
}

function childPlan(): GraphExecutionPlan {
  return {
    schemaVersion: 1,
    graphId: uid(902),
    registryFingerprint: 'subgraph-registry',
    planFingerprint: 'child-plan',
    nodes: [node(CHILD_ENTRY, uid(501), 'builtin')],
    connections: [],
    publicInterface: {
      ports: [
        {
          id: CHILD_PARAMETER,
          name: 'Value',
          kind: 'data',
          direction: 'input',
          type: namedType(NUMBER_TYPE),
        },
        {
          id: CHILD_OUTPUT,
          name: 'Doubled',
          kind: 'data',
          direction: 'output',
          type: namedType(NUMBER_TYPE),
        },
      ],
    },
    subgraphs: [],
    checkpointEligible: true,
  }
}

function parentPlan(): GraphExecutionPlan {
  return {
    schemaVersion: 1,
    graphId: uid(901),
    registryFingerprint: 'subgraph-registry',
    planFingerprint: 'parent-plan',
    nodes: [node(PARENT_CALL, uid(502), 'subgraph')],
    connections: [],
    publicInterface: {
      ports: [
        {
          id: PARENT_OUTPUT,
          name: 'Result',
          kind: 'data',
          direction: 'output',
          type: namedType(NUMBER_TYPE),
        },
      ],
    },
    subgraphs: [
      {
        nodeId: PARENT_CALL,
        assetId: SUBGRAPH_ASSET,
        graphId: uid(902),
      },
    ],
    checkpointEligible: true,
  }
}

describe('GraphInstance subgraphs', () => {
  it('runs a compiled child plan with isolated parameters and public outputs', () => {
    const scheduler = new EngineScheduler()
    const parent = parentPlan()
    const child = childPlan()
    const seenInstances: string[] = []
    const backend: ExecutionBackend = {
      execute(request: NodeExecutionRequest) {
        seenInstances.push(request.instanceId)
        if (request.node.id === CHILD_ENTRY) {
          return {
            publicOutputs: {
              [CHILD_OUTPUT]: Number(request.getParameter(CHILD_PARAMETER)) * 2,
            },
          }
        }
        const result = request.runSubgraph({
          entryNodeId: CHILD_ENTRY,
          parameters: { [CHILD_PARAMETER]: 21 },
        })
        if (result instanceof Promise) {
          throw new Error('Fixture subgraph should complete synchronously')
        }
        return {
          publicOutputs: {
            [PARENT_OUTPUT]: result.outputs[CHILD_OUTPUT],
          },
        }
      },
    }
    const instance = new GraphInstance({
      id: uid(900),
      plan: parent,
      registryFingerprint: parent.registryFingerprint,
      scheduler,
      backend,
      subgraphPlans: new Map([[SUBGRAPH_ASSET, child]]),
    })

    instance.start(PARENT_CALL)

    expect(instance.getOutput(PARENT_OUTPUT)).toBe(42)
    expect(seenInstances).toEqual([
      uid(900),
      `${uid(900)}:${PARENT_CALL}:0`,
    ])
  })

  it('rejects a missing child plan before invoking the backend', () => {
    const scheduler = new EngineScheduler()
    const parent = parentPlan()
    const instance = new GraphInstance({
      id: uid(900),
      plan: parent,
      registryFingerprint: parent.registryFingerprint,
      scheduler,
      backend: { execute: () => ({}) },
    })

    expect(() => instance.start(PARENT_CALL)).toThrow(
      `Missing compiled subgraph plan ${SUBGRAPH_ASSET}`,
    )
  })
})
