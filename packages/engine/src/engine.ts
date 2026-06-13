import type { IWorld, ISystem } from '@haku/core'
import { loadSceneDocument } from '@haku/serializer'
import type { RenderPrototype, SceneDocument, SceneMetadata } from '@haku/schema'
import { validateSceneDocument } from '@haku/schema'
import { ThreeRenderBackend } from './render-backend.js'

export interface EngineOptions {
  canvas: HTMLCanvasElement
}

export interface LoadedScene {
  world: IWorld
  prototypes: Record<string, RenderPrototype>
  metadata: SceneMetadata
  prefabs: SceneDocument['prefabs']
}

export class Engine {
  readonly backend: ThreeRenderBackend
  private world: IWorld | null = null
  private systems: ISystem[] = []
  private running = false
  private lastTime = 0
  private rafId = 0

  constructor(options: EngineOptions) {
    this.backend = new ThreeRenderBackend(options.canvas)
    this.setupResize(options.canvas)
  }

  loadWorld(world: IWorld, prototypes: Record<string, RenderPrototype> = {}, prefabs: SceneDocument['prefabs'] = {}): void {
    this.world = world
    this.backend.setPrototypes(prototypes)
    this.backend.setPrefabs(prefabs)
    this.backend.attach(world)
  }

  addSystem(system: ISystem): void {
    this.systems.push(system)
    this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  getWorld(): IWorld | null {
    return this.world
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = (time: number) => {
      if (!this.running) return
      const dt = (time - this.lastTime) / 1000
      this.lastTime = time
      this.tick(dt)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  tick(dt: number): void {
    if (this.world) {
      for (const system of this.systems) {
        system.update(this.world, dt)
      }
      this.backend.sync.update(this.world)
    }
    this.backend.render()
  }

  dispose(): void {
    this.stop()
    this.backend.detach()
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight
      this.backend.resize(width, height)
    }
    resize()
    window.addEventListener('resize', resize)
  }
}

export class SceneLoader {
  static async load(path: string): Promise<LoadedScene> {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Failed to load scene: ${path}`)
    const json = validateSceneDocument(await response.json())
    return SceneLoader.fromDocument(json)
  }

  static fromDocument(doc: SceneDocument): LoadedScene {
    return {
      world: loadSceneDocument(doc),
      prototypes: doc.prototypes,
      metadata: doc.metadata,
      prefabs: doc.prefabs,
    }
  }
}

export { ThreeRenderBackend, RenderSyncSystem } from './render-backend.js'
