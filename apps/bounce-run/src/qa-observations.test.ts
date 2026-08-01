import { EngineScheduler, World } from '@haku/core'
import { describe, expect, it } from 'vitest'
import {
  createBounceRunObservationSnapshot,
  evaluateBounceRunAssertions,
} from './qa-observations.js'

describe('Bounce Run QA observations', () => {
  it('captures one immutable public fixed-tick observation and evaluates declarative assertions', () => {
    const scheduler = new EngineScheduler({
      fixedTimestep: 1 / 60,
      maxSubsteps: 1,
      maxFrameDelta: 1 / 60,
    })
    scheduler.runFrame(new World(), 1 / 60)
    const source = {
      sessionState: 'active' as const,
      score: 3,
      position: [1, 2, 3] as [number, number, number],
      velocity: [0.5, -1, 8] as [number, number, number],
      activePlatformIndices: [3, 4, 5],
      decisionCount: 6,
      pool: {
        capacity: 8,
        maximum: 8,
        total: 8,
        active: 3,
        inactive: 5,
        acquisitions: 6,
        releases: 3,
        expansions: 0,
        exhaustions: 0,
        forcedReleases: 0,
      },
    }
    const before = structuredClone(source)

    const observation = createBounceRunObservationSnapshot({
      scheduler,
      session: { state: () => source.sessionState, score: () => source.score },
      ball: {
        position: () => source.position,
        velocity: () => source.velocity,
      },
      route: {
        activePlatforms: () =>
          source.activePlatformIndices.map((platformIndex) => ({ platformIndex })),
        decisionLog: () => Array.from({ length: source.decisionCount }, () => ({})),
      },
      pool: { metrics: () => source.pool },
    })

    expect(observation).toEqual({
      version: 2,
      scheduler: { tick: 1, fixedDelta: 1 / 60 },
      session: { state: 'active', score: 3 },
      ball: { position: [1, 2, 3], velocity: [0.5, -1, 8] },
      route: { activeCount: 3, firstPlatformIndex: 3, lastPlatformIndex: 5, decisionCount: 6 },
      pool: source.pool,
    })
    expect(Object.isFrozen(observation)).toBe(true)
    expect(Object.isFrozen(observation.ball.position)).toBe(true)
    expect(source).toEqual(before)
    source.position[1] = 99
    source.pool.active = 4
    expect(observation.ball.position[1]).toBe(2)
    expect(observation.pool.active).toBe(3)
    expect(Reflect.set(observation.ball.position, '1', 42)).toBe(false)
    expect(containsFunction(observation)).toBe(false)

    expect(
      evaluateBounceRunAssertions(observation, [
        { code: 'tick', path: 'scheduler.tick', operator: 'eq', expected: 1 },
        { code: 'height', path: 'ball.position[1]', operator: 'gte', expected: 2 },
        { code: 'session', path: 'session.state', operator: 'ne', expected: 'paused' },
        { code: 'pool-bound', path: 'pool.active', operator: 'lt', expected: 8 },
      ]),
    ).toEqual([
      {
        code: 'tick',
        path: 'scheduler.tick',
        operator: 'eq',
        passed: true,
        expected: 1,
        actual: 1,
      },
      {
        code: 'height',
        path: 'ball.position[1]',
        operator: 'gte',
        passed: true,
        expected: 2,
        actual: 2,
      },
      {
        code: 'session',
        path: 'session.state',
        operator: 'ne',
        passed: true,
        expected: 'paused',
        actual: 'active',
      },
      {
        code: 'pool-bound',
        path: 'pool.active',
        operator: 'lt',
        passed: true,
        expected: 8,
        actual: 3,
      },
    ])
  })

  it('rejects malformed public values and declarative input without changing them', () => {
    const source = {
      tickNumber: -1,
      fixedTimestep: 1 / 60,
      position: [0, 1, 2] as [number, number, number],
      velocity: [0, 0, 8] as [number, number, number],
      metrics: {
        capacity: 8,
        maximum: 8,
        total: 8,
        active: 3,
        inactive: 5,
        acquisitions: 3,
        releases: 0,
        expansions: 0,
        exhaustions: 0,
        forcedReleases: 0,
      },
    }
    const before = structuredClone(source)
    const sources = {
      scheduler: source,
      session: { state: () => 'active' as const, score: () => 0 },
      ball: { position: () => source.position, velocity: () => source.velocity },
      route: {
        activePlatforms: () => [0, 1, 2].map((platformIndex) => ({ platformIndex })),
        decisionLog: () => [],
      },
      pool: { metrics: () => source.metrics },
    }

    expect(() => createBounceRunObservationSnapshot(sources)).toThrow('tick')
    expect(source).toEqual(before)
    source.tickNumber = 1
    source.velocity[0] = Number.NaN
    expect(() => createBounceRunObservationSnapshot(sources)).toThrow('finite')
    expect(Number.isNaN(source.velocity[0])).toBe(true)

    const valid = createBounceRunObservationSnapshot({
      ...sources,
      ball: { position: () => source.position, velocity: () => [0, 0, 8] },
    })
    const validBefore = structuredClone(valid)
    expect(() =>
      evaluateBounceRunAssertions(valid, [
        { code: 'escape', path: '__proto__.polluted', operator: 'eq', expected: true },
      ]),
    ).toThrow('Forbidden observation path')
    expect(() => evaluateBounceRunAssertions({ ...valid, version: 3 }, [])).toThrow(
      'Unsupported Bounce Run observation version',
    )
    expect(valid).toEqual(validBefore)
  })
})

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true
  if (typeof value !== 'object' || value === null) return false
  return Object.values(value).some(containsFunction)
}
