import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { EngineScheduler, World } from '@haku/core'
import {
  NodeRegistry,
  compileGraph,
  createBuiltinTypeRegistry,
  defineNode,
  type GraphAsset,
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  type ExecutionBackend,
  type NodeExecutionRequest,
} from './index.js'

const uid = (value: number): string =>
  `45000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

function flowNodeType(
  id: number,
  domain: 'FixedGameplay' | 'FrameGameplay',
  ports: readonly {
    readonly id: number
    readonly direction: 'input' | 'output'
  }[],
) {
  return defineNode({
    id: uid(id),
    version: '1',
    name: `Flow${id}`,
    category: 'Runtime test',
    description: 'Compiled graph-runtime fixture',
    kind: 'builtin',
    typeParameters: [],
    ports: ports.map((port) => ({
      id: uid(port.id),
      name: port.direction,
      kind: 'flow' as const,
      direction: port.direction,
    })),
    propertySchema: z.object({}).strict(),
    propertyContract: { kind: 'object', fields: [] },
    domains: [domain],
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    resultPersistence: 'none',
    liveness: ports.some((port) => port.direction === 'input')
      ? 'on-flow'
      : 'always',
    exportedState: [],
  })
}

function compileFlowPlan(): GraphExecutionPlan {
  const types = createBuiltinTypeRegistry()
  const nodes = new NodeRegistry()
  nodes.register(flowNodeType(1, 'FixedGameplay', [{ id: 11, direction: 'output' }]))
  nodes.register(
    flowNodeType(2, 'FixedGameplay', [
      { id: 21, direction: 'input' },
      { id: 22, direction: 'output' },
    ]),
  )
  nodes.register(flowNodeType(3, 'FrameGameplay', [{ id: 31, direction: 'input' }]))

  const asset: GraphAsset = {
    schemaVersion: 1,
    graph: {
      id: uid(900),
      name: 'Runtime flow',
      nodes: [
        {
          id: uid(101),
          type: uid(1),
          version: '1',
          domain: 'FixedGameplay',
          properties: {},
          layout: { x: 0, y: 0 },
          callsites: [
            {
              id: uid(201),
              port: uid(11),
              kind: 'flow',
              direction: 'output',
            },
          ],
        },
        {
          id: uid(102),
          type: uid(2),
          version: '1',
          domain: 'FixedGameplay',
          properties: {},
          layout: { x: 1, y: 0 },
          callsites: [
            {
              id: uid(202),
              port: uid(21),
              kind: 'flow',
              direction: 'input',
            },
            {
              id: uid(203),
              port: uid(22),
              kind: 'flow',
              direction: 'output',
            },
          ],
        },
        {
          id: uid(103),
          type: uid(3),
          version: '1',
          domain: 'FrameGameplay',
          properties: {},
          layout: { x: 2, y: 0 },
          callsites: [
            {
              id: uid(204),
              port: uid(31),
              kind: 'flow',
              direction: 'input',
            },
          ],
        },
      ],
      connections: [
        {
          id: uid(301),
          from: { node: uid(101), callsite: uid(201) },
          to: { node: uid(102), callsite: uid(202) },
        },
        {
          id: uid(302),
          from: { node: uid(102), callsite: uid(203) },
          to: { node: uid(103), callsite: uid(204) },
        },
      ],
      publicInterface: { ports: [] },
      metadata: {},
    },
  }
  const result = compileGraph(asset, { types, nodes })
  expect(result.diagnostics).toEqual([])
  return result.plan!
}

describe('GraphInstance compiled flow execution', () => {
  it('runs same-domain flow deterministically and queues cross-domain flow non-reentrantly', () => {
    const plan = compileFlowPlan()
    const scheduler = new EngineScheduler({ fixedTimestep: 1 })
    const world = new World()
    const executionOrder: string[] = []
    let activeNode: string | undefined
    let reentrant = false
    const backend: ExecutionBackend = {
      execute(request: NodeExecutionRequest) {
        if (activeNode !== undefined) reentrant = true
        activeNode = request.node.id
        executionOrder.push(request.node.id)
        const result =
          request.node.id === uid(101)
            ? { flow: [uid(201)] }
            : request.node.id === uid(102)
              ? { flow: [uid(203)] }
              : {}
        activeNode = undefined
        return result
      },
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan,
      registryFingerprint: plan.registryFingerprint,
      scheduler,
      backend,
    })

    instance.start(uid(101))

    expect(executionOrder).toEqual([uid(101), uid(102)])
    expect(reentrant).toBe(false)

    scheduler.runFrame(world, 1)

    expect(executionOrder).toEqual([uid(101), uid(102), uid(103)])
    expect(instance.trace.map((entry) => [entry.kind, entry.nodeId])).toEqual([
      ['node-start', uid(101)],
      ['node-complete', uid(101)],
      ['node-start', uid(102)],
      ['node-complete', uid(102)],
      ['queue', uid(103)],
      ['node-start', uid(103)],
      ['node-complete', uid(103)],
    ])
    expect(reentrant).toBe(false)
  })
})
