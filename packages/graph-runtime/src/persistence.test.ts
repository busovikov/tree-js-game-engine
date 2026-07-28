import { describe, expect, it, vi } from 'vitest'
import { EngineScheduler } from '@haku/core'
import type {
  ExecutionPlanCheckpoint,
  ExecutionPlanNode,
  GraphExecutionPlan,
} from '@haku/graph'
import {
  CheckpointMigrationRegistry,
  GraphInstance,
  checksumCheckpointRecord,
  type ExecutionBackend,
  type PersistentCheckpointRecord,
  type SaveService,
} from './index.js'

const uid = (value: number): string =>
  `6a000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const CHECKPOINT = uid(1)
const MUTATE = uid(2)
const FALLBACK = uid(3)
const RESOURCE = 'logic.score'

function node(id: string): ExecutionPlanNode {
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
    writes: id === MUTATE ? [{ resource: RESOURCE, scope: 'static' }] : [],
    effects: [],
    execution: 'sync',
    exportedState: [],
    checkpoint: { eligible: true, causalChain: [] },
  }
}

function plan(
  planFingerprint = 'plan-v1',
  registryFingerprint = 'registry-v1',
): GraphExecutionPlan {
  const checkpoint: ExecutionPlanCheckpoint = {
    nodeId: CHECKPOINT,
    eligible: true,
    stateScope: {
      nodes: [CHECKPOINT, MUTATE],
      resources: [RESOURCE],
      unbounded: false,
    },
    dependencies: [],
    asyncPolicies: [],
  }
  return {
    schemaVersion: 1,
    graphId: uid(90),
    registryFingerprint,
    planFingerprint,
    nodes: [node(CHECKPOINT), node(MUTATE), node(FALLBACK)],
    connections: [],
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpoints: [checkpoint],
    checkpointEligible: true,
  }
}

class MemorySaveService implements SaveService {
  readonly slots = new Map<string, {
    otherData: unknown
    checkpoints: Map<string, PersistentCheckpointRecord>
  }>()
  readonly writes: PersistentCheckpointRecord[] = []

  async saveCheckpoint(
    slotId: string,
    record: PersistentCheckpointRecord,
  ): Promise<void> {
    const slot = this.slots.get(slotId) ?? {
      otherData: undefined,
      checkpoints: new Map(),
    }
    slot.checkpoints.set(record.instanceId, structuredClone(record))
    this.slots.set(slotId, slot)
    this.writes.push(structuredClone(record))
  }

  async loadCheckpoint(
    slotId: string,
    instanceId: string,
  ): Promise<PersistentCheckpointRecord | undefined> {
    const record = this.slots.get(slotId)?.checkpoints.get(instanceId)
    return record ? structuredClone(record) : undefined
  }
}

function persistentInstance(options: {
  readonly service: SaveService
  readonly policy?: 'memory-only' | 'persist-automatically' | 'persist-explicitly'
  readonly graphPlan?: GraphExecutionPlan
  readonly backend?: ExecutionBackend
  readonly migrations?: CheckpointMigrationRegistry
  readonly score: { value: number }
}): GraphInstance {
  const graphPlan = options.graphPlan ?? plan()
  return new GraphInstance({
    id: 'root',
    plan: graphPlan,
    registryFingerprint: graphPlan.registryFingerprint,
    scheduler: new EngineScheduler(),
    backend: options.backend ?? { execute: () => ({}) },
    resources: {
      snapshot: () => options.score.value,
      restore: (_resource, value) => {
        options.score.value = value as number
      },
    },
    persistence: {
      saveService: options.service,
      slotId: 'slot-a',
      policy: options.policy,
      references: [
        { id: uid(70), fingerprint: 'scene-v1' },
        { id: uid(71), fingerprint: 'asset-v2' },
      ],
      migrations: options.migrations,
      fallbackEntryNodeId: FALLBACK,
    },
  })
}

describe('persistent graph checkpoints', () => {
  it('writes a checksummed record with graph, registry, scope, and reference fingerprints', async () => {
    const service = new MemorySaveService()
    const score = { value: 10 }
    const graph = persistentInstance({ service, score })

    await graph.createCheckpoint(CHECKPOINT, 'automatic')

    expect(service.writes).toHaveLength(1)
    expect(service.writes[0]).toMatchObject({
      schemaVersion: 1,
      graphId: uid(90),
      instanceId: 'root',
      checkpointNodeId: CHECKPOINT,
      planFingerprint: 'plan-v1',
      registryFingerprint: 'registry-v1',
      references: [
        { id: uid(70), fingerprint: 'scene-v1' },
        { id: uid(71), fingerprint: 'asset-v2' },
      ],
      scope: {
        nodes: [CHECKPOINT, MUTATE],
        resources: [RESOURCE],
        unbounded: false,
      },
    })
    expect(service.writes[0].scopeFingerprint).toMatch(/^haku-registry-v1-/)
    expect(service.writes[0].checksum).toBe(
      checksumCheckpointRecord(service.writes[0]),
    )
  })

  it('keeps memory-only checkpoints local and persists explicit checkpoints only on request', async () => {
    const memoryService = new MemorySaveService()
    const memory = persistentInstance({
      service: memoryService,
      policy: 'memory-only',
      score: { value: 1 },
    })
    await memory.createCheckpoint(CHECKPOINT, 'memory')
    expect(memoryService.writes).toEqual([])
    await expect(memory.persistCheckpoint()).rejects.toThrow('memory-only')

    const explicitService = new MemorySaveService()
    const explicit = persistentInstance({
      service: explicitService,
      policy: 'persist-explicitly',
      score: { value: 2 },
    })
    await explicit.createCheckpoint(CHECKPOINT, 'explicit')
    expect(explicitService.writes).toEqual([])
    await explicit.persistCheckpoint()
    expect(explicitService.writes).toHaveLength(1)
  })

  it('restores valid state and dispatches OnResumeFromCheckpoint instead of OnStart', async () => {
    const service = new MemorySaveService()
    const score = { value: 12 }
    const source = persistentInstance({ service, score })
    await source.createCheckpoint(CHECKPOINT, 'resume')
    score.value = 99

    const lifecycle: string[] = []
    const execute = vi.fn(() => ({}))
    const restored = persistentInstance({
      service,
      score,
      backend: {
        execute,
        lifecycle: ({ action }) => lifecycle.push(action),
      },
    })
    await expect(restored.restoreCheckpoint()).resolves.toEqual({
      status: 'restored',
      checkpointId: 'root:checkpoint:0',
    })

    expect(score.value).toBe(12)
    expect(execute).not.toHaveBeenCalled()
    expect(lifecycle.filter((action) => action === 'resume-from-checkpoint'))
      .toHaveLength(2)
    expect(lifecycle).not.toContain('start')
  })

  it.each([
    ['checksum', (record: PersistentCheckpointRecord) => ({
      ...record,
      checksum: 'corrupt',
    })],
    ['plan fingerprint', (record: PersistentCheckpointRecord) => ({
      ...record,
      planFingerprint: 'unknown-plan',
      checksum: '',
    })],
    ['registry fingerprint', (record: PersistentCheckpointRecord) => ({
      ...record,
      registryFingerprint: 'unknown-registry',
      checksum: '',
    })],
    ['reference fingerprint', (record: PersistentCheckpointRecord) => ({
      ...record,
      references: [{ id: uid(70), fingerprint: 'changed-scene' }],
      checksum: '',
    })],
    ['scope fingerprint', (record: PersistentCheckpointRecord) => ({
      ...record,
      scopeFingerprint: 'unknown-scope',
      checksum: '',
    })],
  ] as const)(
    'falls back only the incompatible graph for an invalid %s',
    async (_kind, mutate) => {
      const service = new MemorySaveService()
      service.slots.set('slot-a', {
        otherData: { inventory: ['keep-me'] },
        checkpoints: new Map(),
      })
      const score = { value: 4 }
      const source = persistentInstance({ service, score })
      await source.createCheckpoint(CHECKPOINT, 'source')
      const record = service.writes[0]
      const changed = mutate(record)
      if (changed.checksum === '') {
        changed.checksum = checksumCheckpointRecord(changed)
      }
      service.slots.get('slot-a')!.checkpoints.set('root', changed)

      const fallback = vi.fn(() => ({}))
      const target = persistentInstance({
        service,
        score,
        backend: {
          execute: ({ node: current }) =>
            current.id === FALLBACK ? fallback() : {},
        },
      })
      const result = await target.restoreCheckpoint()

      expect(result.status).toBe('fallback')
      expect(fallback).toHaveBeenCalledOnce()
      expect(service.slots.get('slot-a')?.otherData).toEqual({
        inventory: ['keep-me'],
      })
      expect(service.slots.get('slot-a')?.checkpoints.has('root')).toBe(true)
    },
  )

  it('applies a registered migration before restore and falls back when migration throws', async () => {
    const service = new MemorySaveService()
    const score = { value: 7 }
    const oldGraph = persistentInstance({
      service,
      score,
      graphPlan: plan('plan-v1'),
    })
    await oldGraph.createCheckpoint(CHECKPOINT, 'old')

    const migrations = new CheckpointMigrationRegistry()
    const migrate = vi.fn((record: PersistentCheckpointRecord) => ({
      ...record,
      planFingerprint: 'plan-v2',
    }))
    migrations.register({
      graphId: uid(90),
      fromPlanFingerprint: 'plan-v1',
      toPlanFingerprint: 'plan-v2',
      migrate,
    })
    score.value = 20
    const next = persistentInstance({
      service,
      score,
      graphPlan: plan('plan-v2'),
      migrations,
    })

    await expect(next.restoreCheckpoint()).resolves.toMatchObject({
      status: 'restored',
    })
    expect(migrate).toHaveBeenCalledOnce()
    expect(score.value).toBe(7)

    const brokenMigrations = new CheckpointMigrationRegistry()
    brokenMigrations.register({
      graphId: uid(90),
      fromPlanFingerprint: 'plan-v1',
      toPlanFingerprint: 'plan-v3',
      migrate: () => {
        throw new Error('cannot migrate')
      },
    })
    const fallback = vi.fn(() => ({}))
    const broken = persistentInstance({
      service,
      score,
      graphPlan: plan('plan-v3'),
      migrations: brokenMigrations,
      backend: {
        execute: ({ node: current }) =>
          current.id === FALLBACK ? fallback() : {},
      },
    })
    await expect(broken.restoreCheckpoint()).resolves.toMatchObject({
      status: 'fallback',
      reason: expect.stringContaining('cannot migrate'),
    })
    expect(fallback).toHaveBeenCalledOnce()
  })

  it('rejects an invalid persistence policy at the runtime boundary', () => {
    const service = new MemorySaveService()
    expect(() => persistentInstance({
      service,
      score: { value: 0 },
      policy: 'invalid' as 'memory-only',
    })).toThrow('Unknown checkpoint persistence policy')
  })
})
