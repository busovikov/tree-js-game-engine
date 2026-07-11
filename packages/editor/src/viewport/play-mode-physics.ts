import type { IWorld } from '@haku/core'
import type { Engine } from '@haku/engine'
import { PhysicsColliderSystem } from '@haku/engine'
import { createRapierPhysicsBackend } from '@haku/physics-rapier'

export interface PlayModePhysicsSession {
  dispose(): void
}

/**
 * Initializes Rapier + collider sync for editor play mode.
 * Caller must dispose when leaving play mode.
 */
export async function startPlayModePhysics(
  engine: Engine,
  _world: IWorld,
): Promise<PlayModePhysicsSession> {
  const backend = await createRapierPhysicsBackend()
  const physicsSystem = engine.setPhysicsBackend(backend)
  const colliderSystem = new PhysicsColliderSystem(physicsSystem)
  engine.addSystem(colliderSystem)

  return {
    dispose() {
      colliderSystem.dispose()
      engine.removeSystem(colliderSystem)
      engine.clearPhysicsBackend()
    },
  }
}
