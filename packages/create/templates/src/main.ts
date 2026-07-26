import {
  Engine,
  SceneLoader,
  createEngineAssetRegistry,
  loadProjectPrefabAssets,
  projectPathToUrl,
} from '@haku/engine/runtime'
import {
  MODEL_ASSET_TYPE,
  SCENE_ASSET_TYPE,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import project from '../haku.project.json'

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
  engine.start()
}

void main()
