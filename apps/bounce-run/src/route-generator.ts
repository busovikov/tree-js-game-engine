import {
  analyzeBounceRunBonus,
  analyzeBounceRunTransition,
  sampleBounceRunTrajectory,
  type BounceRunBonusReachabilityResult,
  type BounceRunLaunchBehavior,
  type BounceRunReachabilityResult,
  type ReachabilityFailureReason,
} from './route-reachability.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'

const DEFAULT_MAX_CANDIDATE_ATTEMPTS = 6
const MINIMUM_SURFACE_GAP = 0.3
const START_PLATFORM_SIZE = [6, 0.6, 8] as const
const MAX_BONUS_ATTEMPTS = 8
const BONUS_SEED_SALT = 0x9e37_79b9

export type BounceRunPlatformVariant = 'normal' | 'wide' | 'narrow' | 'bounce'

export interface BounceRunPlatformVariantDescriptor {
  readonly size: readonly [number, number, number]
  readonly behavior: BounceRunLaunchBehavior
}

export const BOUNCE_RUN_PLATFORM_VARIANTS = Object.freeze({
  normal: {
    size: [4, 0.6, 4.2],
    behavior: { kind: 'standard', bounceHeight: BOUNCE_RUN_PHYSICS.bounceHeight },
  },
  wide: {
    size: [5.6, 0.6, 4.6],
    behavior: { kind: 'standard', bounceHeight: BOUNCE_RUN_PHYSICS.bounceHeight },
  },
  narrow: {
    size: [2.8, 0.6, 4],
    behavior: { kind: 'standard', bounceHeight: BOUNCE_RUN_PHYSICS.bounceHeight },
  },
  bounce: {
    size: [4, 0.6, 4.2],
    behavior: { kind: 'boost', bounceHeight: 3.6 },
  },
} as const satisfies Record<BounceRunPlatformVariant, BounceRunPlatformVariantDescriptor>)

export type BounceRunVariantWeights = Readonly<Record<BounceRunPlatformVariant, number>>

export interface BounceRunDifficultyBand {
  readonly startIndex: number
  readonly safetyMargin: number
  readonly variantWeights: BounceRunVariantWeights
}

export type BounceRunDifficultySchedule = readonly BounceRunDifficultyBand[]

export const DEFAULT_BOUNCE_RUN_DIFFICULTY_SCHEDULE = Object.freeze([
  {
    startIndex: 1,
    safetyMargin: 0.9,
    variantWeights: { normal: 0.85, wide: 0.15, narrow: 0, bounce: 0 },
  },
  {
    startIndex: 17,
    safetyMargin: 0.7,
    variantWeights: { normal: 0.45, wide: 0.3, narrow: 0.2, bounce: 0.05 },
  },
  {
    startIndex: 33,
    safetyMargin: 0.5,
    variantWeights: { normal: 0.35, wide: 0.2, narrow: 0.25, bounce: 0.2 },
  },
  {
    startIndex: 65,
    safetyMargin: 0.35,
    variantWeights: { normal: 0.25, wide: 0.2, narrow: 0.25, bounce: 0.3 },
  },
] as const satisfies BounceRunDifficultySchedule)

export type BounceRunBonusConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true
      minimumPlatformCount: number
      radius: number
      sensorClearance: number
    }>

export interface BounceRunRouteConfig {
  readonly seed: number
  readonly platformCount: number
  readonly maxCandidateAttempts?: number
  readonly difficultySchedule?: BounceRunDifficultySchedule
  readonly bonus?: BounceRunBonusConfig
}

export interface BounceRunRoutePlatform {
  readonly index: number
  readonly sourceIndex: number | null
  readonly role: 'start' | 'main'
  readonly variant: BounceRunPlatformVariant
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly behavior: BounceRunLaunchBehavior
}

export interface BounceRunCandidateDecision {
  readonly attempt: number
  readonly position: readonly [number, number, number]
  readonly accepted: boolean
  readonly rejection: CandidateRejection | null
}

export type CandidateRejection =
  | ReachabilityFailureReason
  | 'platform-intersection'
  | 'invalid-surface-gap'
  | 'safety-margin'

export interface BounceRunRouteDecision {
  readonly platformIndex: number
  readonly sourcePlatformIndex: number | null
  readonly difficulty: number
  readonly requiredSafetyMargin: number
  readonly maxCandidateAttempts: number
  readonly attempts: number
  readonly selected: 'start' | 'candidate' | 'fallback'
  readonly variant: BounceRunPlatformVariant
  readonly difficultyBandStartIndex: number
  readonly variantWeights: BounceRunVariantWeights
  readonly candidates: readonly BounceRunCandidateDecision[]
  readonly reachability: BounceRunReachabilityResult | null
}

export interface BounceRunBonusDescriptor {
  readonly index: 0
  readonly sourcePlatformIndex: number
  readonly targetPlatformIndex: number
  readonly position: readonly [number, number, number]
  readonly radius: number
  readonly sensorClearance: number
  readonly trajectoryTick: number
}

export interface BounceRunBonusDecision {
  readonly selected: 'disabled' | 'route-too-short' | 'candidate'
  readonly attempts: number
  readonly maxAttempts: number
  readonly reachability: BounceRunBonusReachabilityResult | null
}

export interface BounceRunRoute {
  readonly seed: number
  readonly platforms: readonly BounceRunRoutePlatform[]
  readonly decisionLog: readonly BounceRunRouteDecision[]
  readonly bonuses: readonly BounceRunBonusDescriptor[]
  readonly bonusDecision: BounceRunBonusDecision
}

export interface BounceRunRouteIssue {
  readonly code:
    | 'decision-log-length'
    | 'platform-index'
    | 'platform-intersection'
    | 'invalid-surface-gap'
    | 'route-discontinuity'
    | 'attempt-overflow'
    | 'bonus-count'
    | 'bonus-attempt-overflow'
    | 'bonus-platform-intersection'
    | 'bonus-unreachable'
  readonly platformIndex: number
  readonly relatedPlatformIndex?: number
}

/** Creates a bounded route without reading or mutating runtime state. */
export function generateBounceRunRoute(config: BounceRunRouteConfig): BounceRunRoute {
  validateConfig(config)
  const maxCandidateAttempts = config.maxCandidateAttempts ?? DEFAULT_MAX_CANDIDATE_ATTEMPTS
  const difficultySchedule = config.difficultySchedule ?? DEFAULT_BOUNCE_RUN_DIFFICULTY_SCHEDULE
  const random = createMulberry32(config.seed)
  const start: BounceRunRoutePlatform = {
    index: 0,
    sourceIndex: null,
    role: 'start',
    variant: 'normal',
    position: [0, 0, 2],
    size: START_PLATFORM_SIZE,
    behavior: BOUNCE_RUN_PLATFORM_VARIANTS.normal.behavior,
  }
  const platforms: BounceRunRoutePlatform[] = [start]
  const decisionLog: BounceRunRouteDecision[] = [
    {
      platformIndex: 0,
      sourcePlatformIndex: null,
      difficulty: 0,
      requiredSafetyMargin: difficultySchedule[0]!.safetyMargin,
      maxCandidateAttempts,
      attempts: 0,
      selected: 'start',
      variant: 'normal',
      difficultyBandStartIndex: 1,
      variantWeights: difficultySchedule[0]!.variantWeights,
      candidates: [],
      reachability: null,
    },
  ]

  for (let index = 1; index < config.platformCount; index += 1) {
    const source = platforms[index - 1]!
    const difficultyBandIndex = findDifficultyBandIndex(difficultySchedule, index)
    const difficultyBand = difficultySchedule[difficultyBandIndex]!
    const difficulty =
      difficultySchedule.length === 1 ? 0 : difficultyBandIndex / (difficultySchedule.length - 1)
    const requiredSafetyMargin = difficultyBand.safetyMargin
    const variant = selectWeightedVariant(difficultyBand.variantWeights, random())
    const variantDescriptor = BOUNCE_RUN_PLATFORM_VARIANTS[variant]
    const candidates: BounceRunCandidateDecision[] = []
    let selectedPlatform: BounceRunRoutePlatform | null = null
    let selectedReachability: BounceRunReachabilityResult | null = null

    for (let attempt = 1; attempt <= maxCandidateAttempts; attempt += 1) {
      const verticalDelta = lerp(-0.35, 0.65, random()) * (0.35 + difficulty * 0.65)
      const probe: BounceRunRoutePlatform = {
        index,
        sourceIndex: source.index,
        role: 'main',
        variant,
        position: [source.position[0], source.position[1] + verticalDelta, source.position[2] + 7],
        size: variantDescriptor.size,
        behavior: variantDescriptor.behavior,
      }
      const envelope = analyzeBounceRunTransition(source, probe)
      const lateralHalfExtent =
        variantDescriptor.size[0] / 2 -
        BOUNCE_RUN_PHYSICS.ballRadius -
        BOUNCE_RUN_PHYSICS.edgeSafety
      const lateralBudget = Math.max(
        0,
        envelope.maxLateralTravel + lateralHalfExtent - requiredSafetyMargin,
      )
      const lateralScale = 0.15 + difficulty * 0.75
      const position = [
        source.position[0] + (random() * 2 - 1) * lateralBudget * lateralScale,
        source.position[1] + verticalDelta,
        source.position[2] + envelope.predictedForwardTravel,
      ] as const
      const candidate: BounceRunRoutePlatform = {
        index,
        sourceIndex: source.index,
        role: 'main',
        variant,
        position,
        size: variantDescriptor.size,
        behavior: variantDescriptor.behavior,
      }
      const reachability = analyzeBounceRunTransition(source, candidate)
      const rejection = candidateRejection(
        platforms,
        source,
        candidate,
        reachability,
        requiredSafetyMargin,
      )
      candidates.push({ attempt, position, accepted: rejection === null, rejection })
      if (rejection === null) {
        selectedPlatform = candidate
        selectedReachability = reachability
        break
      }
    }

    let selected: BounceRunRouteDecision['selected'] = 'candidate'
    if (!selectedPlatform || !selectedReachability) {
      selected = 'fallback'
      const probe: BounceRunRoutePlatform = {
        index,
        sourceIndex: source.index,
        role: 'main',
        variant,
        position: [source.position[0], source.position[1], source.position[2] + 7],
        size: variantDescriptor.size,
        behavior: variantDescriptor.behavior,
      }
      const envelope = analyzeBounceRunTransition(source, probe)
      selectedPlatform = {
        ...probe,
        position: [
          source.position[0],
          source.position[1],
          source.position[2] + envelope.predictedForwardTravel,
        ],
      }
      selectedReachability = analyzeBounceRunTransition(source, selectedPlatform)
      const rejection = candidateRejection(
        platforms,
        source,
        selectedPlatform,
        selectedReachability,
        requiredSafetyMargin,
      )
      if (rejection !== null) {
        throw new Error(`Deterministic route fallback failed at platform ${index}: ${rejection}`)
      }
    }

    platforms.push(selectedPlatform)
    decisionLog.push({
      platformIndex: index,
      sourcePlatformIndex: source.index,
      difficulty,
      requiredSafetyMargin,
      maxCandidateAttempts,
      attempts: candidates.length,
      selected,
      variant,
      difficultyBandStartIndex: difficultyBand.startIndex,
      variantWeights: difficultyBand.variantWeights,
      candidates,
      reachability: selectedReachability,
    })
  }

  const bonus = generateBonus(config, platforms)
  return {
    seed: config.seed,
    platforms,
    decisionLog,
    bonuses: bonus.descriptor ? [bonus.descriptor] : [],
    bonusDecision: bonus.decision,
  }
}

export function validateBounceRunRoute(route: BounceRunRoute): readonly BounceRunRouteIssue[] {
  const issues: BounceRunRouteIssue[] = []
  if (route.platforms.length !== route.decisionLog.length) {
    issues.push({ code: 'decision-log-length', platformIndex: -1 })
  }

  route.platforms.forEach((platform, index) => {
    if (platform.index !== index) issues.push({ code: 'platform-index', platformIndex: index })
    const decision = route.decisionLog[index]
    if (decision && decision.attempts > decision.maxCandidateAttempts) {
      issues.push({ code: 'attempt-overflow', platformIndex: index })
    }
    for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
      if (platformsIntersect(route.platforms[priorIndex]!, platform)) {
        issues.push({
          code: 'platform-intersection',
          platformIndex: index,
          relatedPlatformIndex: priorIndex,
        })
      }
    }
    if (index === 0) return
    const source = route.platforms[index - 1]!
    if (
      platform.sourceIndex !== source.index ||
      !analyzeBounceRunTransition(source, platform).reachable
    ) {
      issues.push({ code: 'route-discontinuity', platformIndex: index })
    }
    if (forwardSurfaceGap(source, platform) < MINIMUM_SURFACE_GAP) {
      issues.push({ code: 'invalid-surface-gap', platformIndex: index })
    }
  })
  const expectedBonusCount = route.bonusDecision.selected === 'candidate' ? 1 : 0
  if (route.bonuses.length !== expectedBonusCount || route.bonuses.length > 1) {
    issues.push({ code: 'bonus-count', platformIndex: -1 })
  }
  if (route.bonusDecision.attempts > route.bonusDecision.maxAttempts) {
    issues.push({ code: 'bonus-attempt-overflow', platformIndex: -1 })
  }
  route.bonuses.forEach((bonus) => {
    const source = route.platforms[bonus.sourcePlatformIndex]
    const target = route.platforms[bonus.targetPlatformIndex]
    if (!source || !target || !analyzeBounceRunBonus(source, target, bonus).reachable) {
      issues.push({ code: 'bonus-unreachable', platformIndex: bonus.targetPlatformIndex })
      return
    }
    for (const platform of route.platforms) {
      if (bonusIntersectsPlatform(bonus, platform)) {
        issues.push({
          code: 'bonus-platform-intersection',
          platformIndex: bonus.targetPlatformIndex,
          relatedPlatformIndex: platform.index,
        })
      }
    }
  })
  return issues
}

export function platformsIntersect(
  first: BounceRunRoutePlatform,
  second: BounceRunRoutePlatform,
): boolean {
  return ([0, 1, 2] as const).every(
    (axis) =>
      Math.abs(first.position[axis] - second.position[axis]) <
      (first.size[axis] + second.size[axis]) / 2,
  )
}

function candidateRejection(
  platforms: readonly BounceRunRoutePlatform[],
  source: BounceRunRoutePlatform,
  candidate: BounceRunRoutePlatform,
  reachability: BounceRunReachabilityResult,
  requiredSafetyMargin: number,
): CandidateRejection | null {
  if (platforms.some((platform) => platformsIntersect(platform, candidate))) {
    return 'platform-intersection'
  }
  if (forwardSurfaceGap(source, candidate) < MINIMUM_SURFACE_GAP) {
    return 'invalid-surface-gap'
  }
  if (!reachability.reachable) return reachability.reason
  if (
    reachability.margins.forward < requiredSafetyMargin ||
    reachability.margins.lateral < requiredSafetyMargin ||
    reachability.margins.vertical < requiredSafetyMargin
  ) {
    return 'safety-margin'
  }
  return null
}

function forwardSurfaceGap(source: BounceRunRoutePlatform, target: BounceRunRoutePlatform): number {
  return target.position[2] - target.size[2] / 2 - (source.position[2] + source.size[2] / 2)
}

function generateBonus(
  config: BounceRunRouteConfig,
  platforms: readonly BounceRunRoutePlatform[],
): Readonly<{
  descriptor: BounceRunBonusDescriptor | null
  decision: BounceRunBonusDecision
}> {
  if (!config.bonus?.enabled) {
    return {
      descriptor: null,
      decision: {
        selected: 'disabled',
        attempts: 0,
        maxAttempts: MAX_BONUS_ATTEMPTS,
        reachability: null,
      },
    }
  }
  if (platforms.length < config.bonus.minimumPlatformCount) {
    return {
      descriptor: null,
      decision: {
        selected: 'route-too-short',
        attempts: 0,
        maxAttempts: MAX_BONUS_ATTEMPTS,
        reachability: null,
      },
    }
  }

  const random = createMulberry32(config.seed ^ BONUS_SEED_SALT)
  const eligibleTransitionCount = config.bonus.minimumPlatformCount - 2
  const firstSourceIndex = 1 + Math.floor(random() * eligibleTransitionCount)
  const firstSide = random() < 0.5 ? -1 : 1
  for (let attempt = 1; attempt <= MAX_BONUS_ATTEMPTS; attempt += 1) {
    const sourceIndex =
      1 + ((firstSourceIndex - 1 + Math.floor((attempt - 1) / 2)) % eligibleTransitionCount)
    const source = platforms[sourceIndex]!
    const target = platforms[sourceIndex + 1]!
    const transition = analyzeBounceRunTransition(source, target)
    const ratio = [0.6, 0.55, 0.65, 0.5][(attempt - 1) % 4]!
    const trajectoryTick = Math.max(
      1,
      Math.min(transition.landingTick - 1, Math.round(transition.landingTick * ratio)),
    )
    const sample = sampleBounceRunTrajectory(source, target, trajectoryTick)
    if (!sample) continue
    const side = attempt % 2 === 1 ? firstSide : -firstSide
    const mandatoryPathOffset =
      BOUNCE_RUN_PHYSICS.ballRadius + config.bonus.radius + config.bonus.sensorClearance + 0.05
    const descriptor: BounceRunBonusDescriptor = {
      index: 0,
      sourcePlatformIndex: source.index,
      targetPlatformIndex: target.index,
      position: [
        sample.position[0] + side * mandatoryPathOffset,
        sample.position[1],
        sample.position[2],
      ],
      radius: config.bonus.radius,
      sensorClearance: config.bonus.sensorClearance,
      trajectoryTick,
    }
    const reachability = analyzeBounceRunBonus(source, target, descriptor)
    if (
      reachability.reachable &&
      !platforms.some((platform) => bonusIntersectsPlatform(descriptor, platform))
    ) {
      return {
        descriptor,
        decision: {
          selected: 'candidate',
          attempts: attempt,
          maxAttempts: MAX_BONUS_ATTEMPTS,
          reachability,
        },
      }
    }
  }
  throw new Error('Deterministic bonus placement failed within bounded attempts')
}

function bonusIntersectsPlatform(
  bonus: BounceRunBonusDescriptor,
  platform: BounceRunRoutePlatform,
): boolean {
  const expandedRadius = bonus.radius + bonus.sensorClearance
  let squaredDistance = 0
  for (const axis of [0, 1, 2] as const) {
    const halfExtent = platform.size[axis] / 2
    const minimum = platform.position[axis] - halfExtent
    const maximum = platform.position[axis] + halfExtent
    const coordinate = bonus.position[axis]
    const closest = Math.max(minimum, Math.min(maximum, coordinate))
    squaredDistance += (coordinate - closest) ** 2
  }
  return squaredDistance < expandedRadius ** 2
}

function findDifficultyBandIndex(
  schedule: BounceRunDifficultySchedule,
  platformIndex: number,
): number {
  let selected = 0
  for (let index = 1; index < schedule.length; index += 1) {
    if (schedule[index]!.startIndex > platformIndex) break
    selected = index
  }
  return selected
}

function selectWeightedVariant(
  weights: BounceRunVariantWeights,
  randomValue: number,
): BounceRunPlatformVariant {
  const variants = Object.keys(BOUNCE_RUN_PLATFORM_VARIANTS) as BounceRunPlatformVariant[]
  const total = variants.reduce((sum, variant) => sum + weights[variant], 0)
  let cursor = randomValue * total
  for (const variant of variants) {
    cursor -= weights[variant]
    if (cursor < 0) return variant
  }
  return variants.at(-1)!
}

function validateConfig(config: BounceRunRouteConfig): void {
  if (!Number.isFinite(config.seed) || !Number.isInteger(config.seed)) {
    throw new Error('seed must be a finite integer')
  }
  if (
    !Number.isInteger(config.platformCount) ||
    config.platformCount < 2 ||
    config.platformCount > 10_000
  ) {
    throw new Error('platformCount must be an integer between 2 and 10000')
  }
  const attempts = config.maxCandidateAttempts ?? DEFAULT_MAX_CANDIDATE_ATTEMPTS
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 32) {
    throw new Error('maxCandidateAttempts must be an integer between 0 and 32')
  }
  validateDifficultySchedule(config.difficultySchedule ?? DEFAULT_BOUNCE_RUN_DIFFICULTY_SCHEDULE)
  validateBonusConfig(config.bonus)
}

function validateDifficultySchedule(schedule: BounceRunDifficultySchedule): void {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new Error('difficultySchedule must contain at least one band')
  }
  if (schedule[0]!.startIndex !== 1) {
    throw new Error('difficultySchedule must start at platform index 1')
  }
  const variants = Object.keys(BOUNCE_RUN_PLATFORM_VARIANTS)
  for (let index = 0; index < schedule.length; index += 1) {
    const band = schedule[index]!
    if (
      !Number.isInteger(band.startIndex) ||
      band.startIndex < 1 ||
      band.startIndex > 10_000 ||
      (index > 0 && band.startIndex <= schedule[index - 1]!.startIndex)
    ) {
      throw new Error('difficultySchedule startIndex values must be strictly increasing integers')
    }
    if (
      !Number.isFinite(band.safetyMargin) ||
      band.safetyMargin < 0.1 ||
      band.safetyMargin > 1.25
    ) {
      throw new Error('difficultySchedule safetyMargin must be finite and between 0.1 and 1.25')
    }
    if (index > 0 && band.safetyMargin > schedule[index - 1]!.safetyMargin) {
      throw new Error('difficultySchedule safetyMargin values must not increase')
    }
    const weightKeys = Object.keys(band.variantWeights)
    const unknown = weightKeys.find((key) => !variants.includes(key))
    if (unknown) throw new Error(`variantWeights contains unknown platform variant: ${unknown}`)
    let total = 0
    for (const variant of variants as BounceRunPlatformVariant[]) {
      const weight = band.variantWeights[variant]
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(`variantWeights.${variant} must be a finite non-negative number`)
      }
      total += weight
    }
    if (total <= 0) throw new Error('variantWeights must have a positive total')
  }
}

function validateBonusConfig(config: BounceRunBonusConfig | undefined): void {
  if (!config?.enabled) return
  if (
    !Number.isInteger(config.minimumPlatformCount) ||
    config.minimumPlatformCount < 3 ||
    config.minimumPlatformCount > 10_000
  ) {
    throw new Error('bonus.minimumPlatformCount must be an integer between 3 and 10000')
  }
  if (!Number.isFinite(config.radius) || config.radius < 0.1 || config.radius > 0.75) {
    throw new Error('bonus.radius must be finite and between 0.1 and 0.75')
  }
  if (
    !Number.isFinite(config.sensorClearance) ||
    config.sensorClearance < 0 ||
    config.sensorClearance > 0.75
  ) {
    throw new Error('bonus.sensorClearance must be finite and between 0 and 0.75')
  }
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}
