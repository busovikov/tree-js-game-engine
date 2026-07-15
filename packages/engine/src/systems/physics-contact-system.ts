import type { IWorld, ISystem } from '@haku/core'
import type { PhysicsCollisionEvent } from '@haku/physics'
import type { PhysicsWorldSystem } from './physics-world-system.js'

/**
 * Drains backend collision/trigger events after {@link PhysicsWorldSystem} steps.
 */
export class PhysicsContactSystem implements ISystem {
  readonly order = 51

  private readonly physicsSystem: PhysicsWorldSystem
  private frameEvents: PhysicsCollisionEvent[] = []

  constructor(physicsSystem: PhysicsWorldSystem) {
    this.physicsSystem = physicsSystem
  }

  update(_world: IWorld): void {
    const events: PhysicsCollisionEvent[] = []
    for (const slot of this.physicsSystem.getWorldSlots()) {
      events.push(...slot.world.drainCollisionEvents())
    }
    this.frameEvents = events
  }

  /** Events from the most recent update; cleared on the next drain call. */
  takeCollisionEvents(): PhysicsCollisionEvent[] {
    const events = this.frameEvents
    this.frameEvents = []
    return events
  }

  /** Peek events without clearing the contact system's frame buffer. */
  peekCollisionEvents(): readonly PhysicsCollisionEvent[] {
    return this.frameEvents
  }
}
