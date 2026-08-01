const FNV1A_64_OFFSET = 0xcbf29ce484222325n
const FNV1A_64_PRIME = 0x100000001b3n
const UINT32_MAX = 0xffff_ffff
const STABLE_HASH_PATTERN = /^fnv1a64:[0-9a-f]{16}$/

export interface FixedTickRecordingFrame<TActions = unknown> {
  readonly tick: number
  readonly actions: TActions
  readonly expectedHash: string
}

export interface FixedTickRecording<TActions = unknown> {
  readonly version: number
  readonly seed: number
  readonly fixedDelta: number
  readonly tickCount: number
  readonly frames: readonly FixedTickRecordingFrame<TActions>[]
}

export interface FixedTickRecorderOptions {
  readonly version: number
  readonly seed: number
  readonly fixedDelta: number
  readonly tickCount: number
}

export interface FixedTickRecorder<TActions = unknown, TState = unknown> {
  record(tick: number, actions: TActions, state: TState): void
  snapshot(): FixedTickRecording<TActions>
  finish(): FixedTickRecording<TActions>
}

export interface FixedTickReplayOptions<TState, TActions = unknown> {
  readonly version: number
  readonly expectedSeed?: number
  readonly expectedFixedDelta?: number
  readonly initialState: TState
  readonly step: (
    state: TState,
    actions: TActions,
    context: Readonly<{ tick: number; fixedDelta: number; seed: number }>,
  ) => TState
}

export interface FixedTickReplayDivergence {
  readonly tick: number
  readonly expectedHash: string
  readonly actualHash: string
}

export interface FixedTickReplayResult {
  readonly hashes: readonly string[]
  readonly divergence: FixedTickReplayDivergence | null
}

/**
 * Serializes JSON-shaped deterministic data without insertion-order or locale dependence.
 * Non-finite numbers and non-JSON data are rejected; negative zero is normalized to zero.
 */
export function stableCanonicalStringify(value: unknown): string {
  return canonicalStringify(value, new Set<object>(), '$')
}

/** Returns a stable lowercase FNV-1a 64-bit hash of the canonical UTF-8 representation. */
export function stableCanonicalHash(value: unknown): string {
  const bytes = new TextEncoder().encode(stableCanonicalStringify(value))
  let hash = FNV1A_64_OFFSET
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * FNV1A_64_PRIME)
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`
}

/** Creates an in-memory recorder that commits one immutable frame per contiguous fixed tick. */
export function createFixedTickRecorder<TActions = unknown, TState = unknown>(
  options: FixedTickRecorderOptions,
): FixedTickRecorder<TActions, TState> {
  validateRecordingMetadata(options)
  const frames: FixedTickRecordingFrame<TActions>[] = []

  const snapshot = (): FixedTickRecording<TActions> =>
    Object.freeze({
      version: options.version,
      seed: options.seed,
      fixedDelta: options.fixedDelta,
      tickCount: options.tickCount,
      frames: Object.freeze([...frames]),
    })

  return {
    record(tick, actions, state) {
      if (!Number.isInteger(tick) || tick < 0) {
        throw new Error('Fixed tick must be a non-negative integer')
      }
      if (tick !== frames.length) {
        throw new Error(`Fixed tick ${tick} is invalid; expected ${frames.length}`)
      }
      if (tick >= options.tickCount) {
        throw new Error(`Fixed tick ${tick} exceeds declared tick count ${options.tickCount}`)
      }

      const immutableActions = cloneDeterministicValue(actions) as TActions
      const expectedHash = stableCanonicalHash(state)
      frames.push(Object.freeze({ tick, actions: immutableActions, expectedHash }))
    },
    snapshot,
    finish() {
      if (frames.length !== options.tickCount) {
        throw new Error(
          `Recording frame count ${frames.length} does not match declared tick count ${options.tickCount}`,
        )
      }
      return snapshot()
    },
  }
}

/** Validates and replays a recording without mutating it, stopping at the first hash mismatch. */
export function replayFixedTickRecording<TState, TActions = unknown>(
  recording: unknown,
  options: FixedTickReplayOptions<TState, TActions>,
): FixedTickReplayResult {
  const validated = validateFixedTickRecording(recording, options)
  let state = cloneDeterministicValue(options.initialState) as TState
  const hashes: string[] = []

  for (const frame of validated.frames) {
    state = options.step(
      state,
      frame.actions as TActions,
      Object.freeze({
        tick: frame.tick,
        fixedDelta: validated.fixedDelta,
        seed: validated.seed,
      }),
    )
    const actualHash = stableCanonicalHash(state)
    hashes.push(actualHash)
    if (actualHash !== frame.expectedHash) {
      return Object.freeze({
        hashes: Object.freeze(hashes),
        divergence: Object.freeze({
          tick: frame.tick,
          expectedHash: frame.expectedHash,
          actualHash,
        }),
      })
    }
  }

  return Object.freeze({
    hashes: Object.freeze(hashes),
    divergence: null,
  })
}

function validateFixedTickRecording<TState, TActions>(
  recording: unknown,
  options: FixedTickReplayOptions<TState, TActions>,
): FixedTickRecording<unknown> {
  if (!Number.isInteger(options.version) || options.version < 0) {
    throw new Error('Expected recording version must be a non-negative integer')
  }
  if (options.expectedSeed !== undefined) validateSeed(options.expectedSeed, 'Expected seed')
  if (options.expectedFixedDelta !== undefined) {
    validatePositiveFinite(options.expectedFixedDelta, 'Expected fixedDelta')
  }

  const value = cloneDeterministicValue(recording)
  if (!isRecord(value)) throw new Error('Recording must be an object')
  if (value.version !== options.version) {
    throw new Error(`Unsupported recording version: ${String(value.version)}`)
  }
  validateSeed(value.seed, 'Recording seed')
  validatePositiveFinite(value.fixedDelta, 'Recording fixedDelta')
  if (!Number.isInteger(value.tickCount) || (value.tickCount as number) < 0) {
    throw new Error('Recording tickCount must be a non-negative integer')
  }
  if (!Array.isArray(value.frames)) throw new Error('Recording frames must be an array')
  if (value.frames.length !== value.tickCount) {
    throw new Error(
      `Recording frame count ${value.frames.length} does not match declared tick count ${String(value.tickCount)}`,
    )
  }
  if (options.expectedSeed !== undefined && value.seed !== options.expectedSeed) {
    throw new Error(`Recording seed ${String(value.seed)} does not match expected seed ${options.expectedSeed}`)
  }
  if (
    options.expectedFixedDelta !== undefined &&
    value.fixedDelta !== options.expectedFixedDelta
  ) {
    throw new Error(
      `Recording fixedDelta ${String(value.fixedDelta)} does not match expected fixedDelta ${options.expectedFixedDelta}`,
    )
  }

  for (let index = 0; index < value.frames.length; index += 1) {
    const frame = value.frames[index]
    if (!isRecord(frame)) throw new Error(`Recording frame ${index} must be an object`)
    if (!Number.isInteger(frame.tick) || frame.tick !== index) {
      throw new Error(`Recording frame ${index} must have contiguous integer tick ${index}`)
    }
    if (!Object.hasOwn(frame, 'actions')) {
      throw new Error(`Recording frame ${index} must include actions`)
    }
    if (typeof frame.expectedHash !== 'string' || !STABLE_HASH_PATTERN.test(frame.expectedHash)) {
      throw new Error(`Recording frame ${index} expectedHash is invalid`)
    }
  }

  return value as unknown as FixedTickRecording<unknown>
}

function validateRecordingMetadata(options: FixedTickRecorderOptions): void {
  if (!Number.isInteger(options.version) || options.version < 0) {
    throw new Error('Recording version must be a non-negative integer')
  }
  validateSeed(options.seed, 'Recording seed')
  validatePositiveFinite(options.fixedDelta, 'Recording fixedDelta')
  if (!Number.isInteger(options.tickCount) || options.tickCount < 0) {
    throw new Error('Recording tickCount must be a non-negative integer')
  }
}

function validateSeed(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > UINT32_MAX) {
    throw new Error(`${label} must be an unsigned 32-bit integer`)
  }
}

function validatePositiveFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
}

function cloneDeterministicValue<T>(value: T): T {
  return deepFreeze(JSON.parse(stableCanonicalStringify(value)) as T)
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}

function canonicalStringify(value: unknown, ancestors: Set<object>, path: string): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite numbers`)
    return Object.is(value, -0) ? '0' : JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new Error(`${path} contains unsupported ${typeof value} data`)
  }
  if (ancestors.has(value)) throw new Error(`${path} contains a cyclic reference`)

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value)
      for (const key of ownKeys) {
        if (typeof key === 'symbol') throw new Error(`${path} contains a symbol property`)
        if (key === 'length') continue
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new Error(`${path} contains a non-index array property`)
        }
      }
      const items: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new Error(`${path} contains a sparse array slot`)
        items.push(canonicalStringify(value[index], ancestors, `${path}[${index}]`))
      }
      return `[${items.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} contains an unsupported object type`)
    }
    const keys: string[] = []
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === 'symbol') throw new Error(`${path} contains a symbol property`)
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new Error(`${path}.${key} must be an enumerable data property`)
      }
      keys.push(key)
    }
    keys.sort()
    return `{${keys
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        return `${JSON.stringify(key)}:${canonicalStringify(descriptor.value, ancestors, `${path}.${key}`)}`
      })
      .join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
