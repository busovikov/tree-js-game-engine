import { describe, expect, it } from 'vitest'
import { TransformComponent, PhysicsControllerComponent, World } from '@haku/core'
import { collectVehicleDebugSnapshot, VehicleDebugLogger, type VehicleDebugLogRecord } from './vehicle-debug.js'
import type { PhysicsControllerSystem } from '../systems/physics-controller-system.js'
import type { PhysicsWorldSystem } from '../systems/physics-world-system.js'
import type { IRaycastVehicle } from '@haku/physics'

function mockPhysicsSystem(
  linearVelocity: [number, number, number] = [0, 0, 0],
  angularVelocity: [number, number, number] = [0, 0, 0],
): PhysicsWorldSystem {
  return {
    getBodyLinearVelocity: () => linearVelocity,
    getBodyAngularVelocity: () => angularVelocity,
  } as unknown as PhysicsWorldSystem
}

function mockVehicleController(
  raycastVehicle?: IRaycastVehicle,
): PhysicsControllerSystem {
  return {
    getRaycastVehicle: () => raycastVehicle,
    getControllerInput: () => ({ throttle: 1 }),
    getCurrentSteer: () => 0,
  } as unknown as PhysicsControllerSystem
}

describe('collectVehicleDebugSnapshot', () => {
  it('collects chassis, wheels, and drive state', () => {
    const world = new World()
    const id = world.createEntity('Vehicle')
    world.addComponent(id, TransformComponent, {
      position: [0, 2.77, 5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, PhysicsControllerComponent, PhysicsControllerComponent.defaults?.() ?? {})

    const raycastVehicle = {
      getWheelStates: () => [
        {
          wheel: { value: 'fl' },
          inContact: true,
          contactPoint: [0, 2.15, 6] as [number, number, number],
          suspensionLength: 0.5,
          rotation: 0,
          steering: 0,
          engineForce: -30,
        },
      ],
    } as unknown as IRaycastVehicle

    const snap = collectVehicleDebugSnapshot(world, {
      physicsSystem: mockPhysicsSystem([0, 0.5, 2]),
      vehicleController: mockVehicleController(raycastVehicle),
      raycastVehicle,
    }, 0)

    expect(snap).not.toBeNull()
    expect(snap!.vehicleName).toBe('Vehicle')
    expect(snap!.grounded).toBe(true)
    expect(snap!.verticalVelocity).toBe(0.5)
    expect(snap!.drive.throttle).toBe(1)
    expect(snap!.implicitCollider.lift).toBe(0.5)
    expect(snap!.wheels[0]?.inContact).toBe(true)
  })

  it('flags rapid vertical rise', () => {
    const world = new World()
    const id = world.createEntity('Vehicle')
    world.addComponent(id, TransformComponent, {
      position: [0, 2.77, 5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(id, PhysicsControllerComponent, PhysicsControllerComponent.defaults?.() ?? {})

    const previous = collectVehicleDebugSnapshot(
      world,
      {
        physicsSystem: mockPhysicsSystem([0, 0, 0]),
        vehicleController: mockVehicleController(),
      },
      0,
      null,
    )!

    world.addComponent(id, TransformComponent, {
      position: [0, 4.2, 5],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })

    const snap = collectVehicleDebugSnapshot(
      world,
      {
        physicsSystem: mockPhysicsSystem([0, 12, 0]),
        vehicleController: mockVehicleController(),
      },
      1,
      { ...previous, t: previous.t - 300 },
    )

    expect(snap?.flags.some((flag) => flag.startsWith('high_vy') || flag.startsWith('rapid_rise'))).toBe(
      true,
    )
  })
})

describe('VehicleDebugLogger', () => {
  it('writes samples to sink instead of console', () => {
    const records: VehicleDebugLogRecord[] = []
    const logger = new VehicleDebugLogger(
      () => null,
      () => null,
      {
        intervalMs: 10_000,
        sink: {
          write(record) {
            records.push(record)
          },
        },
      },
    )

    logger.start()
    logger.stop()

    expect(records.some((r) => r.kind === 'session' && r.event === 'start')).toBe(true)
    expect(records.some((r) => r.kind === 'session' && r.event === 'stop')).toBe(true)
  })
})
