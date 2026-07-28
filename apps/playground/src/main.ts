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
import { compileDiagnosticGraph } from '@haku/graph'
import { runDiagnosticGraphPlan } from '@haku/graph-runtime'

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
  const diagnostic = compileDiagnosticGraph()
  if (!diagnostic.plan || diagnostic.diagnostics.some((item) => item.severity === 'error')) {
    throw new Error(
      `M07 diagnostic graph failed to compile: ${diagnostic.diagnostics
        .map((item) => item.message)
        .join('; ')}`,
    )
  }
  const diagnosticRun = runDiagnosticGraphPlan(diagnostic.plan, loaded.world)
  console.info(
    `[haku] M07 graph plan ${diagnosticRun.planFingerprint} reached the playground world`,
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
