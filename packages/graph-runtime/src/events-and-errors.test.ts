import { describe, expect, it } from 'vitest'
import {
  EngineScheduler,
  SCHEDULER_PHASES,
  World,
  type SchedulerPhase,
} from '@haku/core'
import {
  type GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  GraphRuntimeError,
  type ExecutionBackend,
} from './index.js'

const uid = (value: number): string =>
  `45400000-0000-4000-8000-${value.toString().padStart(12, '0')}`

function node(
  id: number,
  order: number,
  domain: SchedulerPhase = 'FixedGameplay',
): GraphExecutionPlan['nodes'][number] {
  return {
    id: uid(id),
    nodeType: uid(id + 500),
    version: '1',
    kind: 'builtin',
    domain,
    order,
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

function plan(
  nodes: GraphExecutionPlan['nodes'],
  connections: GraphExecutionPlan['connections'],
): GraphExecutionPlan {
  return {
    schemaVersion: 1,
    graphId: uid(900),
    registryFingerprint: 'events-registry',
    planFingerprint: 'events-plan',
    nodes,
    connections,
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpointEligible: true,
  }
}

describe('GraphInstance events, tracing, and errors', () => {
  it('queues typed event fan-out in deterministic plan order', () => {
    const source = node(101, 0)
    const first = node(102, 1)
    const second = node(103, 2)
    const eventOut = uid(201)
    const firstIn = uid(202)
    const secondIn = uid(203)
    const executionPlan = plan(
      [source, first, second],
      [
        {
          id: uid(301),
          kind: 'event',
          operation: 'queue-event',
          from: { node: source.id, callsite: eventOut },
          to: { node: first.id, callsite: firstIn },
        },
        {
          id: uid(302),
          kind: 'event',
          operation: 'queue-event',
          from: { node: source.id, callsite: eventOut },
          to: { node: second.id, callsite: secondIn },
        },
      ],
    )
    const scheduler = new EngineScheduler()
    const world = new World()
    const received: string[] = []
    let sourceExecuting = false
    let reentrant = false
    const backend: ExecutionBackend = {
      execute(request) {
        if (request.node.id === source.id) {
          sourceExecuting = true
          const result = { events: { [eventOut]: 7 } }
          sourceExecuting = false
          return result
        }
        if (sourceExecuting) reentrant = true
        received.push(`${request.node.id}:${request.input?.value}`)
        return {}
      },
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan: executionPlan,
      registryFingerprint: executionPlan.registryFingerprint,
      scheduler,
      backend,
    })

    instance.start(source.id)
    expect(received).toEqual([])

    scheduler.runFrame(world, 1 / 60)

    expect(received).toEqual([`${first.id}:7`, `${second.id}:7`])
    expect(reentrant).toBe(false)
    expect(
      instance.trace
        .filter((entry) => entry.kind === 'queue')
        .map((entry) => entry.connectionId),
    ).toEqual([uid(301), uid(302)])
  })

  it('delivers queued graph events through every existing scheduler domain', () => {
    const source = node(101, 0, 'FrameGameplay')
    const targets = SCHEDULER_PHASES.map((phase, index) =>
      node(200 + index, index + 1, phase)
    )
    const outputs = SCHEDULER_PHASES.map((_, index) => uid(500 + index))
    const executionPlan = plan(
      [source, ...targets],
      targets.map((target, index) => ({
        id: uid(600 + index),
        kind: 'event',
        operation: 'queue-event',
        from: { node: source.id, callsite: outputs[index]! },
        to: { node: target.id, callsite: uid(700 + index) },
      })),
    )
    const received: SchedulerPhase[] = []
    const scheduler = new EngineScheduler()
    const instance = new GraphInstance({
      id: uid(901),
      plan: executionPlan,
      registryFingerprint: executionPlan.registryFingerprint,
      scheduler,
      backend: {
        execute(request) {
          if (request.node.id === source.id) {
            return {
              events: Object.fromEntries(
                outputs.map((output, index) => [
                  output,
                  SCHEDULER_PHASES[index],
                ]),
              ),
            }
          }
          received.push(request.input?.value as SchedulerPhase)
          return {}
        },
      },
    })

    instance.start(source.id)
    scheduler.runFrame(new World(), 1 / 60)

    expect(received).toEqual(SCHEDULER_PHASES)
  })

  it('stops flow loops with a structured runaway error and deterministic trace', () => {
    const looping = node(101, 0)
    const flowOut = uid(201)
    const flowIn = uid(202)
    const executionPlan = plan(
      [looping],
      [
        {
          id: uid(301),
          kind: 'flow',
          operation: 'flow',
          from: { node: looping.id, callsite: flowOut },
          to: { node: looping.id, callsite: flowIn },
        },
      ],
    )
    const scheduler = new EngineScheduler()
    const backend: ExecutionBackend = {
      execute: () => ({ flow: [flowOut] }),
    }
    const instance = new GraphInstance({
      id: uid(901),
      plan: executionPlan,
      registryFingerprint: executionPlan.registryFingerprint,
      scheduler,
      backend,
      limits: { maxStepsPerExecution: 4 },
    })

    expect(() => instance.start(looping.id)).toThrowError(
      expect.objectContaining<Partial<GraphRuntimeError>>({
        code: 'runtime.runaway',
        graphId: executionPlan.graphId,
        nodeId: looping.id,
      }),
    )
    expect(instance.trace.at(-1)?.kind).toBe('runaway')
  })

  it('wraps adapter failures with graph/node/phase/tick context', () => {
    const failing = node(101, 0)
    const executionPlan = plan([failing], [])
    const scheduler = new EngineScheduler()
    const instance = new GraphInstance({
      id: uid(901),
      plan: executionPlan,
      registryFingerprint: executionPlan.registryFingerprint,
      scheduler,
      backend: {
        execute: () => {
          throw new Error('adapter exploded')
        },
      },
    })

    expect(() => instance.start(failing.id)).toThrowError(
      expect.objectContaining<Partial<GraphRuntimeError>>({
        code: 'runtime.node-error',
        graphId: executionPlan.graphId,
        instanceId: uid(901),
        nodeId: failing.id,
        phase: 'FixedGameplay',
        tickNumber: 0,
        frameNumber: 0,
      }),
    )
    expect(instance.trace.at(-1)?.kind).toBe('node-error')
  })

  it('produces identical traces for identical plans, IDs, and inputs', () => {
    const single = node(101, 0)
    const executionPlan = plan([single], [])
    const run = () => {
      const instance = new GraphInstance({
        id: uid(901),
        plan: executionPlan,
        registryFingerprint: executionPlan.registryFingerprint,
        scheduler: new EngineScheduler(),
        backend: { execute: () => ({}) },
      })
      instance.start(single.id)
      return instance.trace
    }

    expect(run()).toEqual(run())
  })
})
