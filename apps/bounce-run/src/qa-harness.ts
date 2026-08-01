import {
  createImmutableJsonSnapshot,
  stableCanonicalStringify,
  type DeclarativeAssertion,
  type ImmutableJsonValue,
} from '@haku/core'
import type { InputActionMapSnapshot } from '@haku/engine'
import { evaluateBounceRunAssertions, type BounceRunObservation } from './qa-observations.js'
import {
  BOUNCE_RUN_BUG_REPORT_VERSION,
  BOUNCE_RUN_SESSION_REPORT_VERSION,
  MAX_BOUNCE_RUN_REPORT_ASSERTIONS,
  MAX_BOUNCE_RUN_REPORT_ERRORS,
  MAX_BOUNCE_RUN_REPORT_OBSERVATIONS,
  MAX_BOUNCE_RUN_REPORT_TICKS,
  createBounceRunBugReport,
  createBounceRunSessionReport,
  type BounceRunBugReport,
  type BounceRunReportError,
  type BounceRunSessionOutcome,
  type BounceRunSessionReport,
} from './qa-report.js'
import { createBounceRunActionRecorder, type BounceRunReplayState } from './replay.js'

export const BOUNCE_RUN_QA_HARNESS_SENTINEL = 'haku:bounce-run:qa-harness:v1' as const

type Unsubscribe = () => void

export interface BounceRunQaSubscriptionPort<T> {
  subscribe(listener: (value: T) => void): Unsubscribe
}

export interface BounceRunQaFixedTickSample {
  readonly schedulerTick: number
  readonly actions: InputActionMapSnapshot
  readonly state: BounceRunReplayState
}

export interface BounceRunQaDiagnosticInput {
  readonly category: string
  readonly message: string
  readonly context?: unknown
}

export interface BounceRunQaHarnessOptions {
  readonly seed: number
  readonly fixedDelta: number
  readonly assertions?: readonly DeclarativeAssertion[]
  readonly maxTicks?: number
  readonly maxDiagnostics?: number
  readonly fixedTicks: BounceRunQaSubscriptionPort<BounceRunQaFixedTickSample>
  readonly observations: Readonly<{ read(localTick: number): unknown }>
  readonly diagnostics: Readonly<{
    runtime: BounceRunQaSubscriptionPort<BounceRunQaDiagnosticInput>
    console: BounceRunQaSubscriptionPort<BounceRunQaDiagnosticInput>
    network: BounceRunQaSubscriptionPort<BounceRunQaDiagnosticInput>
  }>
}

export interface BounceRunQaHarnessSnapshot {
  readonly tickCount: number
  readonly diagnostics: readonly BounceRunReportError[]
  readonly lastObservation: BounceRunObservation | null
}

export interface BounceRunQaBugInput {
  readonly session: BounceRunSessionReport | ImmutableJsonValue<BounceRunSessionReport>
  readonly defect: BounceRunBugReport['defect']
  readonly rootCause: BounceRunBugReport['rootCause']
}

export interface BounceRunQaHarness {
  snapshot(): ImmutableJsonValue<BounceRunQaHarnessSnapshot>
  resetSession(): void
  createSessionReport(outcome: BounceRunSessionOutcome): ImmutableJsonValue<BounceRunSessionReport>
  createBugReport(input: BounceRunQaBugInput): ImmutableJsonValue<BounceRunBugReport>
  dispose(): void
}

interface CapturedTick {
  readonly actions: InputActionMapSnapshot
  readonly state: BounceRunReplayState
  readonly observation: BounceRunObservation
  readonly assertionResults: ReturnType<typeof evaluateBounceRunAssertions>
}

/**
 * Orchestrates bounded QA evidence using only injected data/read subscriptions.
 * Runtime mutation capabilities are intentionally absent from both options and return value.
 */
export function createBounceRunQaHarness(options: BounceRunQaHarnessOptions): BounceRunQaHarness {
  const seed = requireUint32('QA seed', options.seed)
  const fixedDelta = requirePositiveFinite('QA fixedDelta', options.fixedDelta)
  const maxTicks = requireBound(
    'QA maxTicks',
    options.maxTicks ?? MAX_BOUNCE_RUN_REPORT_OBSERVATIONS,
    MAX_BOUNCE_RUN_REPORT_OBSERVATIONS,
  )
  if (maxTicks > MAX_BOUNCE_RUN_REPORT_TICKS) throw new Error('QA maxTicks exceeds report limit')
  const maxDiagnostics = requireBound(
    'QA maxDiagnostics',
    options.maxDiagnostics ?? MAX_BOUNCE_RUN_REPORT_ERRORS,
    MAX_BOUNCE_RUN_REPORT_ERRORS,
  )
  const assertions = createImmutableJsonSnapshot(options.assertions ?? [])
  if (!Array.isArray(assertions) || assertions.length > MAX_BOUNCE_RUN_REPORT_ASSERTIONS) {
    throw new Error('QA assertions exceed report limit')
  }

  let disposed = false
  let lastSchedulerTick = -1
  let capturedTicks: CapturedTick[] = []
  let diagnostics: BounceRunReportError[] = []
  let diagnosticKeys = new Set<string>()

  const captureDiagnostic = (
    source: BounceRunReportError['source'],
    input: BounceRunQaDiagnosticInput,
  ): void => {
    if (disposed) return
    const diagnostic = validateDiagnostic(source, input)
    const key = stableCanonicalStringify(diagnostic)
    if (diagnosticKeys.has(key) || diagnostics.length >= maxDiagnostics) return
    diagnosticKeys.add(key)
    diagnostics.push(diagnostic)
  }

  const unsubscribers = [
    options.fixedTicks.subscribe((sample) => {
      if (disposed) return
      const schedulerTick = requireNonNegativeInteger('QA schedulerTick', sample.schedulerTick)
      if (schedulerTick <= lastSchedulerTick) {
        throw new Error('QA scheduler ticks must be strictly increasing')
      }
      if (capturedTicks.length >= maxTicks) throw new Error(`QA tick limit ${maxTicks} exceeded`)

      const actions = createImmutableJsonSnapshot(sample.actions) as InputActionMapSnapshot
      const stateSnapshot = createImmutableJsonSnapshot(sample.state)
      validateReplaySample(actions, stateSnapshot)
      const state = stateSnapshot as unknown as BounceRunReplayState
      const localTick = capturedTicks.length
      const observationSnapshot = createImmutableJsonSnapshot(options.observations.read(localTick))
      const observation = observationSnapshot as unknown as BounceRunObservation
      const assertionResults = evaluateBounceRunAssertions(observation, assertions)
      if (observation.scheduler.tick !== localTick) {
        throw new Error('QA observation tick must match the local recording tick')
      }
      if (observation.scheduler.fixedDelta !== fixedDelta) {
        throw new Error('QA observation fixedDelta must match the harness fixedDelta')
      }

      capturedTicks.push({ actions, state, observation, assertionResults })
      lastSchedulerTick = schedulerTick
    }),
    options.diagnostics.runtime.subscribe((input) => captureDiagnostic('runtime', input)),
    options.diagnostics.console.subscribe((input) => captureDiagnostic('console', input)),
    options.diagnostics.network.subscribe((input) => captureDiagnostic('network', input)),
  ]

  const harness: BounceRunQaHarness = {
    snapshot() {
      return createImmutableJsonSnapshot({
        tickCount: capturedTicks.length,
        diagnostics,
        lastObservation: capturedTicks.at(-1)?.observation ?? null,
      })
    },
    resetSession() {
      if (disposed) return
      lastSchedulerTick = -1
      capturedTicks = []
      diagnostics = []
      diagnosticKeys = new Set()
    },
    createSessionReport(outcome) {
      const recorder = createBounceRunActionRecorder({
        seed,
        fixedDelta,
        tickCount: capturedTicks.length,
      })
      capturedTicks.forEach((tick, index) => recorder.record(index, tick.actions, tick.state))
      return createBounceRunSessionReport({
        version: BOUNCE_RUN_SESSION_REPORT_VERSION,
        seed,
        fixedDelta,
        outcome,
        recording: recorder.finish(),
        assertions,
        observations: capturedTicks.map(({ observation, assertionResults }) => ({
          observation,
          assertionResults,
        })),
        errors: diagnostics,
      })
    },
    createBugReport(input) {
      return createBounceRunBugReport({
        version: BOUNCE_RUN_BUG_REPORT_VERSION,
        session: input.session,
        defect: input.defect,
        rootCause: input.rootCause,
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const unsubscribe of unsubscribers) unsubscribe()
      capturedTicks = []
      diagnostics = []
      diagnosticKeys.clear()
    },
  }
  return Object.freeze(harness)
}

function validateDiagnostic(
  source: BounceRunReportError['source'],
  input: BounceRunQaDiagnosticInput,
): BounceRunReportError {
  const value = createImmutableJsonSnapshot(input)
  if (!isRecord(value)) throw new TypeError('QA diagnostic must be an object')
  for (const key of Object.keys(value)) {
    if (!['category', 'message', 'context'].includes(key)) {
      throw new Error(`QA diagnostic contains unknown field: ${key}`)
    }
  }
  const category = requireBoundedString('QA diagnostic category', value.category, 128)
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,127}$/.test(category)) {
    throw new Error('QA diagnostic category is invalid')
  }
  const message = requireBoundedString('QA diagnostic message', value.message, 2_048)
  const result: BounceRunReportError = { source, category, message }
  if (Object.hasOwn(value, 'context')) Object.assign(result, { context: value.context })
  return createImmutableJsonSnapshot(result) as ImmutableJsonValue<BounceRunReportError>
}

function validateReplaySample(actions: InputActionMapSnapshot, state: unknown): void {
  if (typeof actions.lateral !== 'number' || !Number.isFinite(actions.lateral)) {
    throw new Error('QA lateral action must be a finite number')
  }
  if (!isRecord(state) || !Array.isArray(state.velocity) || state.velocity.length !== 3) {
    throw new Error('QA replay state velocity must contain three numbers')
  }
  if (
    state.velocity.some(
      (coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate),
    )
  ) {
    throw new Error('QA replay state velocity must contain only finite numbers')
  }
}

function requireBound(label: string, value: unknown, maximum: number): number {
  const result = requireNonNegativeInteger(label, value)
  if (result < 1 || result > maximum) throw new Error(`${label} must be between 1 and ${maximum}`)
  return result
}

function requireNonNegativeInteger(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return value
}

function requireUint32(label: string, value: unknown): number {
  const result = requireNonNegativeInteger(label, value)
  if (result > 0xffff_ffff) throw new TypeError(`${label} must be an unsigned 32-bit integer`)
  return result
}

function requirePositiveFinite(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`)
  }
  return value
}

function requireBoundedString(label: string, value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new TypeError(`${label} must contain between 1 and ${maximum} characters`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
