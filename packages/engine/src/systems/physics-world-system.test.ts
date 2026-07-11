import { describe, expect, it, beforeEach } from 'vitest'
import { TransformComponent, World } from '@haku/core'
import type { IPhysicsBackend } from '@haku/physics'
import {
  PhysicsHandleNotFoundError,
  PhysicsNotInitializedError,
  physicsBodyHandle,
  physicsShapeHandle,
  resetStubPhysicsIds,
  StubPhysicsBackend,
  type PhysicsBodyHandle,
  type PhysicsShapeDescriptor,
  type PhysicsTransform,
  type RigidBodyDescriptor,
  type RaycastHit,
  type Vec3,
} from '@haku/physics'
import type { IRaycastVehicle } from '@haku/physics'
import { PhysicsWorldSystem } from './physics-world-system.js'

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

  attachShape(_body: PhysicsBodyHandle, _shape: PhysicsShapeDescriptor) {
    this.assertInitialized()
    return physicsShapeHandle('shape-1')
  }

  detachShape(): void {
    this.assertInitialized()
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

  createRaycastVehicle(): IRaycastVehicle {
    throw new Error('not implemented in test backend')
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
    expect(transform?.position).toEqual([1, 4, 2])
    expect(transform?.rotation[1]).toBeCloseTo(0.707, 3)
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
})
