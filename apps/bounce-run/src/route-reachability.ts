import { bounceVelocityForHeight } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'

export interface BounceRunPlatformSurface {
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
  readonly behavior?: BounceRunLaunchBehavior
}

export interface BounceRunLaunchBehavior {
  readonly kind: 'standard' | 'boost'
  readonly bounceHeight: number
}

export interface BounceRunBonusSensor {
  readonly position: readonly [number, number, number]
  readonly radius: number
  readonly sensorClearance: number
  readonly trajectoryTick: number
}

export type ReachabilityFailureReason =
  | 'reachable'
  | 'invalid-platform'
  | 'vertical-clearance'
  | 'solver-bound'
  | 'forward-gap'
  | 'lateral-gap'

export interface BounceRunReachabilityResult {
  readonly reachable: boolean
  readonly reason: ReachabilityFailureReason
  readonly landingTick: number
  readonly flightTime: number
  readonly predictedForwardTravel: number
  readonly maxLateralTravel: number
  readonly margins: Readonly<{
    forward: number
    lateral: number
    vertical: number
  }>
}

export type BounceRunBonusFailureReason =
  | 'reachable'
  | 'invalid-bonus'
  | 'route-transition'
  | 'trajectory-tick'
  | 'forward-gap'
  | 'vertical-gap'
  | 'lateral-gap'
  | 'mandatory-path-overlap'

export interface BounceRunBonusReachabilityResult {
  readonly reachable: boolean
  readonly reason: BounceRunBonusFailureReason
  readonly trajectoryTick: number
  readonly maxLateralTravel: number
  readonly mandatoryPathClearance: number
  readonly margins: Readonly<{
    forward: number
    lateral: number
    vertical: number
    mandatoryPath: number
  }>
}

export interface BounceRunTrajectorySample {
  readonly trajectoryTick: number
  readonly landingTick: number
  readonly position: readonly [number, number, number]
  readonly maxLateralTravel: number
}

/**
 * Solves one mandatory jump with the same semi-implicit fixed-tick values used by the game.
 * The launch point is the source platform center and a landing is valid only inside the
 * target's ball-radius-plus-safety inset.
 */
export function analyzeBounceRunTransition(
  source: BounceRunPlatformSurface,
  target: BounceRunPlatformSurface,
): BounceRunReachabilityResult {
  if (!isValidPlatform(source) || !isValidPlatform(target)) {
    return failure('invalid-platform')
  }

  const bounceHeight = source.behavior?.bounceHeight ?? BOUNCE_RUN_PHYSICS.bounceHeight
  if (!Number.isFinite(bounceHeight) || bounceHeight <= 0) {
    return failure('invalid-platform')
  }
  const verticalDelta = top(target) - top(source)
  const verticalMargin = bounceHeight - verticalDelta
  if (verticalMargin < BOUNCE_RUN_PHYSICS.edgeSafety) {
    return failure('vertical-clearance', { vertical: verticalMargin })
  }

  const launchVelocity = bounceVelocityForHeight(bounceHeight, BOUNCE_RUN_PHYSICS.gravity)
  const landingTick = findDescendingLandingTick(verticalDelta, launchVelocity)
  if (landingTick === null) {
    return failure('solver-bound', { vertical: verticalMargin })
  }

  const flightTime = landingTick * BOUNCE_RUN_PHYSICS.fixedDt
  const predictedForwardTravel = BOUNCE_RUN_PHYSICS.forwardSpeed * flightTime
  const maxLateralTravel = simulateMaximumLateralTravel(landingTick)
  const safeForwardHalfExtent =
    target.size[2] / 2 - BOUNCE_RUN_PHYSICS.ballRadius - BOUNCE_RUN_PHYSICS.edgeSafety
  const safeLateralHalfExtent =
    target.size[0] / 2 - BOUNCE_RUN_PHYSICS.ballRadius - BOUNCE_RUN_PHYSICS.edgeSafety
  const forwardOffset = target.position[2] - source.position[2] - predictedForwardTravel
  const lateralOffset = target.position[0] - source.position[0]
  const forwardMargin = safeForwardHalfExtent - Math.abs(forwardOffset)
  const lateralMargin = safeLateralHalfExtent + maxLateralTravel - Math.abs(lateralOffset)
  const base = {
    landingTick,
    flightTime,
    predictedForwardTravel,
    maxLateralTravel,
    margins: { forward: forwardMargin, lateral: lateralMargin, vertical: verticalMargin },
  }

  if (forwardMargin < 0) return { ...base, reachable: false, reason: 'forward-gap' }
  if (lateralMargin < 0) return { ...base, reachable: false, reason: 'lateral-gap' }
  return { ...base, reachable: true, reason: 'reachable' }
}

/** Samples the center-line flight shared by bonus placement and analytic validation. */
export function sampleBounceRunTrajectory(
  source: BounceRunPlatformSurface,
  target: BounceRunPlatformSurface,
  trajectoryTick: number,
): BounceRunTrajectorySample | null {
  const transition = analyzeBounceRunTransition(source, target)
  if (
    !transition.reachable ||
    !Number.isInteger(trajectoryTick) ||
    trajectoryTick <= 0 ||
    trajectoryTick >= transition.landingTick
  ) {
    return null
  }
  const bounceHeight = source.behavior?.bounceHeight ?? BOUNCE_RUN_PHYSICS.bounceHeight
  const launchVelocity = bounceVelocityForHeight(bounceHeight, BOUNCE_RUN_PHYSICS.gravity)
  const time = trajectoryTick * BOUNCE_RUN_PHYSICS.fixedDt
  const launchHeight = top(source) + BOUNCE_RUN_PHYSICS.ballRadius
  return {
    trajectoryTick,
    landingTick: transition.landingTick,
    position: [
      source.position[0],
      launchHeight + launchVelocity * time - (BOUNCE_RUN_PHYSICS.gravity * time ** 2) / 2,
      source.position[2] + BOUNCE_RUN_PHYSICS.forwardSpeed * time,
    ],
    maxLateralTravel: simulateMaximumLateralTravel(trajectoryTick),
  }
}

/** Proves that steering can touch a bonus sensor while the mandatory center path misses it. */
export function analyzeBounceRunBonus(
  source: BounceRunPlatformSurface,
  target: BounceRunPlatformSurface,
  bonus: BounceRunBonusSensor,
): BounceRunBonusReachabilityResult {
  if (
    !bonus.position.every(Number.isFinite) ||
    !Number.isFinite(bonus.radius) ||
    bonus.radius <= 0 ||
    !Number.isFinite(bonus.sensorClearance) ||
    bonus.sensorClearance < 0
  ) {
    return bonusFailure('invalid-bonus')
  }
  const transition = analyzeBounceRunTransition(source, target)
  if (!transition.reachable) return bonusFailure('route-transition')
  const sample = sampleBounceRunTrajectory(source, target, bonus.trajectoryTick)
  if (!sample) return bonusFailure('trajectory-tick')

  const contactRadius = BOUNCE_RUN_PHYSICS.ballRadius + bonus.radius
  const forwardMargin = contactRadius - Math.abs(bonus.position[2] - sample.position[2])
  const verticalMargin = contactRadius - Math.abs(bonus.position[1] - sample.position[1])
  const lateralOffset = Math.abs(bonus.position[0] - sample.position[0])
  const lateralMargin = sample.maxLateralTravel + contactRadius - lateralOffset
  const mandatoryPathClearance = lateralOffset - contactRadius
  const mandatoryPathMargin = mandatoryPathClearance - bonus.sensorClearance
  const base = {
    trajectoryTick: bonus.trajectoryTick,
    maxLateralTravel: sample.maxLateralTravel,
    mandatoryPathClearance,
    margins: {
      forward: forwardMargin,
      lateral: lateralMargin,
      vertical: verticalMargin,
      mandatoryPath: mandatoryPathMargin,
    },
  }

  if (forwardMargin < 0) return { ...base, reachable: false, reason: 'forward-gap' as const }
  if (verticalMargin < 0) return { ...base, reachable: false, reason: 'vertical-gap' as const }
  if (lateralMargin < 0) return { ...base, reachable: false, reason: 'lateral-gap' as const }
  if (mandatoryPathMargin < 0) {
    return { ...base, reachable: false, reason: 'mandatory-path-overlap' as const }
  }
  return { ...base, reachable: true, reason: 'reachable' }
}

function findDescendingLandingTick(verticalDelta: number, launchVelocity: number): number | null {
  const discriminant = launchVelocity ** 2 - 2 * BOUNCE_RUN_PHYSICS.gravity * verticalDelta
  if (discriminant < 0) return null
  const descendingTime = (launchVelocity + Math.sqrt(discriminant)) / BOUNCE_RUN_PHYSICS.gravity
  const geometricTick = Math.ceil(descendingTime / BOUNCE_RUN_PHYSICS.fixedDt)
  const contactTick = geometricTick + BOUNCE_RUN_PHYSICS.contactEventLatencyTicks
  return contactTick <= BOUNCE_RUN_PHYSICS.maxSolverTicks ? contactTick : null
}

function simulateMaximumLateralTravel(ticks: number): number {
  const response =
    1 - Math.exp(-BOUNCE_RUN_PHYSICS.lateralResponsiveness * BOUNCE_RUN_PHYSICS.fixedDt)
  let velocity = 0
  let position = 0
  for (let tick = 0; tick < ticks; tick += 1) {
    velocity += (BOUNCE_RUN_PHYSICS.lateralSpeed - velocity) * response
    position += velocity * BOUNCE_RUN_PHYSICS.fixedDt
  }
  return position
}

function isValidPlatform(platform: BounceRunPlatformSurface): boolean {
  return (
    platform.position.every(Number.isFinite) &&
    platform.size.every((value) => Number.isFinite(value) && value > 0)
  )
}

function top(platform: BounceRunPlatformSurface): number {
  return platform.position[1] + platform.size[1] / 2
}

function failure(
  reason: Exclude<ReachabilityFailureReason, 'reachable'>,
  margins: Partial<BounceRunReachabilityResult['margins']> = {},
): BounceRunReachabilityResult {
  return {
    reachable: false,
    reason,
    landingTick: 0,
    flightTime: 0,
    predictedForwardTravel: 0,
    maxLateralTravel: 0,
    margins: {
      forward: margins.forward ?? Number.NEGATIVE_INFINITY,
      lateral: margins.lateral ?? Number.NEGATIVE_INFINITY,
      vertical: margins.vertical ?? Number.NEGATIVE_INFINITY,
    },
  }
}

function bonusFailure(
  reason: Exclude<BounceRunBonusFailureReason, 'reachable'>,
): BounceRunBonusReachabilityResult {
  return {
    reachable: false,
    reason,
    trajectoryTick: 0,
    maxLateralTravel: 0,
    mandatoryPathClearance: Number.NEGATIVE_INFINITY,
    margins: {
      forward: Number.NEGATIVE_INFINITY,
      lateral: Number.NEGATIVE_INFINITY,
      vertical: Number.NEGATIVE_INFINITY,
      mandatoryPath: Number.NEGATIVE_INFINITY,
    },
  }
}
