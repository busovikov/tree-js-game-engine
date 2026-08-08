// @vitest-environment happy-dom

import { AudioRuntime, AudioService, HeadlessAudioBackend } from '@haku/audio'
import {
  EngineScheduler,
  TransformComponent,
  World,
  entityId,
  stableCanonicalHash,
  type ISystem,
} from '@haku/core'
import {
  HeadlessPresentationEffectsBackend,
  InputManager,
  MeshRendererComponent,
  MeshRendererSchema,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  PhysicsWorldSystem,
  PresentationEffectsService,
  createEnginePoolParticipant,
} from '@haku/engine'
import { EntityPool } from '@haku/pool'
import {
  ColliderComponent,
  ColliderSchema,
  RigidBodyComponent,
  RigidBodySchema,
} from '@haku/physics'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { InMemorySaveStorage } from '@haku/storage'
import { UIService } from '@haku/ui'
import { afterEach, describe, expect, it } from 'vitest'
import documentAsset from '../public/assets/ui/hud.ui.json'
import { BOUNCE_RUN_AUDIO_CLIP_DATA } from './audio-composition.js'
import { createBounceRunEffectsComposition } from './effects-composition.js'
import { BounceRunControlSystem, BounceRunInputSystem } from './game-systems.js'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import { createBounceRunSessionRuntime } from './session-runtime.js'
import { loadBounceRunUIDocument } from './ui-document.js'

const SEED = 0x13_06
const BALL = entityId('b1d00000-0000-4000-8000-000000000001')
const FIXED_DELTA = 1 / 60

const BONUS = {
  enabled: true,
  minimumPlatformCount: 6,
  radius: 0.35,
  sensorClearance: 0.15,
} as const

interface StabilizationFixture {
  readonly world: World
  readonly scheduler: EngineScheduler
  readonly physics: PhysicsWorldSystem
  readonly colliders: PhysicsColliderSystem
  readonly contacts: PhysicsContactSystem
  readonly platformPool: EntityPool
  readonly bonusPool: EntityPool
  readonly route: ReturnType<typeof createPoolBackedBounceRunRoute>
  readonly effectsBackend: HeadlessPresentationEffectsBackend
  readonly effects: PresentationEffectsService
  readonly effectsComposition: ReturnType<typeof createBounceRunEffectsComposition>
  readonly session: ReturnType<typeof createBounceRunSessionRuntime>
  readonly input: BounceRunInputSystem
  readonly control: BounceRunControlSystem
  readonly ui: UIService
  readonly hashes: string[]
  dispose(): void
}

function replayLateralAction(tick: number): number {
  const phase = tick % 360
  if (phase < 120) return -0.75
  if (phase < 240) return 0.5
  return 0.875
}

async function createStabilizationFixture(options: {
  readonly captureHashes?: boolean
} = {}): Promise<StabilizationFixture> {
  const world = new World()
  world.createEntity('Ball', BALL)
  world.addComponent(BALL, TransformComponent, {
    ...TransformComponent.defaults(),
    position: [0, 3, 0],
  })
  world.addComponent(
    BALL,
    ColliderComponent,
    ColliderSchema.parse({ shape: 'sphere', radius: 0.5, restitution: 0 }),
  )
  world.addComponent(
    BALL,
    RigidBodyComponent,
    RigidBodySchema.parse({
      type: 'dynamic',
      massMode: 'explicit',
      mass: 1,
      canSleep: false,
      ccdEnabled: true,
      contactMonitor: true,
      maxReportedContacts: 4,
    }),
  )

  const rapier = await createRapierPhysicsBackend({ gravity: [0, -18, 0] })
  const physics = new PhysicsWorldSystem()
  physics.setBackend(rapier)
  const colliders = new PhysicsColliderSystem(physics)
  const contacts = new PhysicsContactSystem(physics)
  const poolParticipant = createEnginePoolParticipant({ world, colliders })
  const platformPool = new EntityPool({
    id: 'bounce-run-stabilization-platforms',
    world,
    capacity: 8,
    maximum: 8,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    participants: [poolParticipant],
    createInstance() {
      const entity = world.createEntity('Platform')
      world.addComponent(entity, TransformComponent, TransformComponent.defaults())
      world.addComponent(
        entity,
        MeshRendererComponent,
        MeshRendererSchema.parse({ geometryType: 'BoxGeometry' }),
      )
      world.addComponent(entity, ColliderComponent, ColliderSchema.parse({ shape: 'box' }))
      return entity
    },
  })
  const bonusPool = new EntityPool({
    id: 'bounce-run-stabilization-bonus',
    world,
    capacity: 1,
    maximum: 1,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
    participants: [poolParticipant],
    createInstance() {
      const entity = world.createEntity('Bonus')
      world.addComponent(entity, TransformComponent, TransformComponent.defaults())
      world.addComponent(
        entity,
        MeshRendererComponent,
        MeshRendererSchema.parse({ geometryType: 'SphereGeometry' }),
      )
      world.addComponent(
        entity,
        ColliderComponent,
        ColliderSchema.parse({ shape: 'sphere', radius: BONUS.radius, isTrigger: true }),
      )
      return entity
    },
  })
  platformPool.prewarm()
  bonusPool.prewarm()
  const route = createPoolBackedBounceRunRoute({
    world,
    pool: platformPool,
    bonusPool,
    seed: SEED,
    activeAhead: 6,
    retainBehind: 2,
    bonus: BONUS,
  })

  const effectsBackend = new HeadlessPresentationEffectsBackend({
    burstCapacity: 18,
    burstQueueCapacity: 12,
    trailCapacity: 28,
    trailSampleInterval: FIXED_DELTA,
    trailLifetime: 0.55,
  })
  const effects = new PresentationEffectsService(effectsBackend)
  const effectsComposition = createBounceRunEffectsComposition({
    effects,
    platformPool,
    bonusPool,
  })

  const ui = new UIService()
  const uiDocument = await loadBounceRunUIDocument(async () => ({
    ok: true,
    json: async () => documentAsset,
  }))
  ui.register(uiDocument)
  ui.mount(uiDocument.id, document.createElement('div'))
  const audioRuntime = new AudioRuntime(new HeadlessAudioBackend())
  for (const clip of BOUNCE_RUN_AUDIO_CLIP_DATA) audioRuntime.registerClip(clip)
  const session = createBounceRunSessionRuntime({
    scheduler: new EngineScheduler(),
    ui,
    storage: new InMemorySaveStorage(),
    audio: new AudioService(audioRuntime),
  })
  await session.initialize()
  session.start()

  const scheduler = new EngineScheduler({
    fixedTimestep: FIXED_DELTA,
    maxSubsteps: 3,
    maxFrameDelta: FIXED_DELTA * 3,
  })
  const input = new BounceRunInputSystem(
    new InputManager(),
    () => {},
    () => {},
  )
  const control = new BounceRunControlSystem(BALL, physics, input)
  const hashes: string[] = []
  const actionReplay: ISystem = {
    phase: 'FixedInputSnapshot',
    localOrder: -100,
    update() {
      input.setLateralAction(replayLateralAction(scheduler.tickNumber))
      input.update()
    },
  }
  const trail: ISystem = {
    phase: 'LateUpdate',
    localOrder: -10,
    update(_world, dt) {
      if (dt <= 0) return
      const pose = physics.getBodyTransform(BALL)
      if (pose) effectsComposition.trail(pose.position)
    },
  }
  const capture: ISystem = {
    phase: 'FixedGameplay',
    localOrder: 1_000,
    update() {
      if (!options.captureHashes) return
      const pose = physics.getBodyTransform(BALL)
      const velocity = physics.getBodyLinearVelocity(BALL)
      hashes.push(
        stableCanonicalHash({
          tick: scheduler.tickNumber,
          position: pose?.position ?? [0, 0, 0],
          velocity: velocity ?? [0, 0, 0],
          lateral: input.lateralInput,
          platformActive: platformPool.metrics().active,
          bonusActive: bonusPool.metrics().active,
        }),
      )
    },
  }
  for (const system of [
    colliders,
    actionReplay,
    control,
    physics,
    contacts,
    capture,
    trail,
    effects,
  ]) {
    scheduler.addSystem(system)
  }

  return {
    world,
    scheduler,
    physics,
    colliders,
    contacts,
    platformPool,
    bonusPool,
    route,
    effectsBackend,
    effects,
    effectsComposition,
    session,
    input,
    control,
    ui,
    hashes,
    dispose() {
      route.dispose()
      platformPool.releaseAll()
      bonusPool.releaseAll()
      effectsComposition.dispose()
      session.destroy()
      ui.destroyAll()
      platformPool.clear()
      bonusPool.clear()
      colliders.dispose()
      physics.dispose()
    },
  }
}

describe('Bounce Run long-run stabilization', () => {
  afterEach(() => resetRapierPhysicsIds())

  it('restores exact public ownership counters after 72,000 fixed ticks and 10,000+ pool transitions', async () => {
    const fixture = await createStabilizationFixture()
    for (let tick = 0; tick < 120; tick += 1) {
      fixture.scheduler.runFrame(fixture.world, FIXED_DELTA)
    }
    fixture.effectsComposition.reset()
    fixture.route.reset()

    const warm = {
      platformTotal: fixture.platformPool.metrics().total,
      platformActive: fixture.platformPool.metrics().active,
      bonusTotal: fixture.bonusPool.metrics().total,
      bonusActive: fixture.bonusPool.metrics().active,
      worldEntities: fixture.world.getAllEntities().length,
      subscriptions: fixture.effectsComposition.metrics().subscriptions,
      schedulerSystems: fixture.scheduler.metrics().registeredSystems,
      sessionTrace: fixture.session.traceCount(),
    }
    const platformAcquisitions = fixture.platformPool.metrics().acquisitions
    const platformReleases = fixture.platformPool.metrics().releases
    const pendingFailures: Promise<void>[] = []

    for (let tick = 0; tick < 72_000; tick += 1) {
      fixture.scheduler.runFrame(fixture.world, FIXED_DELTA)
      if (tick % 48 === 47) {
        fixture.route.advanceTo(1)
        fixture.route.reset()
      }
      if (tick % 720 === 719) {
        pendingFailures.push(fixture.session.fail())
        fixture.effectsComposition.fail([0, -7, tick / 60])
        fixture.route.reset()
        fixture.physics.resetBodyState(
          BALL,
          { position: [0, 3, 0], rotation: [0, 0, 0, 1] },
          fixture.world,
        )
        fixture.control.reset()
        fixture.effectsComposition.reset()
        fixture.session.restart()
      }
    }
    await Promise.all(pendingFailures)
    fixture.route.reset()
    fixture.effectsComposition.reset()
    fixture.effects.update(fixture.world, FIXED_DELTA)

    const platform = fixture.platformPool.metrics()
    const bonus = fixture.bonusPool.metrics()
    const effects = fixture.effects.metrics()
    expect(fixture.scheduler.tickNumber).toBe(72_120)
    expect(platform.acquisitions - platformAcquisitions).toBeGreaterThanOrEqual(10_000)
    expect(platform.releases - platformReleases).toBeGreaterThanOrEqual(10_000)
    expect(platform).toMatchObject({
      total: warm.platformTotal,
      active: warm.platformActive,
      inactive: warm.platformTotal - warm.platformActive,
      expansions: 0,
      exhaustions: 0,
      forcedReleases: 0,
    })
    expect(bonus).toMatchObject({
      total: warm.bonusTotal,
      active: warm.bonusActive,
      inactive: warm.bonusTotal - warm.bonusActive,
      expansions: 0,
      exhaustions: 0,
      forcedReleases: 0,
    })
    expect(fixture.world.getAllEntities()).toHaveLength(warm.worldEntities)
    expect(fixture.effectsComposition.metrics().subscriptions).toBe(warm.subscriptions)
    expect(fixture.scheduler.metrics()).toMatchObject({
      registeredSystems: warm.schedulerSystems,
      queuedCommands: 0,
    })
    expect(effects).toMatchObject({
      activeBursts: 0,
      queuedBursts: 0,
      trailPoints: 0,
      ownedHandles: 0,
      renderObjects: 0,
      disposed: false,
    })
    expect(fixture.session.traceCount()).toBeLessThanOrEqual(4_096)
    expect(fixture.session.traceCount()).toBeGreaterThan(warm.sessionTrace)

    fixture.dispose()
    expect(fixture.effectsComposition.metrics().subscriptions).toBe(0)
    expect(fixture.effectsBackend.metrics()).toMatchObject({
      activeBursts: 0,
      queuedBursts: 0,
      trailPoints: 0,
      ownedHandles: 0,
      renderObjects: 0,
      disposed: true,
    })
    expect(fixture.world.getAllEntities()).toHaveLength(1)
  }, 60_000)

  it('admits 30 FPS frames as the same fixed 60 Hz action replay and expires effects by elapsed time', async () => {
    const sixty = await createStabilizationFixture({ captureHashes: true })
    const thirty = await createStabilizationFixture({ captureHashes: true })

    const sixtyReports = Array.from({ length: 600 }, () =>
      sixty.scheduler.runFrame(sixty.world, FIXED_DELTA),
    )
    const thirtyReports = Array.from({ length: 300 }, () =>
      thirty.scheduler.runFrame(thirty.world, FIXED_DELTA * 2),
    )
    expect(sixty.scheduler.tickNumber).toBe(600)
    expect(thirty.scheduler.tickNumber).toBe(600)
    expect(Math.max(...sixtyReports.map((report) => report.fixedSteps))).toBe(1)
    expect(Math.max(...thirtyReports.map((report) => report.fixedSteps))).toBe(2)
    expect(thirtyReports.every((report) => report.fixedSteps <= 3)).toBe(true)
    expect(thirty.hashes).toEqual(sixty.hashes)

    sixty.effectsComposition.fail([0, 0, 0])
    thirty.effectsComposition.fail([0, 0, 0])
    for (let frame = 0; frame < 30; frame += 1) {
      sixty.scheduler.runFrame(sixty.world, FIXED_DELTA)
    }
    for (let frame = 0; frame < 15; frame += 1) {
      thirty.scheduler.runFrame(thirty.world, FIXED_DELTA * 2)
    }
    expect(sixty.effects.metrics().activeBursts).toBe(1)
    expect(thirty.effects.metrics().activeBursts).toBe(1)
    for (let frame = 0; frame < 18; frame += 1) {
      sixty.scheduler.runFrame(sixty.world, FIXED_DELTA)
    }
    for (let frame = 0; frame < 9; frame += 1) {
      thirty.scheduler.runFrame(thirty.world, FIXED_DELTA * 2)
    }
    expect(sixty.effects.metrics().activeBursts).toBe(0)
    expect(thirty.effects.metrics().activeBursts).toBe(0)

    sixty.dispose()
    thirty.dispose()
  }, 30_000)

  it('drops only overflow beyond the bounded three-step irregular frame admission', () => {
    const scheduler = new EngineScheduler({
      fixedTimestep: FIXED_DELTA,
      maxSubsteps: 3,
      maxFrameDelta: FIXED_DELTA * 3,
    })
    const world = new World()
    const reports = [FIXED_DELTA / 2, FIXED_DELTA / 2, 0.2].map((delta) =>
      scheduler.runFrame(world, delta),
    )
    expect(reports.map(({ fixedSteps }) => fixedSteps)).toEqual([0, 1, 3])
    expect(reports[2]!.droppedTime).toBeCloseTo(0.15, 10)
    expect(scheduler.tickNumber).toBe(4)
    expect(scheduler.metrics().queuedCommands).toBe(0)
  })
})
