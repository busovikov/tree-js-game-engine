import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ColliderComponent,
  TransformComponent,
  PhysicsControllerComponent,
  World,
} from '@haku/core'
import { CustomRaycastControllerSchema } from '@haku/schema'
import { resetStubPhysicsIds, StubPhysicsBackend } from '@haku/physics'
import { InputManager, type PointerCaptureTarget } from '../input/input-manager.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'
import {
  InputBindingSystem,
  inputActionsToVehicleInput,
} from './input-binding-system.js'
import { PhysicsControllerSystem } from './vehicle-controller-system.js'

const INTEGRATION_DRIVE_VEHICLE = CustomRaycastControllerSchema.parse({ type: "custom-raycast", engine: { force: 800 } })

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

describe('inputActionsToVehicleInput', () => {
  it('maps throttle, steer, brake, boost, and jump', () => {
    const mapped = inputActionsToVehicleInput({
      throttle: 1,
      steer: -0.5,
      brake: true,
      boost: true,
      jump: true,
      respawn: false,
      cameraOrbitDelta: { dx: 0, dy: 0 },
      cameraZoomDelta: 0,
    })

    expect(mapped).toEqual({
      throttle: 1,
      steer: -0.5,
      brake: true,
      boost: true,
      jump: true,
      sprint: true,
    })
  })
})

describe('InputBindingSystem', () => {
  let keyboard: MockEventTarget
  let inputManager: InputManager
  let physicsSystem: PhysicsWorldSystem
  let colliderSystem: PhysicsColliderSystem
  let vehicleSystem: PhysicsControllerSystem
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
    physicsSystem = new PhysicsWorldSystem({
      fixedTimestep: 1 / 60,
      maxSubsteps: 120,
    })
    physicsSystem.setBackend(backend)
    colliderSystem = new PhysicsColliderSystem(physicsSystem)
    vehicleSystem = new PhysicsControllerSystem(physicsSystem)
    bindingSystem = new InputBindingSystem(inputManager, vehicleSystem)

    world = new World()

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

    carId = world.createEntity('Car')
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
  })

  afterEach(() => {
    bindingSystem.dispose()
    colliderSystem.dispose()
    physicsSystem.dispose()
    vehicleSystem.dispose()
    inputManager.detach()
  })

  it('binds WASD actions to VehicleControllerSystem each frame', () => {
    keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))
    keyboard.dispatch('keydown', keyEvent('KeyD', 'keydown'))
    keyboard.dispatch('keydown', keyEvent('ShiftLeft', 'keydown'))

    bindingSystem.update(world, 1 / 60)

    expect(vehicleSystem.getControllerInput(carId)).toEqual({
      throttle: 1,
      steer: 1,
      brake: false,
      boost: true,
      jump: false,
      sprint: true,
    })
  })

  it('fires onRespawn when R is pressed', () => {
    const respawns: string[] = []
    const binding = new InputBindingSystem(inputManager, vehicleSystem, {
      controlledEntity: carId,
      onRespawn: (id) => respawns.push(id.value),
    })

    keyboard.dispatch('keydown', keyEvent('KeyR', 'keydown'))
    binding.update(world, 1 / 60)

    expect(respawns).toEqual([carId.value])

    binding.dispose()
  })

  it('drives the vehicle forward through the input → controller pipeline', () => {
    keyboard.dispatch('keydown', keyEvent('KeyW', 'keydown'))

    for (let i = 0; i < 180; i++) {
      bindingSystem.update(world, 1 / 60)
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const z = world.getComponent(carId, TransformComponent)?.position[2] ?? 0
    expect(z).toBeGreaterThan(0.25)
  })

  it('applies jump pulse from Space keydown', () => {
    for (let i = 0; i < 30; i++) {
      bindingSystem.update(world, 1 / 60)
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const yBefore = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    keyboard.dispatch('keydown', keyEvent('Space', 'keydown'))
    bindingSystem.update(world, 1 / 60)
    vehicleSystem.update(world, 1 / 60)
    physicsSystem.update(world, 1 / 60)

    for (let i = 0; i < 10; i++) {
      bindingSystem.update(world, 1 / 60)
      vehicleSystem.update(world, 1 / 60)
      physicsSystem.update(world, 1 / 60)
    }

    const yAfter = world.getComponent(carId, TransformComponent)?.position[1] ?? 0
    expect(yAfter).toBeGreaterThan(yBefore + 0.05)
  })
})
