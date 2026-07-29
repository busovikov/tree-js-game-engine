import { EngineScheduler } from '@haku/core'
import type {
  ExecutionPlanCheckpoint,
  ExecutionPlanNode,
  GraphExecutionPlan,
} from '@haku/graph'
import {
  CheckpointMigrationRegistry,
  GraphInstance,
  type ExecutionBackend,
} from '@haku/graph-runtime'
import { describe, expect, it, vi } from 'vitest'
import {
  InMemorySaveStorage,
  SaveSlotCheckpointService,
  createSaveSlotData,
  type HakuSaveSlotData,
} from './index.js'

const uid = (value: number): string =>
  `7d000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const CHECKPOINT = uid(1)
const MUTATE = uid(2)
const FALLBACK = uid(3)
const RESOURCE = 'logic.score'

describe('SaveSlotCheckpointService', () => {
  it('roundtrips checkpoint entries without replacing game data or sibling graphs', async () => {
    const storage = new InMemorySaveStorage()
    await storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: createSaveSlotData({ inventory: ['key'] }),
    })
    const service = new SaveSlotCheckpointService(storage)
    const first = persistentRecord('graph-a', 'checkpoint-a')
    const sibling = persistentRecord('graph-b', 'checkpoint-b')

    await service.saveCheckpoint('campaign-1', first)
    await service.saveCheckpoint('campaign-1', sibling)

    expect(await service.loadCheckpoint('campaign-1', 'graph-a')).toEqual(first)
    const slot = await storage.readSlot<HakuSaveSlotData<{ inventory: string[] }>>(
      'campaign-1',
    )
    expect(slot?.data.gameData).toEqual({ inventory: ['key'] })
    expect(Object.keys(slot?.data.checkpointEntries ?? {})).toEqual([
      'graph-a',
      'graph-b',
    ])
  })

  it('roundtrips GraphInstance migration and isolates fallback from the rest of the slot', async () => {
    const storage = new InMemorySaveStorage()
    await storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: createSaveSlotData({ inventory: ['keep-me'] }),
    })
    const service = new SaveSlotCheckpointService(storage)
    const score = { value: 7 }
    const source = graphInstance({
      service,
      score,
      graphPlan: plan('plan-v1'),
    })
    await source.createCheckpoint(CHECKPOINT, 'old')

    const migrations = new CheckpointMigrationRegistry()
    migrations.register({
      graphId: uid(90),
      fromPlanFingerprint: 'plan-v1',
      toPlanFingerprint: 'plan-v2',
      migrate: (record) => ({ ...record, planFingerprint: 'plan-v2' }),
    })
    score.value = 20
    const migrated = graphInstance({
      service,
      score,
      graphPlan: plan('plan-v2'),
      migrations,
    })
    await expect(migrated.restoreCheckpoint()).resolves.toMatchObject({
      status: 'restored',
    })
    expect(score.value).toBe(7)

    const slot = await storage.readSlot<HakuSaveSlotData<{ inventory: string[] }>>(
      'campaign-1',
    )
    const corrupt = structuredClone(slot!)
    corrupt.data.checkpointEntries.root!.checksum = 'corrupt'
    await storage.writeSlot({
      slotId: 'campaign-1',
      label: corrupt.metadata.label,
      data: corrupt.data,
      expectedRevision: corrupt.metadata.revision,
    })

    const fallback = vi.fn(() => ({}))
    const broken = graphInstance({
      service,
      score,
      graphPlan: plan('plan-v1'),
      backend: {
        execute: ({ node }) => node.id === FALLBACK ? fallback() : {},
      },
    })
    await expect(broken.restoreCheckpoint()).resolves.toMatchObject({
      status: 'fallback',
      reason: expect.stringContaining('checksum mismatch'),
    })
    expect(fallback).toHaveBeenCalledOnce()
    const after = await storage.readSlot<HakuSaveSlotData<{ inventory: string[] }>>(
      'campaign-1',
    )
    expect(after?.data.gameData).toEqual({ inventory: ['keep-me'] })
    expect(after?.data.checkpointEntries.root?.checksum).toBe('corrupt')
  })
})

function graphInstance(options: {
  service: SaveSlotCheckpointService
  score: { value: number }
  graphPlan: GraphExecutionPlan
  migrations?: CheckpointMigrationRegistry
  backend?: ExecutionBackend
}): GraphInstance {
  return new GraphInstance({
    id: 'root',
    plan: options.graphPlan,
    registryFingerprint: options.graphPlan.registryFingerprint,
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
      slotId: 'campaign-1',
      references: [],
      migrations: options.migrations,
      fallbackEntryNodeId: FALLBACK,
    },
  })
}

function plan(planFingerprint: string): GraphExecutionPlan {
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
    registryFingerprint: 'registry-v1',
    planFingerprint,
    nodes: [node(CHECKPOINT), node(MUTATE), node(FALLBACK)],
    connections: [],
    publicInterface: { ports: [] },
    subgraphs: [],
    checkpoints: [checkpoint],
    checkpointEligible: true,
  }
}

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

function persistentRecord(instanceId: string, id: string) {
  return {
    schemaVersion: 1 as const,
    id,
    label: id,
    graphId: uid(90),
    instanceId,
    checkpointNodeId: CHECKPOINT,
    planFingerprint: 'plan-v1',
    registryFingerprint: 'registry-v1',
    scopeFingerprint: 'scope-v1',
    references: [],
    tickNumber: 0,
    frameNumber: 0,
    scope: { nodes: [], resources: [], unbounded: false },
    snapshot: {
      parameters: [],
      outputs: [],
      exportedState: [],
      resources: [],
      effects: [],
      asyncRecords: [],
    },
    checksum: 'checksum',
  }
}
