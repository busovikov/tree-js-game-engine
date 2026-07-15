import type { IWorld, ISystem } from '@haku/core'
import type { RaycastHit, RaycastQuery, ShapecastHit, ShapecastQuery, OverlapHit, OverlapQuery } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'

/**
 * Gameplay-facing physics queries that must run after collider reconcile (45) and
 * before the simulation step (50).
 */
export class PhysicsQuerySystem implements ISystem {
  readonly order = 46

  constructor(private readonly physicsSystem: PhysicsWorldSystem) {}

  update(_world: IWorld): void {
    // Queries are invoked on demand via raycast(); update keeps ordering contract only.
  }

  raycast(query: RaycastQuery): RaycastHit | null {
    return this.physicsSystem.getPhysicsWorld()?.raycast(query) ?? null
  }

  shapecast(query: ShapecastQuery): ShapecastHit | null {
    return this.physicsSystem.getPhysicsWorld()?.shapecast(query) ?? null
  }

  overlap(query: OverlapQuery): OverlapHit[] {
    return this.physicsSystem.getPhysicsWorld()?.overlap(query) ?? []
  }
}
