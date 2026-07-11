import { describe, expect, it, beforeEach } from 'vitest'
import {
  ColliderComponent,
  StaticComponent,
  TransformComponent,
  VehicleComponent,
  World,
} from '@haku/core'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { VehicleSchema } from '@haku/schema'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

describe('PhysicsColliderSystem', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  it('spawns static box + dynamic sphere from ColliderComponent entities', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const groundId = world.createEntity('Ground')
    world.addComponent(groundId, TransformComponent, {
      position: [0, -0.5, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(groundId, ColliderComponent, {
      shape: 'box',
      halfExtents: [10, 0.5, 10],
      isStatic: true,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

    const sphereId = world.createEntity('FallingSphere')
    world.addComponent(sphereId, TransformComponent, {
      position: [0, 5, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(sphereId, ColliderComponent, {
      shape: 'sphere',
      radius: 0.5,
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

    colliderSystem.bootstrap(world)
    physicsSystem.update(world, 1)

    const finalY = world.getComponent(sphereId, TransformComponent)?.position[1] ?? 5
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(1.5)

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('spawns vehicle dynamic body with VehicleComponent mass', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 1.05, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, ColliderComponent, {
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
      isStatic: false,
      offset: [0, 0.5, 0],
      rotation: [0, 0, 0, 1],
    })
    world.addComponent(carId, VehicleComponent, VehicleSchema.parse({}))

    colliderSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('treats entity StaticComponent as static body even when collider is dynamic', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 60 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('StaticViaFlag')
    world.addComponent(id, TransformComponent, {
      position: [0, 2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, StaticComponent, { isStatic: true })
    world.addComponent(id, ColliderComponent, {
      shape: 'sphere',
      radius: 0.5,
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

    colliderSystem.bootstrap(world)
    physicsSystem.update(world, 0.5)

    const y = world.getComponent(id, TransformComponent)?.position[1] ?? 0
    expect(y).toBeCloseTo(2, 2)

    colliderSystem.dispose()
    physicsSystem.dispose()
  })
})
