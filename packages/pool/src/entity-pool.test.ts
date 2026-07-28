import { describe, expect, it } from 'vitest'
import { TransformComponent, World, type EntityId } from '@haku/core'
import { EntityPool, poolHandleRoot, type PoolLifecycleEvent } from './index.js'

describe('EntityPool core semantics', () => {
  it('prewarms inactive instances and restores the authored baseline on release', () => {
    const world = new World()
    const lifecycle: PoolLifecycleEvent[] = []
    const roots: EntityId[] = []
    const pool = new EntityPool({
      world,
      createInstance() {
        const root = world.createEntity('Pooled root')
        world.addComponent(root, TransformComponent, {
          position: [7, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        })
        roots.push(root)
        return root
      },
      onLifecycle(event) {
        lifecycle.push(event)
      },
    })

    pool.prewarm(2)

    expect(pool.metrics()).toMatchObject({ total: 2, active: 0, inactive: 2 })
    expect(roots.every((root) => !world.isActiveInHierarchy(root))).toBe(true)

    const handle = pool.acquire()
    expect(handle).not.toBeNull()
    const acquiredRoot = poolHandleRoot(handle!)
    expect(world.isActiveInHierarchy(acquiredRoot)).toBe(true)
    expect(world.getComponent(acquiredRoot, TransformComponent)?.position).toEqual([7, 0, 0])

    world.addComponent(acquiredRoot, TransformComponent, {
      position: [99, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    pool.release(handle!)

    expect(world.isActiveInHierarchy(acquiredRoot)).toBe(false)
    expect(world.getComponent(acquiredRoot, TransformComponent)?.position).toEqual([7, 0, 0])
    expect(lifecycle.map((event) => event.action)).toEqual(['acquire', 'release'])
  })
})
