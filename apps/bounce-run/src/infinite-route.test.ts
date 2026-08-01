import { TransformComponent, World } from '@haku/core'
import { MeshRendererComponent, MeshRendererSchema } from '@haku/engine'
import { EntityPool } from '@haku/pool'
import { ColliderComponent, ColliderSchema } from '@haku/physics'
import { describe, expect, it } from 'vitest'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import { generateBounceRunRoute } from './route-generator.js'

describe('pool-backed Bounce Run route', () => {
  it('keeps three advancing windows bounded while reusing entities and appending pure decisions', () => {
    const world = new World()
    const pool = new EntityPool({
      id: 'bounce-run-route-test',
      world,
      capacity: 8,
      maximum: 8,
      expansionPolicy: 'fixed',
      exhaustionPolicy: 'return-null',
      createInstance() {
        const entity = world.createEntity('Generated platform')
        world.addComponent(entity, TransformComponent, TransformComponent.defaults())
        world.addComponent(
          entity,
          MeshRendererComponent,
          MeshRendererSchema.parse({ geometryType: 'BoxGeometry' }),
        )
        world.addComponent(
          entity,
          ColliderComponent,
          ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
        )
        return entity
      },
    })
    pool.prewarm()

    const route = createPoolBackedBounceRunRoute({
      world,
      pool,
      seed: 0x5eed,
      activeAhead: 6,
      retainBehind: 2,
    })
    const reusedIds = new Set(route.activePlatforms().map((platform) => platform.entity.value))

    for (const platformIndex of [8, 16, 24]) {
      route.advanceTo(platformIndex)

      expect(pool.metrics().active).toBeLessThanOrEqual(8)
      expect(pool.metrics().total).toBe(8)
      expect(world.getAllEntities()).toHaveLength(8)
      expect(
        route.activePlatforms().some((platform) => reusedIds.has(platform.entity.value)),
      ).toBe(true)

      const pure = generateBounceRunRoute({
        seed: 0x5eed,
        platformCount: platformIndex + 6,
      })
      for (const active of route.activePlatforms()) {
        const descriptor = pure.platforms[active.platformIndex]!
        const transform = world.getComponent(active.entity, TransformComponent)
        const mesh = world.getComponent(active.entity, MeshRendererComponent)
        const collider = world.getComponent(active.entity, ColliderComponent)

        expect(transform?.position).toEqual(descriptor.position)
        expect(transform?.scale).toEqual(descriptor.size)
        expect(mesh?.geometryType).toBe('BoxGeometry')
        expect(collider).toMatchObject({
          shape: 'box',
          halfExtents: descriptor.size.map((dimension) => dimension / 2),
        })
      }
      expect(route.decisionLog()).toEqual(pure.decisionLog)
    }

    route.dispose()
    expect(pool.metrics().active).toBe(0)
  })

  it('preserves prior decision objects and resets the same bounded entity set', () => {
    const world = new World()
    const pool = createPlatformPool(world)
    const route = createPoolBackedBounceRunRoute({
      world,
      pool,
      seed: 0x5eed,
      activeAhead: 6,
      retainBehind: 2,
    })
    const initialDecisions = route.decisionLog()
    const initialEntityIds = route.activePlatforms().map((platform) => platform.entity.value)

    route.advanceTo(8)

    expect(route.decisionLog().slice(0, initialDecisions.length)).toEqual(initialDecisions)
    initialDecisions.forEach((decision, index) => {
      expect(route.decisionLog()[index]).toBe(decision)
    })

    route.reset()

    expect(route.decisionLog()).toEqual(
      generateBounceRunRoute({ seed: 0x5eed, platformCount: 6 }).decisionLog,
    )
    expect(route.activePlatforms().map((platform) => platform.entity.value)).toEqual(
      initialEntityIds,
    )
    expect(pool.metrics()).toMatchObject({ total: 8, active: 6, inactive: 2 })

    route.dispose()
    route.dispose()
    expect(pool.metrics()).toMatchObject({ total: 8, active: 0, inactive: 8 })
  })

  it('rejects impossible windows before leasing and contains pool exhaustion failures', () => {
    const invalidWorld = new World()
    const invalidPool = createPlatformPool(invalidWorld)

    expect(() =>
      createPoolBackedBounceRunRoute({
        world: invalidWorld,
        pool: invalidPool,
        seed: 0x5eed,
        activeAhead: 7,
        retainBehind: 2,
      }),
    ).toThrow('activeAhead plus retainBehind must not exceed pool maximum')
    expect(invalidPool.metrics()).toMatchObject({ active: 0, total: 8 })

    const world = new World()
    const pool = createPlatformPool(world)
    const route = createPoolBackedBounceRunRoute({
      world,
      pool,
      seed: 0x5eed,
      activeAhead: 6,
      retainBehind: 2,
    })
    const externalLease = pool.acquire()
    expect(externalLease).not.toBeNull()

    expect(() => route.advanceTo(8)).toThrow('route pool exhausted at platform 13')
    expect(pool.metrics().active).toBe(1)
    expect(pool.metrics().total).toBe(8)
    expect(route.activePlatforms()).toEqual([])
    expect(route.decisionLog()).toHaveLength(6)

    pool.release(externalLease!)
    route.dispose()
  })
})

function createPlatformPool(world: World): EntityPool {
  const pool = new EntityPool({
    id: 'bounce-run-route-test',
    world,
    capacity: 8,
    maximum: 8,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    createInstance() {
      const entity = world.createEntity('Generated platform')
      world.addComponent(entity, TransformComponent, TransformComponent.defaults())
      world.addComponent(
        entity,
        MeshRendererComponent,
        MeshRendererSchema.parse({ geometryType: 'BoxGeometry' }),
      )
      world.addComponent(
        entity,
        ColliderComponent,
        ColliderSchema.parse({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] }),
      )
      return entity
    },
  })
  pool.prewarm()
  return pool
}
