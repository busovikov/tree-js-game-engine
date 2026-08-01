import type { EntityId } from '@haku/core'
import type { PresentationEffectsService } from '@haku/engine'
import type { EntityPool, PoolLifecycleEvent, PoolLifecycleParticipant } from '@haku/pool'
import type { PresentationPosition } from '@haku/engine'

export interface BounceRunLandingEffectEvent {
  readonly platform: EntityId
  readonly position: PresentationPosition
}

export interface BounceRunEffectsComposition {
  landing(event: BounceRunLandingEffectEvent): void
  bonus(position: PresentationPosition): void
  fail(position: PresentationPosition): void
  trail(position: PresentationPosition): void
  reset(): void
  metrics(): { readonly subscriptions: number }
  dispose(): void
}

/** Maps accepted Bounce Run gameplay events to the reusable typed engine presentation API. */
export function createBounceRunEffectsComposition(options: {
  readonly effects: PresentationEffectsService
  readonly platformPool: EntityPool
  readonly bonusPool: EntityPool
}): BounceRunEffectsComposition {
  let disposed = false
  let subscriptions = 0
  const participant: PoolLifecycleParticipant = {
    onPoolLifecycle(event: PoolLifecycleEvent): void {
      if (event.action !== 'acquire') options.effects.clearOwner(event.root)
    },
  }
  const unregister = [
    options.platformPool.registerParticipant(participant),
    options.bonusPool.registerParticipant(participant),
  ]
  subscriptions = unregister.length

  const requireLive = (): void => {
    if (disposed) throw new Error('Bounce Run effects composition is disposed')
  }

  return {
    landing(event) {
      requireLive()
      options.effects.emit({
        kind: 'landing',
        shape: 'ring',
        position: event.position,
        color: '#79ecff',
        duration: 0.32,
        size: 0.72,
        owner: event.platform,
      })
    },
    bonus(position) {
      requireLive()
      options.effects.emit({
        kind: 'bonus',
        shape: 'spark',
        position,
        color: '#ffd84d',
        duration: 0.5,
        size: 0.82,
      })
    },
    fail(position) {
      requireLive()
      options.effects.emit({
        kind: 'fail',
        shape: 'pulse',
        position,
        color: '#ff5b72',
        duration: 0.75,
        size: 1.25,
      })
    },
    trail(position) {
      requireLive()
      options.effects.sampleTrail(position)
    },
    reset() {
      requireLive()
      options.effects.reset()
    },
    metrics: () => ({ subscriptions }),
    dispose() {
      if (disposed) return
      disposed = true
      for (const remove of unregister) remove()
      subscriptions = 0
      options.effects.dispose()
    },
  }
}
