import { describe, expect, it, beforeEach } from 'vitest'
import {
  PhysicsNotInitializedError,
  PhysicsWorld,
  StubPhysicsBackend,
  resetStubPhysicsIds,
} from './index.js'

const identityTransform = {
  position: [0, 0, 0] as const,
  rotation: [0, 0, 0, 1] as const,
}

describe('@haku/physics StubPhysicsBackend', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it('throws when used before init', () => {
    const backend = new StubPhysicsBackend()
    expect(() => backend.step(1 / 60)).toThrow(PhysicsNotInitializedError)
  })

  it('init → create body → step → destroy → dispose', () => {
    const backend = new StubPhysicsBackend()
    backend.init()
    expect(backend.isInitialized()).toBe(true)

    const body = backend.createBody({ type: 'dynamic', transform: identityTransform, mass: 1 })
    backend.attachShape(body, { type: 'box', halfExtents: [0.5, 0.5, 0.5] })
    backend.step(1 / 60)
    expect(backend.getSimulationTime()).toBeCloseTo(1 / 60)

    backend.setBodyTransform(body, {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    })
    expect(backend.getBodyTransform(body).position).toEqual([1, 2, 3])

    backend.destroyBody(body)
    backend.dispose()
    expect(backend.isInitialized()).toBe(false)
  })

  it('raycast vehicle: add wheel, apply force, step updates rotation', () => {
    const backend = new StubPhysicsBackend()
    backend.init()

    const chassis = backend.createBody({ type: 'dynamic', transform: identityTransform })
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

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [20, 0.1, 20] })

    for (let i = 0; i < 10; i++) {
      backend.step(1 / 60)
    }

    const states = vehicle.getWheelStates()
    expect(states).toHaveLength(1)
    expect(states[0]?.engineForce).toBe(1500)
    expect(states[0]?.inContact).toBe(true)
  })
})

describe('@haku/physics PhysicsWorld', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it('facade delegates to backend and guards uninitialized state', () => {
    const backend = new StubPhysicsBackend()
    const world = new PhysicsWorld(backend)

    expect(() => world.createBody({ type: 'static', transform: identityTransform })).toThrow(
      PhysicsNotInitializedError,
    )

    backend.init()
    const body = world.createBody({ type: 'static', transform: identityTransform })
    world.step(1 / 60)
    world.destroyBody(body)
    expect(backend.getSimulationTime()).toBeCloseTo(1 / 60)
  })
})
