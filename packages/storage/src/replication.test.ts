import { describe, expect, it } from 'vitest'
import {
  MockExplicitReplicationAdapter,
  NoReplicationAdapter,
  PlatformManagedReplicationAdapter,
  ReplicationConflictError,
  ReplicationRateLimitError,
  ReplicationSizeLimitError,
  type SaveReplicationAdapter,
} from './index.js'

describe('save replication contracts', () => {
  it('reports none mode without explicit or managed capabilities', async () => {
    const adapter: SaveReplicationAdapter = new NoReplicationAdapter()

    await expect(adapter.queryCapabilities()).resolves.toEqual({
      mode: 'none',
      explicitTransfer: false,
      conflictDetection: false,
      platformManaged: false,
      numericStats: false,
    })
    expect('pull' in adapter).toBe(false)
    expect('push' in adapter).toBe(false)
    expect('flush' in adapter).toBe(false)
  })

  it('mock explicit replication versions defensive records and preserves data on conflict', async () => {
    const adapter = new MockExplicitReplicationAdapter()
    const first = await adapter.push({
      slotId: 'campaign-1',
      data: { score: 10 },
      expectedRevision: 0,
    })

    expect(first.revision).toBe(1)
    first.data = { score: 99 }
    expect(await adapter.pull('campaign-1')).toEqual({
      slotId: 'campaign-1',
      revision: 1,
      updatedAt: expect.any(String),
      data: { score: 10 },
    })

    await expect(adapter.push({
      slotId: 'campaign-1',
      data: { score: 20 },
      expectedRevision: 0,
    })).rejects.toEqual(expect.objectContaining<Partial<ReplicationConflictError>>({
      name: 'ReplicationConflictError',
      slotId: 'campaign-1',
      expectedRevision: 0,
      actualRevision: 1,
    }))
    expect((await adapter.pull<{ score: number }>('campaign-1'))?.data.score).toBe(10)
    await expect(adapter.flush()).resolves.toBeUndefined()
  })

  it('enforces explicit payload-size and operation-rate limits', async () => {
    const adapter = new MockExplicitReplicationAdapter({
      maxPayloadBytes: 100,
      maxOperationsPerWindow: 2,
      rateWindowMs: 1_000,
      nowMs: () => 100,
    })

    await adapter.push({ slotId: 'one', data: { value: 1 }, expectedRevision: 0 })
    await adapter.pull('one')
    await expect(adapter.pull('one')).rejects.toBeInstanceOf(
      ReplicationRateLimitError,
    )

    const sizeLimited = new MockExplicitReplicationAdapter({
      maxPayloadBytes: 10,
    })
    await expect(sizeLimited.push({
      slotId: 'large',
      data: { value: 'x'.repeat(100) },
      expectedRevision: 0,
    })).rejects.toBeInstanceOf(ReplicationSizeLimitError)
    expect(await sizeLimited.pull('large')).toBeUndefined()
  })

  it('offers numeric stats only when the explicit adapter declares support', async () => {
    const withoutStats = new MockExplicitReplicationAdapter()
    expect(withoutStats.numericStats).toBeUndefined()
    expect((await withoutStats.queryCapabilities()).numericStats).toBe(false)

    const withStats = new MockExplicitReplicationAdapter({
      numericStats: true,
    })
    expect(withStats.numericStats).toBeDefined()
    await withStats.numericStats!.set({ highScore: 42, deaths: 3 })
    expect(await withStats.numericStats!.get(['highScore'])).toEqual({
      highScore: 42,
    })
    await expect(withStats.numericStats!.set({
      invalid: Number.NaN,
    })).rejects.toThrow('finite')
  })

  it('platform-managed mode exposes no fake explicit transfer or conflict API', async () => {
    const adapter: SaveReplicationAdapter = new PlatformManagedReplicationAdapter()

    await expect(adapter.queryCapabilities()).resolves.toEqual({
      mode: 'platform-managed',
      explicitTransfer: false,
      conflictDetection: false,
      platformManaged: true,
      numericStats: false,
    })
    expect('pull' in adapter).toBe(false)
    expect('push' in adapter).toBe(false)
    expect('flush' in adapter).toBe(false)
    expect('conflicts' in adapter).toBe(false)
  })
})
