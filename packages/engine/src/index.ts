export {
  Engine,
  SceneLoader,
  ThreeRenderBackend,
  RenderSyncSystem,
  PHYSICS_CATCH_UP_POLICY,
  PhysicsWorldSystem,
  PhysicsColliderSystem,
  VehicleControllerSystem,
  VehicleVisualSyncSystem,
  DynamicRaycastVisualSyncSystem,
  createDynamicRaycastWheelRestPoseResolver,
  InputManager,
  InputBindingSystem,
  inputActionsToVehicleInput,
  startVehiclePlayMode,
  ChaseCameraSystem,
  ThreeJsFollowCameraSystem,
  usesThreeJsFollowCamera,
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
  resolveColliderDescriptor,
  vehicleChassisCollider,
  computeIsaacDriveControlState,
  computeWheelVisualTransform,
  vehicleWheelConfigs,
} from './engine.js'
export type { EngineOptions, EngineFeatureFlags, LoadedScene, SceneFetch } from './engine.js'
export type { PhysicsWorldSystemOptions } from './systems/physics-world-system.js'
export type { ResolvedColliderDescriptor } from './systems/physics-collider-system.js'
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
export type { ThreeJsFollowCameraSystemOptions } from './systems/threejs-follow-camera-system.js'
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
  setDracoDecoderPath,
  clearModelCache,
  type ModelAssetResolver,
  type ModelResourceResolver,
  type ModelLoadPreparer,
} from './model-loader.js'
export { modelLog, modelLogWarn, modelLogError, modelLogUrl, sceneLog, sceneLogWarn, sceneLogError, setHakuLogSink, type HakuLogSink, type HakuLogCategory, type HakuLogLevel } from './model-log.js'
export {
  collectVehicleDebugSnapshot,
  createVehicleDebugWindowApi,
  createHttpVehicleDebugLogSink,
  VehicleDebugLogger,
  VEHICLE_DEBUG_LOG_RELATIVE_PATH,
  VEHICLE_DEBUG_LOG_HTTP_ENDPOINT,
  type VehicleDebugSnapshot,
  type VehicleDebugCollectContext,
  type VehicleDebugLogOptions,
  type VehicleDebugLogRecord,
  type VehicleDebugLogSink,
  type VehicleDebugWindowApi,
  type VehicleWheelDebugSnapshot,
  type VehicleDriveDebugSnapshot,
} from './playtest/vehicle-debug.js'
