import type { IPhysicsBackend } from '@haku/physics'
import {
  EngineScheduler,
  entityId,
  type EngineSchedulerOptions,
  type ISystem,
  type IWorld,
} from '@haku/core'
import { loadSceneDocument } from '@haku/serializer'
import type {
  AssetId,
  PrefabDefinition,
  RenderPrototype,
  RenderSettings,
  SceneDocument,
  SceneMetadata,
} from '@haku/schema'
import { defaultPhysicsProjectSettings, defaultRenderSettings, validateSceneDocument } from '@haku/schema'
import { ThreeRenderBackend } from './render-backend.js'
import { resolveActiveCameraId } from './scene-camera.js'
import { createEngineComponentRegistry } from './components.js'
import {
  PhysicsWorldSystem,
  type PhysicsWorldSystemOptions,
} from './systems/physics-world-system.js'
import {
  PresentationEffectsService,
  type ThreePresentationEffectsOptions,
} from './presentation-effects.js'

export type { ViewportMode } from './render-backend.js'

export interface EngineFeatureFlags {
  viewportPicking?: boolean
}

export interface EngineOptions {
  canvas: HTMLCanvasElement
  features?: EngineFeatureFlags
  scheduler?: EngineSchedulerOptions
}

export const ENGINE_SCHEDULER_POLICY: Readonly<Required<EngineSchedulerOptions>> =
  Object.freeze({
    fixedTimestep: 1 / 60,
    maxSubsteps: 3,
    maxFrameDelta: 3 / 60,
  })

export interface LoadedScene {
  world: IWorld
  prototypes: Record<string, RenderPrototype>
  metadata: SceneMetadata
  prefabAssets: ReadonlyMap<AssetId, PrefabDefinition>
  renderSettings: RenderSettings
  physicsSettings: SceneDocument['physicsSettings']
  activeCameraId: string | null
}

export class Engine {
  readonly backend: ThreeRenderBackend
  readonly scheduler: EngineScheduler
  private world: IWorld | null = null
  private physicsSystem: PhysicsWorldSystem | null = null
  private readonly renderSystem: ISystem
  private running = false
  private lastTime = 0
  private rafId = 0
  private resizeHandler: (() => void) | null = null

  constructor(options: EngineOptions) {
    this.backend = new ThreeRenderBackend(options.canvas, options.features)
    this.scheduler = new EngineScheduler(options.scheduler ?? ENGINE_SCHEDULER_POLICY)
    this.renderSystem = {
      phase: 'Render',
      update: () => this.backend.render(),
    }
    this.scheduler.addSystem(this.backend.sync)
    this.scheduler.addSystem(this.renderSystem)
    this.setupResize(options.canvas)
  }

  loadWorld(
    world: IWorld,
    prototypes: Record<string, RenderPrototype> = {},
    prefabAssets: ReadonlyMap<AssetId, PrefabDefinition> = new Map(),
    renderSettings?: SceneDocument['renderSettings'],
    activeCameraId?: string | null,
  ): void {
    this.world = world
    this.scheduler.resetTime()
    this.physicsSystem?.resetPresentationPoses()
    this.backend.setPrototypes(prototypes)
    this.backend.setPrefabs(prefabAssets)
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
    this.scheduler.resetTime()
    this.physicsSystem?.resetPresentationPoses()
    this.backend.sync.update(world)
  }

  addSystem(system: ISystem): void {
    this.scheduler.addSystem(system)
  }

  createPresentationEffects(
    options: ThreePresentationEffectsOptions,
  ): PresentationEffectsService {
    const effects = new PresentationEffectsService(
      this.backend.createPresentationEffectsBackend(options),
    )
    this.addSystem(effects)
    return effects
  }

  /**
   * Register a physics backend for play mode. Initializes the backend and adds
   * {@link PhysicsWorldSystem} to the scheduler's sole PhysicsStep phase.
   */
  setPhysicsBackend(
    backend: IPhysicsBackend,
    options?: PhysicsWorldSystemOptions,
  ): PhysicsWorldSystem {
    this.clearPhysicsSystem()
    const system = new PhysicsWorldSystem(options)
    system.setBackend(backend)
    system.setPresentationAlphaProvider(() => this.scheduler.interpolationAlpha)
    this.physicsSystem = system
    this.backend.sync.setPresentationTransformResolver((id, source) =>
      system.resolvePresentationTransform(id, source),
    )
    this.addSystem(system)
    return system
  }

  getPhysicsWorldSystem(): PhysicsWorldSystem | null {
    return this.physicsSystem
  }

  /** Remove a registered system from the engine tick. */
  removeSystem(system: ISystem): void {
    this.scheduler.removeSystem(system)
    if (system === this.physicsSystem) {
      this.physicsSystem.dispose()
      this.physicsSystem = null
      this.backend.sync.setPresentationTransformResolver(null)
    }
  }

  /** Tear down physics backend and {@link PhysicsWorldSystem}. */
  clearPhysicsBackend(): void {
    this.clearPhysicsSystem()
  }

  getWorld(): IWorld | null {
    return this.world
  }

  setPaused(paused: boolean): void {
    this.scheduler.setPaused(paused)
  }

  requestSingleStep(): void {
    this.scheduler.requestSingleStep()
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
      this.scheduler.runFrame(this.world, dt)
      return
    }
    this.backend.render()
  }

  dispose(): void {
    this.stop()
    this.clearPhysicsSystem()
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
      this.resizeHandler = null
    }
    this.backend.detach()
  }

  private clearPhysicsSystem(): void {
    if (!this.physicsSystem) {
      return
    }
    this.scheduler.removeSystem(this.physicsSystem)
    this.physicsSystem.dispose()
    this.physicsSystem = null
    this.backend.sync.setPresentationTransformResolver(null)
  }

  private setupResize(canvas: HTMLCanvasElement): void {
    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight
      this.backend.resize(width, height)
    }
    resize()
    this.resizeHandler = resize
    window.addEventListener('resize', resize)
  }
}

/**
 * Fetches a scene document by path. Mirrors the browser `fetch` signature so the
 * global `fetch` is a drop-in default, while headless/test/bundle callers can
 * inject their own resource resolver (see {@link SceneLoader.load}).
 */
export type SceneFetch = (path: string) => Promise<{
  ok: boolean
  json(): Promise<unknown>
}>

const defaultSceneFetch: SceneFetch = (path) => fetch(path)

export class SceneLoader {
  static async load(
    path: string,
    fetchScene: SceneFetch = defaultSceneFetch,
    prefabAssets: ReadonlyMap<AssetId, PrefabDefinition> = new Map(),
  ): Promise<LoadedScene> {
    const response = await fetchScene(path)
    if (!response.ok) throw new Error(`Failed to load scene: ${path}`)
    const json = validateSceneDocument(await response.json())
    return SceneLoader.fromDocument(json, prefabAssets)
  }

  static fromDocument(
    doc: SceneDocument,
    prefabAssets: ReadonlyMap<AssetId, PrefabDefinition> = new Map(),
  ): LoadedScene {
    return {
      world: loadSceneDocument(doc, {
        componentRegistry: createEngineComponentRegistry(),
        prefabAssets,
      }),
      prototypes: doc.prototypes,
      metadata: doc.metadata,
      prefabAssets,
      renderSettings: doc.renderSettings ?? defaultRenderSettings(),
      physicsSettings: doc.physicsSettings ?? defaultPhysicsProjectSettings(),
      activeCameraId: resolveActiveCameraId(doc),
    }
  }
}

export { ThreeRenderBackend, RenderSyncSystem } from './render-backend.js'
export {
  PhysicsWorldSystem,
  PRIMARY_WORLD_HANDLE,
  type PhysicsWorldSystemOptions,
} from './systems/physics-world-system.js'
export {
  PhysicsColliderSystem,
  colliderToPhysicsShape,
  composeColliderTransform,
  resolveColliderDescriptor,
  vehicleChassisCollider,
  type ResolvedColliderDescriptor,
} from './systems/physics-collider-system.js'
export { PhysicsContactSystem } from './systems/physics-contact-system.js'
export { PhysicsQuerySystem } from './systems/physics-query-system.js'
export { PhysicsJointSystem } from './systems/physics-joint-system.js'
export { PhysicsAreaGravitySystem } from './systems/physics-area-gravity-system.js'
export {
  createEnginePoolParticipant,
  type EnginePoolParticipantOptions,
} from './systems/pool-lifecycle.js'
export {
  VehicleControllerSystem,
  computeIsaacDriveControlState,
  vehicleWheelConfigs,
  type VehicleInput,
  type DriveControlContext,
  type DriveControlState,
} from './systems/vehicle-controller-system.js'
export {
  VehicleVisualSyncSystem,
  computeWheelVisualTransform,
  type WheelVisualTransform,
} from './systems/vehicle-visual-sync-system.js'
export {
  DynamicRaycastVisualSyncSystem,
  computeDynamicRaycastWheelLocalTransform,
  computeDynamicRaycastWheelRestTransform,
  createDynamicRaycastWheelRestPoseResolver,
} from './systems/dynamic-raycast-visual-sync-system.js'
export {
  InputManager,
  DEFAULT_INPUT_ACTIONS,
  KEY_BINDINGS,
  type InputActions,
  type InputManagerOptions,
  type PointerCaptureTarget,
  type InputActionBinding,
  type InputActionBindings,
  type InputActionMap,
  type InputActionMapSnapshot,
  type InputAxisActionBinding,
  type InputButtonActionBinding,
} from './input/index.js'
export { createInputActionMap } from './input/index.js'
export {
  InputBindingSystem,
  inputActionsToVehicleInput,
  type InputBindingSystemOptions,
} from './systems/input-binding-system.js'
export {
  ChaseCameraSystem,
  createChaseCameraRuntimeState,
  computeChaseCameraStep,
  computeChaseCameraDesiredPose,
  applyChaseOrbitInput,
  applyChaseZoomInput,
  updateChaseOrbitSmoothing,
  resetChaseOrbitOnAccelerate,
  updateChaseAirborneBlend,
  updateChaseBoostBlend,
  lookAtQuaternion,
  normalizeAngleRadians,
  CHASE_CAMERA_OFFSET,
  CHASE_PITCH_MIN,
  CHASE_PITCH_MAX,
  CHASE_BOOST_FOV,
  type ChaseCameraOrbitState,
  type ChaseCameraRuntimeState,
  type ChaseCameraInput,
  type ChaseCameraVehicleState,
  type ChaseCameraPose,
  type ChaseCameraSystemOptions,
} from './systems/chase-camera-system.js'
export {
  ThreeJsFollowCameraSystem,
  usesThreeJsFollowCamera,
  type ThreeJsFollowCameraSystemOptions,
} from './systems/threejs-follow-camera-system.js'

export {
  startVehiclePlayMode,
  type VehiclePlayModeOptions,
  type VehiclePlayModeSession,
} from './play-mode-vehicle.js'
export {
  RespawnSystem,
  DEFAULT_RESPAWN_FALL_Y,
  type RespawnSystemOptions,
  type SpawnPose,
} from './systems/respawn-system.js'
