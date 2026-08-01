import {
  createImmutableJsonSnapshot,
  stableCanonicalStringify,
  type ImmutableJsonValue,
} from './deterministic-recording.js'

export { createImmutableJsonSnapshot, type ImmutableJsonValue }

export const DECLARATIVE_ASSERTION_OPERATORS = ['eq', 'ne', 'lt', 'lte', 'gt', 'gte'] as const

export type DeclarativeAssertionOperator = (typeof DECLARATIVE_ASSERTION_OPERATORS)[number]

export interface DeclarativeAssertion {
  readonly code: string
  readonly path: string
  readonly operator: DeclarativeAssertionOperator
  readonly expected: unknown
}

export interface DeclarativeAssertionResult {
  readonly code: string
  readonly path: string
  readonly operator: DeclarativeAssertionOperator
  readonly passed: boolean
  readonly expected: unknown
  readonly actual: unknown
}

const ASSERTION_KEYS = new Set(['code', 'path', 'operator', 'expected'])
const ASSERTION_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/
const PROPERTY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*/
const INDEX_PATTERN = /^(0|[1-9]\d*)/
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])
const MAX_PATH_LENGTH = 256

type PathSegment = string | number

/**
 * Evaluates data-only assertions against an immutable clone of an observation.
 * No field from either input is invoked or assigned.
 */
export function evaluateDeclarativeAssertions(
  observation: unknown,
  assertions: unknown,
): readonly DeclarativeAssertionResult[] {
  const immutableObservation = createImmutableJsonSnapshot(observation) as unknown
  const immutableAssertions = createImmutableJsonSnapshot(assertions) as unknown
  if (!Array.isArray(immutableAssertions)) {
    throw new TypeError('Declarative assertions must be an array')
  }

  const codes = new Set<string>()
  const results: DeclarativeAssertionResult[] = []
  for (let index = 0; index < immutableAssertions.length; index += 1) {
    const assertion = validateAssertion(immutableAssertions[index], index)
    if (codes.has(assertion.code)) {
      throw new Error(`Duplicate assertion code: ${assertion.code}`)
    }
    codes.add(assertion.code)

    const actual = resolveObservationPath(immutableObservation, assertion.path)
    const passed = compare(assertion.operator, actual, assertion.expected, assertion.path)
    results.push(
      Object.freeze({
        code: assertion.code,
        path: assertion.path,
        operator: assertion.operator,
        passed,
        expected: assertion.expected,
        actual,
      }),
    )
  }
  return Object.freeze(results)
}

function validateAssertion(value: unknown, index: number): DeclarativeAssertion {
  if (!isRecord(value)) {
    throw new TypeError(`Declarative assertion ${index} must be an object`)
  }
  for (const key of Object.keys(value)) {
    if (!ASSERTION_KEYS.has(key)) {
      throw new Error(`Declarative assertion ${index} contains unknown field: ${key}`)
    }
  }
  for (const key of ASSERTION_KEYS) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`Declarative assertion ${index} must include ${key}`)
    }
  }
  if (typeof value.code !== 'string' || !ASSERTION_CODE_PATTERN.test(value.code)) {
    throw new Error(`Declarative assertion ${index} code is invalid`)
  }
  if (typeof value.path !== 'string') {
    throw new Error(`Declarative assertion ${value.code} path must be a string`)
  }
  if (!isAssertionOperator(value.operator)) {
    throw new Error(`Declarative assertion ${value.code} has unknown operator`)
  }
  parseObservationPath(value.path)
  return value as unknown as DeclarativeAssertion
}

function isAssertionOperator(value: unknown): value is DeclarativeAssertionOperator {
  return (
    typeof value === 'string' &&
    (DECLARATIVE_ASSERTION_OPERATORS as readonly string[]).includes(value)
  )
}

function compare(
  operator: DeclarativeAssertionOperator,
  actual: unknown,
  expected: unknown,
  path: string,
): boolean {
  if (operator === 'eq' || operator === 'ne') {
    const equal = stableCanonicalStringify(actual) === stableCanonicalStringify(expected)
    return operator === 'eq' ? equal : !equal
  }
  if (typeof actual !== 'number' || typeof expected !== 'number') {
    throw new TypeError(`Numeric assertion at ${path} requires numeric actual and expected values`)
  }
  switch (operator) {
    case 'lt':
      return actual < expected
    case 'lte':
      return actual <= expected
    case 'gt':
      return actual > expected
    case 'gte':
      return actual >= expected
  }
}

function resolveObservationPath(observation: unknown, path: string): unknown {
  let current = observation
  for (const segment of parseObservationPath(path)) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || !Object.hasOwn(current, segment)) {
        throw new Error(`Unknown observation path: ${path}`)
      }
      current = current[segment]
      continue
    }
    if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      throw new Error(`Unknown observation path: ${path}`)
    }
    current = current[segment]
  }
  return current
}

function parseObservationPath(path: string): readonly PathSegment[] {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) {
    throw new Error('Observation path must contain between 1 and 256 characters')
  }
  const segments: PathSegment[] = []
  let cursor = 0

  const readProperty = (): void => {
    const match = PROPERTY_PATTERN.exec(path.slice(cursor))
    if (!match) throw new Error(`Invalid observation path: ${path}`)
    const segment = match[0]
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new Error(`Forbidden observation path segment: ${segment}`)
    }
    segments.push(segment)
    cursor += segment.length
  }

  readProperty()
  while (cursor < path.length) {
    if (path[cursor] === '.') {
      cursor += 1
      readProperty()
      continue
    }
    if (path[cursor] !== '[') throw new Error(`Invalid observation path: ${path}`)
    cursor += 1
    const match = INDEX_PATTERN.exec(path.slice(cursor))
    if (!match) throw new Error(`Invalid observation path: ${path}`)
    cursor += match[0].length
    if (path[cursor] !== ']') throw new Error(`Invalid observation path: ${path}`)
    const index = Number(match[0])
    if (!Number.isSafeInteger(index)) throw new Error(`Invalid observation path index: ${match[0]}`)
    segments.push(index)
    cursor += 1
  }
  return segments
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
