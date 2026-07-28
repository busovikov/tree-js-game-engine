import { describe, expect, it, vi } from 'vitest'
import { EngineScheduler } from '@haku/core'
import type {
  AsyncCheckpointPolicy,
  ExecutionPlanCheckpoint,
  ExecutionPlanNode,
  GraphExecutionPlan,
} from '@haku/graph'
import {
  CheckpointPolicyError,
  GraphInstance,
  checkpointableTask,
  type AsyncCheckpointRecord,
  type ExecutionBackend,
  type NodeExecutionResult,
} from './index.js'

const uid = (value: number): string =>
  `5a000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const ASYNC = uid(1)
const CHECKPOINT = uid(2)
const CONTINUE = uid(3)
const ASYNC_OUT = uid(11)
const CONTINUE_IN = uid(13)

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function node(
  id: string,
  execution: ExecutionPlanNode['execution'] = 'sync',
): ExecutionPlanNode {
  return {
    id,
    nodeType: id,
    version: '1',
    kind: 'builtin',
    domain: 'FrameGameplay',
    order: Number(id.slice(-1)),
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

function plan(
  supported: readonly AsyncCheckpointPolicy[],
  dominatesCheckpoint = true,
): GraphExecutionPlan {
  const checkpoint: ExecutionPlanCheckpoint = {
    nodeId: CHECKPOINT,
    eligible: true,
    stateScope: {
      nodes: [ASYNC, CHECKPOINT, CONTINUE],
      resources: [],
      unbounded: false,
    },
    dependencies: [],
    asyncPolicies: [{
      nodeId: ASYNC,
      callsiteId: ASYNC_OUT,
      live: true,
      dominatesCheckpoint,
      supported,
      causalChain: [
        `checkpoint ${CHECKPOINT}`,
        `flow dependency ${ASYNC} -> ${CHECKPOINT}`,
        `async node Operation (${ASYNC})`,
      ],
    }],
  }
  return {
    schemaVersion: 1,
    graphId: uid(90),
    registryFingerprint: 'policy-registry',
    planFingerprint: 'policy-plan',
    nodes: [node(ASYNC, 'async'), node(CHECKPOINT), node(CONTINUE)],
    connections: [{
      id: uid(20),
      kind: 'flow',
      operation: 'flow',
      from: { node: ASYNC, callsite: ASYNC_OUT },
      to: { node: CONTINUE, callsite: CONTINUE_IN },
    }],
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpoints: [checkpoint],
    checkpointEligible: true,
  }
}

function instance(
  supported: readonly AsyncCheckpointPolicy[],
  backend: ExecutionBackend,
): GraphInstance {
  return new GraphInstance({
    id: 'root',
    plan: plan(supported),
    registryFingerprint: 'policy-registry',
    scheduler: new EngineScheduler(),
    backend,
  })
}

describe('checkpoint async policies', () => {
  it('waits at the checkpoint barrier and rejects an expired or invalid timeout', async () => {
    const operation = deferred<NodeExecutionResult>()
    const graph = instance(['wait'], {
      execute: ({ node: current }) =>
        current.id === ASYNC ? operation.promise : {},
    })
    graph.start(ASYNC)

    let settled = false
    const checkpoint = graph.createCheckpoint(CHECKPOINT, 'wait', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'wait',
        timeoutMs: 50,
      }],
    }).then((value) => {
      settled = true
      return value
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    operation.resolve({ flow: [ASYNC_OUT] })
    await expect(checkpoint).resolves.toMatchObject({
      checkpointNodeId: CHECKPOINT,
    })

    const never = deferred<NodeExecutionResult>()
    const timeoutGraph = instance(['wait'], {
      execute: ({ node: current }) =>
        current.id === ASYNC ? never.promise : {},
    })
    timeoutGraph.start(ASYNC)
    await expect(timeoutGraph.createCheckpoint(CHECKPOINT, 'timeout', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'wait',
        timeoutMs: 1,
      }],
    })).rejects.toMatchObject({
      code: 'checkpoint.wait-timeout',
      callsiteId: ASYNC_OUT,
    })
    await expect(timeoutGraph.createCheckpoint(CHECKPOINT, 'invalid', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'wait',
        timeoutMs: 0,
      }],
    })).rejects.toThrow('positive finite')
  })

  it.each([
    [
      'restart',
      {
        restart: {
          safety: 'idempotent',
          inputs: () => ({ request: 'page-2' }),
        },
      },
      { safety: 'idempotent', inputs: { request: 'page-2' } },
    ],
    [
      'resume',
      {
        resume: {
          stateMachineId: 'upload-v1',
          serialize: () => ({ state: 'step-3' }),
        },
      },
      { stateMachineId: 'upload-v1', state: { state: 'step-3' } },
    ],
    [
      'reconnect',
      {
        reconnect: {
          operationId: 'durable-7',
          status: () => 'running',
        },
      },
      { operationId: 'durable-7', status: 'running' },
    ],
  ] as const)(
    'persists %s state and restores it through the owned backend task',
    async (policy, adapter, payload) => {
      const original = deferred<NodeExecutionResult>()
      const restored = deferred<NodeExecutionResult>()
      const records: AsyncCheckpointRecord[] = []
      const backend: ExecutionBackend = {
        execute: ({ node: current }) =>
          current.id === ASYNC
            ? checkpointableTask(original.promise, {
              ...adapter,
            })
            : {},
        restoreCheckpointTask(request) {
          records.push(request.record)
          return restored.promise
        },
      }
      const graph = instance([policy], backend)
      graph.start(ASYNC)

      await graph.createCheckpoint(CHECKPOINT, policy, {
        asyncPolicies: [{ callsiteId: ASYNC_OUT, policy }],
      })
      graph.rewind()

      expect(records).toEqual([{
        nodeId: ASYNC,
        callsiteId: ASYNC_OUT,
        policy,
        payload,
      }])
      expect(graph.trace.filter((entry) => entry.kind === 'task-start'))
        .toHaveLength(2)

      restored.resolve({})
      original.resolve({})
      await graph.idle()
      expect(graph.trace.filter((entry) => entry.kind === 'task-cancel').length)
        .toBeGreaterThanOrEqual(1)
    },
  )

  it('uses only a completed snapshot-safe materialized result', async () => {
    const operation = deferred<NodeExecutionResult>()
    const continuation = vi.fn()
    const graph = instance(['materialized'], {
      execute: ({ node: current }) => {
        if (current.id === ASYNC) return operation.promise
        if (current.id === CONTINUE) continuation()
        return {}
      },
    })
    const task = graph.start(ASYNC)

    await expect(graph.createCheckpoint(CHECKPOINT, 'too-early', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'materialized',
      }],
    })).rejects.toMatchObject({ code: 'checkpoint.result-not-materialized' })

    operation.resolve({ flow: [ASYNC_OUT], data: { result: 42 } })
    await task
    await graph.createCheckpoint(CHECKPOINT, 'materialized', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'materialized',
      }],
    })
    graph.rewind()
    await graph.idle()

    expect(continuation).toHaveBeenCalledTimes(1)
  })

  it('cancels the owned task and continues through a typed fallback', async () => {
    const operation = deferred<NodeExecutionResult>()
    const cancelled = vi.fn()
    const fallbackValues: unknown[] = []
    const graph = instance(['cancel-fallback'], {
      execute: ({ node: current, input }) => {
        if (current.id === ASYNC) {
          return checkpointableTask(operation.promise, {
            cancel: cancelled,
            fallback: {
              kind: 'option',
              result: { flow: [ASYNC_OUT], data: { value: null } },
            },
          })
        }
        if (current.id === CONTINUE) fallbackValues.push(input?.value)
        return {}
      },
    })
    graph.start(ASYNC)

    await graph.createCheckpoint(CHECKPOINT, 'fallback', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'cancel-fallback',
      }],
    })
    operation.resolve({ flow: [ASYNC_OUT] })
    await graph.idle()

    expect(cancelled).toHaveBeenCalledOnce()
    expect(fallbackValues).toEqual([undefined])
    expect(graph.trace.filter((entry) => entry.kind === 'task-cancel'))
      .toHaveLength(1)
  })

  it('returns a typed rejection and validates policy callsite UUIDs', async () => {
    const operation = deferred<NodeExecutionResult>()
    const graph = instance(['wait', 'reject'], {
      execute: ({ node: current }) =>
        current.id === ASYNC ? operation.promise : {},
    })
    graph.start(ASYNC)

    await expect(graph.createCheckpoint(CHECKPOINT, 'reject', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'reject',
      }],
    })).rejects.toBeInstanceOf(CheckpointPolicyError)
    await expect(graph.createCheckpoint(CHECKPOINT, 'wrong-callsite', {
      asyncPolicies: [{
        callsiteId: uid(999),
        policy: 'wait',
        timeoutMs: 10,
      }],
    })).rejects.toMatchObject({ code: 'checkpoint.unknown-callsite' })
    await expect(graph.createCheckpoint(CHECKPOINT, 'unsupported', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'resume',
      }],
    })).rejects.toMatchObject({ code: 'checkpoint.unsupported-policy' })
    await expect(graph.createCheckpoint(CHECKPOINT, 'missing', {
      asyncPolicies: [],
    })).rejects.toMatchObject({ code: 'checkpoint.missing-policy' })

    operation.resolve({})
    await graph.idle()
  })

  it('enforces runtime liveness even when compiler dominance is false', async () => {
    const operation = deferred<NodeExecutionResult>()
    const graphPlan = plan(['reject'], false)
    const graph = new GraphInstance({
      id: 'root',
      plan: graphPlan,
      registryFingerprint: 'policy-registry',
      scheduler: new EngineScheduler(),
      backend: {
        execute: ({ node: current }) =>
          current.id === ASYNC ? operation.promise : {},
      },
    })
    graph.start(ASYNC)

    await expect(graph.createCheckpoint(CHECKPOINT, 'live-branch', {
      asyncPolicies: [{
        callsiteId: ASYNC_OUT,
        policy: 'reject',
      }],
    })).rejects.toMatchObject({ code: 'checkpoint.async-rejected' })

    operation.resolve({})
    await graph.idle()
  })
})
