import { TransformComponent, World, entityId } from '@haku/core'
import { EntityPool } from '@haku/pool'

export interface PoolDiagnosticReport {
  readonly hierarchyInactive: boolean
  readonly baselineRestored: boolean
  readonly exhaustedDeterministically: boolean
  readonly cleanupRan: boolean
  readonly longRunIterations: number
  readonly allocatedEntities: number
  readonly poolInstances: number
  readonly activeAfterRun: number
}

export function runPoolDiagnostic(iterations = 10_000): PoolDiagnosticReport {
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('Pool diagnostic iterations must be a positive integer')
  }
  const world = new World()
  const pool = new EntityPool({
    id: 'a4000000-0000-4000-8000-000000000001',
    world,
    capacity: 2,
    maximum: 2,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    createInstance() {
      const root = world.createEntity('Diagnostic pooled root')
      const child = world.createEntity('Diagnostic pooled child')
      world.setParent(child, root)
      world.addComponent(root, TransformComponent, {
        position: [3, 2, 1],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      world.addComponent(child, TransformComponent, TransformComponent.defaults())
      return root
    },
  })
  pool.prewarm()
  const first = pool.acquire()!
  const second = pool.acquire()!
  const root = entityId(first.entity)
  const child = world.getChildren(root)[0]!
  let cleanupRan = false
  pool.scope(first).addCleanup(() => {
    cleanupRan = true
  })
  world.addComponent(root, TransformComponent, {
    position: [99, 99, 99],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  })
  const exhaustedDeterministically = pool.acquire() === null

  pool.release(first)
  const hierarchyInactive =
    world.getActiveSelf(child) && !world.isActiveInHierarchy(child)
  const baselineRestored =
    world.getComponent(root, TransformComponent)?.position.join(',') === '3,2,1'
  pool.release(second)

  for (let index = 0; index < iterations; index += 1) {
    const handle = pool.acquire()
    if (!handle) throw new Error(`Pool exhausted during reuse iteration ${index}`)
    pool.release(handle)
  }

  const metrics = pool.metrics()
  return {
    hierarchyInactive,
    baselineRestored,
    exhaustedDeterministically,
    cleanupRan,
    longRunIterations: iterations,
    allocatedEntities: world.getAllEntities().length,
    poolInstances: metrics.total,
    activeAfterRun: metrics.active,
  }
}
