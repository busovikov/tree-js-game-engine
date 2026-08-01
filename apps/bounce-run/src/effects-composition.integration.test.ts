import { EngineScheduler, TransformComponent, World, entityId } from '@haku/core'
import {
  HeadlessPresentationEffectsBackend,
  InputManager,
  MeshRendererComponent,
  MeshRendererSchema,
  PhysicsWorldSystem,
  PresentationEffectsService,
} from '@haku/engine'
import { EntityPool } from '@haku/pool'
import { ColliderComponent, ColliderSchema } from '@haku/physics'
import { describe, expect, it } from 'vitest'
import { createBounceRunEffectsComposition } from './effects-composition.js'
import {
  BounceRunBonusCollectionSystem,
  BounceRunControlSystem,
  BounceRunFailureSystem,
  BounceRunInputSystem,
  BounceRunLandingSystem,
  BounceRunTrailSystem,
} from './game-systems.js'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import type { BounceRunDifficultySchedule } from './route-generator.js'

const BALL = entityId('b1a00000-0000-4000-8000-000000000001')

const SCHEDULE = [
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
] as const satisfies BounceRunDifficultySchedule

const BONUS = {
  enabled: true,
  minimumPlatformCount: 5,
  radius: 0.35,
  sensorClearance: 0.15,
} as const

function createPoolPair(world: World): {
  readonly platformPool: EntityPool
  readonly bonusPool: EntityPool
} {
  const platformPool = new EntityPool({
    id: 'bounce-run-effects-platforms',
    world,
    capacity: 7,
    maximum: 7,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
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
    id: 'bounce-run-effects-bonus',
    world,
    capacity: 1,
    maximum: 1,
    expansionPolicy: 'fixed',
    exhaustionPolicy: 'return-null',
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
  return { platformPool, bonusPool }
}

describe('Bounce Run bounded presentation composition', () => {
  it('deduplicates accepted gameplay boundaries and remains bounded across event and pool cycles', () => {
    const world = new World()
    world.createEntity('Ball', BALL)
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [0, 3, 0],
    })
    const { platformPool, bonusPool } = createPoolPair(world)
    const backend = new HeadlessPresentationEffectsBackend({
      burstCapacity: 8,
      burstQueueCapacity: 16,
      trailCapacity: 12,
      trailSampleInterval: 1 / 60,
      trailLifetime: 0.4,
    })
    const effects = new PresentationEffectsService(backend)
    const composition = createBounceRunEffectsComposition({
      effects,
      platformPool,
      bonusPool,
    })
    const route = createPoolBackedBounceRunRoute({
      world,
      pool: platformPool,
      bonusPool,
      seed: 0x13_05,
      activeAhead: 5,
      retainBehind: 2,
      difficultySchedule: SCHEDULE,
      bonus: BONUS,
    })
    expect(
      route.activePlatforms().map(({ entity }) => {
        const material = world.getComponent(entity, MeshRendererComponent)?.material
        return material && 'color' in material ? material.color : null
      }),
    ).toEqual(['#35c6d0', '#35c6d0', '#48d597', '#ff9f5a', '#b46cff'])

    let velocity: readonly [number, number, number] = [0, -5, 0]
    let bodyY = 3
    let collisionNormal: readonly [number, number, number] = [0, -1, 0]
    const landedPlatform = route.activePlatforms()[1]!
    const contacts = {
      peekCollisionEvents: () => [
        {
          kind: 'collision',
          phase: 'enter',
          entityA: BALL.value,
          entityB: landedPlatform.entity.value,
          contacts: [
            {
              point: [...landedPlatform.descriptor.position] as [number, number, number],
              normal: collisionNormal,
              depth: -0.01,
            },
          ],
        } as const,
      ],
    }
    const physics = {
      getBodyLinearVelocity: () => velocity,
      setBodyLinearVelocity: (_entity: unknown, next: readonly [number, number, number]) => {
        velocity = next
      },
      getBodyTransform: () => ({ position: [0, bodyY, 0], rotation: [0, 0, 0, 1] }),
      resolvePresentationTransform: (
        _entity: unknown,
        transform: ReturnType<typeof TransformComponent.defaults>,
      ) => transform,
    } as unknown as PhysicsWorldSystem
    const scheduler = new EngineScheduler()
    const input = new BounceRunInputSystem(
      new InputManager(),
      () => {},
      () => {},
    )
    const control = new BounceRunControlSystem(BALL, physics, input)
    const landing = new BounceRunLandingSystem(
      BALL,
      contacts,
      control,
      scheduler,
      route,
      undefined,
      composition,
    )

    control.update(world, 1 / 60)
    landing.update(world)
    landing.update(world)
    effects.update(world, 1 / 60)
    expect(backend.metrics().emitted).toMatchObject({ landing: 1, bonus: 0, fail: 0 })

    scheduler.runFrame(world, 1 / 60)
    collisionNormal = [1, 0, 0]
    velocity = [0, -5, 0]
    control.update(world, 1 / 60)
    landing.update(world)
    effects.update(world, 1 / 60)
    expect(backend.metrics().emitted.landing).toBe(1)

    const activeBonus = route.activeBonuses()[0]!
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [...activeBonus.descriptor.position],
    })
    let sessionState: 'active' | 'game-over' = 'active'
    let bonusAwards = 0
    const bonusContact = {
      kind: 'trigger',
      phase: 'enter',
      entityA: BALL.value,
      entityB: activeBonus.entity.value,
    } as const
    const collector = new BounceRunBonusCollectionSystem(
      BALL,
      { peekCollisionEvents: () => [bonusContact] },
      route,
      {
        state: () => sessionState,
        collectBonus: () => {
          bonusAwards += 1
          return true
        },
      },
      composition,
    )
    collector.update(world)
    collector.update(world)
    effects.update(world, 1 / 60)
    expect(bonusAwards).toBe(1)
    expect(backend.metrics().emitted).toMatchObject({ landing: 1, bonus: 1, fail: 0 })

    const failure = new BounceRunFailureSystem(BALL, physics, () => {
      sessionState = 'game-over'
      composition.fail([0, -7, 0])
    })
    bodyY = -7
    failure.update()
    failure.update()
    effects.update(world, 1 / 60)
    expect(backend.metrics().emitted).toMatchObject({ landing: 1, bonus: 1, fail: 1 })

    const trail = new BounceRunTrailSystem(BALL, physics, composition)
    const trailBaseline = backend.metrics().trailPoints
    for (let frame = 0; frame < 240; frame += 1) {
      world.addComponent(BALL, TransformComponent, {
        ...TransformComponent.defaults(),
        position: [frame / 10, 3, frame / 5],
      })
      trail.update(world, 1 / 60)
      effects.update(world, 1 / 60)
    }
    expect(backend.metrics().trailPoints).toBeGreaterThan(trailBaseline)
    expect(backend.metrics().trailPoints).toBeLessThanOrEqual(12)
    const pausedTrailPoints = backend.metrics().trailPoints
    trail.update(world, 0)
    effects.update(world, 0)
    expect(backend.metrics().trailPoints).toBe(pausedTrailPoints)

    for (let event = 0; event < 100; event += 1) {
      composition.landing({
        platform: landedPlatform.entity,
        position: [event / 10, 0.5, event / 4],
      })
      effects.update(world, 1 / 120)
    }
    expect(backend.metrics()).toMatchObject({
      burstCapacity: 8,
      trailCapacity: 12,
      droppedBursts: 0,
    })
    expect(backend.metrics().activeBursts).toBeLessThanOrEqual(8)
    expect(backend.metrics().queuedBursts).toBeLessThanOrEqual(16)

    for (let cycle = 0; cycle < 20; cycle += 1) {
      composition.reset()
      route.reset()
      effects.update(world, 1 / 60)
      expect(backend.metrics()).toMatchObject({
        activeBursts: 0,
        queuedBursts: 0,
        trailPoints: 0,
        ownedHandles: 0,
      })
      expect(platformPool.metrics()).toMatchObject({ total: 7, active: 5 })
      expect(bonusPool.metrics()).toMatchObject({ total: 1, active: 1 })
      expect(composition.metrics().subscriptions).toBe(2)
    }

    route.dispose()
    platformPool.releaseAll()
    bonusPool.releaseAll()
    composition.dispose()
    expect(composition.metrics().subscriptions).toBe(0)
    expect(backend.metrics()).toMatchObject({
      activeBursts: 0,
      queuedBursts: 0,
      trailPoints: 0,
      ownedHandles: 0,
      renderObjects: 0,
      disposed: true,
    })
    expect(platformPool.metrics().active).toBe(0)
    expect(bonusPool.metrics().active).toBe(0)
    platformPool.clear()
    bonusPool.clear()
  })
})
