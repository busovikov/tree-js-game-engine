import { describe, expect, it } from 'vitest'
import type { PhysicsCollisionEvent } from '@haku/engine'
import { LandingTracker } from './landing-tracker.js'

function contact(
  entityA: string,
  entityB: string,
  normal: readonly [number, number, number],
): PhysicsCollisionEvent {
  return {
    kind: 'collision',
    phase: 'enter',
    entityA,
    entityB,
    contacts: [{ point: [0, 0, 0], normal, depth: -0.01 }],
  }
}

describe('LandingTracker', () => {
  it('emits once for a downward top contact regardless of collider order', () => {
    const tracker = new LandingTracker('ball', { minimumUpNormal: 0.65 })

    expect(tracker.consume(12, [contact('platform', 'ball', [0, 1, 0])], -5)).toEqual({
      tick: 12,
      platformId: 'platform',
      normalUp: 1,
      point: [0, 0, 0],
    })
    expect(tracker.consume(12, [contact('ball', 'platform-2', [0, -1, 0])], -5)).toBeNull()
  })

  it('rejects side/edge contacts, rising motion, and duplicate enters', () => {
    const tracker = new LandingTracker('ball', { minimumUpNormal: 0.65 })

    expect(
      tracker.consume(
        2,
        [contact('platform', 'ball', [1, 0, 0]), contact('platform', 'ball', [0, 0.64, 0.77])],
        -6,
      ),
    ).toBeNull()
    expect(tracker.consume(3, [contact('platform', 'ball', [0, 1, 0])], 1)).toBeNull()
    expect(
      tracker.consume(
        4,
        [contact('platform', 'ball', [0, 1, 0]), contact('platform', 'ball', [0, 1, 0])],
        -6,
      ),
    ).toEqual({ tick: 4, platformId: 'platform', normalUp: 1, point: [0, 0, 0] })
  })
})
