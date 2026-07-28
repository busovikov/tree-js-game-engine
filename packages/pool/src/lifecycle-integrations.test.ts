import { describe, expect, it } from 'vitest'
import { World } from '@haku/core'
import {
  EntityPool,
  createGraphPoolParticipant,
  type PoolGraphInstance,
} from './index.js'

describe('pool graph lifecycle integration', () => {
  it('creates a fresh graph runtime per lease and destroys it on release', () => {
    const world = new World()
    const calls: string[] = []
    let instanceNumber = 0
    const graphParticipant = createGraphPoolParticipant({
      create(event): readonly PoolGraphInstance[] {
        const label = `${event.root.value}:${instanceNumber++}`
        return [{
          activate: () => calls.push(`activate:${label}`),
          destroy: () => calls.push(`destroy:${label}`),
        }]
      },
    })
    const pool = new EntityPool({
      world,
      participants: [graphParticipant],
      createInstance: () => world.createEntity('Graph owner'),
    })
    pool.prewarm(1)

    const first = pool.acquire()!
    pool.release(first)
    const second = pool.acquire()!

    expect(second.entity).toBe(first.entity)
    expect(calls).toEqual([
      `activate:${first.entity}:0`,
      `destroy:${first.entity}:0`,
      `activate:${first.entity}:1`,
    ])
  })

  it('rolls back world activity and lease state when integration setup fails', () => {
    const world = new World()
    let attempts = 0
    const pool = new EntityPool({
      world,
      participants: [
        createGraphPoolParticipant({
          create() {
            attempts += 1
            if (attempts === 1) throw new Error('graph setup failed')
            return []
          },
        }),
      ],
      createInstance: () => world.createEntity('Recoverable'),
    })
    pool.prewarm(1)

    expect(() => pool.acquire()).toThrow('graph setup failed')
    expect(pool.metrics()).toMatchObject({ active: 0, inactive: 1, acquisitions: 0 })

    expect(pool.acquire()).not.toBeNull()
    expect(pool.metrics()).toMatchObject({ active: 1, inactive: 0, acquisitions: 1 })
  })
})
