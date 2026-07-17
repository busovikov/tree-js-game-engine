import { describe, expect, it, beforeEach } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import type { IPhysicsBackend } from '@haku/physics'
import {
  PhysicsHandleNotFoundError,
  PhysicsNotInitializedError,
  physicsBodyHandle,
  physicsShapeHandle,
  resetStubPhysicsIds,
  STUB_PHYSICS_CAPABILITIES,
  StubPhysicsBackend,
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type PhysicsTransform,
  type RigidBodyDescriptor,
  type RaycastHit,
  type Vec3,
} from '@haku/physics'
import type { IRaycastVehicle } from '@haku/physics'
import {
  PHYSICS_CATCH_UP_POLICY,
  PhysicsWorldSystem,
  interpolatePhysicsPose,
} from './physics-world-system.js'

const identityTransform: PhysicsTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
}

class GravityTestBackend implements IPhysicsBackend {
  private initialized = false
  private stepCount = 0
  private readonly gravity: Vec3
  private readonly bodies = new Map<string, { descriptor: RigidBodyDescriptor; transform: PhysicsTransform; velocity: Vec3 }>()

  constructor(gravity: Vec3 = [0, -9.81, 0]) {
    this.gravity = gravity
  }

  getStepCount(): number {
    return this.stepCount
  }

  init(): void {
    this.initialized = true
  }

  dispose(): void {
    this.initialized = false
    this.bodies.clear()
    this.stepCount = 0
  }

  isInitialized(): boolean {
    return this.initialized
  }

  prepareSceneQueries(): void {}

  step(dt: number): void {
    this.assertInitialized()
    this.stepCount += 1
    for (const record of this.bodies.values()) {
      if (record.descriptor.type !== 'dynamic') {
        continue
      }
      record.velocity = [
        record.velocity[0] + this.gravity[0] * dt,
        record.velocity[1] + this.gravity[1] * dt,
        record.velocity[2] + this.gravity[2] * dt,
      ]
      record.transform = {
        position: [
          record.transform.position[0] + record.velocity[0] * dt,
          record.transform.position[1] + record.velocity[1] * dt,
          record.transform.position[2] + record.velocity[2] * dt,
        ],
        rotation: [...record.transform.rotation],
      }
    }
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    this.assertInitialized()
    const handle = physicsBodyHandle(`body-${this.bodies.size + 1}`)
    this.bodies.set(handle.value, {
      descriptor,
      transform: cloneTransform(descriptor.transform),
      velocity: [0, 0, 0],
    })
    return handle
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    this.assertInitialized()
    if (!this.bodies.delete(handle.value)) {
      throw new PhysicsHandleNotFoundError('body', handle.value)
    }
  }

  attachShape() {
    this.assertInitialized()
    return physicsShapeHandle('shape-1')
  }

  detachShape(): void {
    this.assertInitialized()
  }

  replaceShape(): PhysicsShapeHandle {
    this.assertInitialized()
    return physicsShapeHandle('shape-replaced')
  }

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void {
    this.assertInitialized()
    const record = this.getBody(body)
    record.transform = cloneTransform(transform)
  }

  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform {
    this.assertInitialized()
    return cloneTransform(this.getBody(body).transform)
  }

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3 {
    this.assertInitialized()
    const record = this.getBody(body)
    return [...record.velocity] as Vec3
  }

  getBodyAngularVelocity(): Vec3 {
    this.assertInitialized()
    return [0, 0, 0]
  }

  getBodyMass(body: PhysicsBodyHandle): number {
    this.assertInitialized()
    return this.getBody(body).descriptor.mass ?? 1
  }

  setBodyLinearVelocity(body: PhysicsBodyHandle, velocity: Vec3): void {
    this.assertInitialized()
    const record = this.getBody(body)
    record.velocity = [...velocity] as Vec3
  }

  setBodyAngularVelocity(): void {
    this.assertInitialized()
  }

  applyImpulse(): void {
    this.assertInitialized()
  }

  applyForce(): void {
    this.assertInitialized()
  }

  raycast(): RaycastHit | null {
    this.assertInitialized()
    return null
  }

  shapecast(): null {
    this.assertInitialized()
    return null
  }

  overlap(): [] {
    this.assertInitialized()
    return []
  }

  fork(options?: { gravity?: Vec3 }): IPhysicsBackend {
    return new GravityTestBackend(options?.gravity)
  }

  createRaycastVehicle(): IRaycastVehicle {
    throw new Error('not implemented in test backend')
  }

  createCharacterController(): never {
    throw new Error('not implemented in test backend')
  }

  createDynamicRaycastVehicle(): never {
    throw new Error('not implemented in test backend')
  }

  createPointerAnchorBody(): PhysicsBodyHandle {
    return this.createBody({ type: 'kinematic', transform: identityTransform })
  }

  createPointerJoint(): never {
    throw new Error('not implemented in test backend')
  }

  removeJoint(): void {}

  createRevoluteMotorJoint(): never {
    throw new Error('not implemented in test backend')
  }

  setRevoluteMotorVelocity(): void {}

  setRevoluteMotorPosition(): void {}

  createPrismaticSpringJoint(): never {
    throw new Error('not implemented in test backend')
  }

  createSceneJoint(): never {
    throw new Error('not implemented in test backend')
  }

  capabilities() {
    return STUB_PHYSICS_CAPABILITIES
  }

  setBodyEnabled(): void {
    this.assertInitialized()
  }

  setShapeEnabled(): void {
    this.assertInitialized()
  }

  wakeBody(): void {
    this.assertInitialized()
  }

  clearForces(): void {
    this.assertInitialized()
  }

  finalizeExplicitMass(body: PhysicsBodyHandle, targetMass: number): void {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type === 'dynamic') {
      record.descriptor = { ...record.descriptor, mass: targetMass }
    }
  }

  drainCollisionEvents(): import('@haku/physics').PhysicsCollisionEvent[] {
    return []
  }

  getDebugRenderBuffers(): null {
    return null
  }

  private getBody(handle: PhysicsBodyHandle) {
    const record = this.bodies.get(handle.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('body', handle.value)
    }
    return record
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new PhysicsNotInitializedError()
    }
  }
}

function cloneTransform(transform: PhysicsTransform): PhysicsTransform {
  return {
    position: [...transform.position],
    rotation: [...transform.rotation],
  }
}

describe('PhysicsWorldSystem', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it('is a safe no-op with zero tracked bodies', () => {
    const backend = new StubPhysicsBackend()
    const system = new PhysicsWorldSystem()
    system.setBackend(backend)
    const world = new World()

    system.update(world, 1)
    expect(backend.isInitialized()).toBe(true)
    expect(backend.getSimulationTime()).toBe(0)

    system.dispose()
    expect(backend.isInitialized()).toBe(false)
  })

  it('accumulates fixed timestep at 60 Hz', () => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })

    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 100 })
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    system.registerBody(id, body, 'dynamic', world)

    system.update(world, 1)
    expect(backend.getSimulationTime()).toBeCloseTo(1, 5)
    expect(Math.round(backend.getSimulationTime() / (1 / 60))).toBe(60)
  })

  it.each([30, 45, 60])(
    'preserves one second of simulation time across uneven %i FPS frame deltas',
    (fps) => {
      const backend = new StubPhysicsBackend()
      const system = new PhysicsWorldSystem(PHYSICS_CATCH_UP_POLICY)
      system.setBackend(backend)

      const world = new World()
      const id = world.createEntity('Dynamic')
      world.addComponent(id, TransformComponent, {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      const body = backend.createBody({ type: 'dynamic', transform: identityTransform })
      system.registerBody(id, body, 'dynamic', world)

      const relativeFrameDurations = Array.from(
        { length: fps },
        (_, frame) => 1 + ((frame % 3) - 1) * 0.2,
      )
      const traceDuration = relativeFrameDurations.reduce((sum, frameDt) => sum + frameDt, 0)
      for (const relativeFrameDt of relativeFrameDurations) {
        system.update(world, relativeFrameDt / traceDuration)
      }

      expect(backend.getSimulationTime()).toBeCloseTo(1, 8)
    },
  )

  it('drops pathological hitch time after bounded catch-up', () => {
    const backend = new StubPhysicsBackend()
    const system = new PhysicsWorldSystem(PHYSICS_CATCH_UP_POLICY)
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })
    system.registerBody(id, body, 'dynamic', world)

    system.update(world, 1)
    const boundedTime =
      PHYSICS_CATCH_UP_POLICY.fixedTimestep * PHYSICS_CATCH_UP_POLICY.maxSubsteps
    expect(backend.getSimulationTime()).toBeCloseTo(boundedTime, 8)

    system.update(world, 0)
    expect(backend.getSimulationTime()).toBeCloseTo(boundedTime, 8)
  })

  it('caps substeps to avoid spiral of death', () => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })

    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 3 })
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    system.registerBody(id, body, 'dynamic', world)

    system.update(world, 1)
    expect(backend.getSimulationTime()).toBeCloseTo(3 / 60, 5)
  })

  it('writes dynamic body transforms back to Transform components', () => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })

    const system = new PhysicsWorldSystem()
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [2, 2, 2],
    })
    system.registerBody(id, body, 'dynamic', world)

    backend.setBodyTransform(body, {
      position: [1, 4, 2],
      rotation: [0, 0.707, 0, 0.707],
    })

    system.update(world, 1 / 60)

    const transform = world.getComponent(id, TransformComponent)
    expect(transform?.position[0]).toBeCloseTo(1)
    expect(transform?.position[1]).toBeCloseTo(4, 1)
    expect(transform?.position[2]).toBeCloseTo(2)
    expect(transform?.scale).toEqual([2, 2, 2])
  })

  it('ignores static bodies for transform sync', () => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const body = backend.createBody({ type: 'static', transform: identityTransform })
    backend.setBodyTransform(body, { position: [9, 9, 9], rotation: [0, 0, 0, 1] })

    const system = new PhysicsWorldSystem()
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Static')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    system.registerBody(id, body, 'static', world)

    system.update(world, 1 / 60)
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([0, 0, 0])
  })

  it('dynamic body falls under gravity and updates transform each step', () => {
    const backend = new GravityTestBackend()
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 10 })
    system.setBackend(backend)

    const world = new World()
    const id = world.createEntity('Falling')
    world.addComponent(id, TransformComponent, {
      position: [0, 10, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    const body = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 10, 0], rotation: [0, 0, 0, 1] },
    })
    system.registerBody(id, body, 'dynamic', world)

    system.update(world, 0.5)

    const y = world.getComponent(id, TransformComponent)?.position[1] ?? 10
    expect(y).toBeLessThan(10)
    expect(backend.getStepCount()).toBeGreaterThan(0)
  })

  it('interpolates between previous and current fixed poses using accumulator alpha', () => {
    const backend = new GravityTestBackend([0, 0, 0])
    const system = new PhysicsWorldSystem({ fixedTimestep: 1, maxSubsteps: 2 })
    system.setBackend(backend)
    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [2, 2, 2],
    })
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })
    system.registerBody(id, body, 'dynamic', world)

    backend.setBodyTransform(body, {
      position: [10, 4, -2],
      rotation: [0, 0, 1, 0],
    })
    system.update(world, 1)
    const highRefreshPositions: number[] = []
    for (let frame = 0; frame < 4; frame++) {
      system.update(world, 0.2)
      highRefreshPositions.push(
        system.resolvePresentationTransform(
          id,
          world.getComponent(id, TransformComponent)!,
        ).position[0],
      )
    }

    expect(highRefreshPositions).toEqual([2, 4, 6.000000000000001, 8])
    expect(system.getPresentationAlpha()).toBeCloseTo(0.8)
    const presentation = system.resolvePresentationTransform(
      id,
      world.getComponent(id, TransformComponent)!,
    )
    expect(presentation.position).toEqual([8, 3.2, -1.6])
    expect(presentation.rotation[2]).toBeCloseTo(Math.sin(Math.PI * 0.4))
    expect(presentation.rotation[3]).toBeCloseTo(Math.cos(Math.PI * 0.4))
    expect(presentation.scale).toEqual([2, 2, 2])
    expect(world.getComponent(id, TransformComponent)?.position).toEqual([10, 4, -2])
  })

  it('keeps the first and no-step presentation frames snapped to an initialized pose', () => {
    const backend = new StubPhysicsBackend()
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 })
    system.setBackend(backend)
    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [3, 2, 1],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const body = backend.createBody({
      type: 'dynamic',
      transform: { position: [3, 2, 1], rotation: [0, 0, 0, 1] },
    })
    system.registerBody(id, body, 'dynamic', world)

    system.update(world, 0.25)

    expect(system.getPresentationAlpha()).toBeCloseTo(0.25)
    expect(
      system.resolvePresentationTransform(
        id,
        world.getComponent(id, TransformComponent)!,
      ).position,
    ).toEqual([3, 2, 1])
  })

  it('snaps presentation history after teleport and explicit world replacement invalidation', () => {
    const backend = new StubPhysicsBackend()
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 })
    system.setBackend(backend)
    const world = new World()
    const id = world.createEntity('Dynamic')
    world.addComponent(id, TransformComponent, {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    const body = backend.createBody({ type: 'dynamic', transform: identityTransform })
    system.registerBody(id, body, 'dynamic', world)
    backend.setBodyTransform(body, { position: [10, 0, 0], rotation: [0, 0, 0, 1] })
    system.update(world, 1)
    system.update(world, 0.5)

    system.resetBodyState(
      id,
      { position: [100, 0, 0], rotation: [0, 0, 0, 1] },
      world,
    )
    expect(
      system.resolvePresentationTransform(
        id,
        world.getComponent(id, TransformComponent)!,
      ).position,
    ).toEqual([100, 0, 0])

    system.resetPresentationPoses()
    world.addComponent(id, TransformComponent, {
      position: [-20, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    expect(
      system.resolvePresentationTransform(
        id,
        world.getComponent(id, TransformComponent)!,
      ).position,
    ).toEqual([-20, 0, 0])

    system.update(world, 0.5)
    const authoritativeAfterReplacement = world.getComponent(id, TransformComponent)!
    expect(
      system.resolvePresentationTransform(id, authoritativeAfterReplacement).position,
    ).toEqual(authoritativeAfterReplacement.position)
  })

  it('does not change authoritative physics outcomes when presentation interpolation is disabled', () => {
    const run = (presentationInterpolation: boolean) => {
      const backend = new GravityTestBackend()
      const system = new PhysicsWorldSystem({
        fixedTimestep: 1 / 60,
        maxSubsteps: 3,
        presentationInterpolation,
      })
      system.setBackend(backend)
      const world = new World()
      const id = world.createEntity('Falling')
      world.addComponent(id, TransformComponent, {
        position: [0, 10, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      })
      const body = backend.createBody({
        type: 'dynamic',
        transform: { position: [0, 10, 0], rotation: [0, 0, 0, 1] },
      })
      system.registerBody(id, body, 'dynamic', world)
      for (const dt of [1 / 120, 1 / 120, 1 / 60, 1 / 30]) {
        system.update(world, dt)
        system.resolvePresentationTransform(
          id,
          world.getComponent(id, TransformComponent)!,
        )
      }
      return world.getComponent(id, TransformComponent)
    }

    expect(run(true)).toEqual(run(false))
  })
})

describe('interpolatePhysicsPose', () => {
  it('uses the normalized shortest quaternion path', () => {
    const halfway = interpolatePhysicsPose(
      { position: [0, 0, 0], rotation: [0, 0, 0, 2] },
      { position: [2, 4, 6], rotation: [0, 0, -2, -2] },
      0.5,
    )

    expect(halfway.position).toEqual([1, 2, 3])
    expect(halfway.rotation[2]).toBeCloseTo(Math.sin(Math.PI / 8))
    expect(halfway.rotation[3]).toBeCloseTo(Math.cos(Math.PI / 8))
    expect(Math.hypot(...halfway.rotation)).toBeCloseTo(1)
  })
})

describe('PhysicsWorldSystem multi-world', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it('isolates forked worlds so gravity in one does not affect the other', () => {
    const backend = new GravityTestBackend([0, -10, 0])
    const system = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 10 })
    system.setBackend(backend)

    const worldA = system.createWorld({ gravity: [0, -10, 0] })
    const worldB = system.createWorld({ gravity: [0, 0, 0] })

    const physWorldA = system.getPhysicsWorldByHandle(worldA)!
    const physWorldB = system.getPhysicsWorldByHandle(worldB)!

    const bodyA = physWorldA.createBody({
      type: 'dynamic',
      transform: { position: [0, 10, 0], rotation: [0, 0, 0, 1] },
    })
    const bodyB = physWorldB.createBody({
      type: 'dynamic',
      transform: { position: [0, 10, 0], rotation: [0, 0, 0, 1] },
    })

    const ecsWorld = new World()
    const idA = ecsWorld.createEntity('A')
    const idB = ecsWorld.createEntity('B')
    ecsWorld.addComponent(idA, TransformComponent, {
      position: [0, 10, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    ecsWorld.addComponent(idB, TransformComponent, {
      position: [0, 10, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    system.setEntityWorld(idA, worldA)
    system.setEntityWorld(idB, worldB)
    system.registerBody(idA, bodyA, 'dynamic', ecsWorld)
    system.registerBody(idB, bodyB, 'dynamic', ecsWorld)

    system.update(ecsWorld, 0.5)

    const yA = ecsWorld.getComponent(idA, TransformComponent)?.position[1] ?? 10
    const yB = ecsWorld.getComponent(idB, TransformComponent)?.position[1] ?? 10

    expect(yA).toBeLessThan(10)
    expect(yB).toBeCloseTo(10, 3)
  })
})
