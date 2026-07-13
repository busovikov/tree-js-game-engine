import { describe, expect, it, beforeEach } from 'vitest'
import {
  ColliderComponent,
  StaticComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import {
  ArcadeVehicleControllerSchema,
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  KinematicCharacterControllerSchema,
  PointerControlsControllerSchema,
  RevoluteJointVehicleControllerSchema,
} from '@haku/schema'
import {
  PhysicsColliderSystem,
  resolveColliderDescriptor,
} from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

describe('resolveColliderDescriptor', () => {
  const redundantSphere = {
    shape: 'sphere' as const,
    radius: 0.2,
    isStatic: false,
    offset: [1, 2, 3] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
  }

  it.each([
    ['custom-raycast', CustomRaycastControllerSchema.parse({ type: 'custom-raycast' })],
    ['dynamic-raycast', DynamicRaycastControllerSchema.parse({ type: 'dynamic-raycast' })],
    [
      'revolute-joint-vehicle',
      RevoluteJointVehicleControllerSchema.parse({ type: 'revolute-joint-vehicle' }),
    ],
  ])('uses an implicit chassis and ignores a redundant collider for %s', (_type, controller) => {
    const resolved = resolveColliderDescriptor(controller, redundantSphere)

    expect(resolved).toEqual({
      collider: {
        shape: 'box',
        halfExtents: controller.chassis.halfExtents,
        isStatic: false,
        offset: [0, controller.chassis.lift, 0],
        rotation: [0, 0, 0, 1],
      },
      source: 'implicit-controller',
      bodyTypeOverride: 'dynamic',
    })
  })

  it('uses an authored arcade collider when present', () => {
    const controller = ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle' })

    expect(resolveColliderDescriptor(controller, redundantSphere)).toEqual({
      collider: redundantSphere,
      source: 'explicit',
      bodyTypeOverride: 'dynamic',
    })
  })

  it('falls back to an implicit arcade chassis without an authored collider', () => {
    const controller = ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle' })

    expect(resolveColliderDescriptor(controller, null)).toEqual({
      collider: {
        shape: 'box',
        halfExtents: controller.chassis.halfExtents,
        isStatic: false,
        offset: [0, controller.chassis.lift, 0],
        rotation: [0, 0, 0, 1],
      },
      source: 'implicit-controller',
      bodyTypeOverride: 'dynamic',
    })
  })

  it('uses the runtime kinematic capsule offset and ignores a redundant collider', () => {
    const controller = KinematicCharacterControllerSchema.parse({
      type: 'kinematic-character',
      capsuleRadius: 0.4,
      capsuleHalfHeight: 0.75,
    })

    expect(resolveColliderDescriptor(controller, redundantSphere)).toEqual({
      collider: {
        shape: 'capsule',
        radius: 0.4,
        halfHeight: 0.75,
        isStatic: false,
        offset: [0, 1.15, 0],
        rotation: [0, 0, 0, 1],
      },
      source: 'implicit-controller',
      bodyTypeOverride: 'kinematic',
    })
  })

  it.each([
    ['pointer-controls', PointerControlsControllerSchema.parse({ type: 'pointer-controls' })],
  ])('resolves no collider for non-collider controller %s', (_type, controller) => {
    expect(resolveColliderDescriptor(controller, redundantSphere)).toBeNull()
  })

  it('passes through a collider when no physics controller owns the body', () => {
    expect(resolveColliderDescriptor(null, redundantSphere)).toEqual({
      collider: redundantSphere,
      source: 'explicit',
    })
  })
})

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

  it('spawns vehicle dynamic body with PhysicsControllerComponent mass', async () => {
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
    world.addComponent(carId, PhysicsControllerComponent, CustomRaycastControllerSchema.parse({ type: "custom-raycast" }))

    colliderSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('spawns implicit chassis body for PhysicsControllerComponent without ColliderComponent', async () => {
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
    world.addComponent(carId, PhysicsControllerComponent, CustomRaycastControllerSchema.parse({ type: "custom-raycast" }))

    colliderSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('uses explicit sphere collider for arcade-vehicle (Isaac ball body)', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const carId = world.createEntity('BallCar')
    world.addComponent(carId, TransformComponent, {
      position: [15, 2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, ColliderComponent, {
      shape: 'sphere',
      radius: 0.7,
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })
    world.addComponent(
      carId,
      PhysicsControllerComponent,
      ArcadeVehicleControllerSchema.parse({ type: 'arcade-vehicle' }),
    )

    colliderSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('prefers PhysicsControllerComponent implicit chassis over manual ColliderComponent', async () => {
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
      shape: 'sphere',
      radius: 0.2,
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })
    world.addComponent(carId, PhysicsControllerComponent, CustomRaycastControllerSchema.parse({ type: "custom-raycast" }))

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
