import { describe, expect, it, beforeEach } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import { createBodyWithShape } from '@haku/physics'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { PhysicsWorldSystem } from './physics-world-system.js'

describe('PhysicsWorldSystem primitive colliders (Rapier integration)', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  it('static box ground + falling dynamic sphere collides and settles', async () => {
    const backend = await createRapierPhysicsBackend()
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    system.setBackend(backend)

    const physicsWorld = system.getPhysicsWorld()
    expect(physicsWorld).not.toBeNull()

    createBodyWithShape(
      physicsWorld!,
      {
        type: 'static',
        transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1] },
      },
      { type: 'box', halfExtents: [10, 0.5, 10] },
    )

    const world = new World()
    const entityId = world.createEntity('FallingSphere')
    world.addComponent(entityId, TransformComponent, {
      position: [0, 5, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    const { body: sphereBody } = createBodyWithShape(
      physicsWorld!,
      {
        type: 'dynamic',
        transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
        mass: 1,
      },
      { type: 'sphere', radius: 0.5 },
    )
    system.registerBody(entityId, sphereBody, 'dynamic', world)

    system.update(world, 1)

    const finalY = world.getComponent(entityId, TransformComponent)?.position[1] ?? 5
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(1.5)

    system.dispose()
  })

  it('dynamic capsule falls onto static box ground', async () => {
    const backend = await createRapierPhysicsBackend()
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    system.setBackend(backend)

    const physicsWorld = system.getPhysicsWorld()!

    createBodyWithShape(
      physicsWorld,
      {
        type: 'static',
        transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1] },
      },
      { type: 'box', halfExtents: [10, 0.5, 10] },
    )

    const world = new World()
    const entityId = world.createEntity('FallingCapsule')
    world.addComponent(entityId, TransformComponent, {
      position: [0, 8, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    const { body } = createBodyWithShape(
      physicsWorld,
      {
        type: 'dynamic',
        transform: { position: [0, 8, 0], rotation: [0, 0, 0, 1] },
        mass: 1,
      },
      { type: 'capsule', radius: 0.3, halfHeight: 0.6 },
    )
    system.registerBody(entityId, body, 'dynamic', world)

    system.update(world, 1.5)

    const finalY = world.getComponent(entityId, TransformComponent)?.position[1] ?? 8
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(2)

    system.dispose()
  })
})
