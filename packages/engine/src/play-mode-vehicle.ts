import type { EntityId } from '@haku/core'
import { entityId } from '@haku/core'
import type { Engine } from './engine.js'
import { InputManager, type InputManagerOptions } from './input/index.js'
import { ChaseCameraSystem } from './systems/chase-camera-system.js'
import { ThreeJsFollowCameraSystem, usesThreeJsFollowCamera } from './systems/threejs-follow-camera-system.js'
import { InputBindingSystem } from './systems/input-binding-system.js'
import type { PhysicsWorldSystem } from './systems/physics-world-system.js'
import { RespawnSystem } from './systems/respawn-system.js'
import { PhysicsControllerSystem } from './systems/physics-controller-system.js'
import { PointerControlsSystem } from './systems/pointer-controls-system.js'
import { VehicleVisualSyncSystem } from './systems/vehicle-visual-sync-system.js'
import { DynamicRaycastVisualSyncSystem } from './systems/dynamic-raycast-visual-sync-system.js'

export interface VehiclePlayModeOptions {
  /** Explicit vehicle entity; otherwise first enabled PhysicsControllerComponent is used. */
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
  controllerSystem: PhysicsControllerSystem
  pointerControls: PointerControlsSystem
  vehicleVisualSync: VehicleVisualSyncSystem
  dynamicRaycastVisualSync: DynamicRaycastVisualSyncSystem
  inputBinding: InputBindingSystem
  chaseCamera?: ChaseCameraSystem
  threeJsFollowCamera?: ThreeJsFollowCameraSystem
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

  const pointerTarget =
    (options.input?.pointerTarget as HTMLElement | undefined) ??
    (typeof document !== 'undefined' ? document.body : undefined)

  const controllerSystem = new PhysicsControllerSystem(physicsSystem)
  const pointerControls = new PointerControlsSystem(physicsSystem, {
    pointerTarget,
  })
  if (pointerTarget) {
    pointerControls.attachPointerTarget(pointerTarget)
  }
  const vehicleVisualSync = new VehicleVisualSyncSystem(physicsSystem, controllerSystem)
  const dynamicRaycastVisualSync = new DynamicRaycastVisualSyncSystem(
    physicsSystem,
    controllerSystem,
  )
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

  const respawnSystem = new RespawnSystem(physicsSystem, controllerSystem, {
    controlledEntity,
    fallThresholdY: options.respawnFallThresholdY,
  })
  const inputBinding = new InputBindingSystem(inputManager, controllerSystem, {
    controlledEntity,
    onRespawn: (id) => {
      dynamicRaycastVisualSync.clearVehicleCache(id)
      respawnSystem.requestRespawn(id)
      options.onRespawn?.(id)
    },
  })

  const world = engine.getWorld()
  const useThreeJsCamera = world != null && usesThreeJsFollowCamera(world, controlledEntity)

  let chaseCamera: ChaseCameraSystem | undefined
  let threeJsFollowCamera: ThreeJsFollowCameraSystem | undefined

  if (useThreeJsCamera) {
    threeJsFollowCamera = new ThreeJsFollowCameraSystem({
      controlledEntity,
      cameraEntityId: cameraEntity,
      physicsSystem,
    })
  } else {
    chaseCamera = new ChaseCameraSystem(inputManager, physicsSystem, controllerSystem, {
      controlledEntity,
      cameraEntityId: cameraEntity,
    })
  }

  engine.addSystem(pointerControls)
  engine.addSystem(controllerSystem)
  engine.addSystem(inputBinding)
  engine.addSystem(respawnSystem)
  engine.addSystem(vehicleVisualSync)
  engine.addSystem(dynamicRaycastVisualSync)
  if (threeJsFollowCamera) {
    engine.addSystem(threeJsFollowCamera)
  } else if (chaseCamera) {
    engine.addSystem(chaseCamera)
  }

  return {
    inputManager,
    controllerSystem,
    pointerControls,
    vehicleVisualSync,
    dynamicRaycastVisualSync,
    inputBinding,
    chaseCamera,
    threeJsFollowCamera,
    respawnSystem,
    dispose() {
      inputManager.disable()
      inputManager.detach()
      if (chaseCamera) {
        engine.removeSystem(chaseCamera)
        chaseCamera.dispose()
      }
      if (threeJsFollowCamera) {
        engine.removeSystem(threeJsFollowCamera)
        threeJsFollowCamera.dispose()
      }
      engine.removeSystem(dynamicRaycastVisualSync)
      engine.removeSystem(vehicleVisualSync)
      engine.removeSystem(respawnSystem)
      engine.removeSystem(inputBinding)
      engine.removeSystem(controllerSystem)
      engine.removeSystem(pointerControls)
      respawnSystem.dispose()
      inputBinding.dispose()
      dynamicRaycastVisualSync.dispose()
      vehicleVisualSync.dispose()
      controllerSystem.dispose()
      pointerControls.dispose()
    },
  }
}
