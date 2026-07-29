import { describe, expect, it } from 'vitest'
import { EngineScheduler } from '@haku/core'
import {
  DETERMINISTIC_GRAPH_CONTRACTS,
  FOUNDATION_GRAPH_IDS,
  SERVICE_GRAPH_CONTRACTS,
  WORLD_GRAPH_CONTRACTS,
  type ExecutionPlanNode,
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  createDeterministicResourceSnapshotProvider,
  createFoundationRuntimeRegistry,
  createGraphVariableStore,
  createSeededRandomService,
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
} from './index.js'

const uid = (value: number): string =>
  `74500000-0000-4000-8000-${value.toString().padStart(12, '0')}`

function request(
  nodeType: string,
  inputs: Readonly<Record<string, unknown>> = {},
): NodeExecutionRequest {
  const node: ExecutionPlanNode = {
    id: uid(1),
    nodeType,
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: 0,
    typeArguments: {},
    properties: {},
    reads: [{ resource: 'random.seeded', scope: 'static' }],
    writes: [{ resource: 'random.seeded', scope: 'static' }],
    effects: ['random.seeded'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    instanceId: uid(2),
    graphId: uid(3),
    node,
    phase: 'FrameGameplay',
    tickNumber: 4,
    frameNumber: 6,
    snapshot: {
      id: 1,
      key: 'm10f-runtime',
      phase: 'FrameGameplay',
      tickNumber: 4,
      frameNumber: 6,
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

function checkpointPlan(registryFingerprint: string): GraphExecutionPlan {
  const node: ExecutionPlanNode = {
    id: uid(10),
    nodeType: uid(11),
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: 0,
    typeArguments: {},
    properties: {},
    reads: [{ resource: 'random.seeded', scope: 'static' }],
    writes: [{ resource: 'random.seeded', scope: 'static' }],
    effects: ['random.seeded'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    schemaVersion: 1,
    graphId: uid(12),
    registryFingerprint,
    planFingerprint: 'm10f-deterministic-checkpoint-plan',
    nodes: [node],
    connections: [],
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpoints: [{
      nodeId: node.id,
      eligible: true,
      stateScope: {
        nodes: [node.id],
        resources: ['random.seeded'],
        unbounded: false,
      },
      dependencies: [],
      asyncPolicies: [],
    }],
    checkpointEligible: true,
  }
}

describe('foundation runtime integration', () => {
  it('composes every owned runtime slice and emits deterministic effects', async () => {
    const random = createSeededRandomService(0x1234)
    const variables = createGraphVariableStore({ ready: true })
    const runtimes = createFoundationRuntimeRegistry({
      deterministic: { random, variables },
      world: {
        getTransformPosition: () => [0, 0, 0],
        setTransformPosition: () => {},
        hasComponent: () => false,
        spawnPrefab: () => uid(30),
        raycast: () => null,
        setBodyVelocity: () => {},
      },
      services: {
        save: {
          load: async () => undefined,
          save: async () => {},
        },
        platform: { hasCapability: async () => true },
        debug: { log: () => {} },
      },
    })

    for (const nodeType of [
      FOUNDATION_GRAPH_IDS.onStart.nodeType,
      DETERMINISTIC_GRAPH_CONTRACTS.randomNumber.nodeType,
      WORLD_GRAPH_CONTRACTS.getTransform.nodeType,
      SERVICE_GRAPH_CONTRACTS.saveValue.nodeType,
    ]) {
      expect(() => runtimes.require(nodeType, '1')).not.toThrow()
    }

    const contract = DETERMINISTIC_GRAPH_CONTRACTS.randomNumber
    const first = await runtimes.require(contract.nodeType, '1').execute(
      request(contract.nodeType, {
        [contract.ports.min]: 0,
        [contract.ports.max]: 1,
      }),
    )
    expect(first).toMatchObject({
      effects: [{ kind: 'random.seeded' }],
    })
    expect(first.effects?.[0]?.id).toBe(
      `${uid(2)}:${uid(1)}:random.seeded:4:6`,
    )
  })

  it('restores seeded state through the real GraphInstance checkpoint resource boundary', async () => {
    const random = createSeededRandomService(0xcafe)
    const resources = createDeterministicResourceSnapshotProvider({
      random,
      variables: createGraphVariableStore(),
    })
    const effects: CheckpointEffectRecord[] = []
    const plan = checkpointPlan('m10f-runtime-registry')
    const instance = new GraphInstance({
      id: uid(20),
      plan,
      registryFingerprint: plan.registryFingerprint,
      scheduler: new EngineScheduler(),
      resources,
      effects: {
        apply: (effect) => effects.push(effect),
        reconcile: () => {},
      },
      backend: {
        execute(request) {
          const value = random.next()
          return {
            effects: [{
              id: `${request.instanceId}:${request.node.id}:random.seeded:${value}`,
              kind: 'random.seeded',
              payload: { value },
            }],
          }
        },
      },
    })

    await instance.createCheckpoint(uid(10), 'before-random')
    await instance.start(uid(10))
    const first = effects.at(-1)?.payload
    instance.rewind()
    await instance.start(uid(10))

    expect(effects.at(-1)?.payload).toEqual(first)
    expect(instance.checkpoint?.scope.resources).toEqual(['random.seeded'])
  })

  it('rejects snapshot requests outside deterministic bounded resources', () => {
    const resources = createDeterministicResourceSnapshotProvider({
      random: createSeededRandomService(1),
      variables: createGraphVariableStore(),
    })

    expect(() => resources.snapshot('physics.dynamic-body')).toThrow(
      'Unknown deterministic checkpoint resource',
    )
  })
})
