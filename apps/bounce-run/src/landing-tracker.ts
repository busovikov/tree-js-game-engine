import type { PhysicsCollisionEvent } from '@haku/engine'
import type { Vec3 } from '@haku/schema'

export interface LandingTrackerOptions {
  readonly minimumUpNormal?: number
  readonly minimumDownwardSpeed?: number
}

export interface LandingEvent {
  readonly tick: number
  readonly platformId: string
  readonly normalUp: number
  readonly point: Vec3
}

/**
 * Converts unordered physics collision enters into one fixed-tick landing.
 *
 * Rapier's manifold normal points from collider A toward collider B, so it is
 * inverted when the tracked body is entity A. Solver contacts are world-space.
 */
export class LandingTracker {
  private readonly minimumUpNormal: number
  private readonly minimumDownwardSpeed: number
  private lastLandingTick = -1

  constructor(
    private readonly entityId: string,
    options: LandingTrackerOptions = {},
  ) {
    this.minimumUpNormal = options.minimumUpNormal ?? 0.65
    this.minimumDownwardSpeed = options.minimumDownwardSpeed ?? 0.25
  }

  consume(
    tick: number,
    events: readonly PhysicsCollisionEvent[],
    verticalVelocity: number,
  ): LandingEvent | null {
    if (
      !Number.isInteger(tick) ||
      tick < 0 ||
      !Number.isFinite(verticalVelocity) ||
      verticalVelocity > -this.minimumDownwardSpeed ||
      tick === this.lastLandingTick
    ) {
      return null
    }

    for (const event of events) {
      if (
        event.kind !== 'collision' ||
        event.phase !== 'enter' ||
        (event.entityA !== this.entityId && event.entityB !== this.entityId)
      ) {
        continue
      }
      const platformId = event.entityA === this.entityId ? event.entityB : event.entityA
      for (const contact of event.contacts ?? []) {
        const normalUp = event.entityA === this.entityId ? -contact.normal[1] : contact.normal[1]
        if (Number.isFinite(normalUp) && normalUp >= this.minimumUpNormal) {
          this.lastLandingTick = tick
          return { tick, platformId, normalUp, point: [...contact.point] as Vec3 }
        }
      }
    }
    return null
  }

  reset(): void {
    this.lastLandingTick = -1
  }
}
