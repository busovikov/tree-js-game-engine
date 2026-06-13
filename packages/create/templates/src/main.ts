import { Engine, SceneLoader } from '@haku/engine/runtime'
import project from '../haku.project.json'

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement
  const engine = new Engine({ canvas })

  const loaded = await SceneLoader.load(`/${project.entryScene}`)
  engine.loadWorld(loaded.world, loaded.prototypes, loaded.prefabs)
  engine.start()
}

void main()
