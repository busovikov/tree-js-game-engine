// @vitest-environment happy-dom

import { EngineScheduler, TransformComponent, World, entityId } from '@haku/core'
import {
  InputManager,
  MeshRendererComponent,
  MeshRendererSchema,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  PhysicsWorldSystem,
  SceneLoader,
} from '@haku/engine'
import { EntityPool } from '@haku/pool'
import { ColliderComponent, ColliderSchema } from '@haku/physics'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { SceneDocumentSchema } from '@haku/schema'
import { UIService } from '@haku/ui'
import { afterEach, describe, expect, it } from 'vitest'
import documentAsset from '../public/assets/ui/hud.ui.json'
import {
  BounceRunBonusCollectionSystem,
  BounceRunControlSystem,
  BounceRunInputSystem,
  BounceRunLandingSystem,
} from './game-systems.js'
import { createPoolBackedBounceRunRoute } from './infinite-route.js'
import { generateBounceRunRoute, type BounceRunDifficultySchedule } from './route-generator.js'
import { createBounceRunSessionRuntime } from './session-runtime.js'
import { loadBounceRunUIDocument } from './ui-document.js'

const BALL = entityId('b1800000-0000-4000-8000-000000000001')

describe('Bounce Run fixed-step runtime', () => {
  afterEach(() => resetRapierPhysicsIds())

  it('accepts only bounded finite lateral values through the public action port', () => {
    const input = new BounceRunInputSystem(
      new InputManager(),
      () => {},
      () => {},
    )
    input.setLateralAction(1)
    input.update()
    expect(input.lateralInput).toBe(1)
    input.setLateralAction(-1)
    input.update()
    expect(input.lateralInput).toBe(-1)
    input.setLateralAction(null)
    input.update()
    expect(input.lateralInput).toBe(0)
    expect(() => input.setLateralAction(Number.NaN)).toThrow(/lateral action/i)
    expect(() => input.setLateralAction(2)).toThrow(/lateral action/i)
  })

  it('turns a monitored downward contact into a deterministic analytic bounce', async () => {
    const loaded = SceneLoader.fromDocument(
      SceneDocumentSchema.parse({
        schemaVersion: 1,
        metadata: { name: 'Bounce integration' },
        prototypes: {},
        entities: [
          {
            id: BALL.value,
            name: 'Ball',
            parent: null,
            activeSelf: true,
            components: [
              {
                type: '40000000-0000-4000-8000-000000000001',
                data: { position: [0, 3, 0] },
              },
              {
                type: '40000000-0000-4000-8000-000000000009',
                data: { shape: 'sphere', radius: 0.5, restitution: 0 },
              },
              {
                type: '40000000-0000-4000-8000-000000000010',
                data: {
                  type: 'dynamic',
                  massMode: 'explicit',
                  mass: 1,
                  canSleep: false,
                  ccdEnabled: true,
                  contactMonitor: true,
                  maxReportedContacts: 4,
                },
              },
            ],
          },
          {
            id: 'b1800000-0000-4000-8000-000000000002',
            name: 'Track',
            parent: null,
            activeSelf: true,
            components: [
              {
                type: '40000000-0000-4000-8000-000000000001',
                data: { position: [0, 0, 40] },
              },
              {
                type: '40000000-0000-4000-8000-000000000009',
                data: { shape: 'box', halfExtents: [8, 0.25, 80] },
              },
            ],
          },
        ],
      }),
    )
    const backend = await createRapierPhysicsBackend({ gravity: [0, -18, 0] })
    const physics = new PhysicsWorldSystem()
    physics.setBackend(backend)
    const colliders = new PhysicsColliderSystem(physics)
    const contacts = new PhysicsContactSystem(physics)
    const input = new BounceRunInputSystem(
      new InputManager(),
      () => {},
      () => {},
    )
    const control = new BounceRunControlSystem(BALL, physics, input)
    const scheduler = new EngineScheduler()
    const landing = new BounceRunLandingSystem(BALL, contacts, control, scheduler)
    scheduler.addSystem(colliders)
    scheduler.addSystem(control)
    scheduler.addSystem(physics)
    scheduler.addSystem(contacts)
    scheduler.addSystem(landing)

    const verticalVelocities: number[] = []
    for (let frame = 0; frame < 120; frame += 1) {
      scheduler.runFrame(loaded.world, 1 / 60)
      verticalVelocities.push(physics.getBodyLinearVelocity(BALL)?.[1] ?? 0)
    }

    const bounceIndex = verticalVelocities.findIndex(
      (velocity, index) => index > 0 && velocity > 8 && verticalVelocities[index - 1]! < 0,
    )
    expect(bounceIndex).toBeGreaterThan(20)
    expect(verticalVelocities[bounceIndex]).toBeCloseTo(Math.sqrt(2 * 18 * 2.6) - 18 / 60, 5)
    expect(physics.getBodyTransform(BALL)?.position[2]).toBeGreaterThan(12.5)
    physics.dispose()
  })

  it('applies a descriptor boost once and rejects the repeated landing enter in the same tick', () => {
    let velocity: readonly [number, number, number] = [0, -5, 0]
    const physics = {
      getBodyLinearVelocity: () => velocity,
      setBodyLinearVelocity: (_entity: unknown, next: readonly [number, number, number]) => {
        velocity = next
      },
    } as unknown as PhysicsWorldSystem
    const input = new BounceRunInputSystem(
      new InputManager(),
      () => {},
      () => {},
    )
    const control = new BounceRunControlSystem(BALL, physics, input)
    const scheduler = new EngineScheduler()
    const contacts = {
      peekCollisionEvents: () => [
        {
          kind: 'collision',
          phase: 'enter',
          entityA: BALL.value,
          entityB: 'boost-platform',
          contacts: [{ point: [0, 0, 0], normal: [0, -1, 0], depth: -0.01 }],
        } as const,
      ],
    } as unknown as PhysicsContactSystem
    const route = {
      platformDescriptor: () => ({ behavior: { kind: 'boost', bounceHeight: 3.6 } }),
    } as never
    const landing = new BounceRunLandingSystem(BALL, contacts, control, scheduler, route)
    const world = new World()

    control.update(world, 1 / 60)
    landing.update()
    control.update(world, 1 / 60)
    expect(velocity[1]).toBeCloseTo(Math.sqrt(2 * 18 * 3.6), 8)

    velocity = [0, -4, 0]
    control.update(world, 1 / 60)
    landing.update()
    control.update(world, 1 / 60)
    expect(velocity[1]).toBe(-4)
  })

  it('materializes scheduled platform leases and awards one graph-owned score for a pooled bonus overlap', async () => {
    const schedule = [
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
    const bonus = {
      enabled: true,
      minimumPlatformCount: 5,
      radius: 0.35,
      sensorClearance: 0.15,
    } as const
    const seed = 0x13_02
    const pure = generateBounceRunRoute({
      seed,
      platformCount: 5,
      difficultySchedule: schedule,
      bonus,
    })
    const world = new World()
    const platformPool = new EntityPool({
      id: 'bounce-run-platform-integration',
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
      id: 'bounce-run-bonus-integration',
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
          ColliderComponent,
          ColliderSchema.parse({ shape: 'sphere', radius: 0.5, isTrigger: true }),
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
      seed,
      activeAhead: 5,
      retainBehind: 2,
      difficultySchedule: schedule,
      bonus,
    })

    expect(route.activePlatforms().map(({ descriptor }) => descriptor.variant)).toEqual([
      'normal',
      'normal',
      'wide',
      'narrow',
      'bounce',
    ])
    for (const lease of route.activePlatforms()) {
      const mesh = world.getComponent(lease.entity, MeshRendererComponent)
      const collider = world.getComponent(lease.entity, ColliderComponent)
      expect(lease.descriptor).toEqual(pure.platforms[lease.platformIndex])
      expect(mesh?.geometryParams).toMatchObject({
        width: lease.descriptor.size[0],
        height: lease.descriptor.size[1],
        depth: lease.descriptor.size[2],
      })
      expect(collider).toMatchObject({
        shape: 'box',
        halfExtents: lease.descriptor.size.map((value) => value / 2),
      })
    }

    const activeBonus = route.activeBonuses()[0]!
    expect(activeBonus.descriptor).toEqual(pure.bonuses[0])
    expect(world.getComponent(activeBonus.entity, ColliderComponent)).toMatchObject({
      shape: 'sphere',
      radius: activeBonus.descriptor.radius,
      isTrigger: true,
    })
    expect(bonusPool.metrics()).toMatchObject({ total: 1, active: 1 })
    world.createEntity('Ball', BALL)
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [...activeBonus.descriptor.position],
    })

    const host = document.createElement('div')
    const ui = new UIService()
    const uiDocument = await loadBounceRunUIDocument(async () => ({
      ok: true,
      json: async () => documentAsset,
    }))
    ui.register(uiDocument)
    ui.mount(uiDocument.id, host)
    const session = createBounceRunSessionRuntime({ scheduler: new EngineScheduler(), ui })
    session.start()
    const overlap = {
      kind: 'trigger',
      phase: 'enter',
      entityA: BALL.value,
      entityB: activeBonus.entity.value,
    } as const
    const collector = new BounceRunBonusCollectionSystem(
      BALL,
      { peekCollisionEvents: () => [overlap] },
      route,
      session,
    )

    collector.update(world)
    collector.update(world)

    expect(session.score()).toBe(1)
    expect(route.activeBonuses()).toEqual([])
    expect(bonusPool.metrics()).toMatchObject({ total: 1, active: 0 })

    route.reset()
    session.restart()
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [0, 3, 0],
    })
    collector.update(world)
    expect(session.score()).toBe(0)
    expect(route.activeBonuses()).toHaveLength(1)

    const reacquiredBonus = route.activeBonuses()[0]!
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [...reacquiredBonus.descriptor.position],
    })
    collector.update(world)
    expect(session.score()).toBe(1)

    route.reset()
    session.pause()
    const pausedBonus = route.activeBonuses()[0]!
    world.addComponent(BALL, TransformComponent, {
      ...TransformComponent.defaults(),
      position: [...pausedBonus.descriptor.position],
    })
    collector.update(world)
    expect(session.score()).toBe(1)
    expect(route.activeBonuses()).toHaveLength(1)
    route.dispose()
    session.destroy()
    ui.destroyAll()
  })
})
