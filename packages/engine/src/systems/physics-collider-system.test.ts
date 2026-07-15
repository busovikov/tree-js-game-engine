import { describe, expect, it, beforeEach } from 'vitest'
import {
  ColliderComponent,
  CollidersComponent,
  RigidBodyComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { ColliderSchema, CollidersSchema, RigidBodySchema } from '@haku/schema'
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
  const redundantSphere = ColliderSchema.parse({
    shape: 'sphere',
    radius: 0.2,
    offset: [1, 2, 3],
  })

  it.each([
    ['custom-raycast', CustomRaycastControllerSchema.parse({ type: 'custom-raycast' })],
    ['dynamic-raycast', DynamicRaycastControllerSchema.parse({ type: 'dynamic-raycast' })],
    [
      'revolute-joint-vehicle',
      RevoluteJointVehicleControllerSchema.parse({ type: 'revolute-joint-vehicle' }),
    ],
  ])('uses an implicit chassis and ignores a redundant collider for %s', (_type, controller) => {
    const resolved = resolveColliderDescriptor(controller, redundantSphere)

    expect(resolved).toMatchObject({
      collider: {
        shape: 'box',
        halfExtents: controller.chassis.halfExtents,
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

    expect(resolveColliderDescriptor(controller, null)).toMatchObject({
      collider: {
        shape: 'box',
        halfExtents: controller.chassis.halfExtents,
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

    expect(resolveColliderDescriptor(controller, redundantSphere)).toMatchObject({
      collider: {
        shape: 'capsule',
        radius: 0.4,
        halfHeight: 0.75,
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
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [10, 0.5, 10],
    }))

    const sphereId = world.createEntity('FallingSphere')
    world.addComponent(sphereId, TransformComponent, {
      position: [0, 5, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(sphereId, ColliderComponent, ColliderSchema.parse({
      shape: 'sphere',
      radius: 0.5,
    }))
    world.addComponent(sphereId, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))

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
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
      offset: [0, 0.5, 0],
    }))
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
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'sphere',
      radius: 0.7,
    }))
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
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'sphere',
      radius: 0.2,
    }))
    world.addComponent(carId, PhysicsControllerComponent, CustomRaycastControllerSchema.parse({ type: "custom-raycast" }))

    colliderSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('keeps RigidBody static body fixed during simulation', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 60 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('StaticBody')
    world.addComponent(id, TransformComponent, {
      position: [0, 2, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'static' }))
    world.addComponent(id, ColliderComponent, ColliderSchema.parse({
      shape: 'sphere',
      radius: 0.5,
    }))

    colliderSystem.bootstrap(world)
    physicsSystem.update(world, 0.5)

    const y = world.getComponent(id, TransformComponent)?.position[1] ?? 0
    expect(y).toBeCloseTo(2, 2)

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('does not respawn a dynamic body when only Transform changes (config revision)', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 5 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('Falling')
    world.addComponent(id, TransformComponent, {
      position: [0, 10, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      id,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'sphere', radius: 0.5 }),
    )
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))

    colliderSystem.update(world)
    const handleBefore = physicsSystem.getBodyHandle(id)
    expect(handleBefore).not.toBeNull()

    // Simulate several play frames: physics writes Transform, reconcile must not recreate.
    for (let i = 0; i < 120; i++) {
      colliderSystem.update(world)
      physicsSystem.update(world, 1 / 60)
    }

    const handleAfter = physicsSystem.getBodyHandle(id)
    expect(handleAfter?.value).toBe(handleBefore?.value)

    const y = world.getComponent(id, TransformComponent)?.position[1] ?? 10
    // ~0.5 * 9.81 * 2^2 ≈ 19.6 drop from y=10 over 2s — allow slack for Rapier integration.
    expect(y).toBeLessThan(5)

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('despawns physics body when collider entity is removed at runtime', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('Ephemeral')
    world.addComponent(id, TransformComponent, {
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      id,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'sphere', radius: 0.5 }),
    )
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))

    colliderSystem.update(world)
    expect(physicsSystem.getBodyHandle(id)).not.toBeNull()

    world.destroyEntity(id)
    colliderSystem.update(world)
    expect(physicsSystem.getBodyHandle(id)).toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('respects collider.enabled=false without despawning the body', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('ToggleShape')
    world.addComponent(id, TransformComponent, {
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(
      id,
      ColliderComponent,
      ColliderSchema.parse({ shape: 'sphere', radius: 0.5, enabled: true }),
    )
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'dynamic' }))

    colliderSystem.update(world)
    expect(physicsSystem.getBodyHandle(id)).not.toBeNull()

    world.addComponent(
      id,
      ColliderComponent,
      ColliderSchema.parse({
        shape: 'sphere',
        radius: 0.5,
        enabled: false,
      }),
    )
    colliderSystem.update(world)
    expect(physicsSystem.getBodyHandle(id)).not.toBeNull()

    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('applies enabled flags to the correct array collider across a hot reload', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 1 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)

    const world = new World()
    const id = world.createEntity('TwoColliders')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, RigidBodyComponent, RigidBodySchema.parse({ type: 'static' }))
    // Two boxes at distinct offsets — both share the root entity id, so shapes must be paired
    // positionally, not by entity id. Left box enabled, right box disabled.
    const collidersFor = (leftEnabled: boolean, rightEnabled: boolean) =>
      CollidersSchema.parse({
        colliders: [
          { shape: 'box', halfExtents: [0.5, 0.5, 0.5], offset: [-2, 0, 0], enabled: leftEnabled },
          { shape: 'box', halfExtents: [0.5, 0.5, 0.5], offset: [2, 0, 0], enabled: rightEnabled },
        ],
      })
    world.addComponent(id, CollidersComponent, collidersFor(true, false))

    const raycastDown = (x: number) =>
      physicsSystem.getPhysicsWorld()!.raycast({
        origin: [x, 5, 0],
        direction: [0, -1, 0],
        maxDistance: 10,
      })

    colliderSystem.update(world)
    expect(raycastDown(-2)).not.toBeNull() // left enabled → hit
    expect(raycastDown(2)).toBeNull() // right disabled → miss

    // Swap enabled flags with identical geometry: this reconciles through the hot-reload path.
    world.addComponent(id, CollidersComponent, collidersFor(false, true))
    colliderSystem.update(world)
    expect(physicsSystem.getBodyHandle(id)).not.toBeNull() // static tracked for teleport / joints
    expect(raycastDown(-2)).toBeNull() // left now disabled → miss
    expect(raycastDown(2)).not.toBeNull() // right now enabled → hit

    colliderSystem.dispose()
    physicsSystem.dispose()
  })
})
