import type { IWorld } from '@haku/core'
import type { Engine } from '@haku/engine'
import {
  PHYSICS_CATCH_UP_POLICY,
  PhysicsColliderSystem,
  startVehiclePlayMode,
  type VehiclePlayModeSession,
} from '@haku/engine'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'

export interface PlayModePhysicsSession {
  vehicle?: VehiclePlayModeSession
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
): Promise<PlayModePhysicsSession> {
  const backend = await createRapierPhysicsBackend()
  const physicsSystem = engine.setPhysicsBackend(backend, PHYSICS_CATCH_UP_POLICY)
  const colliderSystem = new PhysicsColliderSystem(physicsSystem)
  engine.addSystem(colliderSystem)

  const vehicle = startVehiclePlayMode(engine, physicsSystem, {
    input: canvas ? { pointerTarget: canvas } : undefined,
  })

  return {
    vehicle,
    dispose() {
      vehicle.dispose()
      colliderSystem.dispose()
      engine.removeSystem(colliderSystem)
      engine.clearPhysicsBackend()
    },
  }
}
