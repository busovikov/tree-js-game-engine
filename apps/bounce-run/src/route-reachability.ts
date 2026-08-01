import { bounceVelocityForHeight } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'

export interface BounceRunPlatformSurface {
  readonly position: readonly [number, number, number]
  readonly size: readonly [number, number, number]
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

  const verticalDelta = top(target) - top(source)
  const verticalMargin = BOUNCE_RUN_PHYSICS.bounceHeight - verticalDelta
  if (verticalMargin < BOUNCE_RUN_PHYSICS.edgeSafety) {
    return failure('vertical-clearance', { vertical: verticalMargin })
  }

  const launchVelocity = bounceVelocityForHeight(
    BOUNCE_RUN_PHYSICS.bounceHeight,
    BOUNCE_RUN_PHYSICS.gravity,
  )
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

function findDescendingLandingTick(verticalDelta: number, launchVelocity: number): number | null {
  let previousHeight = 0
  for (let tick = 1; tick <= BOUNCE_RUN_PHYSICS.maxSolverTicks; tick += 1) {
    const time = tick * BOUNCE_RUN_PHYSICS.fixedDt
    const height =
      launchVelocity * time -
      (BOUNCE_RUN_PHYSICS.gravity * BOUNCE_RUN_PHYSICS.fixedDt ** 2 * tick * (tick + 1)) / 2
    const descendingVelocity = launchVelocity - BOUNCE_RUN_PHYSICS.gravity * time
    if (descendingVelocity < 0 && previousHeight >= verticalDelta && height <= verticalDelta) {
      return tick
    }
    previousHeight = height
  }
  return null
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
