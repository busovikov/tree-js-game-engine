import { describe, expect, it } from 'vitest'
import { DynamicRaycastControllerSchema } from '@haku/schema'
import { updateDynamicRaycast, type TrackedDynamicRaycast } from './physics-controller-runtime.js'
import type { IDynamicRaycastVehicle } from '@haku/physics'
import { physicsBodyHandle } from '@haku/physics'

function createMockVehicle(): IDynamicRaycastVehicle & {
  forces: number[]
  brakes: number[]
  steerings: number[]
} {
  const forces = [0, 0, 0, 0]
  const brakes = [0, 0, 0, 0]
  const steerings = [0, 0, 0, 0]
  return {
    chassis: physicsBodyHandle('body'),
    addWheel: () => 0,
    updateVehicle: () => {},
    setWheelEngineForce: (index, force) => {
      forces[index] = force
    },
    setWheelBrake: (index, strength) => {
      brakes[index] = strength
    },
    setWheelSteering: (index, angle) => {
      steerings[index] = angle
    },
    getWheelSteering: (index) => steerings[index] ?? 0,
    getWheelRotation: () => 0,
    getWheelSuspensionLength: () => 0.8,
    getWheelChassisConnectionY: () => 0,
    getWheelAxle: () => [-1, 0, 0],
    getWheelIsInContact: () => false,
    forces,
    brakes,
    steerings,
  }
}

function simulateOneSecond(fps: 30 | 60 | 120) {
  const controller = DynamicRaycastControllerSchema.parse({
    type: 'dynamic-raycast',
    driveProfile: 'threejs-rapier',
    accelerateForceMax: 1_000,
    brakeForceMax: 100,
  })
  const vehicle = createMockVehicle()
  const tracked: TrackedDynamicRaycast = {
    vehicle,
    wheelCount: 4,
    accelerateForce: 0,
    brakeForceValue: 0,
    currentSteering: 0,
  }
  const world = {
    getComponent: () => controller,
  } as never

  for (let frame = 0; frame < fps; frame++) {
    updateDynamicRaycast(
      world,
      new Map([['car', tracked]]),
      new Map([['car', { throttle: 1, steer: 1, brake: true }]]),
      1 / fps,
    )
  }

  return {
    accelerateForce: tracked.accelerateForce,
    brakeForceValue: tracked.brakeForceValue,
    steering: vehicle.steerings[0],
  }
}

describe('updateDynamicRaycast threejs-rapier profile', () => {
  it('ramps engine force on W and applies FWD to front wheels', () => {
    const controller = DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      driveProfile: 'threejs-rapier',
    })
    const vehicle = createMockVehicle()
    const tracked: TrackedDynamicRaycast = {
      vehicle,
      wheelCount: 4,
      accelerateForce: 0,
      brakeForceValue: 0,
      currentSteering: 0,
    }
    const world = {
      getComponent: () => controller,
    } as never

    updateDynamicRaycast(
      world,
      new Map([['car', tracked]]),
      new Map([['car', { throttle: 1, steer: 0, brake: false }]]),
      1 / 60,
    )

    expect(tracked.accelerateForce).toBe(1)
    expect(vehicle.forces[0]).toBe(1)
    expect(vehicle.forces[1]).toBe(1)
    expect(vehicle.forces[2]).toBe(0)
    expect(vehicle.forces[3]).toBe(0)
  })

  it('lerps steer toward ±π/4 with inverted Haku steer axis', () => {
    const controller = DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      driveProfile: 'threejs-rapier',
    })
    const vehicle = createMockVehicle()
    vehicle.steerings[0] = 0
    const tracked: TrackedDynamicRaycast = {
      vehicle,
      wheelCount: 4,
      accelerateForce: 0,
      brakeForceValue: 0,
      currentSteering: 0,
    }
    const world = {
      getComponent: () => controller,
    } as never

    updateDynamicRaycast(
      world,
      new Map([['car', tracked]]),
      new Map([['car', { throttle: 0, steer: 1, brake: false }]]),
      1 / 60,
    )

    const expected = (Math.PI / 4) * -1 * 0.25
    expect(vehicle.steerings[0]).toBeCloseTo(expected, 5)
    expect(vehicle.steerings[1]).toBeCloseTo(expected, 5)
  })

  it('ramps brake on all wheels when Space held', () => {
    const controller = DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      driveProfile: 'threejs-rapier',
    })
    const vehicle = createMockVehicle()
    const tracked: TrackedDynamicRaycast = {
      vehicle,
      wheelCount: 4,
      accelerateForce: 0,
      brakeForceValue: 0,
      currentSteering: 0,
    }
    const world = {
      getComponent: () => controller,
    } as never

    updateDynamicRaycast(
      world,
      new Map([['car', tracked]]),
      new Map([['car', { throttle: 0, steer: 0, brake: true }]]),
      1 / 60,
    )

    expect(tracked.brakeForceValue).toBeCloseTo(0.05, 5)
    expect(vehicle.brakes.every((b) => b > 0)).toBe(true)

    updateDynamicRaycast(
      world,
      new Map([['car', tracked]]),
      new Map([['car', { throttle: 0, steer: 0, brake: false }]]),
      1 / 60,
    )

    expect(vehicle.brakes.every((b) => b === 0)).toBe(true)
    expect(tracked.brakeForceValue).toBeCloseTo(0.05, 5)
  })

  it('produces equivalent one-second acceleration, brake, and steering ramps at 30/60/120 FPS', () => {
    const thirtyHz = simulateOneSecond(30)
    const sixtyHz = simulateOneSecond(60)
    const oneTwentyHz = simulateOneSecond(120)

    expect(thirtyHz.accelerateForce).toBeCloseTo(sixtyHz.accelerateForce, 10)
    expect(oneTwentyHz.accelerateForce).toBeCloseTo(sixtyHz.accelerateForce, 10)
    expect(thirtyHz.brakeForceValue).toBeCloseTo(sixtyHz.brakeForceValue, 10)
    expect(oneTwentyHz.brakeForceValue).toBeCloseTo(sixtyHz.brakeForceValue, 10)
    expect(thirtyHz.steering).toBeCloseTo(sixtyHz.steering, 10)
    expect(oneTwentyHz.steering).toBeCloseTo(sixtyHz.steering, 10)
  })

  it('does not advance ramps at zero or invalid dt and bounds a large dt', () => {
    const controller = DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      driveProfile: 'threejs-rapier',
      accelerateForceMax: 1_000,
      brakeForceMax: 100,
    })
    const vehicle = createMockVehicle()
    const tracked: TrackedDynamicRaycast = {
      vehicle,
      wheelCount: 4,
      accelerateForce: 0,
      brakeForceValue: 0,
      currentSteering: 0,
    }
    const world = { getComponent: () => controller } as never
    const input = new Map([['car', { throttle: 1, steer: 1, brake: true }]])

    updateDynamicRaycast(world, new Map([['car', tracked]]), input, 0)
    expect(tracked.accelerateForce).toBe(0)
    expect(tracked.brakeForceValue).toBe(0)
    expect(tracked.currentSteering).toBe(0)

    updateDynamicRaycast(world, new Map([['car', tracked]]), input, Number.NaN)
    expect(tracked.accelerateForce).toBe(0)
    expect(tracked.brakeForceValue).toBe(0)
    expect(tracked.currentSteering).toBe(0)

    updateDynamicRaycast(world, new Map([['car', tracked]]), input, 10)
    expect(tracked.accelerateForce).toBeCloseTo(3, 10)
    expect(tracked.brakeForceValue).toBeCloseTo(0.15, 10)
    expect(Math.abs(tracked.currentSteering)).toBeLessThan(controller.steerAngleMax)
  })
})
