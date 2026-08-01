import { describe, expect, it } from 'vitest'
import {
  createImmutableJsonSnapshot,
  evaluateDeclarativeAssertions,
} from './structured-observation.js'

describe('immutable structured observations', () => {
  it('clones and deeply freezes finite plain JSON-shaped data', () => {
    const source = {
      tick: 7,
      state: 'active',
      ball: { position: [1, 2, 3], grounded: false },
    }
    const snapshot = createImmutableJsonSnapshot(source)

    expect(snapshot).toEqual(source)
    expect(snapshot).not.toBe(source)
    expect(snapshot.ball).not.toBe(source.ball)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.ball)).toBe(true)
    expect(Object.isFrozen(snapshot.ball.position)).toBe(true)

    source.tick = 8
    source.ball.position[1] = 99
    expect(snapshot).toEqual({
      tick: 7,
      state: 'active',
      ball: { position: [1, 2, 3], grounded: false },
    })
  })

  it('rejects cyclic, executable, accessor, symbol, sparse, non-finite, and unsupported data', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const sparse = Array(2)
    sparse[1] = 1
    const symbolKey = Symbol('hidden')
    const withSymbol = { value: 1, [symbolKey]: 2 }
    let getterCalls = 0
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        getterCalls += 1
        return 1
      },
    })

    for (const invalid of [
      cyclic,
      { callback: () => undefined },
      accessor,
      withSymbol,
      sparse,
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: 1n },
      new Map(),
    ]) {
      expect(() => createImmutableJsonSnapshot(invalid)).toThrow()
    }
    expect(getterCalls).toBe(0)
  })
})

describe('declarative observation assertions', () => {
  const observation = {
    scheduler: { tick: 12, fixedDelta: 1 / 60 },
    session: { state: 'active' },
    ball: { position: [1, 2, 3], velocity: [0, -1, 8] },
    flags: { safe: true },
  }

  it('returns immutable structured equality and numeric comparison results by stable path', () => {
    const sourceBefore = structuredClone(observation)
    const results = evaluateDeclarativeAssertions(observation, [
      { code: 'equal', path: 'session.state', operator: 'eq', expected: 'active' },
      { code: 'not-equal', path: 'session.state', operator: 'ne', expected: 'paused' },
      { code: 'less', path: 'ball.position[1]', operator: 'lt', expected: 3 },
      { code: 'less-equal', path: 'ball.position[1]', operator: 'lte', expected: 2 },
      { code: 'greater', path: 'scheduler.tick', operator: 'gt', expected: 10 },
      { code: 'greater-equal', path: 'scheduler.tick', operator: 'gte', expected: 12 },
      { code: 'failure', path: 'flags.safe', operator: 'eq', expected: false },
    ])

    expect(results).toEqual([
      { code: 'equal', path: 'session.state', operator: 'eq', passed: true, expected: 'active', actual: 'active' },
      { code: 'not-equal', path: 'session.state', operator: 'ne', passed: true, expected: 'paused', actual: 'active' },
      { code: 'less', path: 'ball.position[1]', operator: 'lt', passed: true, expected: 3, actual: 2 },
      { code: 'less-equal', path: 'ball.position[1]', operator: 'lte', passed: true, expected: 2, actual: 2 },
      { code: 'greater', path: 'scheduler.tick', operator: 'gt', passed: true, expected: 10, actual: 12 },
      { code: 'greater-equal', path: 'scheduler.tick', operator: 'gte', passed: true, expected: 12, actual: 12 },
      { code: 'failure', path: 'flags.safe', operator: 'eq', passed: false, expected: false, actual: true },
    ])
    expect(Object.isFrozen(results)).toBe(true)
    expect(results.every(Object.isFrozen)).toBe(true)
    expect(observation).toEqual(sourceBefore)
  })

  it('rejects unknown and escaping paths, unknown operators, duplicate codes, and invalid operands', () => {
    const invalidAssertions: unknown[] = [
      [{ code: 'missing', path: 'ball.missing', operator: 'eq', expected: 0 }],
      [{ code: 'escape', path: '__proto__.polluted', operator: 'eq', expected: 0 }],
      [{ code: 'escape', path: 'ball.constructor', operator: 'eq', expected: 0 }],
      [{ code: 'bad-index', path: 'ball.position[01]', operator: 'eq', expected: 1 }],
      [{ code: 'unknown-op', path: 'scheduler.tick', operator: 'matches', expected: 12 }],
      [
        { code: 'duplicate', path: 'scheduler.tick', operator: 'eq', expected: 12 },
        { code: 'duplicate', path: 'scheduler.tick', operator: 'eq', expected: 12 },
      ],
      [{ code: 'non-finite', path: 'scheduler.tick', operator: 'gt', expected: Number.NaN }],
      [{ code: 'wrong-type', path: 'session.state', operator: 'gte', expected: 1 }],
      [{ code: 'callback', path: 'scheduler.tick', operator: 'eq', expected: 12, run: () => true }],
      [{ code: 'mutation', path: 'scheduler.tick', operator: 'eq', expected: 12, set: 'tick' }],
    ]
    const before = structuredClone(observation)

    for (const assertions of invalidAssertions) {
      expect(() => evaluateDeclarativeAssertions(observation, assertions)).toThrow()
      expect(observation).toEqual(before)
    }
  })

  it('rejects cyclic and mutation-capable observations without executing user code', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    let callbackCalls = 0
    let setterCalls = 0
    const mutationCapable = {
      scheduler: { tick: 12 },
      mutate: () => {
        callbackCalls += 1
      },
    }
    const accessor = Object.defineProperty({}, 'scheduler', {
      enumerable: true,
      get: () => {
        setterCalls += 1
        return { tick: 12 }
      },
    })
    const assertion = [{ code: 'tick', path: 'scheduler.tick', operator: 'eq', expected: 12 }]

    expect(() => evaluateDeclarativeAssertions(cyclic, assertion)).toThrow()
    expect(() => evaluateDeclarativeAssertions(mutationCapable, assertion)).toThrow()
    expect(() => evaluateDeclarativeAssertions(accessor, assertion)).toThrow()
    expect(callbackCalls).toBe(0)
    expect(setterCalls).toBe(0)
  })
})
