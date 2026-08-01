import { stableCanonicalStringify } from '@haku/core'
import { describe, expect, it } from 'vitest'
import { createBounceRunActionRecorder } from './replay.js'
import { evaluateBounceRunAssertions } from './qa-observations.js'
import {
  BOUNCE_RUN_BUG_REPORT_VERSION,
  BOUNCE_RUN_SESSION_REPORT_VERSION,
  MAX_BOUNCE_RUN_REPORT_ERRORS,
  MAX_BOUNCE_RUN_REPORT_OBSERVATIONS,
  createBounceRunBugReport,
  createBounceRunSessionReport,
  serializeBounceRunBugReport,
} from './qa-report.js'

const FIXED_DELTA = 1 / 60
const SEED = 42

const assertions = [
  {
    code: 'session.active',
    path: 'session.state',
    operator: 'eq',
    expected: 'active',
  },
  {
    code: 'ball.above-floor',
    path: 'ball.position[1]',
    operator: 'gte',
    expected: 0,
  },
] as const

function createRecording() {
  const recorder = createBounceRunActionRecorder({
    seed: SEED,
    fixedDelta: FIXED_DELTA,
    tickCount: 3,
  })
  for (let tick = 0; tick < 3; tick += 1) {
    recorder.record(tick, { lateral: tick - 1 }, { velocity: [tick - 1, 8 - tick, 9] })
  }
  return recorder.finish()
}

function createObservation(tick: number) {
  return {
    version: 1,
    scheduler: { tick, fixedDelta: FIXED_DELTA },
    session: { state: 'active' },
    ball: { position: [0, 2 + tick, tick], velocity: [0, 8 - tick, 9] },
    route: {
      activeCount: 2,
      firstPlatformIndex: tick,
      lastPlatformIndex: tick + 1,
      decisionCount: tick + 2,
    },
    pool: {
      capacity: 8,
      maximum: 8,
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

function createSessionInput() {
  const observations = [0, 2].map((tick) => {
    const observation = createObservation(tick)
    return {
      observation,
      assertionResults: evaluateBounceRunAssertions(observation, assertions),
    }
  })
  return {
    version: BOUNCE_RUN_SESSION_REPORT_VERSION,
    seed: SEED,
    fixedDelta: FIXED_DELTA,
    outcome: 'completed',
    recording: createRecording(),
    assertions,
    observations,
    errors: [
      {
        source: 'console',
        category: 'warning',
        message: 'Known test warning',
        tick: 2,
        context: { subsystem: 'route', attempts: 1 },
      },
    ],
  }
}

type SessionInput = ReturnType<typeof createSessionInput>

function createBugInput(session = createBounceRunSessionReport(createSessionInput())) {
  return {
    version: BOUNCE_RUN_BUG_REPORT_VERSION,
    session,
    defect: {
      code: 'route.platform-gap',
      title: 'Platform gap observed',
      summary: 'The route snapshot shows a gap after replay.',
    },
    rootCause: {
      status: 'confirmed',
      category: 'generator',
      summary: 'A boundary candidate bypassed the landing margin.',
      firstFailingTick: 2,
      assertionCodes: ['ball.above-floor'],
    },
  }
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  expect(Object.isFrozen(value)).toBe(true)
  for (const item of Object.values(value)) expectDeepFrozen(item)
}

describe('Bounce Run QA reports', () => {
  it('clones and deeply freezes normal session evidence without changing its sources', () => {
    const source = createSessionInput()
    const sourceBefore = stableCanonicalStringify(source)

    const report = createBounceRunSessionReport(source)

    expect(report).toMatchObject({
      version: BOUNCE_RUN_SESSION_REPORT_VERSION,
      kind: 'session',
      seed: SEED,
      fixedDelta: FIXED_DELTA,
      outcome: 'completed',
    })
    expect(report.recording).not.toBe(source.recording)
    expect(report.observations[0]?.observation).not.toBe(source.observations[0]?.observation)
    expectDeepFrozen(report)
    expect(stableCanonicalStringify(source)).toBe(sourceBefore)

    source.observations[0]!.observation.ball.position[1] = -100
    expect(report.observations[0]!.observation.ball.position[1]).toBe(2)
    expect(() => {
      ;(report.errors as unknown[]).push({})
    }).toThrow()
  })

  it('composes distinct immutable defect and root-cause evidence', () => {
    const session = createBounceRunSessionReport(createSessionInput())
    const source = createBugInput(session)
    const sourceBefore = stableCanonicalStringify(source)

    const report = createBounceRunBugReport(source)

    expect(report).toMatchObject({
      version: BOUNCE_RUN_BUG_REPORT_VERSION,
      kind: 'bug',
      defect: { code: 'route.platform-gap' },
      rootCause: {
        status: 'confirmed',
        firstFailingTick: 2,
        assertionCodes: ['ball.above-floor'],
      },
    })
    expect(report.session).not.toBe(session)
    expectDeepFrozen(report)
    expect(stableCanonicalStringify(source)).toBe(sourceBefore)
  })

  it('serializes canonical UTF-8 bytes with an identical JSON roundtrip', () => {
    const report = createBounceRunBugReport(createBugInput())

    const bytes = serializeBounceRunBugReport(report)
    const text = new TextDecoder().decode(bytes)

    expect(JSON.parse(text)).toEqual(report)
    expect(text).toBe(stableCanonicalStringify(report))
  })

  it('produces identical bytes regardless of object-key insertion order', () => {
    const source = createBugInput()
    const reversed = {
      rootCause: {
        assertionCodes: [...source.rootCause.assertionCodes],
        firstFailingTick: source.rootCause.firstFailingTick,
        summary: source.rootCause.summary,
        category: source.rootCause.category,
        status: source.rootCause.status,
      },
      defect: {
        summary: source.defect.summary,
        title: source.defect.title,
        code: source.defect.code,
      },
      session: source.session,
      version: source.version,
    }

    const canonical = serializeBounceRunBugReport(createBounceRunBugReport(source))
    const reordered = serializeBounceRunBugReport(createBounceRunBugReport(reversed))

    expect([...reordered]).toEqual([...canonical])
  })

  const corruptSessionCases: readonly [string, (input: SessionInput) => unknown][] = [
    ['session report version', (input) => ({ ...input, version: 99 })],
    [
      'recording version',
      (input) => ({ ...input, recording: { ...input.recording, version: 99 } }),
    ],
    ['seed mismatch', (input) => ({ ...input, seed: input.seed + 1 })],
    ['fixedDelta mismatch', (input) => ({ ...input, fixedDelta: 1 / 30 })],
    [
      'observation fixedDelta mismatch',
      (input) => ({
        ...input,
        observations: [
          {
            ...input.observations[0]!,
            observation: {
              ...input.observations[0]!.observation,
              scheduler: { tick: 0, fixedDelta: 1 / 30 },
            },
          },
        ],
      }),
    ],
    [
      'observation outside recording range',
      (input) => ({
        ...input,
        observations: [
          {
            ...input.observations[0]!,
            observation: {
              ...input.observations[0]!.observation,
              scheduler: { tick: 3, fixedDelta: FIXED_DELTA },
            },
          },
        ],
      }),
    ],
    [
      'duplicate observation ticks',
      (input) => ({
        ...input,
        observations: [input.observations[0], input.observations[0]],
      }),
    ],
    [
      'decreasing observation ticks',
      (input) => ({ ...input, observations: [...input.observations].reverse() }),
    ],
    [
      'unknown assertion result code',
      (input) => ({
        ...input,
        observations: [
          {
            ...input.observations[0]!,
            assertionResults: [
              { ...input.observations[0]!.assertionResults[0], code: 'unknown.code' },
              input.observations[0]!.assertionResults[1],
            ],
          },
        ],
      }),
    ],
    [
      'result not matching its observed snapshot',
      (input) => ({
        ...input,
        observations: [
          {
            ...input.observations[0]!,
            assertionResults: [
              { ...input.observations[0]!.assertionResults[0], passed: false },
              input.observations[0]!.assertionResults[1],
            ],
          },
        ],
      }),
    ],
  ]

  it.each(corruptSessionCases)('rejects %s', (_label, corrupt) => {
    expect(() => createBounceRunSessionReport(corrupt(createSessionInput()))).toThrow()
  })

  it('rejects explicitly unbounded observation and error histories', () => {
    const source = createSessionInput()
    expect(() =>
      createBounceRunSessionReport({
        ...source,
        observations: Array.from(
          { length: MAX_BOUNCE_RUN_REPORT_OBSERVATIONS + 1 },
          () => source.observations[0],
        ),
      }),
    ).toThrow(/observation/i)
    expect(() =>
      createBounceRunSessionReport({
        ...source,
        errors: Array.from({ length: MAX_BOUNCE_RUN_REPORT_ERRORS + 1 }, () => source.errors[0]),
      }),
    ).toThrow(/error/i)
  })

  it('rejects undeclared observation payload and unreferenced assertion specifications', () => {
    const source = createSessionInput()
    const observation = source.observations[0]!.observation
    expect(() =>
      createBounceRunSessionReport({
        ...source,
        observations: [
          {
            ...source.observations[0],
            observation: { ...observation, mutationHandle: { entityId: 'runtime-entity' } },
          },
        ],
      }),
    ).toThrow(/observation/i)
    expect(() => createBounceRunSessionReport({ ...source, observations: [], assertions })).toThrow(
      /assertion/i,
    )
  })

  it.each([
    { source: 'browser', category: 'failure', message: 'bad source' },
    { source: 'runtime', category: '', message: 'bad category' },
    { source: 'runtime', category: 'failure', message: '' },
    { source: 'console', category: 'failure', message: 'bad tick', tick: 3 },
    { source: 'console', category: 'failure', message: 'bad context', context: Number.NaN },
    { source: 'runtime', category: 'failure', message: 'extra field', mutate: true },
  ])('rejects malformed structured error %#', (error) => {
    const source = createSessionInput()
    expect(() => createBounceRunSessionReport({ ...source, errors: [error] })).toThrow()
  })

  it('rejects non-finite, cyclic, executable, accessor, and mutation-capable input inertly', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    let accessorCalls = 0
    let callbackCalls = 0
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        accessorCalls += 1
        return 'secret'
      },
    })
    const callback = () => {
      callbackCalls += 1
    }
    class MutableHandle {
      mutate(): void {}
    }
    const values = [Number.POSITIVE_INFINITY, cyclic, accessor, callback, new MutableHandle()]

    for (const context of values) {
      const source = createSessionInput()
      expect(() =>
        createBounceRunSessionReport({
          ...source,
          errors: [{ source: 'runtime', category: 'test', message: 'bad', context }],
        }),
      ).toThrow()
    }
    expect(accessorCalls).toBe(0)
    expect(callbackCalls).toBe(0)
  })

  it('rejects malformed bugs transactionally and never invokes supplied code', () => {
    const session = createBounceRunSessionReport(createSessionInput())
    const source = createBugInput(session)
    const sourceBefore = stableCanonicalStringify(source)
    let calls = 0
    const malformed = {
      ...source,
      rootCause: {
        ...source.rootCause,
        callback: () => {
          calls += 1
        },
      },
    }

    expect(() => createBounceRunBugReport(malformed)).toThrow()
    expect(calls).toBe(0)
    expect(stableCanonicalStringify(source)).toBe(sourceBefore)
    expect(() =>
      createBounceRunBugReport({ ...source, version: BOUNCE_RUN_BUG_REPORT_VERSION + 1 }),
    ).toThrow(/version/i)
    expect(() =>
      createBounceRunBugReport({
        ...source,
        rootCause: { ...source.rootCause, assertionCodes: ['unknown.code'] },
      }),
    ).toThrow(/assertion/i)
  })
})
