import type { EntityId, IWorld } from '@haku/core'
import { TransformComponent } from '@haku/core'
import type { Engine } from '@haku/engine'

let getEngine: (() => Engine | null) | null = null

/**
 * Lets Inspector (outside ViewportPanel) call into the live play-mode physics system.
 * ViewportPanel installs this while the engine exists.
 */
export function installPlayModePhysicsAccess(options: {
  getEngine: () => Engine | null
}): () => void {
  getEngine = options.getEngine
  return () => {
    if (getEngine === options.getEngine) {
      getEngine = null
    }
  }
}

/**
 * Variant B mid-play Transform: push authored ECS pose into Rapier, clear velocities,
 * snap presentation history (same contract as RespawnSystem / resetBodyState).
 */
export function teleportEntitiesToAuthoredTransform(
  world: IWorld,
  ids: readonly EntityId[],
): void {
  const physicsSystem = getEngine?.()?.getPhysicsWorldSystem()
  if (!physicsSystem) {
    return
  }

  for (const id of ids) {
    if (!physicsSystem.getBodyHandle(id)) {
      continue
    }
    const transform = world.getComponent(id, TransformComponent)
    if (!transform) {
      continue
    }
    physicsSystem.resetBodyState(
      id,
      {
        position: [
          transform.position[0],
          transform.position[1],
          transform.position[2],
        ],
        rotation: [
          transform.rotation[0],
          transform.rotation[1],
          transform.rotation[2],
          transform.rotation[3],
        ],
      },
      world,
    )
  }
}
