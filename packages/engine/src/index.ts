export { Engine, SceneLoader, ThreeRenderBackend, RenderSyncSystem } from './engine.js'
export type { EngineOptions, LoadedScene } from './engine.js'
export {
  createGeometry,
  createMaterial,
  createMeshFromRenderer,
  rebuildMesh,
  updateMeshMaterial,
} from './mesh-factory.js'
