export {
  Engine,
  SceneLoader,
  ThreeRenderBackend,
  RenderSyncSystem,
  PhysicsWorldSystem,
  PhysicsColliderSystem,
  VehicleControllerSystem,
  VehicleVisualSyncSystem,
  InputManager,
  InputBindingSystem,
  inputActionsToVehicleInput,
  startVehiclePlayMode,
  ChaseCameraSystem,
  RespawnSystem,
  DEFAULT_RESPAWN_FALL_Y,
  createChaseCameraRuntimeState,
  computeChaseCameraStep,
  computeChaseCameraDesiredPose,
  applyChaseOrbitInput,
  applyChaseZoomInput,
  updateChaseOrbitSmoothing,
  resetChaseOrbitOnAccelerate,
  updateChaseAirborneBlend,
  updateChaseBoostBlend,
  lookAtQuaternion,
  normalizeAngleRadians,
  CHASE_CAMERA_OFFSET,
  CHASE_PITCH_MIN,
  CHASE_PITCH_MAX,
  CHASE_BOOST_FOV,
  colliderToPhysicsShape,
  composeColliderTransform,
  computeDriveControlState,
  computeWheelVisualTransform,
  vehicleWheelConfigs,
} from './engine.js'
export type { EngineOptions, EngineFeatureFlags, LoadedScene } from './engine.js'
export type { PhysicsWorldSystemOptions } from './systems/physics-world-system.js'
export type { VehicleInput, DriveControlContext, DriveControlState } from './systems/vehicle-controller-system.js'
export type {
  InputActions,
  InputManagerOptions,
  PointerCaptureTarget,
  DirectionalKeyAction,
} from './input/index.js'
export type { InputBindingSystemOptions } from './systems/input-binding-system.js'
export type {
  ChaseCameraOrbitState,
  ChaseCameraRuntimeState,
  ChaseCameraInput,
  ChaseCameraVehicleState,
  ChaseCameraPose,
  ChaseCameraSystemOptions,
} from './systems/chase-camera-system.js'
export type { VehiclePlayModeOptions, VehiclePlayModeSession } from './play-mode-vehicle.js'
export type { RespawnSystemOptions, SpawnPose } from './systems/respawn-system.js'
export { DEFAULT_INPUT_ACTIONS, KEY_BINDINGS } from './input/index.js'
export type { WheelVisualTransform } from './systems/vehicle-visual-sync-system.js'
export type { EditorRenderExtensions } from '@haku/core'
export {
  createGeometry,
  createMaterial,
  createMeshFromRenderer,
  rebuildMesh,
  updateMeshMaterial,
} from './mesh-factory.js'
export {
  setModelAssetResolver,
  setModelResourceResolver,
  setModelLoadPreparer,
  clearModelCache,
  type ModelAssetResolver,
  type ModelResourceResolver,
  type ModelLoadPreparer,
} from './model-loader.js'
export { modelLog, modelLogWarn, modelLogError, modelLogUrl, sceneLog, sceneLogWarn, sceneLogError, setHakuLogSink, type HakuLogSink, type HakuLogCategory, type HakuLogLevel } from './model-log.js'
