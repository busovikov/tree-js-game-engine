import { describe, expect, it } from 'vitest'
import {
  createFixedTickRecorder,
  replayFixedTickRecording,
  stableCanonicalHash,
  stableCanonicalStringify,
} from './deterministic-recording.js'

describe('deterministic recording primitives', () => {
  it('canonicalizes object keys without locale or insertion-order dependence', () => {
    const first = { b: 2, a: [true, null, 'é'] }
    const second = { a: [true, null, 'é'], b: 2 }

    expect(stableCanonicalStringify(first)).toBe(
      '{"a":[true,null,"\u00e9"],"b":2}',
    )
    expect(stableCanonicalHash(first)).toBe(stableCanonicalHash(second))
    expect(stableCanonicalHash(first)).toBe('fnv1a64:89f569122486004b')
  })

  it('rejects non-finite, sparse, cyclic, and unsupported values explicitly', () => {
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const sparse = Array(1)

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      undefined,
      1n,
      Symbol('unsupported'),
      () => undefined,
      new Date(0),
      sparse,
      cyclic,
    ]) {
      expect(() => stableCanonicalHash(value)).toThrow()
    }
  })

  it('records immutable contiguous ticks and replays until the exact first mismatch', () => {
    const recorder = createFixedTickRecorder({
      version: 7,
      seed: 42,
      fixedDelta: 0.5,
      tickCount: 3,
    })
    let state = { total: 0 }
    for (let tick = 0; tick < 3; tick += 1) {
      const actions = { amount: tick + 1 }
      state = { total: state.total + actions.amount }
      recorder.record(tick, actions, state)
    }
    const recording = recorder.finish()
    const matching = replayFixedTickRecording(recording, {
      version: 7,
      initialState: { total: 0 },
      step: (current, actions) => ({
        total: current.total + (actions as { amount: number }).amount,
      }),
    })

    expect(matching.divergence).toBeNull()
    expect(matching.hashes).toHaveLength(3)
    expect(Object.isFrozen(recording.frames[0]!.actions)).toBe(true)

    const tampered = {
      ...recording,
      frames: recording.frames.map((frame) =>
        frame.tick === 1 ? { ...frame, actions: { amount: 10 } } : frame,
      ),
    }
    const before = structuredClone(tampered)
    const divergent = replayFixedTickRecording(tampered, {
      version: 7,
      initialState: { total: 0 },
      step: (current, actions) => ({
        total: current.total + (actions as { amount: number }).amount,
      }),
    })

    expect(divergent.divergence).toMatchObject({ tick: 1 })
    expect(divergent.hashes).toHaveLength(2)
    expect(tampered).toEqual(before)
  })
})
