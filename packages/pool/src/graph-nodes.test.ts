import { describe, expect, it } from 'vitest'
import { World } from '@haku/core'
import {
  NodeRegistry,
  type ExecutionPlanNode,
} from '@haku/graph'
import {
  NodeRuntimeRegistry,
  type NodeExecutionRequest,
  type NodeExecutionResult,
} from '@haku/graph-runtime'
import {
  EntityPool,
  POOL_GRAPH_CONTRACTS,
  PoolRegistry,
  registerPoolNodeContracts,
  registerPoolRuntimeAdapters,
} from './index.js'

function request(
  nodeType: string,
  properties: Readonly<Record<string, unknown>>,
  inputs: Readonly<Record<string, unknown>> = {},
): NodeExecutionRequest {
  const node: ExecutionPlanNode = {
    id: 'a2000000-0000-4000-8000-000000000001',
    nodeType,
    version: '1',
    kind: 'builtin',
    domain: 'FixedGameplay',
    order: 0,
    typeArguments: {},
    properties,
    reads: [],
    writes: [{ resource: 'pool', scope: 'static' }],
    effects: ['pool'],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
  return {
    instanceId: 'a2000000-0000-4000-8000-000000000002',
    graphId: 'a2000000-0000-4000-8000-000000000003',
    node,
    phase: 'FixedGameplay',
    tickNumber: 4,
    frameNumber: 5,
    snapshot: {
      id: 1,
      key: 'snapshot',
      phase: 'FixedGameplay',
      tickNumber: 4,
      frameNumber: 5,
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

describe('pool graph contracts and runtime SDK', () => {
  it('declares universal pool capability, bounded resources, and checkpoint-visible effects', () => {
    const registry = new NodeRegistry()
    registerPoolNodeContracts(registry)
    const definitions = registry.all()

    expect(definitions).toHaveLength(6)
    for (const definition of definitions.filter(
      (item) => item.contract.id !== POOL_GRAPH_CONTRACTS.metrics.nodeType,
    )) {
      expect(definition.contract.capabilities).toContain('pool')
      expect(definition.contract.effects).toEqual(['pool'])
      expect(definition.contract.checkpoint).toBe('safe')
      expect(definition.contract.checkpointScope).toBe('bounded')
    }
    expect(
      registry.require(POOL_GRAPH_CONTRACTS.metrics.nodeType).contract,
    ).toMatchObject({
      capabilities: ['pool'],
      effects: [],
      reads: [{ resource: 'pool', scope: 'static' }],
      checkpoint: 'safe',
    })
  })

  it('acquires and releases through runtime adapters with declared effect records', () => {
    const world = new World()
    const pool = new EntityPool({
      id: 'a2000000-0000-4000-8000-000000000010',
      world,
      createInstance: () => world.createEntity('Graph pooled'),
    })
    pool.prewarm(1)
    const pools = new PoolRegistry()
    pools.register(pool)
    const runtimes = new NodeRuntimeRegistry()
    registerPoolRuntimeAdapters(runtimes, pools)

    const acquire = runtimes.require(POOL_GRAPH_CONTRACTS.acquire.nodeType, '1')
      .execute(
        request(POOL_GRAPH_CONTRACTS.acquire.nodeType, { poolId: pool.id }),
      ) as NodeExecutionResult
    const acquired = acquire.data?.[POOL_GRAPH_CONTRACTS.acquire.ports.handle]
    expect(acquired).toMatchObject({ kind: 'some' })
    expect(acquire.effects).toMatchObject([{ kind: 'pool.acquire' }])

    const handle = (acquired as { value: unknown }).value
    const release = runtimes.require(POOL_GRAPH_CONTRACTS.release.nodeType, '1')
      .execute(
        request(
          POOL_GRAPH_CONTRACTS.release.nodeType,
          {},
          { [POOL_GRAPH_CONTRACTS.release.ports.handle]: handle },
        ),
      ) as NodeExecutionResult

    expect(release.effects).toMatchObject([{ kind: 'pool.release' }])
    expect(pool.metrics()).toMatchObject({ active: 0, inactive: 1 })
  })
})
