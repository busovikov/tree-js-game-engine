import {
  createImmutableJsonSnapshot,
  evaluateDeclarativeAssertions,
  type DeclarativeAssertionResult,
  type EngineScheduler,
  type ImmutableJsonValue,
} from '@haku/core'
import type { PoolMetrics } from '@haku/pool'
import type { BounceRunSessionState } from './session-runtime.js'

export const BOUNCE_RUN_OBSERVATION_VERSION = 1 as const

export interface BounceRunBallObservationReader {
  position(): readonly [number, number, number]
  velocity(): readonly [number, number, number]
}

export interface BounceRunRouteObservationReader {
  activePlatforms(): readonly Readonly<{ platformIndex: number }>[]
  decisionLog(): readonly unknown[]
}

export interface BounceRunObservationSources {
  readonly scheduler: Pick<EngineScheduler, 'tickNumber' | 'fixedTimestep'>
  readonly session: Readonly<{ state(): BounceRunSessionState }>
  readonly ball: BounceRunBallObservationReader
  readonly route: BounceRunRouteObservationReader
  readonly pool: Readonly<{ metrics(): PoolMetrics }>
}

export interface BounceRunObservation {
  readonly version: typeof BOUNCE_RUN_OBSERVATION_VERSION
  readonly scheduler: Readonly<{ tick: number; fixedDelta: number }>
  readonly session: Readonly<{ state: BounceRunSessionState }>
  readonly ball: Readonly<{
    position: readonly [number, number, number]
    velocity: readonly [number, number, number]
  }>
  readonly route: Readonly<{
    activeCount: number
    firstPlatformIndex: number | null
    lastPlatformIndex: number | null
    decisionCount: number
  }>
  readonly pool: Readonly<PoolMetrics>
}

/** Composes a bounded data-only QA snapshot from public read surfaces. */
export function createBounceRunObservationSnapshot(
  sources: BounceRunObservationSources,
): ImmutableJsonValue<BounceRunObservation> {
  const tick = requireNonNegativeInteger('scheduler tick', sources.scheduler.tickNumber)
  const fixedDelta = requirePositiveFinite('scheduler fixedDelta', sources.scheduler.fixedTimestep)
  const state = requireSessionState(sources.session.state())
  const position = requireVector('ball position', sources.ball.position())
  const velocity = requireVector('ball velocity', sources.ball.velocity())
  const activePlatforms = createImmutableJsonSnapshot(sources.route.activePlatforms())
  if (!Array.isArray(activePlatforms)) throw new TypeError('route activePlatforms must be an array')
  const activeIndices = activePlatforms.map((platform, index) => {
    if (typeof platform !== 'object' || platform === null || Array.isArray(platform)) {
      throw new TypeError(`route active platform ${index} must be an object`)
    }
    return requireNonNegativeInteger(`route active platform ${index} index`, platform.platformIndex)
  })
  for (let index = 1; index < activeIndices.length; index += 1) {
    if (activeIndices[index]! <= activeIndices[index - 1]!) {
      throw new Error('route active platform indices must be strictly increasing')
    }
  }
  const decisionLog = sources.route.decisionLog()
  if (!Array.isArray(decisionLog)) throw new TypeError('route decisionLog must be an array')
  const decisionCount = requireNonNegativeInteger('route decisionCount', decisionLog.length)
  const pool = requirePoolMetrics(sources.pool.metrics())
  if (activeIndices.length !== pool.active) {
    throw new Error('route active platform count must match pool active count')
  }
  const observation: BounceRunObservation = {
    version: BOUNCE_RUN_OBSERVATION_VERSION,
    scheduler: {
      tick,
      fixedDelta,
    },
    session: { state },
    ball: {
      position,
      velocity,
    },
    route: {
      activeCount: activeIndices.length,
      firstPlatformIndex: activeIndices[0] ?? null,
      lastPlatformIndex: activeIndices.at(-1) ?? null,
      decisionCount,
    },
    pool,
  }
  return createImmutableJsonSnapshot(observation)
}

/** Evaluates data-only assertions without exposing any Bounce Run runtime capability. */
export function evaluateBounceRunAssertions(
  observation: unknown,
  assertions: unknown,
): readonly DeclarativeAssertionResult[] {
  const immutableObservation = createImmutableJsonSnapshot(observation)
  if (
    !isRecord(immutableObservation) ||
    immutableObservation.version !== BOUNCE_RUN_OBSERVATION_VERSION
  ) {
    throw new Error('Unsupported Bounce Run observation version')
  }
  return evaluateDeclarativeAssertions(immutableObservation, assertions)
}

function requireSessionState(value: unknown): BounceRunSessionState {
  if (!['start', 'active', 'paused', 'game-over'].includes(value as string)) {
    throw new Error('session state is invalid')
  }
  return value as BounceRunSessionState
}

function requireVector(label: string, value: unknown): readonly [number, number, number] {
  const immutable = createImmutableJsonSnapshot(value)
  if (!Array.isArray(immutable) || immutable.length !== 3) {
    throw new TypeError(`${label} must be a three-number array`)
  }
  for (const coordinate of immutable) {
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate)) {
      throw new TypeError(`${label} must contain only finite numbers`)
    }
  }
  return immutable as unknown as readonly [number, number, number]
}

function requirePoolMetrics(value: unknown): PoolMetrics {
  const immutable = createImmutableJsonSnapshot(value)
  if (!isRecord(immutable)) {
    throw new TypeError('pool metrics must be an object')
  }
  const metrics = {
    capacity: requireNonNegativeInteger('pool capacity', immutable.capacity),
    maximum: requireNonNegativeInteger('pool maximum', immutable.maximum),
    total: requireNonNegativeInteger('pool total', immutable.total),
    active: requireNonNegativeInteger('pool active', immutable.active),
    inactive: requireNonNegativeInteger('pool inactive', immutable.inactive),
    acquisitions: requireNonNegativeInteger('pool acquisitions', immutable.acquisitions),
    releases: requireNonNegativeInteger('pool releases', immutable.releases),
    expansions: requireNonNegativeInteger('pool expansions', immutable.expansions),
    exhaustions: requireNonNegativeInteger('pool exhaustions', immutable.exhaustions),
    forcedReleases: requireNonNegativeInteger('pool forcedReleases', immutable.forcedReleases),
  }
  if (metrics.capacity > metrics.maximum || metrics.total > metrics.maximum) {
    throw new Error('pool capacity and total must not exceed maximum')
  }
  if (metrics.active + metrics.inactive !== metrics.total) {
    throw new Error('pool active plus inactive must equal total')
  }
  return metrics
}

function requireNonNegativeInteger(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return value
}

function requirePositiveFinite(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
