import type { IPhysicsBackend } from '@haku/physics'
import type { IWorld, ISystem } from '@haku/core'
import { entityId } from '@haku/core'
import { loadSceneDocument } from '@haku/serializer'
import type { RenderPrototype, RenderSettings, SceneDocument, SceneMetadata } from '@haku/schema'
import { defaultRenderSettings, resolveActiveCameraId, validateSceneDocument } from '@haku/schema'
import { ThreeRenderBackend } from './render-backend.js'
import {
  PhysicsWorldSystem,
  type PhysicsWorldSystemOptions,
} from './systems/physics-world-system.js'

export type { ViewportMode } from './render-backend.js'

export interface EngineFeatureFlags {
  selectionOutline?: boolean
  viewportPicking?: boolean
  hierarchyDim?: boolean
}

export interface EngineOptions {
  canvas: HTMLCanvasElement
  features?: EngineFeatureFlags
}

export interface LoadedScene {
  world: IWorld
  prototypes: Record<string, RenderPrototype>
  metadata: SceneMetadata
  prefabs: SceneDocument['prefabs']
  renderSettings: RenderSettings
  activeCameraId: string | null
}

export class Engine {
  readonly backend: ThreeRenderBackend
  private world: IWorld | null = null
  private systems: ISystem[] = []
  private physicsSystem: PhysicsWorldSystem | null = null
  private running = false
  private lastTime = 0
  private rafId = 0

  constructor(options: EngineOptions) {
    this.backend = new ThreeRenderBackend(options.canvas, options.features)
    this.setupResize(options.canvas)
  }

  loadWorld(
    world: IWorld,
    prototypes: Record<string, RenderPrototype> = {},
    prefabs: SceneDocument['prefabs'] = {},
    renderSettings?: SceneDocument['renderSettings'],
    activeCameraId?: string | null,
  ): void {
    this.world = world
    this.backend.setPrototypes(prototypes)
    this.backend.setPrefabs(prefabs)
    if (renderSettings) {
      this.backend.setRenderSettings(renderSettings)
    }
    this.backend.attach(world)
    const resolved = activeCameraId ?? null
    if (resolved) {
      this.backend.setActiveSceneCamera(entityId(resolved))
    } else {
      this.backend.setActiveSceneCamera(null)
    }
  }

  setWorld(world: IWorld): void {
    this.world = world
    this.backend.sync.update(world)
  }

  addSystem(system: ISystem): void {
    this.systems.push(system)
    this.systems.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  /**
   * Register a physics backend for play mode. Initializes the backend and adds
   * {@link PhysicsWorldSystem} to the engine tick (order 50, before render sync).
   */
  setPhysicsBackend(
    backend: IPhysicsBackend,
    options?: PhysicsWorldSystemOptions,
  ): PhysicsWorldSystem {
    this.clearPhysicsSystem()
    const system = new PhysicsWorldSystem(options)
    system.setBackend(backend)
    this.physicsSystem = system
    this.addSystem(system)
    return system
  }

  getPhysicsWorldSystem(): PhysicsWorldSystem | null {
    return this.physicsSystem
  }

  /** Remove a registered system from the engine tick. */
  removeSystem(system: ISystem): void {
    const index = this.systems.indexOf(system)
    if (index >= 0) {
      this.systems.splice(index, 1)
    }
    if (system === this.physicsSystem) {
      this.physicsSystem.dispose()
      this.physicsSystem = null
    }
  }

  /** Tear down physics backend and {@link PhysicsWorldSystem}. */
  clearPhysicsBackend(): void {
    this.clearPhysicsSystem()
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
    this.clearPhysicsSystem()
    this.backend.detach()
  }

  private clearPhysicsSystem(): void {
    if (!this.physicsSystem) {
      return
    }
    this.systems = this.systems.filter((system) => system !== this.physicsSystem)
    this.physicsSystem.dispose()
    this.physicsSystem = null
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
      renderSettings: doc.renderSettings ?? defaultRenderSettings(),
      activeCameraId: resolveActiveCameraId(doc),
    }
  }
}

export { ThreeRenderBackend, RenderSyncSystem } from './render-backend.js'
export { PhysicsWorldSystem, type PhysicsWorldSystemOptions } from './systems/physics-world-system.js'
export { PhysicsColliderSystem, colliderToPhysicsShape, composeColliderTransform } from './systems/physics-collider-system.js'
export {
  VehicleControllerSystem,
  computeDriveControlState,
  vehicleWheelConfigs,
  type VehicleInput,
  type DriveControlContext,
  type DriveControlState,
} from './systems/vehicle-controller-system.js'
