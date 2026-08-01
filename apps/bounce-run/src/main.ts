import {
  SCENE_ASSET_TYPE,
  validateProjectAssetComposition,
  validateProjectManifest,
} from '@haku/assets'
import { entityId, type ISystem } from '@haku/core'
import {
  Engine,
  InputManager,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  SceneLoader,
  createEngineAssetRegistry,
  createEngineComponentRegistry,
  createEnginePoolParticipant,
  loadProjectPrefabAssets,
} from '@haku/engine'
import { createEntityPoolFromComponent } from '@haku/pool'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'
import { projectPathToUrl } from '@haku/schema'
import { UIService } from '@haku/ui'
import projectAsset from '../haku.project.json'
import {
  BounceRunCameraSystem,
  BounceRunControlSystem,
  BounceRunFailureSystem,
  BounceRunInputSystem,
  BounceRunLandingSystem,
  BounceRunPerformanceSystem,
  BounceRunRouteSystem,
} from './game-systems.js'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import { instantiatePrefabDefinition } from './prefab-instance.js'
import { createBounceRunSessionRuntime } from './session-runtime.js'
import { BOUNCE_RUN_UI_IDS, loadBounceRunUIDocument } from './ui-document.js'

const BALL_ID = entityId('b1700000-0000-4000-8000-000000000002')
const CAMERA_ID = entityId('b1700000-0000-4000-8000-000000000001')
const POOL_OWNER_ID = entityId('b1700000-0000-4000-8000-000000000004')
const BALL_SPAWN = {
  position: [0, 3, 0] as const,
  rotation: [0, 0, 0, 1] as const,
}
const ROUTE_SEED = 0x5eed

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
  const route = createPoolBackedBounceRunRoute({
    world: loaded.world,
    pool: platformPool,
    seed: ROUTE_SEED,
    activeAhead: 6,
    retainBehind: 2,
  })

  const ui = new UIService()
  const uiDocument = await loadBounceRunUIDocument()
  ui.register(uiDocument)
  ui.mount(uiDocument.id, hudHost)
  const session = createBounceRunSessionRuntime({ scheduler: engine.scheduler, ui })

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
  )
  const failureSystem = new BounceRunFailureSystem(BALL_ID, physics, () => {
    session.fail()
    engine.setPaused(true)
  })
  const routeSystem = new BounceRunRouteSystem(BALL_ID, physics, route)
  const cameraSystem = new BounceRunCameraSystem(BALL_ID, CAMERA_ID, physics)
  const performanceSystem = new BounceRunPerformanceSystem(ui, platformPool, engine.scheduler)
  const systems: ISystem[] = [
    inputSystem,
    controlSystem,
    landingSystem,
    routeSystem,
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
        start: startRun,
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
  function startRun(): void {
    resetRun()
    session.start()
    engine.setPaused(false)
  }
  function restartRun(): void {
    if (session.state() === 'start') return
    resetRun()
    session.restart()
    engine.setPaused(false)
  }
  function togglePause(): void {
    if (session.state() === 'active') {
      session.pause()
      engine.setPaused(true)
    } else if (session.state() === 'paused') {
      session.resume()
      engine.setPaused(false)
    }
  }

  const unsubscribeUI = ui.subscribe((event) => {
    if (event.eventId === BOUNCE_RUN_UI_IDS.events.start) startRun()
    else if (event.eventId === BOUNCE_RUN_UI_IDS.events.resume) togglePause()
    else if (event.eventId === BOUNCE_RUN_UI_IDS.events.restart) restartRun()
  })

  session.initialize()
  engine.setPaused(true)
  engine.start()

  window.addEventListener(
    'beforeunload',
    () => {
      disposeDevQa()
      engine.stop()
      unsubscribeUI()
      input.detach()
      session.destroy()
      ui.destroyAll()
      systems.forEach((system) => engine.removeSystem(system))
      route.dispose()
      platformPool.clear()
      engine.removeSystem(contacts)
      engine.removeSystem(colliders)
      engine.dispose()
    },
    { once: true },
  )
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
