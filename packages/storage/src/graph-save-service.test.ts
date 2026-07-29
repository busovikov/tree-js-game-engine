import { describe, expect, it } from 'vitest'
import {
  InMemorySaveStorage,
  createStorageGraphService,
} from './index.js'

describe('storage graph service adapter', () => {
  it('persists keyed values through ISaveStorage without dropping siblings', async () => {
    const storage = new InMemorySaveStorage()
    const service = createStorageGraphService(storage, {
      slotId: 'graph',
      label: 'Graph save',
    })

    await service.save('score', 3)
    await service.save('name', 'Runner')

    await expect(service.load('score')).resolves.toBe(3)
    await expect(service.load('name')).resolves.toBe('Runner')
    await expect(service.load('missing')).resolves.toBeUndefined()
    await expect(storage.readSlot('graph')).resolves.toMatchObject({
      metadata: { revision: 2 },
      data: { score: 3, name: 'Runner' },
    })
  })

  it('serializes concurrent graph writes against expected revisions', async () => {
    const storage = new InMemorySaveStorage()
    const service = createStorageGraphService(storage, {
      slotId: 'graph',
      label: 'Graph save',
    })

    await Promise.all([
      service.save('a', 1),
      service.save('b', 2),
      service.save('c', 3),
    ])

    await expect(storage.readSlot('graph')).resolves.toMatchObject({
      metadata: { revision: 3 },
      data: { a: 1, b: 2, c: 3 },
    })
  })
})
