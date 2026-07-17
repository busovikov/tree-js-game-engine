import RAPIER from '@dimforge/rapier3d-compat'
import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  PhysicsNotInitializedError,
  PhysicsWorld,
  type PhysicsBodyHandle,
} from '@haku/physics'
import {
  createRapierPhysicsBackend,
  RapierPhysicsBackend,
  resetRapierPhysicsIds,
} from './index.js'

const identityTransform = {
  position: [0, 0, 0] as const,
  rotation: [0, 0, 0, 1] as const,
}

async function createBackend(): Promise<RapierPhysicsBackend> {
  resetRapierPhysicsIds()
  return createRapierPhysicsBackend()
}

describe('@haku/physics-rapier RapierPhysicsBackend', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  it('throws when init() called before WASM load', () => {
    const backend = new RapierPhysicsBackend()
    expect(() => backend.init()).toThrow(PhysicsNotInitializedError)
  })

  it('init → create body → attach collider → step → destroy → dispose', async () => {
    const backend = await createBackend()
    expect(backend.isInitialized()).toBe(true)

    const body = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    backend.attachShape(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] })
    backend.step(1 / 60)

    backend.setBodyTransform(body, {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    })
    expect(backend.getBodyTransform(body).position).toEqual([1, 2, 3])

    backend.destroyBody(body)
    backend.dispose()
    expect(backend.isInitialized()).toBe(false)
  })

  it('applies force during exactly the next simulation step', async () => {
    const backend = await createRapierPhysicsBackend({ gravity: [0, 0, 0] })
    const body = backend.createBody({
      type: 'dynamic',
      transform: identityTransform,
      mass: 2,
    })
    backend.attachShape(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] })

    backend.applyForce(body, [6, 0, 0], [0, 1, 0])
    backend.step(0.5)
    expect(backend.getBodyLinearVelocity(body)[0]).toBeCloseTo(1.5)
    const angularAfterForce = backend.getBodyAngularVelocity(body)[2]
    expect(Math.abs(angularAfterForce)).toBeGreaterThan(0)

    backend.step(0.5)
    expect(backend.getBodyLinearVelocity(body)[0]).toBeCloseTo(1.5)
    expect(backend.getBodyAngularVelocity(body)[2]).toBeCloseTo(angularAfterForce)
    backend.dispose()
  })

  it('applyImpulseAtPoint on explicit mass sets angular velocity (inertia tensor)', async () => {
    const backend = await createBackend()
    const body = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
    })
    backend.attachShape(body, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })
    backend.prepareSceneQueries()

    const center = backend.getBodyTransform(body).position
    backend.applyImpulse(body, [0, 0, 80], [center[0] + 0.9, center[1], center[2] + 1.55])
    backend.step(1 / 60)

    const angular = backend.getBodyAngularVelocity(body)
    expect(Math.abs(angular[1])).toBeGreaterThan(0.1)
    backend.dispose()
  })

  it('dynamic sphere falls onto static ground and settles after 60 steps', async () => {
    const backend = await createBackend()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [10, 0.5, 10] })

    const sphere = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(sphere, { type: 'sphere', radius: 0.5 })

    for (let i = 0; i < 60; i++) {
      backend.step(1 / 60)
    }

    const finalY = backend.getBodyTransform(sphere).position[1]
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(1.5)
  })

  it('raycast returns hit point and normal on ground plane', async () => {
    const backend = await createBackend()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [10, 0.1, 10] })
    backend.prepareSceneQueries()

    const hit = backend.raycast({
      origin: [0, 5, 0],
      direction: [0, -1, 0],
      maxDistance: 20,
    })

    expect(hit).not.toBeNull()
    expect(hit!.point[1]).toBeCloseTo(0.1, 1)
    expect(hit!.normal[1]).toBeGreaterThan(0.5)
    expect(hit!.distance).toBeGreaterThan(4)
    expect(hit!.body.value).toBe(ground.value)
  })

  it('destroyBody disposes its dynamic vehicle controller', async () => {
    const backend = await createBackend()
    const chassis = backend.createBody({
      type: 'dynamic',
      transform: identityTransform,
      mass: 1,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.5, 0.5, 0.5] })
    backend.createDynamicRaycastVehicle(chassis)

    expect(backend.getWorldInternal().vehicleControllers.size).toBe(1)

    backend.destroyBody(chassis)

    expect(backend.getWorldInternal().vehicleControllers.size).toBe(0)
    expect(() => backend.step(1 / 60)).not.toThrow()
  })

  it('destroyBody disposes its character controller', async () => {
    const backend = await createBackend()
    const body = backend.createBody({ type: 'kinematic', transform: identityTransform })
    const collider = backend.attachShape(body, {
      type: 'capsule',
      radius: 0.25,
      halfHeight: 0.5,
    })
    backend.createCharacterController(body, collider, {
      offset: 0.01,
      snapToGroundDistance: 0.1,
      autoStepMaxHeight: 0.2,
      autoStepMinWidth: 0.1,
      autoStepIncludeDynamicBodies: false,
      applyImpulsesToDynamicBodies: true,
    })

    expect(backend.getWorldInternal().characterControllers.size).toBe(1)

    backend.destroyBody(body)

    expect(backend.getWorldInternal().characterControllers.size).toBe(0)
  })

  it('destroyBody removes collider reverse lookup entries', async () => {
    const backend = await createBackend()
    const body = backend.createBody({ type: 'static', transform: identityTransform })
    const shape = backend.attachShape(body, { type: 'box', halfExtents: [1, 1, 1] })
    backend.prepareSceneQueries()
    const collider = backend.getColliderRecord(shape)
    const world = backend.getWorldInternal()
    backend.destroyBody(body)

    vi.spyOn(world, 'castRayAndGetNormal').mockReturnValue(
      new RAPIER.RayColliderIntersection(collider, 1, { x: 0, y: 1, z: 0 }),
    )

    expect(
      backend.raycast({
        origin: [0, 5, 0],
        direction: [0, -1, 0],
        maxDistance: 10,
      }),
    ).toBeNull()
  })

  it('destroyBody forgets attached joints before Rapier recycles their handles', async () => {
    const backend = await createBackend()
    const bodyA = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    const bodyB = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    const staleJoint = backend.createRevoluteMotorJoint({
      bodyA,
      bodyB,
      anchorA: [0, 0, 0],
      anchorB: [0, 0, 0],
      axis: [1, 0, 0],
    })

    backend.destroyBody(bodyA)

    const bodyC = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    backend.createRevoluteMotorJoint({
      bodyA: bodyB,
      bodyB: bodyC,
      anchorA: [0, 0, 0],
      anchorB: [0, 0, 0],
      axis: [1, 0, 0],
    })
    expect(backend.getWorldInternal().impulseJoints.len()).toBe(1)

    backend.removeJoint(staleJoint)
    backend.removeJoint(staleJoint)

    expect(backend.getWorldInternal().impulseJoints.len()).toBe(1)
  })

  it('prismatic spring joint suspends a body near its rest length under gravity', async () => {
    const backend = await createBackend()
    // Kinematic anchor held aloft; dynamic body hangs from it via a stiff spring strut along Y.
    const anchor = backend.createBody({
      type: 'kinematic',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
    })
    const body = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(body, { type: 'sphere', radius: 0.2 })

    backend.createPrismaticSpringJoint({
      bodyA: anchor,
      bodyB: body,
      anchorA: [0, 0, 0],
      anchorB: [0, 0, 0],
      axis: [0, 1, 0],
      restLength: 0,
      stiffness: 400,
      damping: 20,
      limits: { min: -1, max: 1 },
    })

    for (let i = 0; i < 180; i++) {
      backend.step(1 / 60)
    }

    const { position } = backend.getBodyTransform(body)
    // Free-fall would drop it tens of metres; the spring holds it within the ±1 travel limit.
    expect(Number.isFinite(position[1])).toBe(true)
    expect(position[1]).toBeGreaterThan(3.5)
    expect(position[1]).toBeLessThanOrEqual(5.001)
  })

  it('rejects a non-finite prismatic spring joint anchor before it reaches Rapier', async () => {
    const backend = await createBackend()
    const bodyA = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    const bodyB = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    expect(() =>
      backend.createPrismaticSpringJoint({
        bodyA,
        bodyB,
        anchorA: [0, 0, 0],
        anchorB: [0, Number.NaN, 0],
        axis: [0, 1, 0],
        restLength: 0,
        stiffness: 100,
        damping: 10,
      }),
    ).toThrow()
    expect(() =>
      backend.createPrismaticSpringJoint({
        bodyA,
        bodyB,
        anchorA: [0, 0, 0],
        anchorB: [0, 0, 0],
        axis: [0, 0, 0],
        restLength: 0,
        stiffness: 100,
        damping: 10,
      }),
    ).toThrow()
    expect(backend.getWorldInternal().impulseJoints.len()).toBe(0)
  })

  it('rejects non-finite / degenerate joint and body inputs before they reach Rapier', async () => {
    const backend = await createBackend()
    const bodyA = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    const bodyB = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })

    // NaN anchor would otherwise trip Rapier's `unreachable` WASM trap during step.
    expect(() =>
      backend.createRevoluteMotorJoint({
        bodyA,
        bodyB,
        anchorA: [0, Number.NaN, 0],
        anchorB: [0, 0, 0],
        axis: [1, 0, 0],
      }),
    ).toThrow()

    // Zero-length axis is a degenerate revolute basis.
    expect(() =>
      backend.createRevoluteMotorJoint({
        bodyA,
        bodyB,
        anchorA: [0, 0, 0],
        anchorB: [0, 0, 0],
        axis: [0, 0, 0],
      }),
    ).toThrow()

    // Non-finite body mass.
    expect(() =>
      backend.createBody({ type: 'dynamic', transform: identityTransform, mass: Number.POSITIVE_INFINITY }),
    ).toThrow()

    expect(backend.getWorldInternal().impulseJoints.len()).toBe(0)
  })

  it('repeated full dispose is safe with body-owned resources', async () => {
    const backend = await createBackend()
    const body = backend.createBody({ type: 'kinematic', transform: identityTransform })
    const collider = backend.attachShape(body, { type: 'box', halfExtents: [0.5, 1, 0.5] })
    backend.createDynamicRaycastVehicle(body)
    backend.createCharacterController(body, collider, {
      offset: 0.01,
      snapToGroundDistance: 0.1,
      autoStepMaxHeight: 0.2,
      autoStepMinWidth: 0.1,
      autoStepIncludeDynamicBodies: false,
      applyImpulsesToDynamicBodies: true,
    })

    backend.dispose()

    expect(() => backend.dispose()).not.toThrow()
    expect(backend.isInitialized()).toBe(false)
  })

  it('supports box, sphere, and capsule colliders', async () => {
    const backend = await createBackend()

    const body = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    backend.attachShape(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] })
    backend.attachShape(body, { type: 'sphere', radius: 0.25 })
    backend.attachShape(body, { type: 'capsule', radius: 0.2, halfHeight: 0.5 })
    backend.step(1 / 60)
    backend.dispose()
  })

  it('raycast vehicle: add wheel, apply force, step updates rotation', async () => {
    const backend = await createBackend()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [20, 0.1, 20] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
      mass: 800,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [1, 0.3, 2] })

    const vehicle = backend.createRaycastVehicle(chassis)
    const wheel = vehicle.addWheel({
      localPosition: [0, 0, -1],
      radius: 0.4,
      suspensionRestLength: 0.3,
      suspensionStiffness: 30,
      dampingRelaxation: 2.3,
      dampingCompression: 2.3,
      maxSuspensionTravel: 0.3,
      frictionSlip: 1.4,
      rollInfluence: 0.01,
    })

    vehicle.applyEngineForce(wheel, 1500)
    for (let i = 0; i < 10; i++) {
      backend.step(1 / 60)
    }

    const states = vehicle.getWheelStates()
    expect(states).toHaveLength(1)
    expect(states[0]?.engineForce).toBe(1500)
    expect(backend.getBodyTransform(chassis).position[1]).toBeGreaterThan(0.5)
  })

  it('attaches cylinder collider shape', async () => {
    const backend = await createBackend()
    const body = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(body, { type: 'cylinder', radius: 0.5, halfHeight: 0.5 })
    backend.prepareSceneQueries()

    const hit = backend.raycast({
      origin: [0, 3, 0],
      direction: [0, -1, 0],
      maxDistance: 5,
    })
    expect(hit).not.toBeNull()
    expect(hit!.body.value).toBe(body.value)
  })

  it('filters raycasts by layer mask', async () => {
    const backend = await createBackend()
    const matrix = Array.from({ length: 16 }, (_, row) =>
      Array.from({ length: 16 }, (_, col) => row === col),
    )

    const layer0 = backend.createBody({
      type: 'static',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(layer0, {
      type: 'box',
      halfExtents: [2, 0.1, 2],
      spawn: { collisionGroups: (1 << 16) | 1 },
    })

    const layer1 = backend.createBody({
      type: 'static',
      transform: { position: [5, 0, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(layer1, {
      type: 'box',
      halfExtents: [2, 0.1, 2],
      spawn: { collisionGroups: (2 << 16) | 2 },
    })
    backend.prepareSceneQueries()

    const hitLayer1 = backend.raycast({
      origin: [5, 2, 0],
      direction: [0, -1, 0],
      maxDistance: 5,
      layerMask: 1 << 1,
    })
    const missLayer1 = backend.raycast({
      origin: [5, 2, 0],
      direction: [0, -1, 0],
      maxDistance: 5,
      layerMask: 1 << 0,
    })

    expect(hitLayer1?.body.value).toBe(layer1.value)
    expect(missLayer1).toBeNull()
  })

  it('emits collision enter events when monitored colliders touch', async () => {
    const backend = await createBackend()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, {
      type: 'box',
      halfExtents: [5, 0.5, 5],
      spawn: {
        entityId: 'ground-1',
        collisionEvents: true,
      },
    })

    const dynamic = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(dynamic, {
      type: 'box',
      halfExtents: [0.5, 0.5, 0.5],
      spawn: {
        entityId: 'box-1',
        collisionEvents: true,
      },
    })
    backend.prepareSceneQueries()

    for (let i = 0; i < 60; i++) {
      backend.step(1 / 60)
    }
    const events = backend.drainCollisionEvents()

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((event) => event.phase === 'enter' && event.kind === 'collision')).toBe(true)
    expect(
      events.some(
        (event) =>
          (event.entityA === 'ground-1' && event.entityB === 'box-1') ||
          (event.entityA === 'box-1' && event.entityB === 'ground-1'),
      ),
    ).toBe(true)
  })

  it('emits trigger enter events for sensor overlaps', async () => {
    const backend = await createBackend()

    const zone = backend.createBody({
      type: 'static',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(zone, {
      type: 'box',
      halfExtents: [2, 2, 2],
      spawn: {
        entityId: 'area-1',
        isSensor: true,
        collisionEvents: true,
      },
    })

    const dynamic = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(dynamic, {
      type: 'sphere',
      radius: 0.5,
      spawn: {
        entityId: 'ball-1',
        collisionEvents: true,
      },
    })
    backend.prepareSceneQueries()

    for (let i = 0; i < 60; i++) {
      backend.step(1 / 60)
    }
    const events = backend.drainCollisionEvents()

    expect(events.some((event) => event.kind === 'trigger')).toBe(true)
    expect(events.some((event) => event.entityA === 'area-1' || event.entityB === 'area-1')).toBe(true)
  })
})

describe('@haku/physics-rapier PhysicsWorld integration', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  it('facade delegates to Rapier backend', async () => {
    const backend = await createBackend()
    const world = new PhysicsWorld(backend)

    const body: PhysicsBodyHandle = world.createBody({
      type: 'static',
      transform: identityTransform,
    })
    world.attachShape(body, { type: 'box', halfExtents: [1, 1, 1] })
    world.step(1 / 60)
    world.destroyBody(body)
    backend.dispose()
  })

  it('includes contact points on monitored collision enter events', async () => {
    const backend = await createBackend()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.5, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, {
      type: 'box',
      halfExtents: [5, 0.5, 5],
      spawn: {
        entityId: 'ground-1',
        collisionEvents: true,
      },
    })

    const dynamic = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1] },
      mass: 1,
    })
    backend.attachShape(dynamic, {
      type: 'box',
      halfExtents: [0.5, 0.5, 0.5],
      spawn: {
        entityId: 'box-1',
        collisionEvents: true,
        contactMonitor: true,
        maxReportedContacts: 4,
      },
    })
    backend.prepareSceneQueries()

    let enterWithContacts: import('@haku/physics').PhysicsCollisionEvent | undefined
    for (let i = 0; i < 60; i++) {
      backend.step(1 / 60)
      const events = backend.drainCollisionEvents()
      enterWithContacts = events.find(
        (event) =>
          event.phase === 'enter' &&
          event.kind === 'collision' &&
          event.contacts &&
          event.contacts.length > 0,
      )
      if (enterWithContacts) break
    }

    expect(enterWithContacts).toBeDefined()
    expect(enterWithContacts!.contacts![0]?.point).toHaveLength(3)
    expect(enterWithContacts!.contacts![0]?.normal).toHaveLength(3)

    backend.dispose()
  })

  it('returns debug render buffers for spawned colliders', async () => {
    const backend = await createBackend()
    const body = backend.createBody({
      type: 'static',
      transform: identityTransform,
    })
    backend.attachShape(body, { type: 'box', halfExtents: [1, 1, 1] })
    backend.prepareSceneQueries()
    backend.step(1 / 60)

    const buffers = backend.getDebugRenderBuffers()
    expect(buffers).not.toBeNull()
    expect(buffers!.vertices.length).toBeGreaterThan(0)
    expect(buffers!.colors.length).toBeGreaterThan(0)

    backend.dispose()
  })
})
