import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, beforeEach } from 'vitest'
import { PhysicsControllerComponent, TransformComponent } from '@haku/core'
import { loadSceneDocument } from '@haku/serializer'
import { createRapierPhysicsBackend, resetRapierPhysicsIds } from '@haku/physics-rapier'
import { PhysicsWorldSystem, PHYSICS_CATCH_UP_POLICY } from './physics-world-system.js'
import { PhysicsColliderSystem } from './physics-collider-system.js'
import { PhysicsControllerSystem } from './vehicle-controller-system.js'
import { PhysicsJointSystem } from './physics-joint-system.js'
import { PhysicsAreaGravitySystem } from './physics-area-gravity-system.js'
import { PhysicsContactSystem } from './physics-contact-system.js'
import { PhysicsQuerySystem } from './physics-query-system.js'
import { VehicleVisualSyncSystem } from './vehicle-visual-sync-system.js'

const SCENE_PATH = fileURLToPath(
  new URL(
    '../../../../apps/playground/public/assets/scenes/demos/isaac/revolute-joint-vehicle.scene.json',
    import.meta.url,
  ),
)

/**
 * Regression for the shipped revolute-joint-vehicle demo: the old rig trapped Rapier with a NaN
 * `unreachable` a couple seconds into play, and worse when driven-and-steered in the full scene. Run
 * the real scene file through the whole editor play-mode system set *with throttle + steer* and assert
 * it never traps and stays finite — the scene-independence guarantee, exercised end to end.
 */
describe('revolute-joint-vehicle scene (full play-mode pipeline, driven + steered)', () => {
  beforeEach(() => resetRapierPhysicsIds())

  it('plays the real scene file under drive + steer without trapping Rapier', async () => {
    const world = loadSceneDocument(JSON.parse(readFileSync(SCENE_PATH, 'utf-8')))

    const backend = await createRapierPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem(PHYSICS_CATCH_UP_POLICY)
    physicsSystem.setBackend(backend)

    const collider = new PhysicsColliderSystem(physicsSystem)
    const controller = new PhysicsControllerSystem(physicsSystem)
    const joint = new PhysicsJointSystem(physicsSystem)
    const areaGravity = new PhysicsAreaGravitySystem(physicsSystem)
    const contact = new PhysicsContactSystem(physicsSystem)
    const query = new PhysicsQuerySystem(physicsSystem)
    const visualSync = new VehicleVisualSyncSystem(physicsSystem, controller)

    const vehicleId = [...world.query(PhysicsControllerComponent)][0]
    expect(vehicleId).toBeDefined()

    const yaw = (): number => {
      const q = world.getComponent(vehicleId!, TransformComponent)!.rotation
      return (Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] ** 2 + q[2] ** 2)) * 180) / Math.PI
    }

    // No explicit bootstrap — exactly like the editor: systems auto-bootstrap on their first update().
    let settledX = 0
    let settledZ = 0
    let steerStartYaw = 0
    expect(() => {
      for (let i = 0; i < 420; i++) {
        collider.update(world)
        // Settle for the first 90 frames, then drive + steer.
        if (i === 90) {
          const p = world.getComponent(vehicleId!, TransformComponent)!.position
          settledX = p[0]
          settledZ = p[2]
          steerStartYaw = yaw()
          controller.setVehicleInput(vehicleId!, { throttle: 1, steer: 1 })
        }
        controller.update(world, 1 / 60)
        joint.update(world)
        areaGravity.update(world)
        physicsSystem.update(world, 1 / 60)
        contact.update(world)
        query.update(world)
        visualSync.update(world)
      }
    }).not.toThrow()

    const pos = world.getComponent(vehicleId!, TransformComponent)!.position
    expect(pos.every((v) => Number.isFinite(v))).toBe(true)
    // The car must actually drive under throttle through the real editor pipeline (auto-bootstrap),
    // not just fail to crash — a wheel/chassis jam or a dead input path would leave it standing still.
    expect(Math.hypot(pos[0] - settledX, pos[2] - settledZ)).toBeGreaterThan(2)
    // And it must actually turn under steer — a too-weak steer motor lets the front wheels free-swivel
    // (caster) and the car drives straight.
    expect(Math.abs(yaw() - steerStartYaw)).toBeGreaterThan(10)

    contact.takeCollisionEvents()
    collider.dispose()
    physicsSystem.dispose()
  })
})
