import type { DeclarativeAssertion } from '@haku/core'
import { describe, expect, it } from 'vitest'
import {
  createBounceRunQaHarness,
  type BounceRunQaDiagnosticInput,
  type BounceRunQaFixedTickSample,
} from './qa-harness.js'

function createPort<T>() {
  const listeners = new Set<(value: T) => void>()
  let unsubscribeCount = 0
  return {
    port: {
      subscribe(listener: (value: T) => void) {
        listeners.add(listener)
        return () => {
          if (listeners.delete(listener)) unsubscribeCount += 1
        }
      },
    },
    emit(value: T) {
      for (const listener of listeners) listener(value)
    },
    listenerCount: () => listeners.size,
    unsubscribeCount: () => unsubscribeCount,
  }
}

function createObservation(tick: number) {
  return {
    version: 1 as const,
    scheduler: { tick, fixedDelta: 1 / 60 },
    session: { state: tick === 0 ? ('active' as const) : ('paused' as const) },
    ball: { position: [tick, 2, tick + 4], velocity: [1, 7, 9] },
    route: {
      activeCount: 2,
      firstPlatformIndex: tick,
      lastPlatformIndex: tick + 1,
      decisionCount: tick + 2,
    },
    pool: {
      capacity: 2,
      maximum: 2,
      total: 2,
      active: 2,
      inactive: 0,
      acquisitions: tick + 2,
      releases: tick,
      expansions: 0,
      exhaustions: 0,
      forcedReleases: 0,
    },
  }
}

function createHarness(maxDiagnostics = 3) {
  const fixedTicks = createPort<BounceRunQaFixedTickSample>()
  const runtime = createPort<BounceRunQaDiagnosticInput>()
  const console = createPort<BounceRunQaDiagnosticInput>()
  const network = createPort<BounceRunQaDiagnosticInput>()
  const assertions: readonly DeclarativeAssertion[] = [
    { code: 'ball.above-floor', path: 'ball.position[1]', operator: 'gt', expected: -6 },
  ]
  const harness = createBounceRunQaHarness({
    seed: 0x5eed,
    fixedDelta: 1 / 60,
    assertions,
    maxTicks: 8,
    maxDiagnostics,
    fixedTicks: fixedTicks.port,
    observations: { read: createObservation },
    diagnostics: {
      runtime: runtime.port,
      console: console.port,
      network: network.port,
    },
  })
  return { harness, fixedTicks, runtime, console, network }
}

describe('Bounce Run dev-only QA harness', () => {
  it('records each ordered public tick once and composes bounded immutable reports', () => {
    const { harness, fixedTicks, runtime, console, network } = createHarness()

    console.emit({ category: 'warning', message: 'known warning' })
    console.emit({ category: 'warning', message: 'known warning' })
    runtime.emit({ category: 'unhandled-error', message: 'runtime failed' })
    network.emit({
      category: 'http-error',
      message: 'GET /missing returned 404',
      context: { method: 'GET', status: 404, url: '/missing' },
    })
    console.emit({ category: 'late', message: 'bounded out' })

    fixedTicks.emit({ schedulerTick: 41, actions: { lateral: 1 }, state: { velocity: [1, 7, 9] } })
    fixedTicks.emit({
      schedulerTick: 42,
      actions: { lateral: -1 },
      state: { velocity: [-1, 6, 9] },
    })

    const session = harness.createSessionReport('aborted')
    expect(session.recording.frames.map(({ tick, actions }) => ({ tick, actions }))).toEqual([
      { tick: 0, actions: { lateral: 1 } },
      { tick: 1, actions: { lateral: -1 } },
    ])
    expect(session.observations.map((item) => item.observation.scheduler.tick)).toEqual([0, 1])
    expect(session.errors).toEqual([
      { source: 'console', category: 'warning', message: 'known warning' },
      { source: 'runtime', category: 'unhandled-error', message: 'runtime failed' },
      {
        source: 'network',
        category: 'http-error',
        message: 'GET /missing returned 404',
        context: { method: 'GET', status: 404, url: '/missing' },
      },
    ])
    expect(Object.isFrozen(session)).toBe(true)

    const bug = harness.createBugReport({
      session,
      defect: {
        code: 'route.missing',
        title: 'Route gap',
        summary: 'A mandatory platform is absent.',
      },
      rootCause: {
        status: 'suspected',
        category: 'generator',
        summary: 'The route window lost one platform.',
        firstFailingTick: 1,
        assertionCodes: ['ball.above-floor'],
      },
    })
    expect(bug.kind).toBe('bug')
    expect(Object.isFrozen(bug.session.recording.frames)).toBe(true)
    expect(Object.keys(harness).sort()).toEqual([
      'createBugReport',
      'createSessionReport',
      'dispose',
      'resetSession',
      'snapshot',
    ])
    expect('world' in harness || 'entity' in harness || 'pool' in harness).toBe(false)

    harness.resetSession()
    expect(harness.snapshot()).toEqual({ tickCount: 0, diagnostics: [], lastObservation: null })
    expect(session.recording.frames).toHaveLength(2)
    expect(bug.session.errors).toHaveLength(3)
  })

  it('rejects duplicate/decreasing ticks and executable diagnostics without invoking code', () => {
    const { harness, fixedTicks, runtime } = createHarness()
    fixedTicks.emit({ schedulerTick: 9, actions: { lateral: 0 }, state: { velocity: [0, 7, 9] } })
    expect(() =>
      fixedTicks.emit({
        schedulerTick: 9,
        actions: { lateral: 0 },
        state: { velocity: [0, 6, 9] },
      }),
    ).toThrow(/strictly increasing/i)

    let invoked = false
    const context = {}
    Object.defineProperty(context, 'secret', {
      enumerable: true,
      get() {
        invoked = true
        return 'not data'
      },
    })
    expect(() =>
      runtime.emit({ category: 'bad-context', message: 'must reject accessor', context }),
    ).toThrow()
    expect(invoked).toBe(false)
    expect(harness.snapshot().diagnostics).toEqual([])
  })

  it('unsubscribes every injected port and ignores later events on dispose', () => {
    const { harness, fixedTicks, runtime, console, network } = createHarness()
    harness.dispose()

    expect(fixedTicks.unsubscribeCount()).toBe(1)
    expect(runtime.unsubscribeCount()).toBe(1)
    expect(console.unsubscribeCount()).toBe(1)
    expect(network.unsubscribeCount()).toBe(1)
    expect(fixedTicks.listenerCount()).toBe(0)
    expect(runtime.listenerCount()).toBe(0)
    expect(console.listenerCount()).toBe(0)
    expect(network.listenerCount()).toBe(0)
    fixedTicks.emit({ schedulerTick: 0, actions: { lateral: 1 }, state: { velocity: [1, 7, 9] } })
    expect(harness.snapshot()).toEqual({ tickCount: 0, diagnostics: [], lastObservation: null })
  })
})
