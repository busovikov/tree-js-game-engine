import { describe, expect, it, beforeEach } from 'vitest'
import {
  ColliderComponent,
  TransformComponent,
  VehicleComponent,
  World,
} from '@haku/core'
import { VehicleSchema } from '@haku/schema'
import {
  resetStubPhysicsIds,
  StubPhysicsBackend,
  type Quat,
  type Vec3,
} from '@haku/physics'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import {
  VehicleControllerSystem,
  computeDriveControlState,
  vehicleWheelConfigs,
} from './vehicle-controller-system.js'

const DEFAULT_VEHICLE = VehicleSchema.parse({})
const IDENTITY_ROTATION: Quat = [0, 0, 0, 1]

function driveContext(overrides: Partial<Parameters<typeof computeDriveControlState>[0]> = {}) {
  return {
    vehicle: DEFAULT_VEHICLE,
    input: {},
    currentSteer: 0,
    jumpCooldown: 0,
    jumpBuffer: 0,
    linearVelocity: [0, 0, 0] as Vec3,
    rotation: IDENTITY_ROTATION,
    grounded: true,
    dt: 1 / 60,
    ...overrides,
  }
}

describe('computeDriveControlState', () => {
  it('applies RWD engine force when throttle is forward and under speed cap', () => {
    const state = computeDriveControlState(
      driveContext({ input: { throttle: 1 } }),
    )
    expect(state.engineForce).toBe(-DEFAULT_VEHICLE.engine.force)
  })

  it('applies boost multiplier and raises speed cap while boosting', () => {
    const underCruise = computeDriveControlState(
      driveContext({
        input: { throttle: 1, boost: true },
        linearVelocity: [10, 0, 0],
      }),
    )
    expect(underCruise.engineForce).toBeCloseTo(
      -DEFAULT_VEHICLE.engine.force * DEFAULT_VEHICLE.engine.boostMultiplier,
    )

    const aboveBoostCap = computeDriveControlState(
      driveContext({
        input: { throttle: 1, boost: true },
        linearVelocity: [50, 0, 0],
      }),
    )
    expect(aboveBoostCap.engineForce).toBe(0)
  })

  it('cuts engine force at cruise speed without boost', () => {
    const state = computeDriveControlState(
      driveContext({
        input: { throttle: 1 },
        linearVelocity: [30, 0, 0],
      }),
    )
    expect(state.engineForce).toBe(0)
  })

  it('applies service brake when reversing while moving forward', () => {
    const state = computeDriveControlState(
      driveContext({
        input: { throttle: -1 },
        linearVelocity: [0, 0, 5],
      }),
    )
    expect(state.engineForce).toBe(0)
    expect(state.brake).toBe(DEFAULT_VEHICLE.brakes.brakeForce)
  })

  it('applies reverse engine force when moving backward or stopped', () => {
    const state = computeDriveControlState(
      driveContext({
        input: { throttle: -0.5 },
        linearVelocity: [-1, 0, 0],
      }),
    )
    expect(state.engineForce).toBeCloseTo(
      DEFAULT_VEHICLE.engine.force * DEFAULT_VEHICLE.engine.reverseFactor * 0.5,
    )
  })

  it('applies coast brake when throttle is neutral', () => {
    const state = computeDriveControlState(driveContext({ input: {} }))
    expect(state.brake).toBe(1.2)
    expect(state.engineForce).toBe(0)
  })

  it('smooths steering toward target over multiple frames', () => {
    const first = computeDriveControlState(
      driveContext({ input: { steer: 1 }, dt: 1 / 60 }),
    )
    expect(first.currentSteer).toBeCloseTo(-DEFAULT_VEHICLE.steering.steerSpeed / 60, 4)
    expect(Math.abs(first.currentSteer)).toBeLessThan(DEFAULT_VEHICLE.steering.maxSteer)

    let steer = first.currentSteer
    for (let i = 0; i < 120; i++) {
      const frame = computeDriveControlState(
        driveContext({
          input: { steer: 1 },
          currentSteer: steer,
          dt: 1 / 60,
        }),
      )
      steer = frame.currentSteer
    }
    expect(steer).toBeCloseTo(-DEFAULT_VEHICLE.steering.maxSteer, 3)
  })

  it('flags handbrake on rear wheels when brake input is set', () => {
    const state = computeDriveControlState(
      driveContext({ input: { brake: true } }),
    )
    expect(state.handbrakeRear).toBe(true)
  })

  it('applies jump only when grounded with active buffer and no cooldown', () => {
    const airborne = computeDriveControlState(
      driveContext({ input: { jump: true }, grounded: false }),
    )
    expect(airborne.jumpApplied).toBe(false)

    const grounded = computeDriveControlState(
      driveContext({ input: { jump: true }, grounded: true }),
    )
    expect(grounded.jumpApplied).toBe(true)
    expect(grounded.jumpCooldown).toBe(DEFAULT_VEHICLE.jump.cooldown)

    const onCooldown = computeDriveControlState(
      driveContext({
        input: { jump: true },
        grounded: true,
        jumpCooldown: 0.2,
      }),
    )
    expect(onCooldown.jumpApplied).toBe(false)
  })
})

describe('vehicleWheelConfigs', () => {
  it('maps VehicleComponent suspension and wheel layout to four WheelConfig entries', () => {
    const configs = vehicleWheelConfigs(DEFAULT_VEHICLE)
    expect(configs).toHaveLength(4)
    expect(configs[0]?.localPosition).toEqual([
      -DEFAULT_VEHICLE.wheels.halfWidth,
      DEFAULT_VEHICLE.wheels.height,
      DEFAULT_VEHICLE.wheels.halfLength,
    ])
    expect(configs[2]?.localPosition[2]).toBe(-DEFAULT_VEHICLE.wheels.halfLength)
    expect(configs[0]?.suspensionStiffness).toBe(DEFAULT_VEHICLE.suspension.stiffness)
  })
})

describe('VehicleControllerSystem integration (stub)', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  function createFlatVehicleScene() {
    const backend = new StubPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({
      fixedTimestep: 1 / 60,
      maxSubsteps: 120,
    })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new VehicleControllerSystem(physicsSystem)

    const world = new World()

    const groundId = world.createEntity('Ground')
    world.addComponent(groundId, TransformComponent, {
      position: [0, -0.1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(groundId, ColliderComponent, {
      shape: 'box',
      halfExtents: [30, 0.1, 30],
      isStatic: true,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

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
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })
    world.addComponent(carId, VehicleComponent, DEFAULT_VEHICLE)

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)

    return { world, physicsSystem, colliderSystem, vehicleSystem, carId, backend }
  }

  it('drives forward on flat ground with throttle input', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, carId } =
      createFlatVehicleScene()

    vehicleSystem.setVehicleInput(carId, { throttle: 1 })

    for (let i = 0; i < 90; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const z = world.getComponent(carId, TransformComponent)?.position[2] ?? 0
    expect(z).toBeGreaterThan(0.5)

    const tracked = vehicleSystem.getCurrentSteer(carId)
    expect(tracked).toBeDefined()

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })

  it('steers without explicit input binding', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, carId } =
      createFlatVehicleScene()

    vehicleSystem.setVehicleInput(carId, { throttle: 1, steer: 1 })
    for (let i = 0; i < 60; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }
    const steerAngle = vehicleSystem.getCurrentSteer(carId) ?? 0
    expect(steerAngle).toBeLessThan(0)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })

  it('jumps when grounded and jump input is requested', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, carId } =
      createFlatVehicleScene()

    for (let i = 0; i < 30; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const yBefore = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    vehicleSystem.setVehicleInput(carId, { jump: true })
    vehicleSystem.update(world, 1 / 60)
    physicsSystem.update(world, 1 / 60)

    for (let i = 0; i < 10; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const yAfter = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    expect(yAfter).toBeGreaterThan(yBefore + 0.05)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })
})

describe('VehicleControllerSystem integration (Rapier)', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  it('drives forward on flat ground with Rapier backend', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({
      fixedTimestep: 1 / 60,
      maxSubsteps: 120,
    })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new VehicleControllerSystem(physicsSystem)

    const world = new World()
    const groundId = world.createEntity('Ground')
    world.addComponent(groundId, TransformComponent, {
      position: [0, -0.1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(groundId, ColliderComponent, {
      shape: 'box',
      halfExtents: [30, 0.1, 30],
      isStatic: true,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

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
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })
    world.addComponent(carId, VehicleComponent, DEFAULT_VEHICLE)

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)
    vehicleSystem.setVehicleInput(carId, { throttle: 1 })

    for (let i = 0; i < 90; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const z = world.getComponent(carId, TransformComponent)?.position[2] ?? 0
    expect(z).toBeGreaterThan(0.2)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })
})
