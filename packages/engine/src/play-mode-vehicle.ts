import type { EntityId } from '@haku/core'
import { entityId } from '@haku/core'
import type { Engine } from './engine.js'
import { InputManager, type InputManagerOptions } from './input/index.js'
import { InputBindingSystem } from './systems/input-binding-system.js'
import type { PhysicsWorldSystem } from './systems/physics-world-system.js'
import { VehicleControllerSystem } from './systems/vehicle-controller-system.js'
import { VehicleVisualSyncSystem } from './systems/vehicle-visual-sync-system.js'

export interface VehiclePlayModeOptions {
  /** Explicit vehicle entity; otherwise first enabled VehicleComponent is used. */
  controlledEntityId?: EntityId | string
  /** DOM targets for {@link InputManager.attach}. */
  input?: InputManagerOptions
  /** Respawn pulse callback (T01.21 implements logic). */
  onRespawn?: (entityId: EntityId) => void
}

export interface VehiclePlayModeSession {
  inputManager: InputManager
  vehicleController: VehicleControllerSystem
  vehicleVisualSync: VehicleVisualSyncSystem
  inputBinding: InputBindingSystem
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

  const inputBinding = new InputBindingSystem(inputManager, vehicleController, {
    controlledEntity,
    onRespawn: options.onRespawn,
  })

  engine.addSystem(vehicleController)
  engine.addSystem(inputBinding)
  engine.addSystem(vehicleVisualSync)

  return {
    inputManager,
    vehicleController,
    vehicleVisualSync,
    inputBinding,
    dispose() {
      inputManager.disable()
      inputManager.detach()
      engine.removeSystem(inputBinding)
      engine.removeSystem(vehicleVisualSync)
      engine.removeSystem(vehicleController)
      inputBinding.dispose()
      vehicleVisualSync.dispose()
      vehicleController.dispose()
    },
  }
}
