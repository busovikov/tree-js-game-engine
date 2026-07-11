import type { EntityId } from '@haku/core'
import { entityId } from '@haku/core'
import type { Engine } from './engine.js'
import { InputManager, type InputManagerOptions } from './input/index.js'
import { ChaseCameraSystem } from './systems/chase-camera-system.js'
import { InputBindingSystem } from './systems/input-binding-system.js'
import type { PhysicsWorldSystem } from './systems/physics-world-system.js'
import { RespawnSystem } from './systems/respawn-system.js'
import { VehicleControllerSystem } from './systems/vehicle-controller-system.js'
import { VehicleVisualSyncSystem } from './systems/vehicle-visual-sync-system.js'

export interface VehiclePlayModeOptions {
  /** Explicit vehicle entity; otherwise first enabled VehicleComponent is used. */
  controlledEntityId?: EntityId | string
  /** Scene camera entity; otherwise first enabled CameraComponent is used. */
  cameraEntityId?: EntityId | string
  /** DOM targets for {@link InputManager.attach}. */
  input?: InputManagerOptions
  /** Y threshold for automatic fall respawn. Default: -20. */
  respawnFallThresholdY?: number
  /** Optional hook after built-in respawn runs. */
  onRespawn?: (entityId: EntityId) => void
}

export interface VehiclePlayModeSession {
  inputManager: InputManager
  vehicleController: VehicleControllerSystem
  vehicleVisualSync: VehicleVisualSyncSystem
  inputBinding: InputBindingSystem
  chaseCamera: ChaseCameraSystem
  respawnSystem: RespawnSystem
  dispose(): void
}

/**
 * Registers vehicle controller, visual sync, and input binding for play mode.
 * Caller must already have {@link PhysicsWorldSystem} and colliders on the engine.
 */
export function startVehiclePlayMode(
  engine: Engine,
  physicsSystem: PhysicsWorldSystem,
  options: VehiclePlayModeOptions = {},
): VehiclePlayModeSession {
  const inputManager = new InputManager(options.input)
  inputManager.attach(options.input)
  inputManager.enable()

  const vehicleController = new VehicleControllerSystem(physicsSystem)
  const vehicleVisualSync = new VehicleVisualSyncSystem(physicsSystem, vehicleController)
  const controlledEntity =
    options.controlledEntityId != null
      ? typeof options.controlledEntityId === 'string'
        ? entityId(options.controlledEntityId)
        : options.controlledEntityId
      : null
  const cameraEntity =
    options.cameraEntityId != null
      ? typeof options.cameraEntityId === 'string'
        ? entityId(options.cameraEntityId)
        : options.cameraEntityId
      : null

  const respawnSystem = new RespawnSystem(physicsSystem, vehicleController, {
    controlledEntity,
    fallThresholdY: options.respawnFallThresholdY,
  })
  const inputBinding = new InputBindingSystem(inputManager, vehicleController, {
    controlledEntity,
    onRespawn: (id) => {
      respawnSystem.requestRespawn(id)
      options.onRespawn?.(id)
    },
  })
  const chaseCamera = new ChaseCameraSystem(inputManager, physicsSystem, vehicleController, {
    controlledEntity,
    cameraEntityId: cameraEntity,
  })

  engine.addSystem(vehicleController)
  engine.addSystem(inputBinding)
  engine.addSystem(respawnSystem)
  engine.addSystem(vehicleVisualSync)
  engine.addSystem(chaseCamera)

  return {
    inputManager,
    vehicleController,
    vehicleVisualSync,
    inputBinding,
    chaseCamera,
    respawnSystem,
    dispose() {
      inputManager.disable()
      inputManager.detach()
      engine.removeSystem(chaseCamera)
      engine.removeSystem(vehicleVisualSync)
      engine.removeSystem(respawnSystem)
      engine.removeSystem(inputBinding)
      engine.removeSystem(vehicleController)
      chaseCamera.dispose()
      respawnSystem.dispose()
      inputBinding.dispose()
      vehicleVisualSync.dispose()
      vehicleController.dispose()
    },
  }
}
