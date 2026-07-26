import { Engine, SceneLoader, projectPathToUrl } from '@haku/engine/runtime'
import {
  MODEL_ASSET_TYPE,
  ProjectAssetIndex,
  SCENE_ASSET_TYPE,
  validateProjectManifest,
} from '@haku/assets'
import project from '../haku.project.json'

async function main() {
  const manifest = validateProjectManifest(project)
  const assets = new ProjectAssetIndex(manifest)
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const engine = new Engine({ canvas })
  engine.backend.setModelAssetResolver((assetId) => {
    const path = assets.path({ $ref: assetId, type: MODEL_ASSET_TYPE }, MODEL_ASSET_TYPE)
    return { path, url: projectPathToUrl(`${manifest.assetsDir}/${path}`) }
  })

  const entryScene = assets.path(manifest.entryScene, SCENE_ASSET_TYPE)
  const loaded = await SceneLoader.load(projectPathToUrl(`${manifest.assetsDir}/${entryScene}`))
  engine.loadWorld(
    loaded.world,
    loaded.prototypes,
    loaded.prefabs,
    loaded.renderSettings,
    loaded.activeCameraId,
  )
  engine.start()
}

void main()
