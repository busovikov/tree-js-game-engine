import {
  createImmutableJsonSnapshot,
  stableCanonicalStringify,
  type DeclarativeAssertion,
  type DeclarativeAssertionResult,
  type ImmutableJsonValue,
} from '@haku/core'
import {
  BOUNCE_RUN_OBSERVATION_VERSION,
  evaluateBounceRunAssertions,
  type BounceRunObservation,
} from './qa-observations.js'
import {
  BOUNCE_RUN_RECORDING_VERSION,
  type BounceRunRecording,
} from './replay.js'

export const BOUNCE_RUN_SESSION_REPORT_VERSION = 1 as const
export const BOUNCE_RUN_BUG_REPORT_VERSION = 1 as const
export const MAX_BOUNCE_RUN_REPORT_TICKS = 36_000
export const MAX_BOUNCE_RUN_REPORT_OBSERVATIONS = 1_024
export const MAX_BOUNCE_RUN_REPORT_ASSERTIONS = 64
export const MAX_BOUNCE_RUN_REPORT_ERRORS = 128
export const MAX_BOUNCE_RUN_ERROR_CONTEXT_BYTES = 8_192

const HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/
const CATEGORY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/
const SESSION_INPUT_KEYS = new Set([
  'version',
  'kind',
  'seed',
  'fixedDelta',
  'outcome',
  'recording',
  'assertions',
  'observations',
  'errors',
])
const RECORDING_KEYS = new Set(['version', 'seed', 'fixedDelta', 'tickCount', 'frames'])
const FRAME_KEYS = new Set(['tick', 'actions', 'expectedHash'])
const OBSERVATION_EVIDENCE_KEYS = new Set(['observation', 'assertionResults'])
const ERROR_KEYS = new Set(['source', 'category', 'message', 'tick', 'context'])
const BUG_INPUT_KEYS = new Set(['version', 'kind', 'session', 'defect', 'rootCause'])
const DEFECT_KEYS = new Set(['code', 'title', 'summary'])
const ROOT_CAUSE_KEYS = new Set([
  'status',
  'category',
  'summary',
  'firstFailingTick',
  'assertionCodes',
])

export type BounceRunSessionOutcome = 'completed' | 'failed' | 'aborted'
export type BounceRunReportErrorSource = 'runtime' | 'console'
export type BounceRunRootCauseStatus = 'unknown' | 'suspected' | 'confirmed'

export interface BounceRunReportError {
  readonly source: BounceRunReportErrorSource
  readonly category: string
  readonly message: string
  readonly tick?: number
  readonly context?: unknown
}

export interface BounceRunObservationEvidence {
  readonly observation: BounceRunObservation
  readonly assertionResults: readonly DeclarativeAssertionResult[]
}

export interface BounceRunSessionReport {
  readonly version: typeof BOUNCE_RUN_SESSION_REPORT_VERSION
  readonly kind: 'session'
  readonly seed: number
  readonly fixedDelta: number
  readonly outcome: BounceRunSessionOutcome
  readonly recording: BounceRunRecording
  readonly assertions: readonly DeclarativeAssertion[]
  readonly observations: readonly BounceRunObservationEvidence[]
  readonly errors: readonly BounceRunReportError[]
}

export interface BounceRunBugReport {
  readonly version: typeof BOUNCE_RUN_BUG_REPORT_VERSION
  readonly kind: 'bug'
  readonly session: BounceRunSessionReport
  readonly defect: Readonly<{ code: string; title: string; summary: string }>
  readonly rootCause: Readonly<{
    status: BounceRunRootCauseStatus
    category: string
    summary: string
    firstFailingTick?: number
    assertionCodes: readonly string[]
  }>
}

/** Composes one immutable data-only QA session artifact from existing public evidence. */
export function createBounceRunSessionReport(
  input: unknown,
): ImmutableJsonValue<BounceRunSessionReport> {
  const value = createImmutableJsonSnapshot(input)
  return createImmutableJsonSnapshot(validateSessionReport(value, false))
}

/** Adds immutable defect and root-cause evidence to one validated session artifact. */
export function createBounceRunBugReport(
  input: unknown,
): ImmutableJsonValue<BounceRunBugReport> {
  const value = createImmutableJsonSnapshot(input)
  return createImmutableJsonSnapshot(validateBugReport(value))
}

/** Serializes a validated bug report as deterministic canonical UTF-8 bytes. */
export function serializeBounceRunBugReport(input: unknown): Uint8Array {
  const report = createBounceRunBugReport(input)
  return new TextEncoder().encode(stableCanonicalStringify(report))
}

function validateSessionReport(value: unknown, requireKind: boolean): BounceRunSessionReport {
  const report = requireRecord('Bounce Run session report', value)
  requireOnlyKeys('Bounce Run session report', report, SESSION_INPUT_KEYS)
  requireOwnFields('Bounce Run session report', report, [
    'version',
    'seed',
    'fixedDelta',
    'outcome',
    'recording',
    'assertions',
    'observations',
    'errors',
  ])
  if (report.version !== BOUNCE_RUN_SESSION_REPORT_VERSION) {
    throw new Error(`Unsupported Bounce Run session report version: ${String(report.version)}`)
  }
  if (requireKind) {
    if (report.kind !== 'session') throw new Error('Bounce Run session report kind is invalid')
  } else if (Object.hasOwn(report, 'kind')) {
    throw new Error('Bounce Run session report input must not include kind')
  }

  const seed = requireUint32('Bounce Run session seed', report.seed)
  const fixedDelta = requirePositiveFinite('Bounce Run session fixedDelta', report.fixedDelta)
  const outcome = requireOneOf(
    'Bounce Run session outcome',
    report.outcome,
    ['completed', 'failed', 'aborted'] as const,
  )
  const recording = validateRecording(report.recording)
  if (recording.seed !== seed) throw new Error('Bounce Run session seed must match recording seed')
  if (recording.fixedDelta !== fixedDelta) {
    throw new Error('Bounce Run session fixedDelta must match recording fixedDelta')
  }

  const assertions = requireArray('Bounce Run report assertions', report.assertions)
  if (assertions.length > MAX_BOUNCE_RUN_REPORT_ASSERTIONS) {
    throw new Error(`Bounce Run report assertions exceed ${MAX_BOUNCE_RUN_REPORT_ASSERTIONS}`)
  }
  const observations = validateObservationHistory(
    report.observations,
    assertions,
    recording.tickCount,
    fixedDelta,
  )
  const errors = validateErrors(report.errors, recording.tickCount)

  return {
    version: BOUNCE_RUN_SESSION_REPORT_VERSION,
    kind: 'session',
    seed,
    fixedDelta,
    outcome,
    recording: recording as BounceRunRecording,
    assertions: assertions as unknown as readonly DeclarativeAssertion[],
    observations,
    errors,
  }
}

function validateRecording(value: unknown): BounceRunRecording {
  const recording = requireRecord('Bounce Run recording', value)
  requireOnlyKeys('Bounce Run recording', recording, RECORDING_KEYS)
  requireOwnFields('Bounce Run recording', recording, [...RECORDING_KEYS])
  if (recording.version !== BOUNCE_RUN_RECORDING_VERSION) {
    throw new Error(`Unsupported Bounce Run recording version: ${String(recording.version)}`)
  }
  requireUint32('Bounce Run recording seed', recording.seed)
  requirePositiveFinite('Bounce Run recording fixedDelta', recording.fixedDelta)
  const tickCount = requireNonNegativeInteger('Bounce Run recording tickCount', recording.tickCount)
  if (tickCount > MAX_BOUNCE_RUN_REPORT_TICKS) {
    throw new Error(`Bounce Run recording tickCount exceeds ${MAX_BOUNCE_RUN_REPORT_TICKS}`)
  }
  const frames = requireArray('Bounce Run recording frames', recording.frames)
  if (frames.length !== tickCount) {
    throw new Error('Bounce Run recording frame count must match tickCount')
  }
  for (let index = 0; index < frames.length; index += 1) {
    const frame = requireRecord(`Bounce Run recording frame ${index}`, frames[index])
    requireOnlyKeys(`Bounce Run recording frame ${index}`, frame, FRAME_KEYS)
    requireOwnFields(`Bounce Run recording frame ${index}`, frame, [...FRAME_KEYS])
    if (frame.tick !== index) {
      throw new Error(`Bounce Run recording frame ${index} must have contiguous tick ${index}`)
    }
    if (typeof frame.expectedHash !== 'string' || !HASH_PATTERN.test(frame.expectedHash)) {
      throw new Error(`Bounce Run recording frame ${index} expectedHash is invalid`)
    }
  }
  return recording as unknown as BounceRunRecording
}

function validateObservationHistory(
  value: unknown,
  assertions: readonly unknown[],
  tickCount: number,
  fixedDelta: number,
): readonly BounceRunObservationEvidence[] {
  const history = requireArray('Bounce Run report observations', value)
  if (history.length > MAX_BOUNCE_RUN_REPORT_OBSERVATIONS) {
    throw new Error(`Bounce Run report observations exceed ${MAX_BOUNCE_RUN_REPORT_OBSERVATIONS}`)
  }
  let previousTick = -1
  const evidence: BounceRunObservationEvidence[] = []
  for (let index = 0; index < history.length; index += 1) {
    const entry = requireRecord(`Bounce Run observation evidence ${index}`, history[index])
    requireOnlyKeys(`Bounce Run observation evidence ${index}`, entry, OBSERVATION_EVIDENCE_KEYS)
    requireOwnFields(`Bounce Run observation evidence ${index}`, entry, [
      'observation',
      'assertionResults',
    ])
    const observation = requireRecord(`Bounce Run observation ${index}`, entry.observation)
    if (observation.version !== BOUNCE_RUN_OBSERVATION_VERSION) {
      throw new Error(`Unsupported Bounce Run observation version at index ${index}`)
    }
    const scheduler = requireRecord(`Bounce Run observation ${index} scheduler`, observation.scheduler)
    const tick = requireNonNegativeInteger(`Bounce Run observation ${index} tick`, scheduler.tick)
    if (tick >= tickCount) throw new Error(`Bounce Run observation tick ${tick} is outside recording range`)
    if (tick <= previousTick) {
      throw new Error('Bounce Run observation ticks must be strictly increasing')
    }
    if (scheduler.fixedDelta !== fixedDelta) {
      throw new Error(`Bounce Run observation ${tick} fixedDelta must match session fixedDelta`)
    }

    const expectedResults = evaluateBounceRunAssertions(observation, assertions)
    if (stableCanonicalStringify(entry.assertionResults) !== stableCanonicalStringify(expectedResults)) {
      throw new Error(`Bounce Run assertion results do not match observation tick ${tick}`)
    }
    previousTick = tick
    evidence.push({
      observation: observation as unknown as BounceRunObservation,
      assertionResults: expectedResults,
    })
  }
  return evidence
}

function validateErrors(value: unknown, tickCount: number): readonly BounceRunReportError[] {
  const errors = requireArray('Bounce Run report errors', value)
  if (errors.length > MAX_BOUNCE_RUN_REPORT_ERRORS) {
    throw new Error(`Bounce Run report errors exceed ${MAX_BOUNCE_RUN_REPORT_ERRORS}`)
  }
  return errors.map((item, index) => {
    const error = requireRecord(`Bounce Run report error ${index}`, item)
    requireOnlyKeys(`Bounce Run report error ${index}`, error, ERROR_KEYS)
    requireOwnFields(`Bounce Run report error ${index}`, error, ['source', 'category', 'message'])
    const source = requireOneOf(
      `Bounce Run report error ${index} source`,
      error.source,
      ['runtime', 'console'] as const,
    )
    const category = requirePattern(
      `Bounce Run report error ${index} category`,
      error.category,
      CATEGORY_PATTERN,
    )
    const message = requireBoundedString(`Bounce Run report error ${index} message`, error.message, 2_048)
    const result: BounceRunReportError = { source, category, message }
    if (Object.hasOwn(error, 'tick')) {
      const tick = requireNonNegativeInteger(`Bounce Run report error ${index} tick`, error.tick)
      if (tick >= tickCount) throw new Error(`Bounce Run report error ${index} tick is outside recording range`)
      Object.assign(result, { tick })
    }
    if (Object.hasOwn(error, 'context')) {
      const contextSize = new TextEncoder().encode(stableCanonicalStringify(error.context)).byteLength
      if (contextSize > MAX_BOUNCE_RUN_ERROR_CONTEXT_BYTES) {
        throw new Error(`Bounce Run report error ${index} context exceeds byte limit`)
      }
      Object.assign(result, { context: error.context })
    }
    return result
  })
}

function validateBugReport(value: unknown): BounceRunBugReport {
  const report = requireRecord('Bounce Run bug report', value)
  requireOnlyKeys('Bounce Run bug report', report, BUG_INPUT_KEYS)
  requireOwnFields('Bounce Run bug report', report, ['version', 'session', 'defect', 'rootCause'])
  if (report.version !== BOUNCE_RUN_BUG_REPORT_VERSION) {
    throw new Error(`Unsupported Bounce Run bug report version: ${String(report.version)}`)
  }
  if (Object.hasOwn(report, 'kind') && report.kind !== 'bug') {
    throw new Error('Bounce Run bug report kind is invalid')
  }
  const session = validateSessionReport(report.session, true)
  const defect = requireRecord('Bounce Run bug defect', report.defect)
  requireOnlyKeys('Bounce Run bug defect', defect, DEFECT_KEYS)
  requireOwnFields('Bounce Run bug defect', defect, [...DEFECT_KEYS])
  const validatedDefect = {
    code: requirePattern('Bounce Run bug defect code', defect.code, CODE_PATTERN),
    title: requireBoundedString('Bounce Run bug defect title', defect.title, 256),
    summary: requireBoundedString('Bounce Run bug defect summary', defect.summary, 4_096),
  }

  const rootCause = requireRecord('Bounce Run bug rootCause', report.rootCause)
  requireOnlyKeys('Bounce Run bug rootCause', rootCause, ROOT_CAUSE_KEYS)
  requireOwnFields('Bounce Run bug rootCause', rootCause, [
    'status',
    'category',
    'summary',
    'assertionCodes',
  ])
  const status = requireOneOf(
    'Bounce Run bug rootCause status',
    rootCause.status,
    ['unknown', 'suspected', 'confirmed'] as const,
  )
  const category = requirePattern('Bounce Run bug rootCause category', rootCause.category, CATEGORY_PATTERN)
  const summary = requireBoundedString('Bounce Run bug rootCause summary', rootCause.summary, 4_096)
  const knownAssertionCodes = new Set(session.assertions.map((assertion) => assertion.code))
  const assertionCodes = requireArray('Bounce Run bug rootCause assertionCodes', rootCause.assertionCodes)
  const uniqueCodes = new Set<string>()
  for (const code of assertionCodes) {
    const validatedCode = requirePattern('Bounce Run bug rootCause assertion code', code, CODE_PATTERN)
    if (!knownAssertionCodes.has(validatedCode)) {
      throw new Error(`Unknown Bounce Run bug rootCause assertion code: ${validatedCode}`)
    }
    if (uniqueCodes.has(validatedCode)) {
      throw new Error(`Duplicate Bounce Run bug rootCause assertion code: ${validatedCode}`)
    }
    uniqueCodes.add(validatedCode)
  }
  const validatedRootCause: BounceRunBugReport['rootCause'] = {
    status,
    category,
    summary,
    assertionCodes: [...uniqueCodes],
  }
  if (Object.hasOwn(rootCause, 'firstFailingTick')) {
    const tick = requireNonNegativeInteger('Bounce Run bug rootCause firstFailingTick', rootCause.firstFailingTick)
    if (tick >= session.recording.tickCount) {
      throw new Error('Bounce Run bug rootCause firstFailingTick is outside recording range')
    }
    Object.assign(validatedRootCause, { firstFailingTick: tick })
  }

  return {
    version: BOUNCE_RUN_BUG_REPORT_VERSION,
    kind: 'bug',
    session,
    defect: validatedDefect,
    rootCause: validatedRootCause,
  }
}

function requireRecord(label: string, value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireArray(label: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`)
  return value
}

function requireOnlyKeys(label: string, value: Record<string, unknown>, keys: ReadonlySet<string>): void {
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) throw new Error(`${label} contains unknown field: ${key}`)
  }
}

function requireOwnFields(label: string, value: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new Error(`${label} must include ${field}`)
  }
}

function requireNonNegativeInteger(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return value
}

function requireUint32(label: string, value: unknown): number {
  const number = requireNonNegativeInteger(label, value)
  if (number > 0xffff_ffff) throw new TypeError(`${label} must be an unsigned 32-bit integer`)
  return number
}

function requirePositiveFinite(label: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finite number`)
  }
  return value
}

function requirePattern(label: string, value: unknown, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new TypeError(`${label} is invalid`)
  return value
}

function requireBoundedString(label: string, value: unknown, maximumLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new TypeError(`${label} must contain between 1 and ${maximumLength} characters`)
  }
  return value
}

function requireOneOf<const TValue extends string>(
  label: string,
  value: unknown,
  allowed: readonly TValue[],
): TValue {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new TypeError(`${label} is invalid`)
  }
  return value as TValue
}
