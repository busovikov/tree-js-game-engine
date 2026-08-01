import { EngineScheduler, entityId } from '@haku/core'
import { PhysicsColliderSystem, PhysicsContactSystem, PhysicsWorldSystem, SceneLoader } from '@haku/engine'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { SceneDocumentSchema } from '@haku/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { bounceVelocityForHeight } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'
import { analyzeBounceRunTransition, type BounceRunPlatformSurface } from './route-reachability.js'

const BALL = entityId('b1800000-0000-4000-8000-000000000011')
const SOURCE_ID = 'b1800000-0000-4000-8000-000000000012'
const TARGET_ID = 'b1800000-0000-4000-8000-000000000013'

describe('Bounce Run reachability Rapier boundary', () => {
  afterEach(() => resetRapierPhysicsIds())

  it('predicts the fixed tick and forward position of a same-height Rapier landing', async () => {
    const source: BounceRunPlatformSurface = { position: [0, 0, 0], size: [4, 0.6, 4.2] }
    const initialTarget: BounceRunPlatformSurface = { position: [0, 0, 7], size: [4, 0.6, 4.2] }
    const initialPrediction = analyzeBounceRunTransition(source, initialTarget)
    const target: BounceRunPlatformSurface = {
      ...initialTarget,
      position: [0, 0, initialPrediction.predictedForwardTravel],
    }
    const prediction = analyzeBounceRunTransition(source, target)
    const world = SceneLoader.fromDocument(
      SceneDocumentSchema.parse({
        schemaVersion: 1,
        metadata: { name: 'Route reachability comparison' },
        prototypes: {},
        entities: [
          dynamicBall(),
          staticPlatform(SOURCE_ID, source),
          staticPlatform(TARGET_ID, target),
        ],
      }),
    ).world
    const backend = await createRapierPhysicsBackend({ gravity: [0, -BOUNCE_RUN_PHYSICS.gravity, 0] })
    const physics = new PhysicsWorldSystem()
    physics.setBackend(backend)
    const colliders = new PhysicsColliderSystem(physics)
    const contacts = new PhysicsContactSystem(physics)
    const scheduler = new EngineScheduler()
    scheduler.addSystem(colliders)
    scheduler.addSystem(physics)
    scheduler.addSystem(contacts)
    colliders.update(world)
    physics.setBodyLinearVelocity(BALL, [
      0,
      bounceVelocityForHeight(BOUNCE_RUN_PHYSICS.bounceHeight, BOUNCE_RUN_PHYSICS.gravity),
      BOUNCE_RUN_PHYSICS.forwardSpeed,
    ])

    let landingTick: number | null = null
    for (let tick = 1; tick <= BOUNCE_RUN_PHYSICS.maxSolverTicks; tick += 1) {
      scheduler.runFrame(world, BOUNCE_RUN_PHYSICS.fixedDt)
      if (
        contacts
          .peekCollisionEvents()
          .some(
            (event) =>
              (event.entityA === BALL.value && event.entityB === TARGET_ID) ||
              (event.entityB === BALL.value && event.entityA === TARGET_ID),
          )
      ) {
        landingTick = tick
        break
      }
    }

    expect(prediction.reachable).toBe(true)
    expect(landingTick).toBe(prediction.landingTick)
    expect(physics.getBodyTransform(BALL)?.position[2]).toBeCloseTo(
      prediction.predictedForwardTravel,
      1,
    )
    physics.dispose()
  })
})

function dynamicBall() {
  return {
    id: BALL.value,
    name: 'Ball',
    parent: null,
    activeSelf: true,
    components: [
      {
        type: '40000000-0000-4000-8000-000000000001',
        data: { position: [0, 0.86, 0] },
      },
      {
        type: '40000000-0000-4000-8000-000000000009',
        data: { shape: 'sphere', radius: BOUNCE_RUN_PHYSICS.ballRadius, restitution: 0 },
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
  }
}

function staticPlatform(id: string, platform: BounceRunPlatformSurface) {
  return {
    id,
    name: 'Platform',
    parent: null,
    activeSelf: true,
    components: [
      {
        type: '40000000-0000-4000-8000-000000000001',
        data: { position: [...platform.position] },
      },
      {
        type: '40000000-0000-4000-8000-000000000009',
        data: {
          shape: 'box',
          halfExtents: [platform.size[0] / 2, platform.size[1] / 2, platform.size[2] / 2],
        },
      },
    ],
  }
}
