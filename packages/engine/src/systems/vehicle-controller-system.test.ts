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
  computeIsaacDriveControlState,
  vehicleWheelConfigs,
} from './vehicle-controller-system.js'

const DEFAULT_VEHICLE = CustomRaycastControllerSchema.parse({ type: 'custom-raycast' })
const INTEGRATION_DRIVE_VEHICLE = CustomRaycastControllerSchema.parse({
  type: 'custom-raycast',
  engine: { force: 800 },
})
const IDENTITY_ROTATION: Quat = [0, 0, 0, 1]

describe('computeIsaacDriveControlState', () => {
  it('matches sketch maxForce/maxSteer/maxBrake (1:1 port, no speed cap, no jump)', () => {
    const vehicle = CustomRaycastControllerSchema.parse({
      type: 'custom-raycast',
      engine: { force: 30 },
      steering: { maxSteer: 10 },
      brakes: { brakeForce: 2 },
    })
    const drive = computeIsaacDriveControlState({
      vehicle,
      input: { throttle: 1, steer: 1, brake: true },
    })
    expect(drive.engineForce).toBe(-30)
    expect(drive.currentSteer).toBe(10)
    expect(drive.brake).toBe(2)

    const reverse = computeIsaacDriveControlState({
      vehicle,
      input: { throttle: -1 },
    })
    expect(reverse.engineForce).toBe(30)
  })

  it('applies RWD engine force proportional to throttle', () => {
    const state = computeIsaacDriveControlState({
      vehicle: DEFAULT_VEHICLE,
      input: { throttle: 1 },
    })
    expect(state.engineForce).toBe(-DEFAULT_VEHICLE.engine.force)
  })

  it('does not apply brake or engine force when input is neutral', () => {
    const state = computeIsaacDriveControlState({ vehicle: DEFAULT_VEHICLE, input: {} })
    expect(state.brake).toBe(0)
    expect(state.engineForce).toBe(0)
    expect(state.currentSteer).toBe(0)
  })

  it('steers instantly to steerInput × maxSteer (no smoothing, per reference sketch)', () => {
    const state = computeIsaacDriveControlState({
      vehicle: DEFAULT_VEHICLE,
      input: { steer: 1 },
    })
    expect(state.currentSteer).toBe(DEFAULT_VEHICLE.steering.maxSteer)
  })

  it('applies brake force when brake input is held', () => {
    const state = computeIsaacDriveControlState({
      vehicle: DEFAULT_VEHICLE,
      input: { brake: true },
    })
    expect(state.brake).toBe(DEFAULT_VEHICLE.brakes.brakeForce)
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
        }
      >
    }
    internals.bootstrapped = true
    internals.customRaycast.set(carId.value, {
      vehicle,
      wheels,
      currentSteer: 0.4,
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
