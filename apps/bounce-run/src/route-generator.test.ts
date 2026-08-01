import { describe, expect, it } from 'vitest'
import { analyzeBounceRunBonus, analyzeBounceRunTransition } from './route-reachability.js'
import {
  BOUNCE_RUN_PLATFORM_VARIANTS,
  generateBounceRunRoute,
  validateBounceRunRoute,
  type BounceRunDifficultySchedule,
} from './route-generator.js'

const EXPLICIT_VARIANT_SCHEDULE = [
  {
    startIndex: 1,
    safetyMargin: 0.9,
    variantWeights: { normal: 1, wide: 0, narrow: 0, bounce: 0 },
  },
  {
    startIndex: 4,
    safetyMargin: 0.7,
    variantWeights: { normal: 0, wide: 1, narrow: 0, bounce: 0 },
  },
  {
    startIndex: 7,
    safetyMargin: 0.5,
    variantWeights: { normal: 0, wide: 0, narrow: 1, bounce: 0 },
  },
  {
    startIndex: 10,
    safetyMargin: 0.35,
    variantWeights: { normal: 0, wide: 0, narrow: 0, bounce: 1 },
  },
] as const satisfies BounceRunDifficultySchedule

describe('Bounce Run route generator', () => {
  it('generates every platform variant and one analytically reachable bonus for a fixed difficulty schedule', () => {
    const route = generateBounceRunRoute({
      seed: 0x13b0_0b,
      platformCount: 16,
      difficultySchedule: EXPLICIT_VARIANT_SCHEDULE,
      bonus: {
        enabled: true,
        minimumPlatformCount: 12,
        radius: 0.3,
        sensorClearance: 0.2,
      },
    })

    expect(new Set(route.platforms.slice(1).map((platform) => platform.variant))).toEqual(
      new Set(['normal', 'wide', 'narrow', 'bounce']),
    )
    expect(route.bonuses).toHaveLength(1)
    const bonus = route.bonuses[0]!
    const reachability = analyzeBounceRunBonus(
      route.platforms[bonus.sourcePlatformIndex]!,
      route.platforms[bonus.targetPlatformIndex]!,
      bonus,
    )
    expect(reachability.reachable).toBe(true)
    expect(reachability.margins.mandatoryPath).toBeGreaterThanOrEqual(0)
    expect(validateBounceRunRoute(route)).toEqual([])
  })

  it('keeps variant, decision, and bonus prefixes stable across a longer horizon', () => {
    const config = {
      seed: 0xb0_0b,
      difficultySchedule: EXPLICIT_VARIANT_SCHEDULE,
      bonus: {
        enabled: true as const,
        minimumPlatformCount: 12,
        radius: 0.3,
        sensorClearance: 0.2,
      },
    }
    const short = generateBounceRunRoute({ ...config, platformCount: 16 })
    const long = generateBounceRunRoute({ ...config, platformCount: 64 })

    expect(long.platforms.slice(0, short.platforms.length)).toEqual(short.platforms)
    expect(long.decisionLog.slice(0, short.decisionLog.length)).toEqual(short.decisionLog)
    expect(long.bonuses).toEqual(short.bonuses)
    expect(long.bonusDecision).toEqual(short.bonusDecision)
  })

  it('uses explicit variant dimensions and bounce launch semantics without breaking the route', () => {
    const route = generateBounceRunRoute({
      seed: 0x51ce,
      platformCount: 16,
      difficultySchedule: EXPLICIT_VARIANT_SCHEDULE,
    })

    for (const platform of route.platforms.slice(1)) {
      expect(platform.size).toEqual(BOUNCE_RUN_PLATFORM_VARIANTS[platform.variant].size)
      expect(platform.behavior).toEqual(BOUNCE_RUN_PLATFORM_VARIANTS[platform.variant].behavior)
    }
    const bounce = route.platforms.find((platform) => platform.variant === 'bounce')!
    const target = route.platforms[bounce.index + 1]!
    const boosted = analyzeBounceRunTransition(bounce, target)
    const standard = analyzeBounceRunTransition(
      { ...bounce, behavior: BOUNCE_RUN_PLATFORM_VARIANTS.normal.behavior },
      target,
    )
    expect(boosted.reachable).toBe(true)
    expect(boosted.predictedForwardTravel).toBeGreaterThan(standard.predictedForwardTravel)
  })

  it('rejects malformed difficulty and bonus configuration at their boundaries', () => {
    expect(() =>
      generateBounceRunRoute({ seed: 1, platformCount: 16, difficultySchedule: [] }),
    ).toThrow('difficultySchedule must contain at least one band')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        difficultySchedule: [
          {
            startIndex: 2,
            safetyMargin: 0.9,
            variantWeights: { normal: 1, wide: 0, narrow: 0, bounce: 0 },
          },
        ],
      }),
    ).toThrow('difficultySchedule must start at platform index 1')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        difficultySchedule: [
          {
            startIndex: 1,
            safetyMargin: 0.9,
            variantWeights: { normal: 0, wide: 0, narrow: 0, bounce: 0 },
          },
        ],
      }),
    ).toThrow('variantWeights must have a positive total')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        difficultySchedule: [
          {
            startIndex: 1,
            safetyMargin: 0.4,
            variantWeights: {
              normal: 1,
              wide: 0,
              narrow: 0,
              bounce: 0,
              unknown: 1,
            },
          },
        ] as unknown as BounceRunDifficultySchedule,
      }),
    ).toThrow('variantWeights contains unknown platform variant: unknown')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        bonus: { enabled: true, minimumPlatformCount: 2, radius: 0.3, sensorClearance: 0.2 },
      }),
    ).toThrow('bonus.minimumPlatformCount must be an integer between 3 and 10000')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        bonus: { enabled: true, minimumPlatformCount: 12, radius: 0, sensorClearance: 0.2 },
      }),
    ).toThrow('bonus.radius must be finite and between 0.1 and 0.75')
    expect(() =>
      generateBounceRunRoute({
        seed: 1,
        platformCount: 16,
        bonus: {
          enabled: true,
          minimumPlatformCount: 12,
          radius: 0.3,
          sensorClearance: 0.8,
        },
      }),
    ).toThrow('bonus.sensorClearance must be finite and between 0 and 0.75')
  })

  it('omits the optional bonus when disabled or the configured route is too short', () => {
    const disabled = generateBounceRunRoute({ seed: 9, platformCount: 16 })
    const short = generateBounceRunRoute({
      seed: 9,
      platformCount: 11,
      bonus: {
        enabled: true,
        minimumPlatformCount: 12,
        radius: 0.3,
        sensorClearance: 0.2,
      },
    })

    expect(disabled.bonuses).toEqual([])
    expect(disabled.bonusDecision.selected).toBe('disabled')
    expect(short.bonuses).toEqual([])
    expect(short.bonusDecision.selected).toBe('route-too-short')
  })

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
      const route = generateBounceRunRoute({
        seed,
        platformCount: 128,
        bonus: {
          enabled: true,
          minimumPlatformCount: 12,
          radius: 0.3,
          sensorClearance: 0.2,
        },
      })
      expect(validateBounceRunRoute(route), `seed ${seed}`).toEqual([])
      expect(route.bonuses, `seed ${seed}`).toHaveLength(1)
      expect(
        route.decisionLog.every((decision) => decision.attempts <= decision.maxCandidateAttempts),
        `seed ${seed}`,
      ).toBe(true)
      expect(
        route.platforms.slice(1).every((platform) => {
          const descriptor = BOUNCE_RUN_PLATFORM_VARIANTS[platform.variant]
          return (
            platform.size.every(
              (dimension, axis) =>
                Number.isFinite(dimension) && dimension === descriptor.size[axis],
            ) && platform.behavior === descriptor.behavior
          )
        }),
        `seed ${seed}`,
      ).toBe(true)
      expect(route.bonusDecision.attempts, `seed ${seed}`).toBeLessThanOrEqual(
        route.bonusDecision.maxAttempts,
      )
    }
  })
})
