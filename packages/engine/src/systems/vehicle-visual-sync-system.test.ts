import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  ColliderComponent,
  MeshRendererComponent,
  TransformComponent,
  VehicleComponent,
  World,
} from '@haku/core'
import { VehicleSchema, MeshRendererSchema } from '@haku/schema'
import {
  resetStubPhysicsIds,
  StubPhysicsBackend,
  physicsWheelHandle,
  type PhysicsTransform,
  type Quat,
  type Vec3,
  type WheelConfig,
  type WheelState,
} from '@haku/physics'
import { RenderSyncSystem } from '../render-sync/render-sync-system.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import { VehicleControllerSystem } from './vehicle-controller-system.js'
import {
  VehicleVisualSyncSystem,
  computeWheelVisualTransform,
} from './vehicle-visual-sync-system.js'

const DEFAULT_VEHICLE = VehicleSchema.parse({})
const IDENTITY: Quat = [0, 0, 0, 1]

function wheelState(overrides: Partial<WheelState> = {}): WheelState {
  return {
    wheel: physicsWheelHandle('wheel-0'),
    inContact: true,
    contactPoint: [0, 0, 0],
    suspensionLength: 0.4,
    rotation: 0,
    steering: 0,
    engineForce: 0,
    ...overrides,
  }
}

function wheelConfig(overrides: Partial<WheelConfig> = {}): WheelConfig {
  return {
    localPosition: [-0.95, 0.35, 1.55],
    radius: 0.42,
    suspensionRestLength: 0.55,
    suspensionStiffness: 70,
    dampingRelaxation: 3.5,
    dampingCompression: 4.4,
    maxSuspensionTravel: 0.42,
    frictionSlip: 7.8,
    rollInfluence: 0.008,
    ...overrides,
  }
}

describe('computeWheelVisualTransform', () => {
  it('places wheel at rest suspension length when grounded', () => {
    const chassis: PhysicsTransform = {
      position: [0, 1, 0],
      rotation: IDENTITY,
    }
    const config = wheelConfig()
    const state = wheelState({ suspensionLength: 0.45, inContact: true })

    const visual = computeWheelVisualTransform(chassis, config, state)

    expect(visual.position[0]).toBeCloseTo(config.localPosition[0]!)
    expect(visual.position[1]).toBeCloseTo(config.localPosition[1]! - state.suspensionLength)
    expect(visual.position[2]).toBeCloseTo(config.localPosition[2]!)
  })

  it('uses rest pose when airborne instead of max travel extension', () => {
    const chassis: PhysicsTransform = {
      position: [0, 2, 0],
      rotation: IDENTITY,
    }
    const config = wheelConfig()
    const grounded = computeWheelVisualTransform(
      chassis,
      config,
      wheelState({ inContact: true, suspensionLength: 0.35 }),
    )
    const airborne = computeWheelVisualTransform(
      chassis,
      config,
      wheelState({
        inContact: false,
        suspensionLength: config.suspensionRestLength + config.maxSuspensionTravel,
      }),
    )

    expect(airborne.position[1]).toBeCloseTo(config.localPosition[1]! - config.suspensionRestLength)
    expect(airborne.position[1]).toBeLessThan(grounded.position[1])
  })

  it('applies steering yaw and spin rotation', () => {
    const chassis: PhysicsTransform = {
      position: [0, 1, 0],
      rotation: IDENTITY,
    }
    const config = wheelConfig()
    const steerAngle = 0.3
    const spin = 1.2

    const visual = computeWheelVisualTransform(
      chassis,
      config,
      wheelState({ steering: steerAngle, rotation: spin }),
    )

    expect(visual.rotation).not.toEqual(IDENTITY)
    const noSteer = computeWheelVisualTransform(
      chassis,
      config,
      wheelState({ rotation: spin }),
    )
    expect(visual.rotation).not.toEqual(noSteer.rotation)
  })
})

describe('VehicleVisualSyncSystem integration (stub)', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  function createVehicleWithWheels() {
    const backend = new StubPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({
      fixedTimestep: 1 / 60,
      maxSubsteps: 120,
    })
    physicsSystem.setBackend(backend)
    const colliderSystem = new PhysicsColliderSystem(physicsSystem)
    const vehicleSystem = new VehicleControllerSystem(physicsSystem)
    const visualSystem = new VehicleVisualSyncSystem(physicsSystem, vehicleSystem)

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

    const wheelIds = (['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const).map(
      (slot) => {
        const wheelId = world.createEntity(`wheel-${slot}`)
        world.setParent(wheelId, carId)
        world.addComponent(wheelId, TransformComponent, {
          position: [0, 0, 0],
          rotation: [0, 0, 0, 1],
          scale: [1, 1, 1],
        })
        world.addComponent(wheelId, MeshRendererComponent, MeshRendererSchema.parse({
          geometryType: 'BoxGeometry',
          geometryParams: { width: 0.3, height: 0.3, depth: 0.15 },
        }))
        return wheelId
      },
    )

    colliderSystem.bootstrap(world)

    return {
      world,
      physicsSystem,
      colliderSystem,
      vehicleSystem,
      visualSystem,
      carId,
      wheelIds,
      backend,
    }
  }

  it('syncs chassis transform from physics body', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, visualSystem, carId } =
      createVehicleWithWheels()

    for (let i = 0; i < 30; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      visualSystem.update(world)
    }

    const bodyHandle = physicsSystem.getBodyHandle(carId)
    const bodyTransform = physicsSystem.getPhysicsWorld()!.getBodyTransform(bodyHandle!)
    const entityTransform = world.getComponent(carId, TransformComponent)!

    expect(entityTransform.position).toEqual(bodyTransform.position)
    expect(entityTransform.rotation).toEqual(bodyTransform.rotation)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    visualSystem.dispose()
  })

  it('updates four wheel child transforms from raycast wheel state', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, visualSystem, carId, wheelIds } =
      createVehicleWithWheels()

    for (let i = 0; i < 30; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      visualSystem.update(world)
    }

    const raycastVehicle = vehicleSystem.getRaycastVehicle(carId)!
    const wheelStates = raycastVehicle.getWheelStates()
    expect(wheelStates).toHaveLength(4)
    expect(wheelStates.every((state) => state.inContact)).toBe(true)

    const bodyHandle = physicsSystem.getBodyHandle(carId)!
    const chassisTransform = physicsSystem.getPhysicsWorld()!.getBodyTransform(bodyHandle)

    for (let i = 0; i < 4; i++) {
      const expected = computeWheelVisualTransform(
        chassisTransform,
        {
          localPosition: [
            i % 2 === 0 ? -0.95 : 0.95,
            0.35,
            i < 2 ? 1.55 : -1.55,
          ] as Vec3,
          radius: 0.42,
          suspensionRestLength: 0.55,
          suspensionStiffness: 70,
          dampingRelaxation: 3.5,
          dampingCompression: 4.4,
          maxSuspensionTravel: 0.42,
          frictionSlip: 7.8,
          rollInfluence: 0.008,
        },
        wheelStates[i]!,
      )
      const actual = world.getComponent(wheelIds[i]!, TransformComponent)!
      expect(actual.position[0]).toBeCloseTo(expected.position[0]!)
      expect(actual.position[1]).toBeCloseTo(expected.position[1]!)
      expect(actual.position[2]).toBeCloseTo(expected.position[2]!)
    }

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    visualSystem.dispose()
  })

  it('wheel meshes track ground contact over simulated drive via RenderSyncSystem', () => {
    const { world, physicsSystem, colliderSystem, vehicleSystem, visualSystem, carId, wheelIds } =
      createVehicleWithWheels()

    const scene = new THREE.Scene()
    const renderSync = new RenderSyncSystem(scene)
    renderSync.attach(world)

    vehicleSystem.setVehicleInput(carId, { throttle: 1 })

    const initialSpin = 0

    for (let i = 0; i < 10; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      visualSystem.update(world)
      renderSync.update(world)
    }

    for (let i = 0; i < 80; i++) {
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
      visualSystem.update(world)
      renderSync.update(world)
    }

    const wheelObject = renderSync.getObject3D(wheelIds[0]!)!
    expect(wheelObject).toBeDefined()

    const wheelTransform = world.getComponent(wheelIds[0]!, TransformComponent)!
    expect(wheelObject.position.y).toBeCloseTo(wheelTransform.position[1]!)

    const raycastVehicle = vehicleSystem.getRaycastVehicle(carId)!
    const spin = raycastVehicle.getWheelStates()[0]!.rotation
    expect(Math.abs(spin)).toBeGreaterThan(Math.abs(initialSpin) + 0.01)

    const carZ = world.getComponent(carId, TransformComponent)!.position[2]
    expect(carZ).toBeGreaterThan(0.5)

    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    visualSystem.dispose()
    renderSync.detach()
  })
})
