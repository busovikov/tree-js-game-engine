import { EngineScheduler, entityId } from '@haku/core'
import {
  InputManager,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  PhysicsWorldSystem,
  SceneLoader,
} from '@haku/engine'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { SceneDocumentSchema } from '@haku/schema'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BounceRunControlSystem,
  BounceRunInputSystem,
  BounceRunLandingSystem,
} from './game-systems.js'

const BALL = entityId('b1800000-0000-4000-8000-000000000001')

describe('Bounce Run fixed-step runtime', () => {
  afterEach(() => resetRapierPhysicsIds())

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
})
