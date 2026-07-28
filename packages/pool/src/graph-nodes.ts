import {
  NUMBER_TYPE,
  OPTION_TYPE,
  POOL_HANDLE_TYPE,
  defineNode,
  namedType,
  type NodePortInput,
  type NodeRegistry,
} from '@haku/graph'
import {
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from '@haku/graph-runtime'
import { z } from 'zod'

interface PoolHandleValue {
  readonly pool: string
  readonly entity: string
  readonly generation: number
}

interface PoolGraphTarget {
  prewarm(count?: number): void
  acquire(): PoolHandleValue | null
  release(handle: PoolHandleValue): void
  releaseAll(): void
  clear(): void
  metrics(): {
    readonly total: number
    readonly active: number
    readonly inactive: number
    readonly acquisitions: number
    readonly releases: number
    readonly exhaustions: number
  }
}

export interface PoolGraphService {
  require(poolId: string): PoolGraphTarget
}

const id = (value: number): string =>
  `a3000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const FLOW_IN = id(101)
const FLOW_OUT = id(102)

export const POOL_GRAPH_CONTRACTS = {
  acquire: {
    nodeType: id(1),
    ports: { flowIn: FLOW_IN, flowOut: FLOW_OUT, handle: id(103) },
  },
  release: {
    nodeType: id(2),
    ports: { flowIn: id(201), flowOut: id(202), handle: id(203) },
  },
  prewarm: {
    nodeType: id(3),
    ports: { flowIn: id(301), flowOut: id(302) },
  },
  releaseAll: {
    nodeType: id(4),
    ports: { flowIn: id(401), flowOut: id(402) },
  },
  clear: {
    nodeType: id(5),
    ports: { flowIn: id(501), flowOut: id(502) },
  },
  metrics: {
    nodeType: id(6),
    ports: {
      total: id(601),
      active: id(602),
      inactive: id(603),
      acquisitions: id(604),
      releases: id(605),
      exhaustions: id(606),
    },
  },
} as const

export type PoolGraphContracts = typeof POOL_GRAPH_CONTRACTS

const PoolIdProperties = z.object({ poolId: z.string().uuid() }).strict()
const PrewarmProperties = PoolIdProperties.extend({
  count: z.number().int().nonnegative(),
}).strict()
const EmptyProperties = z.object({}).strict()

function flowPorts(ports: { readonly flowIn: string; readonly flowOut: string }) {
  return [
    { id: ports.flowIn, name: 'In', kind: 'flow' as const, direction: 'input' as const },
    { id: ports.flowOut, name: 'Out', kind: 'flow' as const, direction: 'output' as const },
  ]
}

function mutationContract(
  input: {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly ports: readonly NodePortInput[]
    readonly propertySchema: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>
    readonly propertyContract: Record<string, unknown>
  },
) {
  return defineNode({
    id: input.id,
    version: '1',
    name: input.name,
    category: 'Pool',
    description: input.description,
    kind: 'builtin',
    typeParameters: [],
    ports: input.ports,
    propertySchema: input.propertySchema,
    propertyContract: input.propertyContract,
    domains: ['FixedGameplay', 'FrameGameplay'],
    capabilities: ['pool'],
    reads: [],
    writes: [{ resource: 'pool', scope: 'static' }],
    effects: ['pool'],
    execution: 'sync',
    checkpoint: 'safe',
    checkpointScope: 'bounded',
    asyncCheckpointPolicies: [],
    resultPersistence: 'none',
    liveness: 'on-flow',
    exportedState: [],
  })
}

export function registerPoolNodeContracts(registry: NodeRegistry): void {
  const acquire = POOL_GRAPH_CONTRACTS.acquire
  registry.register(
    mutationContract({
      id: acquire.nodeType,
      name: 'Acquire Pool Entity',
      description: 'Acquire one reusable entity lease.',
      ports: [
        ...flowPorts(acquire.ports),
        {
          id: acquire.ports.handle,
          name: 'Handle',
          kind: 'data',
          direction: 'output',
          type: namedType(OPTION_TYPE, [namedType(POOL_HANDLE_TYPE)]),
        },
      ],
      propertySchema: PoolIdProperties,
      propertyContract: { poolId: 'uuid' },
    }),
  )

  const release = POOL_GRAPH_CONTRACTS.release
  registry.register(
    mutationContract({
      id: release.nodeType,
      name: 'Release Pool Entity',
      description: 'Release a lease and restore its authored baseline.',
      ports: [
        ...flowPorts(release.ports),
        {
          id: release.ports.handle,
          name: 'Handle',
          kind: 'data',
          direction: 'input',
          type: namedType(POOL_HANDLE_TYPE),
        },
      ],
      propertySchema: EmptyProperties,
      propertyContract: {},
    }),
  )

  for (const definition of [
    {
      contract: POOL_GRAPH_CONTRACTS.prewarm,
      name: 'Prewarm Pool',
      description: 'Create inactive instances before gameplay.',
      schema: PrewarmProperties,
      propertyContract: { poolId: 'uuid', count: 'non-negative integer' },
    },
    {
      contract: POOL_GRAPH_CONTRACTS.releaseAll,
      name: 'Release All Pool Entities',
      description: 'Release every active lease.',
      schema: PoolIdProperties,
      propertyContract: { poolId: 'uuid' },
    },
    {
      contract: POOL_GRAPH_CONTRACTS.clear,
      name: 'Clear Pool',
      description: 'Destroy all owned instances.',
      schema: PoolIdProperties,
      propertyContract: { poolId: 'uuid' },
    },
  ]) {
    registry.register(
      mutationContract({
        id: definition.contract.nodeType,
        name: definition.name,
        description: definition.description,
        ports: flowPorts(definition.contract.ports),
        propertySchema: definition.schema,
        propertyContract: definition.propertyContract,
      }),
    )
  }

  const metrics = POOL_GRAPH_CONTRACTS.metrics
  registry.register(
    defineNode({
      id: metrics.nodeType,
      version: '1',
      name: 'Pool Metrics',
      category: 'Pool',
      description: 'Read current pool occupancy and reuse counters.',
      kind: 'builtin',
      typeParameters: [],
      ports: Object.entries(metrics.ports).map(([name, portId]) => ({
        id: portId,
        name,
        kind: 'data' as const,
        direction: 'output' as const,
        type: namedType(NUMBER_TYPE),
      })),
      propertySchema: PoolIdProperties,
      propertyContract: { poolId: 'uuid' },
      domains: ['FixedGameplay', 'FrameGameplay'],
      capabilities: ['pool'],
      reads: [{ resource: 'pool', scope: 'static' }],
      writes: [],
      effects: [],
      execution: 'sync',
      checkpoint: 'safe',
      checkpointScope: 'bounded',
      asyncCheckpointPolicies: [],
      resultPersistence: 'execution',
      liveness: 'pure',
      exportedState: [],
    }),
  )
}

const PoolHandleSchema: z.ZodType<PoolHandleValue> = z.object({
  pool: z.string().uuid(),
  entity: z.string().uuid(),
  generation: z.number().int().nonnegative(),
}).strict()

export function registerPoolRuntimeAdapters(
  registry: NodeRuntimeRegistry,
  service: PoolGraphService,
): void {
  const register = (
    nodeType: string,
    execute: (request: NodeExecutionRequest) => NodeExecutionResult,
  ): void => registry.register({ nodeType, version: '1', execute })

  register(POOL_GRAPH_CONTRACTS.acquire.nodeType, (request) => {
    const poolId = poolIdFrom(request)
    const handle = service.require(poolId).acquire()
    return {
      flow: [POOL_GRAPH_CONTRACTS.acquire.ports.flowOut],
      data: {
        [POOL_GRAPH_CONTRACTS.acquire.ports.handle]:
          handle === null ? { kind: 'none' } : { kind: 'some', value: handle },
      },
      effects: [effect(request, 'pool.acquire', handle ?? { pool: poolId })],
    }
  })

  register(POOL_GRAPH_CONTRACTS.release.nodeType, (request) => {
    const handle = PoolHandleSchema.parse(
      request.readData(POOL_GRAPH_CONTRACTS.release.ports.handle),
    )
    service.require(handle.pool).release(handle)
    return {
      flow: [POOL_GRAPH_CONTRACTS.release.ports.flowOut],
      effects: [effect(request, 'pool.release', handle)],
    }
  })

  register(POOL_GRAPH_CONTRACTS.prewarm.nodeType, (request) => {
    const properties = PrewarmProperties.parse(request.node.properties)
    service.require(properties.poolId).prewarm(properties.count)
    return {
      flow: [POOL_GRAPH_CONTRACTS.prewarm.ports.flowOut],
      effects: [effect(request, 'pool.prewarm', properties)],
    }
  })

  register(POOL_GRAPH_CONTRACTS.releaseAll.nodeType, (request) => {
    const poolId = poolIdFrom(request)
    service.require(poolId).releaseAll()
    return {
      flow: [POOL_GRAPH_CONTRACTS.releaseAll.ports.flowOut],
      effects: [effect(request, 'pool.release-all', { pool: poolId })],
    }
  })

  register(POOL_GRAPH_CONTRACTS.clear.nodeType, (request) => {
    const poolId = poolIdFrom(request)
    service.require(poolId).clear()
    return {
      flow: [POOL_GRAPH_CONTRACTS.clear.ports.flowOut],
      effects: [effect(request, 'pool.clear', { pool: poolId })],
    }
  })

  register(POOL_GRAPH_CONTRACTS.metrics.nodeType, (request) => {
    const metrics = service.require(poolIdFrom(request)).metrics()
    return {
      data: Object.fromEntries(
        Object.entries(POOL_GRAPH_CONTRACTS.metrics.ports).map(([name, portId]) => [
          portId,
          metrics[name as keyof typeof metrics],
        ]),
      ),
    }
  })
}

function poolIdFrom(request: NodeExecutionRequest): string {
  return PoolIdProperties.parse(request.node.properties).poolId
}

function effect(
  request: NodeExecutionRequest,
  kind: string,
  payload: unknown,
): CheckpointEffectRecord {
  return {
    id: [
      request.instanceId,
      request.node.id,
      kind,
      request.tickNumber,
      request.frameNumber,
      effectIdentity(payload),
    ].join(':'),
    kind,
    payload,
  }
}

function effectIdentity(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return String(payload)
  const candidate = payload as { readonly pool?: unknown; readonly entity?: unknown; readonly generation?: unknown }
  return [candidate.pool, candidate.entity, candidate.generation]
    .filter((value) => value !== undefined)
    .join('/')
}
