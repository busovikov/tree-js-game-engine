import { DETERMINISTIC_GRAPH_CONTRACTS } from '@haku/graph'
import {
  type CheckpointEffectRecord,
  type NodeExecutionRequest,
  type NodeExecutionResult,
  type NodeRuntimeRegistry,
} from './runtime-adapter.js'

export interface GraphVariableStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
  capture(): Readonly<Record<string, unknown>>
  restore(values: Readonly<Record<string, unknown>>): void
}

export function createGraphVariableStore(
  initial: Readonly<Record<string, unknown>> = {},
): GraphVariableStore {
  let values = cloneRecord(initial)
  return {
    get(key) {
      if (!Object.hasOwn(values, key)) {
        throw new Error(`Unknown graph variable: ${key}`)
      }
      return structuredClone(values[key])
    },
    set(key, value) {
      values[key] = structuredClone(value)
    },
    capture() {
      return cloneRecord(values)
    },
    restore(snapshot) {
      values = cloneRecord(snapshot)
    },
  }
}

export interface SeededRandomCheckpoint {
  readonly state: number
}

export interface SeededRandomService {
  next(): number
  capture(): SeededRandomCheckpoint
  restore(checkpoint: SeededRandomCheckpoint): void
}

export function createSeededRandomService(seed: number): SeededRandomService {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new TypeError('Random seed must be an unsigned 32-bit integer')
  }
  let state = (seed >>> 0) || 0x6d2b79f5
  return {
    next() {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      state >>>= 0
      return state / 0x1_0000_0000
    },
    capture() {
      return { state }
    },
    restore(checkpoint) {
      if (
        !Number.isInteger(checkpoint.state) ||
        checkpoint.state <= 0 ||
        checkpoint.state > 0xffff_ffff
      ) {
        throw new TypeError('Random checkpoint state must be a non-zero unsigned 32-bit integer')
      }
      state = checkpoint.state >>> 0
    },
  }
}

export interface DeterministicRuntimeServices {
  readonly variables: GraphVariableStore
  readonly random: SeededRandomService
}

export function registerDeterministicRuntimeAdapters(
  registry: NodeRuntimeRegistry,
  services: DeterministicRuntimeServices,
): void {
  const register = (
    nodeType: string,
    execute: (request: NodeExecutionRequest) => NodeExecutionResult,
  ): void => registry.register({ nodeType, version: '1', execute })

  const getVariable = DETERMINISTIC_GRAPH_CONTRACTS.getVariable
  register(getVariable.nodeType, (request) => ({
    data: {
      [getVariable.ports.value]: services.variables.get(variableKey(request)),
    },
  }))

  const setVariable = DETERMINISTIC_GRAPH_CONTRACTS.setVariable
  register(setVariable.nodeType, (request) => {
    services.variables.set(
      variableKey(request),
      request.readData(setVariable.ports.value),
    )
    return { flow: [setVariable.ports.flowOut] }
  })

  const multiply = DETERMINISTIC_GRAPH_CONTRACTS.multiply
  register(multiply.nodeType, (request) => ({
    data: {
      [multiply.ports.result]:
        finiteNumber(request.readData(multiply.ports.a), 'Multiply A') *
        finiteNumber(request.readData(multiply.ports.b), 'Multiply B'),
    },
  }))

  const dot = DETERMINISTIC_GRAPH_CONTRACTS.dotVec3
  register(dot.nodeType, (request) => {
    const left = finiteVec3(request.readData(dot.ports.a), 'Dot Vec3 A')
    const right = finiteVec3(request.readData(dot.ports.b), 'Dot Vec3 B')
    return {
      data: {
        [dot.ports.result]:
          left[0] * right[0] + left[1] * right[1] + left[2] * right[2],
      },
    }
  })

  const random = DETERMINISTIC_GRAPH_CONTRACTS.randomNumber
  register(random.nodeType, (request) => {
    const min = finiteNumber(request.readData(random.ports.min), 'Random minimum')
    const max = finiteNumber(request.readData(random.ports.max), 'Random maximum')
    if (max <= min) {
      throw new RangeError('Random range maximum must be greater than minimum')
    }
    const value = min + services.random.next() * (max - min)
    return {
      data: { [random.ports.value]: value },
      effects: [randomEffect(request, value)],
    }
  })
}

function variableKey(request: NodeExecutionRequest): string {
  const key = request.node.properties.key
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('Graph variable key must be a non-empty string')
  }
  return key
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`)
  }
  return value
}

function finiteVec3(
  value: unknown,
  label: string,
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new TypeError(`${label} must be a three-component vector`)
  }
  return [
    finiteNumber(value[0], `${label}[0]`),
    finiteNumber(value[1], `${label}[1]`),
    finiteNumber(value[2], `${label}[2]`),
  ]
}

function cloneRecord(
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const clone = structuredClone(values)
  if (
    typeof clone !== 'object' ||
    clone === null ||
    Array.isArray(clone)
  ) {
    throw new TypeError('Graph variable snapshot must be an object')
  }
  return clone
}

function randomEffect(
  request: NodeExecutionRequest,
  value: number,
): CheckpointEffectRecord {
  return {
    id: [
      request.instanceId,
      request.node.id,
      'random.seeded',
      request.tickNumber,
      request.frameNumber,
    ].join(':'),
    kind: 'random.seeded',
    payload: { value },
  }
}
