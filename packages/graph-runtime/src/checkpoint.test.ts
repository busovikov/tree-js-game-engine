import { describe, expect, it } from 'vitest'
import { EngineScheduler, World } from '@haku/core'
import type {
  ExecutionPlanCheckpoint,
  ExecutionPlanNode,
  GraphExecutionPlan,
} from '@haku/graph'
import {
  GraphInstance,
  type CheckpointEffectRecord,
  type ExecutionBackend,
} from './index.js'

const uid = (value: number): string =>
  `4a000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const CHECKPOINT = uid(1)
const MUTATE = uid(2)
const QUEUED = uid(3)
const INPUT = uid(4)

function node(
  id: string,
  domain: ExecutionPlanNode['domain'],
  effects: ExecutionPlanNode['effects'] = [],
): ExecutionPlanNode {
  return {
    id,
    nodeType: id,
    version: '1',
    kind: 'builtin',
    domain,
    order: Number(id.slice(-1)),
    typeArguments: {},
    properties: {},
    reads: [],
    writes: id === MUTATE
      ? [{ resource: 'logic.score', scope: 'static' }]
      : [],
    effects,
    execution: 'sync',
    exportedState: id === MUTATE
      ? [{ name: 'count', type: { kind: 'named', id: uid(99), arguments: [] } }]
      : [],
    checkpoint: { eligible: true, causalChain: [] },
  }
}

function plan(): GraphExecutionPlan {
  const checkpoint: ExecutionPlanCheckpoint = {
    nodeId: CHECKPOINT,
    eligible: true,
    stateScope: {
      nodes: [CHECKPOINT, MUTATE, QUEUED],
      resources: ['logic.score'],
      unbounded: false,
    },
    dependencies: [],
    asyncPolicies: [],
  }
  return {
    schemaVersion: 1,
    graphId: uid(90),
    registryFingerprint: 'checkpoint-registry',
    planFingerprint: 'checkpoint-plan',
    nodes: [
      node(CHECKPOINT, 'FrameGameplay'),
      node(MUTATE, 'FrameGameplay', ['audio', 'event.emit']),
      node(QUEUED, 'LateUpdate'),
    ],
    connections: [{
      id: uid(20),
      kind: 'flow',
      operation: 'queue-flow',
      from: { node: MUTATE, callsite: uid(21) },
      to: { node: QUEUED, callsite: uid(22) },
    }],
    publicInterface: {
      ports: [{
        id: INPUT,
        name: 'Input',
        kind: 'data',
        direction: 'input',
        type: { kind: 'named', id: uid(99), arguments: [] },
      }],
    },
    subgraphs: [],
    checkpoints: [checkpoint],
    checkpointEligible: true,
  }
}

describe('GraphInstance checkpoint and rewind', () => {
  it('atomically restores only the proven scope and removes post-checkpoint work in one tick', () => {
    const scheduler = new EngineScheduler()
    const world = new World()
    const lifecycle: string[] = []
    const queued: string[] = []
    let execution = 0
    let score = 10
    let unrelatedPhysics = 5
    const applied: CheckpointEffectRecord[] = []
    const reconciled: readonly CheckpointEffectRecord[][] = []
    const backend: ExecutionBackend = {
      execute(request) {
        if (request.node.id === MUTATE) {
          execution += 1
          return {
            flow: [uid(21)],
            exportedState: { count: execution },
            effects: [
              { id: 'score-once', kind: 'score', payload: execution },
              { id: 'audio-once', kind: 'audio', payload: 'jump' },
              { id: 'event-once', kind: 'event', payload: 'landed' },
            ],
          }
        }
        if (request.node.id === QUEUED) queued.push('ran')
        return {}
      },
      lifecycle(request) {
        lifecycle.push(request.action)
      },
    }
    const instance = new GraphInstance({
      id: 'root',
      plan: plan(),
      registryFingerprint: 'checkpoint-registry',
      scheduler,
      backend,
      resources: {
        snapshot: (resource) =>
          resource === 'logic.score' ? score : unrelatedPhysics,
        restore: (resource, value) => {
          if (resource === 'logic.score') score = value as number
          else unrelatedPhysics = value as number
        },
        recompute: (resources) => lifecycle.push(`recompute:${resources.join(',')}`),
      },
      effects: {
        apply: (record) => applied.push(record),
        reconcile: (records) => reconciled.push(records),
      },
    })

    instance.setParameter(INPUT, 1)
    instance.start(MUTATE)
    scheduler.runFrame(world, 0)
    expect(queued).toEqual(['ran'])
    const first = instance.createCheckpoint(CHECKPOINT, 'first')

    instance.setParameter(INPUT, 2)
    score = 99
    instance.start(MUTATE)
    const replacement = instance.createCheckpoint(CHECKPOINT, 'replacement')
    expect(replacement.id).not.toBe(first.id)
    score = 123
    unrelatedPhysics = 77
    instance.start(MUTATE)
    const tickBefore = scheduler.tickNumber

    instance.rewind()
    scheduler.runFrame(world, 0)

    expect(scheduler.tickNumber - tickBefore).toBeLessThanOrEqual(1)
    expect(instance.checkpoint?.id).toBe(replacement.id)
    expect(instance.getParameter(INPUT)).toBe(2)
    expect(score).toBe(99)
    expect(unrelatedPhysics).toBe(77)
    expect(queued).toEqual(['ran'])
    expect(lifecycle.slice(-7)).toEqual([
      'before-rewind',
      'before-rewind',
      'before-rewind',
      'recompute:logic.score',
      'after-rewind',
      'after-rewind',
      'after-rewind',
    ])
    expect(reconciled.at(-1)?.map((record) => record.id)).toEqual([
      'audio-once',
      'event-once',
      'score-once',
    ])

    instance.start(MUTATE)
    expect(applied.map((record) => record.id)).toEqual([
      'audio-once',
      'event-once',
      'score-once',
    ])
  })

  it('rejects an ineligible or unknown checkpoint without replacing the active record', () => {
    const unsafe = plan()
    unsafe.checkpoints[0] = {
      ...unsafe.checkpoints[0],
      eligible: false,
      dependencies: [{
        kind: 'dynamic-physics',
        nodeId: CHECKPOINT,
        resource: 'physics.dynamic-body',
        causalChain: ['checkpoint', 'dynamic physics read'],
      }],
    }
    const instance = new GraphInstance({
      id: 'root',
      plan: unsafe,
      registryFingerprint: 'checkpoint-registry',
      scheduler: new EngineScheduler(),
      backend: { execute: () => ({}) },
    })

    expect(() => instance.createCheckpoint(CHECKPOINT, 'unsafe')).toThrow(
      'dynamic physics read',
    )
    expect(() => instance.createCheckpoint(uid(404), 'missing')).toThrow(
      'Unknown checkpoint node',
    )
    expect(instance.checkpoint).toBeUndefined()
  })
})
