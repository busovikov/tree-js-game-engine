import {
  Engine,
  SceneLoader,
  PHYSICS_CATCH_UP_POLICY,
  PhysicsColliderSystem,
  startVehiclePlayMode,
  projectPathToUrl,
} from '@haku/engine/runtime'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'
import project from '../haku.project.json'

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const engine = new Engine({ canvas })

  const loaded = await SceneLoader.load(projectPathToUrl(project.entryScene))
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
