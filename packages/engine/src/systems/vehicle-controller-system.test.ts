import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  ColliderComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { CustomRaycastControllerSchema } from '@haku/schema'
import {
  resetStubPhysicsIds,
  StubPhysicsBackend,
  type ICharacterController,
  type IDynamicRaycastVehicle,
  type IRaycastVehicle,
  type PhysicsJointHandle,
  type PhysicsWheelHandle,
  type Quat,
  type Vec3,
} from '@haku/physics'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import {
  PhysicsControllerSystem,
  computeDriveControlState,
  computeIsaacDriveControlState,
  steerScaleAtSpeed,
  resolvePhysicsSteerAngle,
  MIN_PHYSICS_STEER_SPEED_MPS,
  vehicleWheelConfigs,
} from './vehicle-controller-system.js'

const DEFAULT_VEHICLE = CustomRaycastControllerSchema.parse({ type: 'custom-raycast' })
const INTEGRATION_DRIVE_VEHICLE = CustomRaycastControllerSchema.parse({
  type: 'custom-raycast',
  engine: { force: 800 },
})
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
  it('isaac profile matches sketch maxForce/maxSteer/maxBrake', () => {
    const vehicle = CustomRaycastControllerSchema.parse({
      type: 'custom-raycast',
      driveProfile: 'isaac',
      engine: { force: 30 },
      steering: { maxSteer: 10 },
      brakes: { brakeForce: 2 },
    })
    const drive = computeIsaacDriveControlState(
      driveContext({
        vehicle,
        input: { throttle: 1, steer: 1, brake: true },
      }),
    )
    expect(drive.engineForce).toBe(-30)
    expect(drive.currentSteer).toBe(10)
    expect(drive.brake).toBe(2)
    expect(drive.handbrakeRear).toBe(false)

    const reverse = computeIsaacDriveControlState(
      driveContext({ vehicle, input: { throttle: -1 } }),
    )
    expect(reverse.engineForce).toBe(30)
  })

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

  it('does not apply coast brake when throttle is neutral (Isaac Mason sketch)', () => {
    const state = computeDriveControlState(driveContext({ input: {} }))
    expect(state.brake).toBe(0)
    expect(state.engineForce).toBe(0)
  })

  it('reduces steer authority at high speed', () => {
    expect(steerScaleAtSpeed(10)).toBe(1)
    expect(steerScaleAtSpeed(30)).toBeCloseTo(0.33, 2)
    expect(steerScaleAtSpeed(120)).toBeCloseTo(0.15, 2)

    let steer = 0
    for (let i = 0; i < 120; i++) {
      const frame = computeDriveControlState(
        driveContext({
          input: { steer: 1 },
          currentSteer: steer,
          linearVelocity: [0, 0, 10],
          dt: 1 / 60,
        }),
      )
      steer = frame.currentSteer
    }
    expect(steer).toBeLessThan(DEFAULT_VEHICLE.steering.maxSteer * 0.5)
  })

  it('zeros physics steer at standstill', () => {
    expect(resolvePhysicsSteerAngle(0.55, [0, 0, 0])).toBe(0)
    expect(resolvePhysicsSteerAngle(0.55, [0.1, 0, 0.1])).toBe(0)
    expect(resolvePhysicsSteerAngle(0.55, [0, 0, MIN_PHYSICS_STEER_SPEED_MPS])).toBe(0.55)
    expect(resolvePhysicsSteerAngle(-0.4, [0, 0, 2])).toBe(-0.4)
  })

  it('smooths steering toward target over multiple frames', () => {
    const first = computeDriveControlState(
      driveContext({ input: { steer: 1 }, dt: 1 / 60 }),
    )
    expect(first.currentSteer).toBeCloseTo(DEFAULT_VEHICLE.steering.steerSpeed / 60, 4)
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
    expect(steer).toBeCloseTo(DEFAULT_VEHICLE.steering.maxSteer, 3)
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
  it('maps PhysicsControllerComponent suspension and wheel layout to four WheelConfig entries', () => {
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
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)

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
    world.addComponent(carId, PhysicsControllerComponent, INTEGRATION_DRIVE_VEHICLE)

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)

    return { world, physicsSystem, colliderSystem, vehicleSystem, carId, backend }
  }

  it('drives forward on flat ground with throttle input', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, carId } =
      createFlatVehicleScene()

    vehicleSystem.setVehicleInput(carId, { throttle: 1 })

    for (let i = 0; i < 180; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const z = world.getComponent(carId, TransformComponent)?.position[2] ?? 0
    expect(z).toBeGreaterThan(0.25)

    const tracked = vehicleSystem.getCurrentSteer(carId)
    expect(tracked).toBeDefined()

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })

  it('does not oscillate when steering at standstill without throttle', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, carId } =
      createFlatVehicleScene()

    vehicleSystem.setVehicleInput(carId, { steer: 1 })

    for (let i = 0; i < 180; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const transform = world.getComponent(carId, TransformComponent)!
    const angular = physicsSystem.getBodyAngularVelocity(carId) ?? [0, 0, 0]
    const linear = physicsSystem.getBodyLinearVelocity(carId) ?? [0, 0, 0]
    const flSteer = vehicleSystem.getRaycastVehicle(carId)?.getWheelStates()[0]?.steering ?? 0

    expect(flSteer).toBe(0)
    expect(Math.abs(angular[0])).toBeLessThan(0.15)
    expect(Math.abs(angular[1])).toBeLessThan(0.15)
    expect(Math.abs(angular[2])).toBeLessThan(0.15)
    expect(Math.hypot(linear[0], linear[2])).toBeLessThan(0.5)
    expect(Math.abs(transform.position[0])).toBeLessThan(0.3)
    expect(Math.abs(transform.position[2])).toBeLessThan(0.3)

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
    expect(steerAngle).toBeGreaterThan(0)

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

  it('neutralizes a controller exactly once when it transitions to disabled', () => {
    const physicsSystem = new PhysicsWorldSystem()
    physicsSystem.setBackend(new StubPhysicsBackend())
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)
    const world = new World()
    const carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 0, 0],
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
    })
    world.addComponent(
      carId,
      PhysicsControllerComponent,
      CustomRaycastControllerSchema.parse({ type: 'custom-raycast', enabled: false }),
    )

    const vehicle = {
      setSteering: vi.fn(),
      applyEngineForce: vi.fn(),
      setBrake: vi.fn(),
    } as unknown as IRaycastVehicle
    const wheels = [
      { value: 'fl' },
      { value: 'fr' },
      { value: 'bl' },
      { value: 'br' },
    ] as unknown as readonly [
      PhysicsWheelHandle,
      PhysicsWheelHandle,
      PhysicsWheelHandle,
      PhysicsWheelHandle,
    ]
    const internals = vehicleSystem as unknown as {
      bootstrapped: boolean
      customRaycast: Map<
        string,
        {
          vehicle: IRaycastVehicle
          wheels: typeof wheels
          currentSteer: number
          jumpCooldown: number
          jumpBuffer: number
        }
      >
    }
    internals.bootstrapped = true
    internals.customRaycast.set(carId.value, {
      vehicle,
      wheels,
      currentSteer: 0.4,
      jumpCooldown: 1,
      jumpBuffer: 1,
    })
    vehicleSystem.setControllerInput(carId, { throttle: 1, steer: 1, brake: true })

    vehicleSystem.update(world, 1 / 60)
    vehicleSystem.update(world, 1 / 60)

    expect(vehicle.setSteering).toHaveBeenCalledTimes(2)
    expect(vehicle.applyEngineForce).toHaveBeenCalledTimes(2)
    expect(vehicle.setBrake).toHaveBeenCalledTimes(4)
    expect(vehicleSystem.getControllerInput(carId)).toBeUndefined()
    physicsSystem.dispose()
  })

  it('resetControllerState clears every tracked controller family', () => {
    const physicsSystem = new PhysicsWorldSystem()
    physicsSystem.setBackend(new StubPhysicsBackend())
    const physicsWorld = physicsSystem.getPhysicsWorld()
    expect(physicsWorld).toBeTruthy()
    if (!physicsWorld) return

    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)
    const world = new World()
    const id = world.createEntity('Controlled')
    const customVehicle = {
      setSteering: vi.fn(),
      applyEngineForce: vi.fn(),
      setBrake: vi.fn(),
    } as unknown as IRaycastVehicle
    const dynamicVehicle = {
      setWheelSteering: vi.fn(),
      setWheelEngineForce: vi.fn(),
      setWheelBrake: vi.fn(),
    } as unknown as IDynamicRaycastVehicle
    const characterController = {} as ICharacterController
    const steerJoint = { value: 'steer-joint' } as PhysicsJointHandle
    const driveJoint = { value: 'drive-joint' } as PhysicsJointHandle
    const setMotorPosition = vi.spyOn(physicsWorld, 'setRevoluteMotorPosition')
    const setMotorVelocity = vi.spyOn(physicsWorld, 'setRevoluteMotorVelocity')
    const wheels = [
      { value: 'fl' },
      { value: 'fr' },
      { value: 'bl' },
      { value: 'br' },
    ] as unknown as readonly [
      PhysicsWheelHandle,
      PhysicsWheelHandle,
      PhysicsWheelHandle,
      PhysicsWheelHandle,
    ]
    const custom = {
      vehicle: customVehicle,
      wheels,
      currentSteer: 0.5,
      jumpCooldown: 0.3,
      jumpBuffer: 0.2,
    }
    const dynamic = {
      vehicle: dynamicVehicle,
      wheelCount: 4,
      accelerateForce: 20,
      brakeForceValue: 3,
      currentSteering: 0.4,
    }
    const arcade = { currentSpeed: 12, jumpCooldown: 0.3 }
    const character = {
      controller: characterController,
      velocityXZ: [4, 0, -2] as Vec3,
      jumpBuffer: 0.1,
      jumpCooldown: 0.2,
      grounded: true,
    }
    const revolute = {
      wheels: [
        {
          wheelBody: { value: 'steer-body' },
          wheelShape: { value: 'steer-shape' },
          joint: steerJoint,
          isSteered: true,
          isDriven: false,
        },
        {
          wheelBody: { value: 'drive-body' },
          wheelShape: { value: 'drive-shape' },
          joint: driveJoint,
          isSteered: false,
          isDriven: true,
        },
      ],
      steerAngle: 0.5,
      steerStiffness: 100,
      steerDamping: 10,
    }
    const internals = vehicleSystem as unknown as {
      customRaycast: Map<string, unknown>
      dynamicRaycast: Map<string, unknown>
      arcadeVehicles: Map<string, typeof arcade>
      characters: Map<string, typeof character>
      revoluteVehicles: Map<string, typeof revolute>
    }
    internals.customRaycast.set(id.value, custom)
    internals.dynamicRaycast.set(id.value, dynamic)
    internals.arcadeVehicles.set(id.value, arcade)
    internals.characters.set(id.value, character)
    internals.revoluteVehicles.set(id.value, revolute)
    vehicleSystem.setControllerInput(id, { throttle: 1, jump: true })

    vehicleSystem.resetControllerState(id)

    expect(custom.currentSteer).toBe(0)
    expect(custom.jumpCooldown).toBe(0)
    expect(custom.jumpBuffer).toBe(0)
    expect(customVehicle.setSteering).toHaveBeenCalledTimes(2)
    expect(customVehicle.applyEngineForce).toHaveBeenCalledTimes(2)
    expect(customVehicle.setBrake).toHaveBeenCalledTimes(4)
    expect(dynamic.accelerateForce).toBe(0)
    expect(dynamic.brakeForceValue).toBe(0)
    expect(dynamic.currentSteering).toBe(0)
    expect(dynamicVehicle.setWheelSteering).toHaveBeenCalledTimes(4)
    expect(dynamicVehicle.setWheelEngineForce).toHaveBeenCalledTimes(4)
    expect(dynamicVehicle.setWheelBrake).toHaveBeenCalledTimes(4)
    expect(arcade).toEqual({ currentSpeed: 0, jumpCooldown: 0 })
    expect(character.velocityXZ).toEqual([0, 0, 0])
    expect(character.jumpBuffer).toBe(0)
    expect(character.jumpCooldown).toBe(0)
    expect(character.grounded).toBe(false)
    expect(revolute.steerAngle).toBe(0)
    expect(setMotorPosition).toHaveBeenCalledWith(steerJoint, 0, 100, 10)
    expect(setMotorVelocity).toHaveBeenCalledWith(driveJoint, 0, 0)
    expect(vehicleSystem.getControllerInput(id)).toBeUndefined()
    physicsSystem.dispose()
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
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)

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
    world.addComponent(carId, PhysicsControllerComponent, INTEGRATION_DRIVE_VEHICLE)

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

  it('bootstraps implicit chassis collider without ColliderComponent', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)

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
    world.addComponent(carId, PhysicsControllerComponent, INTEGRATION_DRIVE_VEHICLE)

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)
    expect(physicsSystem.getBodyHandle(carId)).not.toBeNull()
    expect(vehicleSystem.getRaycastVehicle(carId)).toBeDefined()

    vehicleSystem.setVehicleInput(carId, { throttle: 1, steer: 1 })
    for (let i = 0; i < 60; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    expect(vehicleSystem.getCurrentSteer(carId) ?? 0).toBeGreaterThan(0.2)
    const pos = world.getComponent(carId, TransformComponent)?.position ?? [0, 0, 0]
    expect(Math.hypot(pos[0], pos[2]!)).toBeGreaterThan(0.2)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })
})
