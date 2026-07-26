import {
  Engine,
  SceneLoader,
  PhysicsColliderSystem,
  createEngineAssetRegistry,
  loadProjectPrefabAssets,
  startVehiclePlayMode,
  projectPathToUrl,
} from '@haku/engine/runtime'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'
import {
  MODEL_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import project from '../haku.project.json'
import { configurePlaygroundViewport } from './playground-viewport.js'

async function main() {
  const manifest = validateProjectManifest(project)
  const assets = validateProjectAssetComposition(
    manifest,
    createEngineAssetRegistry(),
  ).index
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const engine = new Engine({ canvas })
  engine.backend.setModelAssetResolver((assetId) => {
    const path = assets.path({ $ref: assetId, type: MODEL_ASSET_TYPE }, MODEL_ASSET_TYPE)
    return { path, url: projectPathToUrl(`${manifest.assetsDir}/${path}`) }
  })
  configurePlaygroundViewport(engine, canvas)

  const entryScene = assets.path(manifest.entryScene, SCENE_ASSET_TYPE)
  const prefabAssets = await loadProjectPrefabAssets(manifest)
  const loaded = await SceneLoader.load(
    projectPathToUrl(`${manifest.assetsDir}/${entryScene}`),
    undefined,
    prefabAssets,
  )
  engine.loadWorld(
    loaded.world,
    loaded.prototypes,
    loaded.prefabAssets,
    loaded.renderSettings,
    loaded.activeCameraId,
  )

  const backend = await createRapierPhysicsBackend()
  const physicsSystem = engine.setPhysicsBackend(backend)
  engine.addSystem(new PhysicsColliderSystem(physicsSystem))
  startVehiclePlayMode(engine, physicsSystem, {
    input: { pointerTarget: canvas },
  })

  engine.start()
}

void main()
