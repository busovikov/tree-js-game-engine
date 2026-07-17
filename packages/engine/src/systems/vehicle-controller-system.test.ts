import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  ColliderComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import {
  CustomRaycastControllerSchema,
  RevoluteJointVehicleControllerSchema,
  ColliderSchema,
} from '@haku/schema'
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
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [30, 0.1, 30],
    }))

    const carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 1.05, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
    }))
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
      customRaycast: {
        tracked: Map<
          string,
          {
            vehicle: IRaycastVehicle
            wheels: typeof wheels
            currentSteer: number
          }
        >
      }
    }
    internals.bootstrapped = true
    internals.customRaycast.tracked.set(carId.value, {
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
          hubBody: { value: 'steer-hub' },
          hubShape: { value: 'steer-hub-shape' },
          suspensionJoint: { value: 'steer-susp-joint' } as PhysicsJointHandle,
          rollJoint: { value: 'steer-roll-joint' } as PhysicsJointHandle,
          steerJoint,
          knuckleBody: { value: 'steer-knuckle' },
          knuckleShape: { value: 'steer-knuckle-shape' },
          isSteered: true,
          isDriven: false,
        },
        {
          wheelBody: { value: 'drive-body' },
          wheelShape: { value: 'drive-shape' },
          hubBody: { value: 'drive-hub' },
          hubShape: { value: 'drive-hub-shape' },
          suspensionJoint: { value: 'drive-susp-joint' } as PhysicsJointHandle,
          driveJoint,
          isSteered: false,
          isDriven: true,
        },
      ],
      steerAngle: 0.5,
      steerStiffness: 100,
      steerDamping: 10,
    }
    const internals = vehicleSystem as unknown as {
      customRaycast: { tracked: Map<string, unknown> }
      dynamicRaycast: { tracked: Map<string, unknown> }
      registry: { get(type: string): { tracked: Map<string, unknown> } | undefined }
    }
    internals.customRaycast.tracked.set(id.value, custom)
    internals.dynamicRaycast.tracked.set(id.value, dynamic)
    internals.registry.get('arcade-vehicle')?.tracked.set(id.value, arcade)
    internals.registry.get('kinematic-character')?.tracked.set(id.value, character)
    internals.registry.get('revolute-joint-vehicle')?.tracked.set(id.value, revolute)
    vehicleSystem.setControllerInput(id, { throttle: 1, jump: true })

    vehicleSystem.resetControllerState(world, id)

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
    // Reset zeroes the tracked steer angle. (Body re-seat/rebuild only runs when a real chassis body
    // exists; here the entity has no physics body, so the reset stops after clearing tracked state.)
    expect(revolute.steerAngle).toBe(0)
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
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [30, 0.1, 30],
    }))

    const carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 1.05, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
    }))
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
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [30, 0.1, 30],
    }))

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

  it('runs a revolute-joint vehicle without exploding into NaN (unreachable regression)', async () => {
    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 120 })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new PhysicsControllerSystem(physicsSystem)

    const world = new World()
    const groundId = world.createEntity('Ground')
    world.addComponent(groundId, TransformComponent, {
      position: [0, -2, 0],
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
    })
    world.addComponent(groundId, ColliderComponent, ColliderSchema.parse({
      shape: 'box',
      halfExtents: [75, 1, 75],
    }))

    const carId = world.createEntity('RevoluteVehicle')
    world.addComponent(carId, TransformComponent, {
      position: [0, 1, 0],
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
    })
    // Exact params from apps/playground/.../isaac/revolute-joint-vehicle.scene.json.
    world.addComponent(
      carId,
      PhysicsControllerComponent,
      RevoluteJointVehicleControllerSchema.parse({
        type: 'revolute-joint-vehicle',
        chassis: { mass: 5, halfExtents: [1.75, 0.25, 0.75], lift: 0, angularDamping: 0.35, inertiaScale: 3 },
        wheels: [
          { axlePosition: [-1.2, -0.6, 0.7], wheelPosition: [-1.2, -0.6, 1], isSteered: true, isDriven: false },
          { axlePosition: [-1.2, -0.6, -0.7], wheelPosition: [-1.2, -0.6, -1], isSteered: true, isDriven: false },
          { axlePosition: [1.2, -0.6, 0.7], wheelPosition: [1.2, -0.6, 1], isSteered: false, isDriven: true },
          { axlePosition: [1.2, -0.6, -0.7], wheelPosition: [1.2, -0.6, -1], isSteered: false, isDriven: true },
        ],
        wheelRadius: 0.2,
        wheelHalfHeight: 0.15,
        wheelMass: 0.25,
        drivenTargetVelocity: 30,
        drivenFactor: 10,
        steerAngle: 0.6,
        steerStiffness: 100,
        steerDamping: 10,
      }),
    )

    colliderSystem.bootstrap(world)
    vehicleSystem.bootstrap(world)

    const wheelBodies = vehicleSystem.getRevoluteWheelBodies(carId)
    expect(wheelBodies).toHaveLength(4)

    vehicleSystem.setVehicleInput(carId, { throttle: 1 })
    expect(() => {
      for (let i = 0; i < 150; i++) {
        vehicleSystem.update(world, 1 / 60)
        physicsSystem.update(world, 1 / 60)
      }
    }).not.toThrow()

    const pos = world.getComponent(carId, TransformComponent)?.position ?? [0, 0, 0]
    expect(pos.every((n) => Number.isFinite(n))).toBe(true)
    // The vehicle should settle on the ground, not sink or fling away.
    expect(pos[1]).toBeGreaterThan(-2)
    expect(pos[1]).toBeLessThan(10)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
  })
})
