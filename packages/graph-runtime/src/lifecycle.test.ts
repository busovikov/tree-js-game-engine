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
  `45300000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ASYNC = uid(101)
const TARGET = uid(102)
const EMITTER = uid(103)
const FLOW_OUT = uid(201)
const FLOW_IN = uid(202)
const EVENT = uid(301)

function node(
  id: string,
  order: number,
  execution: 'sync' | 'async',
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
    execution,
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
}

function lifecyclePlan(): GraphExecutionPlan {
  return {
    schemaVersion: 1,
    graphId: uid(900),
    registryFingerprint: 'lifecycle-registry',
    planFingerprint: 'lifecycle-plan',
    nodes: [
      node(ASYNC, 0, 'async'),
      node(TARGET, 1, 'sync'),
      node(EMITTER, 2, 'sync'),
    ],
    connections: [
      {
        id: uid(401),
        kind: 'flow',
        operation: 'flow',
        from: { node: ASYNC, callsite: FLOW_OUT },
        to: { node: TARGET, callsite: FLOW_IN },
      },
    ],
    publicInterface: {
      ports: [
        {
          id: EVENT,
          name: 'Completed',
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

describe('GraphInstance structured lifecycle', () => {
  it('holds an async branch until every explicitly owned child completes', async () => {
    const plan = lifecyclePlan()
    const scheduler = new EngineScheduler()
    let releaseChild = () => {}
    let targetRuns = 0
    const backend: ExecutionBackend = {
      execute(request: NodeExecutionRequest) {
        if (request.node.id === ASYNC) {
          request.spawnChild(
            () =>
              new Promise<void>((resolve) => {
                releaseChild = resolve
              }),
          )
          return Promise.resolve({ flow: [FLOW_OUT] })
        }
        if (request.node.id === TARGET) targetRuns += 1
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

    const pending = instance.start(ASYNC)
    expect(pending).toBeInstanceOf(Promise)
    await Promise.resolve()
    expect(targetRuns).toBe(0)

    releaseChild()
    await pending

    expect(targetRuns).toBe(1)
    expect(instance.trace.map((entry) => entry.kind)).toContain('task-complete')
  })

  it.each(['deactivate', 'stop', 'destroy'] as const)(
    '%s cancels tasks and subscriptions without routing cancelled flow',
    async (action) => {
      const plan = lifecyclePlan()
      const scheduler = new EngineScheduler()
      const lifecycle: string[] = []
      let taskCancelled = false
      let targetRuns = 0
      const events: unknown[] = []
      const backend: ExecutionBackend = {
        lifecycle(request) {
          lifecycle.push(`${request.action}:${request.node.id}`)
        },
        execute(request) {
          if (request.node.id === ASYNC) {
            request.spawnChild(
              (signal) =>
                new Promise<void>((resolve) => {
                  signal.addEventListener(
                    'abort',
                    () => {
                      taskCancelled = true
                      resolve()
                    },
                    { once: true },
                  )
                }),
            )
            return new Promise((resolve) => {
              request.signal.addEventListener(
                'abort',
                () => resolve({ flow: [FLOW_OUT] }),
                { once: true },
              )
            })
          }
          if (request.node.id === TARGET) targetRuns += 1
          if (request.node.id === EMITTER) {
            return { publicEvents: { [EVENT]: 1 } }
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
      instance.subscribe(EVENT, (value) => events.push(value))
      const pending = instance.start(ASYNC)

      instance[action]()
      await pending

      expect(taskCancelled).toBe(true)
      expect(targetRuns).toBe(0)
      expect(lifecycle.some((entry) => entry.startsWith(`${action}:`))).toBe(
        true,
      )
      if (action === 'destroy') {
        expect(() => instance.start(EMITTER)).toThrow(
          'Cannot start a destroyed graph instance',
        )
      } else {
        instance.start(EMITTER)
        expect(events).toEqual([])
      }
    },
  )
})
