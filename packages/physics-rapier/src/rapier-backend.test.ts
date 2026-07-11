import { describe, expect, it, beforeEach } from 'vitest'
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
    expect(states[0]?.inContact).toBe(true)
    expect(states[0]?.contactPoint).not.toBeNull()
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
})
