import {
  Engine,
  SceneLoader,
  PHYSICS_CATCH_UP_POLICY,
  PhysicsColliderSystem,
  startVehiclePlayMode,
  projectPathToUrl,
} from '@haku/engine/runtime'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'
import {
  MODEL_ASSET_TYPE,
  ProjectAssetIndex,
  SCENE_ASSET_TYPE,
  validateProjectManifest,
} from '@haku/assets'
import project from '../haku.project.json'
import { configurePlaygroundViewport } from './playground-viewport.js'

async function main() {
  const manifest = validateProjectManifest(project)
  const assets = new ProjectAssetIndex(manifest)
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const engine = new Engine({ canvas })
  engine.backend.setModelAssetResolver((assetId) => {
    const path = assets.path({ $ref: assetId, type: MODEL_ASSET_TYPE }, MODEL_ASSET_TYPE)
    return { path, url: projectPathToUrl(`${manifest.assetsDir}/${path}`) }
  })
  configurePlaygroundViewport(engine, canvas)

  const entryScene = assets.path(manifest.entryScene, SCENE_ASSET_TYPE)
  const loaded = await SceneLoader.load(projectPathToUrl(`${manifest.assetsDir}/${entryScene}`))
  engine.loadWorld(
    loaded.world,
    loaded.prototypes,
    loaded.prefabs,
    loaded.renderSettings,
    loaded.activeCameraId,
  )

  const backend = await createRapierPhysicsBackend()
  const physicsSystem = engine.setPhysicsBackend(backend, PHYSICS_CATCH_UP_POLICY)
  engine.addSystem(new PhysicsColliderSystem(physicsSystem))
  startVehiclePlayMode(engine, physicsSystem, {
    input: { pointerTarget: canvas },
  })

  engine.start()
}

void main()
