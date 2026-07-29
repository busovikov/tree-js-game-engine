import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import {
  IndexedDbSaveStorage,
  SaveStorageConflictError,
  SaveStorageUnavailableError,
} from './index.js'

describe('IndexedDbSaveStorage', () => {
  it('roundtrips slots across connections and atomically rejects stale revisions', async () => {
    const indexedDB = new IDBFactory()
    const first = new IndexedDbSaveStorage({
      databaseName: 'roundtrip',
      indexedDB,
      now: () => '2026-07-30T11:00:00.000Z',
    })
    const second = new IndexedDbSaveStorage({
      databaseName: 'roundtrip',
      indexedDB,
      now: () => '2026-07-30T11:00:01.000Z',
    })

    await first.writeSlot({
      slotId: 'campaign-1',
      label: 'Campaign 1',
      data: { checkpointEntries: [{ graphInstanceId: 'player', checksum: 'one' }] },
    })
    const loaded = await second.readSlot('campaign-1')
    expect(loaded?.metadata.revision).toBe(1)
    expect(loaded?.data).toEqual({
      checkpointEntries: [{ graphInstanceId: 'player', checksum: 'one' }],
    })

    await expect(Promise.all([
      first.writeSlot({
        slotId: 'campaign-1',
        label: 'Writer one',
        data: { writer: 1 },
        expectedRevision: 1,
      }),
      second.writeSlot({
        slotId: 'campaign-1',
        label: 'Writer two',
        data: { writer: 2 },
        expectedRevision: 1,
      }),
    ])).rejects.toBeInstanceOf(SaveStorageConflictError)

    const afterConflict = await first.readSlot<{ writer: number }>('campaign-1')
    expect(afterConflict?.metadata.revision).toBe(2)
    expect([1, 2]).toContain(afterConflict?.data.writer)
  })

  it('keeps replay artifacts in a separate object store', async () => {
    const storage = new IndexedDbSaveStorage({
      databaseName: 'replays',
      indexedDB: new IDBFactory(),
      now: () => '2026-07-30T11:00:00.000Z',
    })

    await storage.writeReplayArtifact({
      artifactId: 'run-1',
      label: 'Run 1',
      data: { ticks: [1, 2, 3] },
    })

    expect(await storage.listSlots()).toEqual([])
    expect(await storage.readSlot('run-1')).toBeUndefined()
    expect(await storage.listReplayArtifacts()).toEqual([
      expect.objectContaining({ artifactId: 'run-1', revision: 1 }),
    ])
    expect(await storage.readReplayArtifact('run-1')).toEqual({
      metadata: {
        artifactId: 'run-1',
        label: 'Run 1',
        revision: 1,
        createdAt: '2026-07-30T11:00:00.000Z',
        updatedAt: '2026-07-30T11:00:00.000Z',
      },
      data: { ticks: [1, 2, 3] },
    })
  })

  it('reports the browser storage estimate without presenting it as exact', async () => {
    const estimateStorage = vi.fn(async () => ({ usage: 1234, quota: 5678 }))
    const storage = new IndexedDbSaveStorage({
      databaseName: 'estimate',
      indexedDB: new IDBFactory(),
      estimateStorage,
    })

    await expect(storage.estimate()).resolves.toEqual({
      usage: 1234,
      quota: 5678,
    })
    expect(estimateStorage).toHaveBeenCalledOnce()
  })

  it('fails honestly when IndexedDB is unavailable', async () => {
    const storage = new IndexedDbSaveStorage({
      databaseName: 'unavailable',
      indexedDB: undefined,
    })

    await expect(storage.listSlots()).rejects.toBeInstanceOf(
      SaveStorageUnavailableError,
    )
  })
})
