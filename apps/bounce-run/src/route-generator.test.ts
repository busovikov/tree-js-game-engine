import { describe, expect, it } from 'vitest'
import { analyzeBounceRunTransition } from './route-reachability.js'
import { generateBounceRunRoute, validateBounceRunRoute } from './route-generator.js'

describe('Bounce Run route generator', () => {
  it('returns the same complete platform sequence and decision log for the same seed and config', () => {
    const config = Object.freeze({ seed: 0x5eed, platformCount: 64 })

    const first = generateBounceRunRoute(config)
    const second = generateBounceRunRoute(config)

    expect(first.platforms).toEqual(second.platforms)
    expect(first.decisionLog).toEqual(second.decisionLog)
  })

  it('keeps the generated prefix stable when an infinite route requests a longer horizon', () => {
    const short = generateBounceRunRoute({ seed: 0x5eed, platformCount: 64 })
    const long = generateBounceRunRoute({ seed: 0x5eed, platformCount: 128 })

    expect(long.platforms.slice(0, short.platforms.length)).toEqual(short.platforms)
    expect(long.decisionLog.slice(0, short.decisionLog.length)).toEqual(short.decisionLog)
  })

  it('starts safely and preserves explicit difficulty margins along a reachable main path', () => {
    const route = generateBounceRunRoute({ seed: 42, platformCount: 96 })

    expect(route.platforms[0]).toMatchObject({
      index: 0,
      sourceIndex: null,
      role: 'start',
      position: [0, 0, 2],
      size: [6, 0.6, 8],
    })
    expect(route.decisionLog).toHaveLength(route.platforms.length)

    for (let index = 1; index < route.platforms.length; index += 1) {
      const previous = route.platforms[index - 1]!
      const platform = route.platforms[index]!
      const decision = route.decisionLog[index]!
      const reachability = analyzeBounceRunTransition(previous, platform)

      expect(platform.sourceIndex).toBe(previous.index)
      expect(reachability.reachable).toBe(true)
      expect(reachability.margins.forward).toBeGreaterThanOrEqual(
        decision.requiredSafetyMargin - 1e-12,
      )
      expect(reachability.margins.lateral).toBeGreaterThanOrEqual(
        decision.requiredSafetyMargin - 1e-12,
      )
      expect(platform.position[2] - previous.position[2]).toBeCloseTo(
        reachability.predictedForwardTravel,
        12,
      )
      expect(decision.requiredSafetyMargin).toBeGreaterThanOrEqual(0.35)
      expect(decision.attempts).toBeLessThanOrEqual(decision.maxCandidateAttempts)
    }
    expect(route.decisionLog[1]!.requiredSafetyMargin).toBeGreaterThan(
      route.decisionLog.at(-1)!.requiredSafetyMargin,
    )
    expect(validateBounceRunRoute(route)).toEqual([])
  })

  it('rejects invalid config and uses a bounded deterministic fallback without candidate retries', () => {
    expect(() => generateBounceRunRoute({ seed: Number.NaN, platformCount: 8 })).toThrow(
      'seed must be a finite integer',
    )
    expect(() => generateBounceRunRoute({ seed: 1, platformCount: 1 })).toThrow(
      'platformCount must be an integer between 2 and 10000',
    )
    expect(() =>
      generateBounceRunRoute({ seed: 1, platformCount: 8, maxCandidateAttempts: -1 }),
    ).toThrow('maxCandidateAttempts must be an integer between 0 and 32')

    const route = generateBounceRunRoute({
      seed: 0xface,
      platformCount: 32,
      maxCandidateAttempts: 0,
    })
    expect(route.decisionLog.slice(1).every((decision) => decision.selected === 'fallback')).toBe(
      true,
    )
    expect(route.decisionLog.slice(1).every((decision) => decision.attempts === 0)).toBe(true)
    expect(validateBounceRunRoute(route)).toEqual([])
  })

  it('reports intersecting platforms and broken route continuity', () => {
    const route = generateBounceRunRoute({ seed: 7, platformCount: 3 })
    const invalid = {
      ...route,
      platforms: [
        route.platforms[0]!,
        { ...route.platforms[1]!, position: [0, 0, 2] as const },
        route.platforms[2]!,
      ],
    }

    expect(validateBounceRunRoute(invalid).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['platform-intersection', 'route-discontinuity']),
    )
  })

  it('generates many bounded routes without intersections, invalid gaps, or missing paths', () => {
    for (let seed = 0; seed < 256; seed += 1) {
      const route = generateBounceRunRoute({ seed, platformCount: 128 })
      expect(validateBounceRunRoute(route), `seed ${seed}`).toEqual([])
      expect(
        route.decisionLog.every(
          (decision) => decision.attempts <= decision.maxCandidateAttempts,
        ),
        `seed ${seed}`,
      ).toBe(true)
    }
  })
})
