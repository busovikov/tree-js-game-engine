import {
  analyzeBounceRunTransition,
  type BounceRunReachabilityResult,
  type ReachabilityFailureReason,
} from './route-reachability.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'

const DEFAULT_MAX_CANDIDATE_ATTEMPTS = 6
const MINIMUM_SURFACE_GAP = 0.3
const START_PLATFORM_SIZE = [6, 0.6, 8] as const
const MAIN_PLATFORM_SIZE = [4, 0.6, 4.2] as const
const START_SAFETY_MARGIN = 0.9
const END_SAFETY_MARGIN = 0.35
const DIFFICULTY_RAMP_PLATFORM_COUNT = 64

export interface BounceRunRouteConfig {
  readonly seed: number
  readonly platformCount: number
  readonly maxCandidateAttempts?: number
}

export interface BounceRunRoutePlatform {
  readonly index: number
  readonly sourceIndex: number | null
  readonly role: 'start' | 'main'
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
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
  readonly candidates: readonly BounceRunCandidateDecision[]
  readonly reachability: BounceRunReachabilityResult | null
}

export interface BounceRunRoute {
  readonly seed: number
  readonly platforms: readonly BounceRunRoutePlatform[]
  readonly decisionLog: readonly BounceRunRouteDecision[]
}

export interface BounceRunRouteIssue {
  readonly code:
    | 'decision-log-length'
    | 'platform-index'
    | 'platform-intersection'
    | 'invalid-surface-gap'
    | 'route-discontinuity'
    | 'attempt-overflow'
  readonly platformIndex: number
  readonly relatedPlatformIndex?: number
}

/** Creates a bounded route without reading or mutating runtime state. */
export function generateBounceRunRoute(config: BounceRunRouteConfig): BounceRunRoute {
  validateConfig(config)
  const maxCandidateAttempts =
    config.maxCandidateAttempts ?? DEFAULT_MAX_CANDIDATE_ATTEMPTS
  const random = createMulberry32(config.seed)
  const start: BounceRunRoutePlatform = {
    index: 0,
    sourceIndex: null,
    role: 'start',
    position: [0, 0, 2],
    size: START_PLATFORM_SIZE,
  }
  const platforms: BounceRunRoutePlatform[] = [start]
  const decisionLog: BounceRunRouteDecision[] = [
    {
      platformIndex: 0,
      sourcePlatformIndex: null,
      difficulty: 0,
      requiredSafetyMargin: START_SAFETY_MARGIN,
      maxCandidateAttempts,
      attempts: 0,
      selected: 'start',
      candidates: [],
      reachability: null,
    },
  ]

  for (let index = 1; index < config.platformCount; index += 1) {
    const source = platforms[index - 1]!
    const difficulty = Math.min(1, (index - 1) / (DIFFICULTY_RAMP_PLATFORM_COUNT - 1))
    const requiredSafetyMargin = lerp(
      START_SAFETY_MARGIN,
      END_SAFETY_MARGIN,
      difficulty,
    )
    const candidates: BounceRunCandidateDecision[] = []
    let selectedPlatform: BounceRunRoutePlatform | null = null
    let selectedReachability: BounceRunReachabilityResult | null = null

    for (let attempt = 1; attempt <= maxCandidateAttempts; attempt += 1) {
      const verticalDelta = lerp(-0.35, 0.65, random()) * (0.35 + difficulty * 0.65)
      const probe: BounceRunRoutePlatform = {
        index,
        sourceIndex: source.index,
        role: 'main',
        position: [source.position[0], source.position[1] + verticalDelta, source.position[2] + 7],
        size: MAIN_PLATFORM_SIZE,
      }
      const envelope = analyzeBounceRunTransition(source, probe)
      const lateralHalfExtent =
        MAIN_PLATFORM_SIZE[0] / 2 -
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
        position,
        size: MAIN_PLATFORM_SIZE,
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
        position: [source.position[0], source.position[1], source.position[2] + 7],
        size: MAIN_PLATFORM_SIZE,
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
      candidates,
      reachability: selectedReachability,
    })
  }

  return { seed: config.seed, platforms, decisionLog }
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

function forwardSurfaceGap(
  source: BounceRunRoutePlatform,
  target: BounceRunRoutePlatform,
): number {
  return target.position[2] - target.size[2] / 2 - (source.position[2] + source.size[2] / 2)
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
