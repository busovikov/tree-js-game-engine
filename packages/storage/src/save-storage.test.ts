import { describe, expect, it } from 'vitest'
import {
  InMemorySaveStorage,
  SaveStorageConflictError,
  SaveStorageQuotaError,
  SaveStorageSerializationError,
  type ISaveStorage,
  type ReplayArtifactRecord,
  type SaveSlotRecord,
} from './index.js'

const firstWrittenAt = '2026-07-30T10:00:00.000Z'
const secondWrittenAt = '2026-07-30T10:00:01.000Z'

describe('InMemorySaveStorage', () => {
  it('atomically writes, lists, and reads a typed save slot as defensive copies', async () => {
    const storage: ISaveStorage = new InMemorySaveStorage({
      now: sequenceClock(firstWrittenAt, secondWrittenAt),
    })

    const written = await storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: {
        sceneId: 'scene-main',
        checkpointEntries: [{ graphInstanceId: 'graph-player', checksum: 'sha256:test' }],
      },
    })

    expect(written).toEqual<SaveSlotRecord>({
      metadata: {
        slotId: 'campaign-1',
        label: 'Campaign 1',
        revision: 1,
        createdAt: firstWrittenAt,
        updatedAt: firstWrittenAt,
      },
      data: {
        sceneId: 'scene-main',
        checkpointEntries: [{ graphInstanceId: 'graph-player', checksum: 'sha256:test' }],
      },
    })
    expect(await storage.listSlots()).toEqual([written.metadata])
    expect(await storage.readSlot('campaign-1')).toEqual(written)

    written.metadata.label = 'mutated result'
    ;(written.data as { checkpointEntries: { checksum: string }[] }).checkpointEntries[0]!
      .checksum = 'mutated result'
    const listed = await storage.listSlots()
    listed[0]!.label = 'mutated list'

    expect(await storage.readSlot('campaign-1')).toEqual({
      metadata: {
        slotId: 'campaign-1',
        label: 'Campaign 1',
        revision: 1,
        createdAt: firstWrittenAt,
        updatedAt: firstWrittenAt,
      },
      data: {
        sceneId: 'scene-main',
        checkpointEntries: [{ graphInstanceId: 'graph-player', checksum: 'sha256:test' }],
      },
    })
  })

  it('rejects a stale expected revision without mutating the stored slot', async () => {
    const storage = new InMemorySaveStorage({
      now: sequenceClock(firstWrittenAt, secondWrittenAt),
    })
    await storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: { score: 10 },
    })

    await expect(storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Stale write',
      data: { score: 99 },
      expectedRevision: 0,
    })).rejects.toEqual(expect.objectContaining<Partial<SaveStorageConflictError>>({
      name: 'SaveStorageConflictError',
      slotId: 'campaign-1',
      expectedRevision: 0,
      actualRevision: 1,
    }))

    expect(await storage.readSlot('campaign-1')).toEqual({
      metadata: {
        slotId: 'campaign-1',
        label: 'Campaign 1',
        revision: 1,
        createdAt: firstWrittenAt,
        updatedAt: firstWrittenAt,
      },
      data: { score: 10 },
    })
  })

  it('keeps replay artifacts in a namespace separate from save slots', async () => {
    const storage = new InMemorySaveStorage({
      now: sequenceClock(firstWrittenAt, secondWrittenAt),
    })
    const replay = await storage.writeReplayArtifact({
      artifactId: 'run-1',
      label: 'First run',
      data: { ticks: [1, 2, 3] },
    })

    expect(replay).toEqual<ReplayArtifactRecord>({
      metadata: {
        artifactId: 'run-1',
        label: 'First run',
        revision: 1,
        createdAt: firstWrittenAt,
        updatedAt: firstWrittenAt,
      },
      data: { ticks: [1, 2, 3] },
    })
    expect(await storage.listSlots()).toEqual([])
    expect(await storage.readSlot('run-1')).toBeUndefined()
    expect(await storage.listReplayArtifacts()).toEqual([replay.metadata])
    expect(await storage.readReplayArtifact('run-1')).toEqual(replay)
  })

  it('reports quota usage and rejects an oversized replacement without mutation', async () => {
    const storage = new InMemorySaveStorage({
      quotaBytes: 500,
      now: sequenceClock(firstWrittenAt, secondWrittenAt),
    })
    await storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: { score: 10 },
    })
    const before = await storage.estimate()

    expect(before.quota).toBe(500)
    expect(before.usage).toBeGreaterThan(0)
    await expect(storage.writeSlot({
      slotId: 'campaign-1',
      label: 'Oversized',
      data: { value: 'x'.repeat(1_000) },
      expectedRevision: 1,
    })).rejects.toBeInstanceOf(SaveStorageQuotaError)

    expect(await storage.readSlot('campaign-1')).toEqual({
      metadata: {
        slotId: 'campaign-1',
        label: 'Campaign 1',
        revision: 1,
        createdAt: firstWrittenAt,
        updatedAt: firstWrittenAt,
      },
      data: { score: 10 },
    })
    expect(await storage.estimate()).toEqual(before)
  })

  it('rejects data that cannot be cloned without creating a partial slot', async () => {
    const storage = new InMemorySaveStorage()

    await expect(storage.writeSlot({
      slotId: 'invalid',
      label: 'Invalid',
      data: { callback: () => undefined },
    })).rejects.toBeInstanceOf(SaveStorageSerializationError)

    expect(await storage.readSlot('invalid')).toBeUndefined()
    expect(await storage.listSlots()).toEqual([])
  })
})

function sequenceClock(...timestamps: string[]): () => string {
  let index = 0
  return () => timestamps[Math.min(index++, timestamps.length - 1)]!
}
