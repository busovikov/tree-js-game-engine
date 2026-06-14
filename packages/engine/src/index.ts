export { Engine, SceneLoader, ThreeRenderBackend, RenderSyncSystem } from './engine.js'
export type { EngineOptions, LoadedScene } from './engine.js'
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
