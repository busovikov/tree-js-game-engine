import type { IWorld } from '@haku/core'
import type { PoolLifecycleParticipant } from '@haku/pool'
import type { RenderSyncSystem } from '../render-sync/render-sync-system.js'
import type { PhysicsColliderSystem } from './physics-collider-system.js'

export interface EnginePoolParticipantOptions {
  readonly world: IWorld
  readonly colliders?: PhysicsColliderSystem
  readonly render?: RenderSyncSystem
}

/**
 * Reconciles external engine state at the synchronous pool lifecycle boundary. Inactive bodies
 * are destroyed before another physics step and are recreated from baseline on acquire; render
 * objects follow the same immediate removal/recreation contract.
 */
export function createEnginePoolParticipant(
  options: EnginePoolParticipantOptions,
): PoolLifecycleParticipant {
  return {
    onPoolLifecycle() {
      options.colliders?.update(options.world)
      options.render?.update(options.world)
    },
  }
}
