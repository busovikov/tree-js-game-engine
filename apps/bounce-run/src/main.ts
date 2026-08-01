import {
  SCENE_ASSET_TYPE,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import { TransformComponent, entityId, type ISystem } from '@haku/core'
import {
  Engine,
  InputManager,
  MeshRendererComponent,
  MeshRendererSchema,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  SceneLoader,
  createEngineAssetRegistry,
  createEngineComponentRegistry,
  createEnginePoolParticipant,
  loadProjectPrefabAssets,
} from '@haku/engine'
import { EntityPool, createEntityPoolFromComponent } from '@haku/pool'
import { ColliderComponent, ColliderSchema } from '@haku/physics'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'
import { projectPathToUrl } from '@haku/schema'
import {
  IndexedDbSaveStorage,
  InMemorySaveStorage,
  SaveStorageUnavailableError,
  type ISaveStorage,
} from '@haku/storage'
import { UIService } from '@haku/ui'
import { createWebAudioBackend } from '@haku/audio-web'
import projectAsset from '../haku.project.json'
import {
  BounceRunCameraSystem,
  BounceRunBonusCollectionSystem,
  BounceRunControlSystem,
  BounceRunFailureSystem,
  BounceRunInputSystem,
  BounceRunLandingSystem,
  BounceRunPerformanceSystem,
  BounceRunRouteSystem,
} from './game-systems.js'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import type { BounceRunDifficultySchedule } from './route-generator.js'
import { instantiatePrefabDefinition } from './prefab-instance.js'
import { BOUNCE_RUN_AUDIO_CLIP_DATA, createBounceRunAudioComposition } from './audio-composition.js'
import { BOUNCE_RUN_UI_IDS, loadBounceRunUIDocument } from './ui-document.js'

const BALL_ID = entityId('b1700000-0000-4000-8000-000000000002')
const CAMERA_ID = entityId('b1700000-0000-4000-8000-000000000001')
const POOL_OWNER_ID = entityId('b1700000-0000-4000-8000-000000000004')
const BALL_SPAWN = {
  position: [0, 3, 0] as const,
  rotation: [0, 0, 0, 1] as const,
}
const ROUTE_SEED = 0x5eed
const ROUTE_BONUS = {
  enabled: true,
  minimumPlatformCount: 6,
  radius: 0.35,
  sensorClearance: 0.15,
} as const
const ROUTE_DIFFICULTY = [
  {
    startIndex: 1,
    safetyMargin: 0.9,
    variantWeights: { normal: 1, wide: 0, narrow: 0, bounce: 0 },
  },
  {
    startIndex: 2,
    safetyMargin: 0.8,
    variantWeights: { normal: 0, wide: 1, narrow: 0, bounce: 0 },
  },
  {
    startIndex: 3,
    safetyMargin: 0.7,
    variantWeights: { normal: 0, wide: 0, narrow: 1, bounce: 0 },
  },
  {
    startIndex: 4,
    safetyMargin: 0.6,
    variantWeights: { normal: 0, wide: 0, narrow: 0, bounce: 1 },
  },
  {
    startIndex: 5,
    safetyMargin: 0.55,
    variantWeights: { normal: 0.55, wide: 0.2, narrow: 0.15, bounce: 0.1 },
  },
  {
    startIndex: 17,
    safetyMargin: 0.45,
    variantWeights: { normal: 0.4, wide: 0.2, narrow: 0.2, bounce: 0.2 },
  },
  {
    startIndex: 33,
    safetyMargin: 0.35,
    variantWeights: { normal: 0.25, wide: 0.2, narrow: 0.25, bounce: 0.3 },
  },
] as const satisfies BounceRunDifficultySchedule

async function main(): Promise<void> {
  const manifest = validateProjectManifest(projectAsset)
  const assets = validateProjectAssetComposition(manifest, createEngineAssetRegistry()).index
  const canvas = requireElement<HTMLCanvasElement>('canvas')
  const hudHost = requireElement<HTMLElement>('hud')
  const engine = new Engine({ canvas })
  engine.backend.setViewportMode('view')

  const prefabAssets = await loadProjectPrefabAssets(manifest)
  const scenePath = assets.path(manifest.entryScene, SCENE_ASSET_TYPE)
  const loaded = await SceneLoader.load(
    projectPathToUrl(`${manifest.assetsDir}/${scenePath}`),
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

  const rapier = await createRapierPhysicsBackend({ gravity: [0, -18, 0] })
  const physics = engine.setPhysicsBackend(rapier)
  const colliders = new PhysicsColliderSystem(physics, {
    physicsSettings: loaded.physicsSettings,
  })
  const contacts = new PhysicsContactSystem(physics)
  engine.addSystem(colliders)
  engine.addSystem(contacts)

  const components = createEngineComponentRegistry()
  const platformPool = createEntityPoolFromComponent({
    world: loaded.world,
    entity: POOL_OWNER_ID,
    instantiatePrefab(reference) {
      const prefab = prefabAssets.get(reference.$ref)
      if (!prefab) throw new Error(`Unknown platform prefab: ${reference.$ref}`)
      return instantiatePrefabDefinition({
        world: loaded.world,
        registry: components,
        definition: prefab,
      })
    },
    participants: [
      createEnginePoolParticipant({
        world: loaded.world,
        colliders,
        render: engine.backend.sync,
      }),
    ],
  })
  const bonusPool = new EntityPool({
    id: 'bounce-run-bonus-pool',
    world: loaded.world,
    capacity: 1,
    maximum: 1,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    createInstance() {
      const entity = loaded.world.createEntity('Generated bonus')
      loaded.world.addComponent(entity, TransformComponent, TransformComponent.defaults())
      loaded.world.addComponent(
        entity,
        MeshRendererComponent,
        MeshRendererSchema.parse({
          geometryType: 'SphereGeometry',
          geometryParams: { radius: ROUTE_BONUS.radius, widthSegments: 16, heightSegments: 12 },
          material: { materialType: 'standard', color: '#ffd84d' },
        }),
      )
      loaded.world.addComponent(
        entity,
        ColliderComponent,
        ColliderSchema.parse({ shape: 'sphere', radius: ROUTE_BONUS.radius, isTrigger: true }),
      )
      return entity
    },
    participants: [
      createEnginePoolParticipant({
        world: loaded.world,
        colliders,
        render: engine.backend.sync,
      }),
    ],
  })
  bonusPool.prewarm()
  const route = createPoolBackedBounceRunRoute({
    world: loaded.world,
    pool: platformPool,
    bonusPool,
    seed: ROUTE_SEED,
    activeAhead: 6,
    retainBehind: 2,
    difficultySchedule: ROUTE_DIFFICULTY,
    bonus: ROUTE_BONUS,
  })

  const ui = new UIService()
  const uiDocument = await loadBounceRunUIDocument()
  ui.register(uiDocument)
  ui.mount(uiDocument.id, hudHost)
  const saveStorage = await createBounceRunSaveStorage()
  const audioBackend = createWebAudioBackend()
  for (const clip of BOUNCE_RUN_AUDIO_CLIP_DATA) await audioBackend.loadClip(clip)
  const audioComposition = createBounceRunAudioComposition({
    scheduler: engine.scheduler,
    ui,
    storage: saveStorage.storage,
    backend: audioBackend,
    pooledOwners: [platformPool, bonusPool],
    hooks: {
      start: () => {
        resetRun()
        engine.setPaused(false)
      },
      pause: () => engine.setPaused(true),
      resume: () => engine.setPaused(false),
      restart: () => {
        resetRun()
        engine.setPaused(false)
      },
      fail: () => engine.setPaused(true),
      error: (error) => console.error('[bounce-run] audio lifecycle failed', error),
    },
  })
  const session = audioComposition.session
  await audioComposition.initialize()
  if (!saveStorage.persistent) {
    ui.setText(
      { document: BOUNCE_RUN_UI_IDS.document, element: BOUNCE_RUN_UI_IDS.startHelp },
      'A / D or arrows to steer · Escape to pause · R to restart · ' +
        'Local saves unavailable; best score lasts this tab',
    )
  }

  const input = new InputManager({
    keyboardTarget: window,
    pointerTarget: canvas,
    actionBindings: {
      lateral: {
        kind: 'axis',
        negative: ['KeyA', 'ArrowLeft'],
        positive: ['KeyD', 'ArrowRight'],
      },
      pause: { kind: 'pulse', codes: ['Escape'] },
      restart: { kind: 'pulse', codes: ['KeyR'] },
    },
  })
  input.attach()
  input.enable()

  const inputSystem = new BounceRunInputSystem(input, togglePause, restartRun)
  const controlSystem = new BounceRunControlSystem(BALL_ID, physics, inputSystem)
  const landingSystem = new BounceRunLandingSystem(
    BALL_ID,
    contacts,
    controlSystem,
    engine.scheduler,
    route,
    session,
  )
  const failureSystem = new BounceRunFailureSystem(BALL_ID, physics, () => {
    void audioComposition.fail().catch((error: unknown) => {
      console.error('[bounce-run] fail transition failed', error)
    })
  })
  const routeSystem = new BounceRunRouteSystem(BALL_ID, physics, route)
  const bonusCollectionSystem = new BounceRunBonusCollectionSystem(
    BALL_ID,
    contacts,
    route,
    session,
  )
  const cameraSystem = new BounceRunCameraSystem(BALL_ID, CAMERA_ID, physics)
  const performanceSystem = new BounceRunPerformanceSystem(ui, platformPool, engine.scheduler)
  const systems: ISystem[] = [
    inputSystem,
    controlSystem,
    landingSystem,
    routeSystem,
    bonusCollectionSystem,
    failureSystem,
    cameraSystem,
    performanceSystem,
  ]
  systems.forEach((system) => engine.addSystem(system))

  let disposeDevQa = (): void => {}
  if (import.meta.env.DEV) {
    const { installBounceRunDevQa } = await import('./dev-qa-bootstrap.js')
    const installation = installBounceRunDevQa({
      seed: ROUTE_SEED,
      systemHost: {
        add: (system) => engine.addSystem(system),
        remove: (system) => engine.removeSystem(system),
      },
      actions: {
        read: () => ({ lateral: inputSystem.lateralInput }),
        setLateral: (value) => inputSystem.setLateralAction(value),
        start: () => void startRun(),
        pause: () => {
          if (session.state() === 'active') togglePause()
        },
        resume: () => {
          if (session.state() === 'paused') togglePause()
        },
        restart: restartRun,
      },
      observations: {
        scheduler: engine.scheduler,
        session,
        ball: {
          position: () => physics.getBodyTransform(BALL_ID)?.position ?? BALL_SPAWN.position,
          velocity: () => physics.getBodyLinearVelocity(BALL_ID) ?? [0, 0, 0],
        },
        route,
        pool: platformPool,
      },
    })
    disposeDevQa = () => installation.dispose()
  }

  function resetRun(): void {
    inputSystem.setLateralAction(null)
    routeSystem.reset()
    physics.resetBodyState(BALL_ID, BALL_SPAWN, loaded.world)
    input.disable()
    input.enable()
    controlSystem.reset()
    landingSystem.reset()
    failureSystem.reset()
    cameraSystem.reset()
  }
  function startRun(): Promise<void> {
    return audioComposition.start()
  }
  function restartRun(): void {
    void audioComposition.restart().catch((error: unknown) => {
      console.error('[bounce-run] restart failed', error)
    })
  }
  function togglePause(): void {
    if (session.state() === 'active') {
      void audioComposition.pause().catch((error: unknown) => {
        console.error('[bounce-run] pause failed', error)
      })
    } else if (session.state() === 'paused') {
      void audioComposition.resume().catch((error: unknown) => {
        console.error('[bounce-run] resume failed', error)
      })
    }
  }

  engine.setPaused(true)
  engine.start()

  window.addEventListener(
    'beforeunload',
    () => {
      disposeDevQa()
      engine.stop()
      input.detach()
      audioComposition.dispose()
      ui.destroyAll()
      systems.forEach((system) => engine.removeSystem(system))
      route.dispose()
      platformPool.clear()
      bonusPool.clear()
      engine.removeSystem(contacts)
      engine.removeSystem(colliders)
      engine.dispose()
    },
    { once: true },
  )
}

async function createBounceRunSaveStorage(): Promise<{
  readonly storage: ISaveStorage
  readonly persistent: boolean
}> {
  const storage = new IndexedDbSaveStorage({ databaseName: 'haku-bounce-run' })
  try {
    await storage.listSlots()
    return { storage, persistent: true }
  } catch (error) {
    if (!(error instanceof SaveStorageUnavailableError)) throw error
    return { storage: new InMemorySaveStorage(), persistent: false }
  }
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}`)
  return element as T
}

void main().catch((error: unknown) => {
  console.error('[bounce-run] failed to start', error)
  const hud = document.getElementById('hud')
  if (hud) hud.textContent = `Bounce Run failed to start: ${String(error)}`
})
