import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  TransformComponent,
  VehicleComponent,
  World,
} from '@haku/core'
import { VehicleSchema } from '@haku/schema'
import type { Quat, Vec3 } from '@haku/schema'
import { resetStubPhysicsIds, StubPhysicsBackend } from '@haku/physics'
import { InputManager, type PointerCaptureTarget } from '../input/input-manager.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import { InputBindingSystem } from './input-binding-system.js'
import {
  DEFAULT_RESPAWN_FALL_Y,
  RespawnSystem,
} from './respawn-system.js'
import { VehicleControllerSystem } from './vehicle-controller-system.js'

const DEFAULT_VEHICLE = VehicleSchema.parse({})
const IDENTITY_ROTATION: Quat = [0, 0, 0, 1]

type Listener = (event: unknown) => void

class MockEventTarget {
  private listeners = new Map<string, Set<Listener>>()

  addEventListener(type: string, listener: Listener, _options?: unknown): void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(listener)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: unknown): void {
    const set = this.listeners.get(type)
    if (!set) return
    for (const listener of [...set]) {
      listener(event)
    }
  }
}

function keyEvent(code: string, type: 'keydown' | 'keyup', repeat = false) {
  return {
    code,
    repeat,
    preventDefault: () => {},
    target: null,
    type,
  }
}

describe('RespawnSystem', () => {
  let physicsSystem: PhysicsWorldSystem
  let colliderSystem: PhysicsColliderSystem
  let vehicleController: VehicleControllerSystem
  let respawnSystem: RespawnSystem
  let world: World
  let carId: ReturnType<World['createEntity']>
  const spawnPosition: Vec3 = [2, 5, -3]
  const spawnRotation: Quat = [0, 0.707, 0, 0.707]

  beforeEach(() => {
    resetStubPhysicsIds()
    const backend = new StubPhysicsBackend()
    physicsSystem = new PhysicsWorldSystem()
    physicsSystem.setBackend(backend)
    colliderSystem = new PhysicsColliderSystem(physicsSystem)
    vehicleController = new VehicleControllerSystem(physicsSystem)
    respawnSystem = new RespawnSystem(physicsSystem, vehicleController, {
      fallThresholdY: DEFAULT_RESPAWN_FALL_Y,
    })

    world = new World()
    carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [...spawnPosition],
      rotation: [...spawnRotation],
      scale: [1, 1, 1],
    })
    world.addComponent(carId, VehicleComponent, DEFAULT_VEHICLE)
    world.addComponent(carId, ColliderComponent, {
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

    colliderSystem.bootstrap(world)
    vehicleController.bootstrap(world)
    respawnSystem.update(world, 1 / 60)
  })

  afterEach(() => {
    respawnSystem.dispose()
    vehicleController.dispose()
    colliderSystem.dispose()
    physicsSystem.dispose()
  })

  it('captures spawn pose from initial transform', () => {
    const spawn = respawnSystem.getSpawnPose(carId)
    expect(spawn?.position).toEqual(spawnPosition)
    expect(spawn?.rotation).toEqual(spawnRotation)
  })

  it('respawns when vehicle falls below Y threshold', () => {
    const body = physicsSystem.getBodyHandle(carId)
    expect(body).toBeTruthy()
    if (!body) return

    const physicsWorld = physicsSystem.getPhysicsWorld()
    expect(physicsWorld).toBeTruthy()
    if (!physicsWorld) return

    physicsWorld.setBodyTransform(body, {
      position: [0, DEFAULT_RESPAWN_FALL_Y - 5, 0],
      rotation: [0, 0, 0, 1],
    })
    physicsSystem.setBodyLinearVelocity(carId, [12, -30, 4])

    respawnSystem.update(world, 1 / 60)

    const transform = world.getComponent(carId, TransformComponent)
    expect(transform?.position[0]).toBeCloseTo(spawnPosition[0])
    expect(transform?.position[1]).toBeCloseTo(spawnPosition[1])
    expect(transform?.position[2]).toBeCloseTo(spawnPosition[2])
    expect(transform?.rotation).toEqual(spawnRotation)
    expect(physicsSystem.getBodyLinearVelocity(carId)).toEqual([0, 0, 0])
    expect(vehicleController.getCurrentSteer(carId)).toBe(0)
  })

  it('manual requestRespawn resets to spawn transform and clears vehicle state', () => {
    const body = physicsSystem.getBodyHandle(carId)
    expect(body).toBeTruthy()
    if (!body) return

    const physicsWorld = physicsSystem.getPhysicsWorld()
    expect(physicsWorld).toBeTruthy()
    if (!physicsWorld) return

    physicsWorld.setBodyTransform(body, {
      position: [20, 1, -8],
      rotation: [0, 0, 0, 1],
    })
    physicsSystem.setBodyLinearVelocity(carId, [5, 2, -1])
    vehicleController.setVehicleInput(carId, { steer: 1, throttle: 1 })
    vehicleController.update(world, 1 / 60)
    expect(vehicleController.getCurrentSteer(carId)).not.toBe(0)

    respawnSystem.requestRespawn(carId)
    respawnSystem.update(world, 1 / 60)

    const transform = world.getComponent(carId, TransformComponent)
    expect(transform?.position).toEqual(spawnPosition)
    expect(transform?.rotation).toEqual(spawnRotation)
    expect(physicsSystem.getBodyLinearVelocity(carId)).toEqual([0, 0, 0])
    expect(vehicleController.getCurrentSteer(carId)).toBe(0)
    expect(vehicleController.getVehicleInput(carId)).toBeUndefined()
  })
})

describe('RespawnSystem + InputBindingSystem', () => {
  let keyboard: MockEventTarget
  let inputManager: InputManager
  let physicsSystem: PhysicsWorldSystem
  let colliderSystem: PhysicsColliderSystem
  let vehicleController: VehicleControllerSystem
  let respawnSystem: RespawnSystem
  let bindingSystem: InputBindingSystem
  let world: World
  let carId: ReturnType<World['createEntity']>

  beforeEach(() => {
    resetStubPhysicsIds()
    keyboard = new MockEventTarget()
    inputManager = new InputManager({
      keyboardTarget: keyboard as unknown as EventTarget,
      pointerTarget: keyboard as unknown as PointerCaptureTarget,
    })
    inputManager.attach()
    inputManager.enable()

    const backend = new StubPhysicsBackend()
    physicsSystem = new PhysicsWorldSystem()
    physicsSystem.setBackend(backend)
    colliderSystem = new PhysicsColliderSystem(physicsSystem)
    vehicleController = new VehicleControllerSystem(physicsSystem)
    respawnSystem = new RespawnSystem(physicsSystem, vehicleController)
    bindingSystem = new InputBindingSystem(inputManager, vehicleController, {
      onRespawn: (id) => respawnSystem.requestRespawn(id),
    })

    world = new World()
    carId = world.createEntity('Car')
    world.addComponent(carId, TransformComponent, {
      position: [0, 8, 0],
      rotation: IDENTITY_ROTATION,
      scale: [1, 1, 1],
    })
    world.addComponent(carId, VehicleComponent, DEFAULT_VEHICLE)
    world.addComponent(carId, ColliderComponent, {
      shape: 'box',
      halfExtents: [0.9, 0.3, 1.55],
      isStatic: false,
      offset: [0, 0, 0],
      rotation: [0, 0, 0, 1],
    })

    colliderSystem.bootstrap(world)
    vehicleController.bootstrap(world)
    respawnSystem.update(world, 1 / 60)
  })

  afterEach(() => {
    bindingSystem.dispose()
    respawnSystem.dispose()
    vehicleController.dispose()
    colliderSystem.dispose()
    physicsSystem.dispose()
    inputManager.detach()
  })

  it('R key pulse triggers respawn via onRespawn hook', () => {
    const body = physicsSystem.getBodyHandle(carId)
    expect(body).toBeTruthy()
    if (!body) return

    const physicsWorld = physicsSystem.getPhysicsWorld()
    expect(physicsWorld).toBeTruthy()
    if (!physicsWorld) return

    physicsWorld.setBodyTransform(body, {
      position: [15, 2, 4],
      rotation: [0, 0, 0, 1],
    })

    keyboard.dispatch('keydown', keyEvent('KeyR', 'keydown'))
    bindingSystem.update(world, 1 / 60)
    respawnSystem.update(world, 1 / 60)

    const transform = world.getComponent(carId, TransformComponent)
    expect(transform?.position).toEqual([0, 8, 0])
    expect(transform?.rotation).toEqual(IDENTITY_ROTATION)
  })
})
