import type { IWorld } from '@haku/core'
import type { PhysicsProjectSettings } from '@haku/schema'
import type { Engine } from '@haku/engine'
import {
  PHYSICS_CATCH_UP_POLICY,
  PhysicsColliderSystem,
  PhysicsContactSystem,
  PhysicsQuerySystem,
  PhysicsJointSystem,
  PhysicsAreaGravitySystem,
  startVehiclePlayMode,
  type VehiclePlayModeSession,
} from '@haku/engine'
import type { PhysicsCollisionEvent, RaycastHit, RaycastQuery } from '@haku/engine'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'

export interface PlayModePhysicsSession {
  vehicle?: VehiclePlayModeSession
  contactSystem: PhysicsContactSystem
  querySystem: PhysicsQuerySystem
  takeCollisionEvents(): PhysicsCollisionEvent[]
  peekCollisionEvents(): readonly PhysicsCollisionEvent[]
  raycast(query: RaycastQuery): RaycastHit | null
  dispose(): void
}

/**
 * Initializes Rapier + collider sync for editor play mode.
 * Caller must dispose when leaving play mode.
 */
export async function startPlayModePhysics(
  engine: Engine,
  _world: IWorld,
  canvas?: HTMLCanvasElement,
  physicsSettings?: PhysicsProjectSettings,
): Promise<PlayModePhysicsSession> {
  const backend = await createRapierPhysicsBackend()
  const physicsSystem = engine.setPhysicsBackend(backend, PHYSICS_CATCH_UP_POLICY)
  const colliderSystem = new PhysicsColliderSystem(physicsSystem, { physicsSettings })
  const contactSystem = new PhysicsContactSystem(physicsSystem)
  const querySystem = new PhysicsQuerySystem(physicsSystem)
  const jointSystem = new PhysicsJointSystem(physicsSystem)
  const areaGravitySystem = new PhysicsAreaGravitySystem(physicsSystem, { physicsSettings })
  engine.addSystem(colliderSystem)
  engine.addSystem(querySystem)
  engine.addSystem(areaGravitySystem)
  engine.addSystem(jointSystem)
  engine.addSystem(contactSystem)

  const vehicle = startVehiclePlayMode(engine, physicsSystem, {
    input: canvas ? { pointerTarget: canvas } : undefined,
  })

  return {
    vehicle,
    contactSystem,
    querySystem,
    takeCollisionEvents: () => contactSystem.takeCollisionEvents(),
    peekCollisionEvents: () => contactSystem.peekCollisionEvents(),
    raycast: (query) => querySystem.raycast(query),
    dispose() {
      vehicle.dispose()
      contactSystem.takeCollisionEvents()
      engine.removeSystem(contactSystem)
      engine.removeSystem(jointSystem)
      engine.removeSystem(areaGravitySystem)
      engine.removeSystem(querySystem)
      colliderSystem.dispose()
      engine.removeSystem(colliderSystem)
      engine.clearPhysicsBackend()
    },
  }
}
