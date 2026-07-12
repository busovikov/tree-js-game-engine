import { expect, it } from 'vitest'
import type { IPhysicsBackend } from './backend.js'
import { defaultFourWheelConfigs } from './raycast-vehicle-simulation.js'

const DT = 1 / 60
const STEP_COUNT = 120

/** Suspension params tuned for stable 120-step integration tests (stub + Rapier). */
export function testFourWheelConfigs() {
  return defaultFourWheelConfigs({
    suspension: {
      suspensionStiffness: 30,
      dampingRelaxation: 4.5,
      dampingCompression: 5.5,
    },
  })
}

/** Run flat-ground assertions shared by stub and Rapier backends. */
export function runFlatGroundRaycastVehicleAssertions(
  createBackend: () => IPhysicsBackend | Promise<IPhysicsBackend>,
): void {
  it('supports vehicle weight with four stable wheel contacts over 120 steps', async () => {
    const backend = await Promise.resolve(createBackend())
    backend.init()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [30, 0.1, 30] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1.05, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })

    const vehicle = backend.createRaycastVehicle(chassis)
    const wheels = testFourWheelConfigs().map((config) => vehicle.addWheel(config))
    expect(wheels).toHaveLength(4)

    const contactHistory: boolean[][] = []
    const suspensionHistory: number[][] = []

    for (let step = 0; step < STEP_COUNT; step++) {
      backend.step(DT)
      const states = vehicle.getWheelStates()
      expect(states).toHaveLength(4)
      contactHistory.push(states.map((state) => state.inContact))
      suspensionHistory.push(states.map((state) => state.suspensionLength))
    }

    const finalStates = vehicle.getWheelStates()
    const chassisY = backend.getBodyTransform(chassis).position[1]

    expect(chassisY).toBeGreaterThan(0.2)
    expect(chassisY).toBeLessThan(2.0)

    for (const state of finalStates) {
      expect(state.inContact).toBe(true)
      expect(state.contactPoint).not.toBeNull()
      expect(state.suspensionLength).toBeGreaterThan(0)
      expect(state.suspensionLength).toBeLessThan(0.8)
    }

    const last20Contacts = contactHistory.slice(-20)
    const last20Suspension = suspensionHistory.slice(-20)
    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex++) {
      const contacts = last20Contacts.map((frame) => frame[wheelIndex])
      expect(contacts.every(Boolean)).toBe(true)

      const lengths = last20Suspension.map((frame) => frame[wheelIndex]!)
      const min = Math.min(...lengths)
      const max = Math.max(...lengths)
      expect(max - min).toBeLessThan(0.3)
    }
  })

  it('applies RWD engine force and front-wheel steering via IRaycastVehicle API', async () => {
    const backend = await Promise.resolve(createBackend())
    backend.init()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [30, 0.1, 30] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1.05, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })

    const vehicle = backend.createRaycastVehicle(chassis)
    const wheelConfigs = testFourWheelConfigs()
    const wheels = wheelConfigs.map((config) => vehicle.addWheel(config))

    vehicle.setSteering(wheels[0]!, 0.35)
    vehicle.setSteering(wheels[1]!, 0.35)
    vehicle.applyEngineForce(wheels[2]!, -2000)
    vehicle.applyEngineForce(wheels[3]!, -2000)

    for (let step = 0; step < 90; step++) {
      backend.step(DT)
    }

    const states = vehicle.getWheelStates()
    expect(states[0]?.steering).toBeCloseTo(0.35)
    expect(states[1]?.steering).toBeCloseTo(0.35)
    expect(states[2]?.engineForce).toBe(-2000)
    expect(states[3]?.engineForce).toBe(-2000)
    const pos = backend.getBodyTransform(chassis).position
    const dist = Math.hypot(pos[0], pos[2])
    expect(dist).toBeGreaterThan(0.2)
  })

  it('drives forward monotonically without longitudinal friction oscillation', async () => {
    const backend = await Promise.resolve(createBackend())
    backend.init()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [30, 0.1, 30] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1.05, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })

    const vehicle = backend.createRaycastVehicle(chassis)
    const wheelConfigs = testFourWheelConfigs()
    const wheels = wheelConfigs.map((config) => vehicle.addWheel(config))

    vehicle.applyEngineForce(wheels[2]!, -2000)
    vehicle.applyEngineForce(wheels[3]!, -2000)

    const zHistory: number[] = []
    for (let step = 0; step < 90; step++) {
      backend.step(DT)
      zHistory.push(backend.getBodyTransform(chassis).position[2])
    }

    let backwardFrames = 0
    for (let i = 1; i < zHistory.length; i++) {
      if (zHistory[i]! < zHistory[i - 1]! - 0.001) {
        backwardFrames += 1
      }
    }
    expect(zHistory[zHistory.length - 1]!).toBeGreaterThan(zHistory[0]! + 0.5)
    expect(backwardFrames).toBeLessThan(5)
  })

  it('yaws when front wheels are steered during forward drive', async () => {
    const backend = await Promise.resolve(createBackend())
    backend.init()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [30, 0.1, 30] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1.05, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })

    const vehicle = backend.createRaycastVehicle(chassis)
    const wheelConfigs = testFourWheelConfigs()
    const wheels = wheelConfigs.map((config) => vehicle.addWheel(config))

    vehicle.setSteering(wheels[0]!, -0.35)
    vehicle.setSteering(wheels[1]!, -0.35)
    vehicle.applyEngineForce(wheels[2]!, -2000)
    vehicle.applyEngineForce(wheels[3]!, -2000)

    for (let step = 0; step < 180; step++) {
      backend.step(DT)
    }

    const rotation = backend.getBodyTransform(chassis).rotation
    const yaw = Math.atan2(
      2 * (rotation[3] * rotation[1] + rotation[0] * rotation[2]),
      1 - 2 * (rotation[1] * rotation[1] + rotation[2] * rotation[2]),
    )
    const dist = Math.hypot(
      backend.getBodyTransform(chassis).position[0],
      backend.getBodyTransform(chassis).position[2],
    )

    expect(Math.abs(yaw)).toBeGreaterThan(0.3)
    expect(Math.abs(yaw)).toBeLessThan(2.8)
    expect(dist).toBeGreaterThan(0.5)
  })

  it('settles idle chassis without vertical bounce on flat ground', async () => {
    const backend = await Promise.resolve(createBackend())
    backend.init()

    const ground = backend.createBody({
      type: 'static',
      transform: { position: [0, -0.1, 0], rotation: [0, 0, 0, 1] },
    })
    backend.attachShape(ground, { type: 'box', halfExtents: [30, 0.1, 30] })

    const chassis = backend.createBody({
      type: 'dynamic',
      transform: { position: [0, 1.05, 0], rotation: [0, 0, 0, 1] },
      mass: 250,
      angularDamping: 0.35,
      inertiaScalePitchRoll: 3,
    })
    backend.attachShape(chassis, { type: 'box', halfExtents: [0.9, 0.3, 1.55] })

    const vehicle = backend.createRaycastVehicle(chassis)
    testFourWheelConfigs().forEach((config) => vehicle.addWheel(config))

    const yHistory: number[] = []
    const pitchHistory: number[] = []
    for (let step = 0; step < 240; step++) {
      backend.step(DT)
      if (step >= 120) {
        const transform = backend.getBodyTransform(chassis)
        yHistory.push(transform.position[1])
        pitchHistory.push(backend.getBodyAngularVelocity(chassis)[0])
      }
    }

    const ySpread = Math.max(...yHistory) - Math.min(...yHistory)
    const lastPitch = Math.abs(pitchHistory[pitchHistory.length - 1] ?? 0)

    expect(ySpread).toBeLessThan(0.08)
    expect(lastPitch).toBeLessThan(0.35)
  })
}
