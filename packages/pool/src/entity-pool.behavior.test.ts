import { describe, expect, it } from 'vitest'
import {
  TransformComponent,
  World,
  entityId,
  type ComponentDefinition,
} from '@haku/core'
import { assetId, assetRef } from '@haku/schema'
import { PREFAB_ASSET_TYPE } from '@haku/assets'
import { z } from 'zod'
import {
  EntityPool,
  EntityPoolComponent,
  EntityPoolSchema,
  createEntityPoolFromComponent,
  poolHandleRoot,
  type PoolLifecycleEvent,
} from './index.js'

const BaselineComponent: ComponentDefinition<{ value: string }> = {
  id: 'a1000000-0000-4000-8000-000000000001',
  name: 'Baseline',
  schema: z.object({ value: z.string() }),
}

describe('EntityPool hierarchy and baseline reset', () => {
  it('prepares serializable lease state before acquire lifecycle participants observe it', () => {
    const world = new World()
    const observedPositions: unknown[] = []
    const pool = new EntityPool({
      world,
      capacity: 1,
      maximum: 1,
      createInstance() {
        const root = world.createEntity('Prepared root')
        world.addComponent(root, TransformComponent, TransformComponent.defaults())
        return root
      },
      onLifecycle(event) {
        if (event.action === 'acquire') {
          observedPositions.push(world.getComponent(event.root, TransformComponent)?.position)
        }
      },
    })
    pool.prewarm()

    const handle = pool.acquire((root) => {
      world.addComponent(root, TransformComponent, {
        ...TransformComponent.defaults(),
        position: [4, 5, 6],
      })
    })

    expect(handle).not.toBeNull()
    expect(observedPositions).toEqual([[4, 5, 6]])
  })

  it('rolls back a failed lease preparation without consuming the instance', () => {
    const world = new World()
    const pool = new EntityPool({
      world,
      capacity: 1,
      maximum: 1,
      createInstance: () => world.createEntity('Prepared root'),
    })
    pool.prewarm()

    expect(() =>
      pool.acquire(() => {
        throw new Error('invalid placement')
      }),
    ).toThrow('invalid placement')
    expect(pool.metrics()).toMatchObject({ active: 0, inactive: 1, acquisitions: 0 })
    expect(pool.acquire()).not.toBeNull()
  })

  it('restores hierarchy, names, activity, component membership, and serializable data', () => {
    const world = new World()
    const extraType = {
      id: 'a1000000-0000-4000-8000-000000000002',
      name: 'Runtime-only',
      schema: BaselineComponent.schema,
    }
    let authoredChild = entityId('a1000000-0000-4000-8000-000000000010')
    const pool = new EntityPool({
      world,
      createInstance() {
        const root = world.createEntity('Authored root')
        authoredChild = world.createEntity('Authored child')
        world.setParent(authoredChild, root)
        world.addComponent(root, TransformComponent, TransformComponent.defaults())
        world.addComponent(authoredChild, BaselineComponent, { value: 'baseline' })
        return root
      },
    })
    pool.prewarm(1)
    const handle = pool.acquire()!
    const root = poolHandleRoot(handle)
    const runtimeChild = world.createEntity('Runtime child')
    world.setParent(runtimeChild, root)
    world.setParent(authoredChild, null)
    world.setEntityName(authoredChild, 'Mutated')
    world.addComponent(authoredChild, BaselineComponent, { value: 'changed' })
    world.addComponent(authoredChild, extraType, { value: 'temporary' })
    world.setActiveSelf(authoredChild, false)

    pool.release(handle)

    expect(world.hasEntity(runtimeChild)).toBe(false)
    expect(world.getParent(authoredChild)).toEqual(root)
    expect(world.getEntityName(authoredChild)).toBe('Authored child')
    expect(world.getActiveSelf(authoredChild)).toBe(true)
    expect(world.getComponent(authoredChild, BaselineComponent)).toEqual({ value: 'baseline' })
    expect(world.hasComponent(authoredChild, extraType)).toBe(false)
    expect(world.isActiveInHierarchy(authoredChild)).toBe(false)
  })

  it('aborts lease work, disposes subscriptions, clears flags, and rejects stale handles', async () => {
    const world = new World()
    let event: PoolLifecycleEvent | undefined
    const pool = new EntityPool({
      world,
      createInstance: () => world.createEntity('Scoped'),
      onLifecycle(value) {
        if (value.action === 'acquire') event = value
      },
    })
    pool.prewarm(1)
    const first = pool.acquire()!
    const scope = pool.scope(first)
    const leasedSignal = scope.signal
    let disposed = 0
    scope.addCleanup(() => {
      disposed += 1
    })
    scope.setFlag('has-scored', true)
    const task = scope.trackTask(
      (signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        }),
    )

    pool.release(first)
    await task

    expect(event?.scope).toBe(scope)
    expect(leasedSignal.aborted).toBe(true)
    expect(disposed).toBe(1)
    expect(scope.flags.size).toBe(0)
    expect(() => pool.release(first)).toThrow('Stale pool handle')
    const second = pool.acquire()!
    expect(second.entity).toBe(first.entity)
    expect(second.generation).toBe(first.generation + 1)
  })
})

describe('EntityPool policies and metrics', () => {
  it('honors fixed capacity and return-null exhaustion', () => {
    const world = new World()
    const pool = new EntityPool({
      world,
      capacity: 1,
      maximum: 1,
      expansionPolicy: 'fixed',
      exhaustionPolicy: 'return-null',
      createInstance: () => world.createEntity('Fixed'),
    })
    pool.prewarm()

    expect(pool.acquire()).not.toBeNull()
    expect(pool.acquire()).toBeNull()
    expect(pool.metrics()).toMatchObject({
      capacity: 1,
      maximum: 1,
      total: 1,
      active: 1,
      inactive: 0,
      exhaustions: 1,
    })
  })

  it('grows to maximum and throws when configured', () => {
    const world = new World()
    const pool = new EntityPool({
      world,
      capacity: 1,
      maximum: 2,
      expansionPolicy: 'grow',
      exhaustionPolicy: 'throw',
      createInstance: () => world.createEntity('Growing'),
    })
    pool.prewarm()

    expect(pool.acquire()).not.toBeNull()
    expect(pool.acquire()).not.toBeNull()
    expect(() => pool.acquire()).toThrow('is exhausted')
    expect(pool.metrics()).toMatchObject({ capacity: 2, total: 2, expansions: 1 })
  })

  it('reuses the oldest lease and counts forced release cleanup', () => {
    const world = new World()
    const actions: string[] = []
    const pool = new EntityPool({
      world,
      capacity: 2,
      maximum: 2,
      expansionPolicy: 'fixed',
      exhaustionPolicy: 'reuse-oldest',
      createInstance: () => world.createEntity('Reusable'),
      onLifecycle: (event) => actions.push(`${event.action}:${event.root.value}`),
    })
    pool.prewarm()
    const first = pool.acquire()!
    const second = pool.acquire()!

    const reused = pool.acquire()!

    expect(reused.entity).toBe(first.entity)
    expect(reused.entity).not.toBe(second.entity)
    expect(reused.generation).toBe(first.generation + 1)
    expect(actions.slice(-2)).toEqual([
      `release:${first.entity}`,
      `acquire:${first.entity}`,
    ])
    expect(pool.metrics()).toMatchObject({
      acquisitions: 3,
      releases: 1,
      exhaustions: 1,
      forcedReleases: 1,
    })
  })

  it('releases all and clears every owned hierarchy', () => {
    const world = new World()
    const pool = new EntityPool({
      world,
      capacity: 2,
      maximum: 2,
      createInstance() {
        const root = world.createEntity('Root')
        const child = world.createEntity('Child')
        world.setParent(child, root)
        return root
      },
    })
    pool.prewarm()
    pool.acquire()
    pool.acquire()

    pool.releaseAll()
    expect(pool.metrics()).toMatchObject({ active: 0, inactive: 2, releases: 2 })
    pool.clear()
    expect(pool.metrics()).toMatchObject({ total: 0, active: 0, inactive: 0 })
    expect(world.getAllEntities()).toEqual([])
  })
})

describe('EntityPool serializable configuration', () => {
  it('parses a prefab template and rejects impossible bounds', () => {
    const template = assetRef(
      assetId('a1000000-0000-4000-8000-000000000020'),
      PREFAB_ASSET_TYPE,
    )
    expect(
      EntityPoolSchema.parse({
        template,
        capacity: 4,
        maximum: 8,
        prewarm: 2,
      }),
    ).toMatchObject({
      template,
      expansionPolicy: 'grow',
      exhaustionPolicy: 'return-null',
    })
    expect(() =>
      EntityPoolSchema.parse({
        template,
        capacity: 5,
        maximum: 4,
      }),
    ).toThrow('Pool capacity must not exceed maximum')
  })

  it('composes a runtime pool from the authored prefab-backed component', () => {
    const world = new World()
    const owner = world.createEntity('Pool owner')
    const template = assetRef(
      assetId('a1000000-0000-4000-8000-000000000021'),
      PREFAB_ASSET_TYPE,
    )
    world.addComponent(owner, EntityPoolComponent, {
      template,
      capacity: 2,
      maximum: 3,
      prewarm: 2,
      expansionPolicy: 'grow',
      exhaustionPolicy: 'return-null',
    })
    const resolved: string[] = []

    const pool = createEntityPoolFromComponent({
      world,
      entity: owner,
      instantiatePrefab(reference) {
        resolved.push(reference.$ref)
        return world.createEntity('Prefab instance')
      },
    })

    expect(pool.id).toBe(owner.value)
    expect(pool.metrics()).toMatchObject({ capacity: 2, maximum: 3, total: 2, inactive: 2 })
    expect(resolved).toEqual([template.$ref, template.$ref])
  })
})
