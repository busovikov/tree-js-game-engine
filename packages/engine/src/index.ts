export {
  Engine,
  SceneLoader,
  ThreeRenderBackend,
  RenderSyncSystem,
  PhysicsWorldSystem,
  PhysicsColliderSystem,
  VehicleControllerSystem,
  VehicleVisualSyncSystem,
  colliderToPhysicsShape,
  composeColliderTransform,
  computeDriveControlState,
  computeWheelVisualTransform,
  vehicleWheelConfigs,
} from './engine.js'
export type { EngineOptions, EngineFeatureFlags, LoadedScene } from './engine.js'
export type { PhysicsWorldSystemOptions } from './systems/physics-world-system.js'
export type { VehicleInput, DriveControlContext, DriveControlState } from './systems/vehicle-controller-system.js'
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
