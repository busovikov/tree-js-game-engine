import { describe, expect, it } from 'vitest'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'
import { analyzeBounceRunTransition } from './route-reachability.js'
import type { BounceRunRoutePlatform } from './route-generator.js'

const source: BounceRunRoutePlatform = {
  index: 0,
  position: [0, 0, 0],
  size: [4, 0.6, 4.2],
}

describe('Bounce Run analytic reachability', () => {
  it('accepts a safely centered landing using the fixed-step controller constants', () => {
    const target: BounceRunRoutePlatform = {
      index: 1,
      position: [0, 0, 7],
      size: [4, 0.6, 4.2],
    }

    const result = analyzeBounceRunTransition(source, target)

    expect(BOUNCE_RUN_PHYSICS.fixedDt).toBe(1 / 60)
    expect(result.reachable).toBe(true)
    expect(result.landingTick).toBeGreaterThan(50)
    expect(result.margins.forward).toBeGreaterThan(1)
    expect(result.margins.lateral).toBeGreaterThan(1)
    expect(result.margins.vertical).toBe(BOUNCE_RUN_PHYSICS.bounceHeight)
  })

  it('rejects targets above the bounce envelope and beyond safe edge contact', () => {
    const tooHigh: BounceRunRoutePlatform = {
      index: 1,
      position: [0, BOUNCE_RUN_PHYSICS.bounceHeight, 4],
      size: [4, 0.6, 4.2],
    }
    const beyondForwardEdge: BounceRunRoutePlatform = {
      index: 1,
      position: [0, 0, 10],
      size: [4, 0.6, 4.2],
    }

    expect(analyzeBounceRunTransition(source, tooHigh)).toMatchObject({
      reachable: false,
      reason: 'vertical-clearance',
    })
    expect(analyzeBounceRunTransition(source, beyondForwardEdge)).toMatchObject({
      reachable: false,
      reason: 'forward-gap',
    })
  })

  it('includes deterministic lateral response and an explicit edge safety margin', () => {
    const centered: BounceRunRoutePlatform = {
      index: 1,
      position: [0, 0, 7],
      size: [2.2, 0.6, 4.2],
    }
    const outsideLateralEnvelope: BounceRunRoutePlatform = {
      ...centered,
      position: [6, 0, 7],
    }

    const result = analyzeBounceRunTransition(source, centered)
    expect(result.maxLateralTravel).toBeGreaterThan(3)
    expect(result.margins.lateral).toBeCloseTo(
      result.maxLateralTravel + 1.1 - BOUNCE_RUN_PHYSICS.ballRadius - BOUNCE_RUN_PHYSICS.edgeSafety,
    )
    expect(analyzeBounceRunTransition(source, outsideLateralEnvelope)).toMatchObject({
      reachable: false,
      reason: 'lateral-gap',
    })
  })
})
