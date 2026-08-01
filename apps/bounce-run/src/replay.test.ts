import { describe, expect, it } from 'vitest'
import { EngineScheduler, World } from '@haku/core'
import type { InputActionMapSnapshot } from '@haku/engine'
import { applyBallControlStep, type Velocity3 } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'
import {
  createBounceRunActionRecorder,
  replayBounceRunRecording,
} from './replay.js'

const SEED = 0x5eed
const FIXED_DELTA = 1 / 60
const TICK_COUNT = 180

function lateralForTick(tick: number): number {
  if (tick < 30) return 0
  if (tick < 90) return 1
  if (tick < 140) return -1
  return 0
}

function applyStep(
  velocity: Velocity3,
  actions: InputActionMapSnapshot,
  fixedDelta: number,
): Velocity3 {
  return applyBallControlStep({
    velocity,
    lateralInput: actions.lateral as number,
    landed: false,
    dt: fixedDelta,
    forwardSpeed: BOUNCE_RUN_PHYSICS.forwardSpeed,
    lateralSpeed: BOUNCE_RUN_PHYSICS.lateralSpeed,
    lateralResponsiveness: BOUNCE_RUN_PHYSICS.lateralResponsiveness,
    bounceHeight: BOUNCE_RUN_PHYSICS.bounceHeight,
    gravity: BOUNCE_RUN_PHYSICS.gravity,
  })
}

function recordSchedule() {
  const recorder = createBounceRunActionRecorder({
    seed: SEED,
    fixedDelta: FIXED_DELTA,
    tickCount: TICK_COUNT,
  })
  let velocity: Velocity3 = [0, 0, BOUNCE_RUN_PHYSICS.forwardSpeed]
  const scheduler = new EngineScheduler({
    fixedTimestep: FIXED_DELTA,
    maxSubsteps: 1,
    maxFrameDelta: FIXED_DELTA,
  })
  scheduler.addSystem({
    phase: 'FixedGameplay',
    update: (_world, dt) => {
      const tick = scheduler.tickNumber - 1
      const actions: InputActionMapSnapshot = Object.freeze({
        lateral: lateralForTick(tick),
      })
      velocity = applyStep(velocity, actions, dt)
      recorder.record(tick, actions, { velocity })
    },
  })

  const world = new World()
  for (let tick = 0; tick < TICK_COUNT; tick += 1) {
    const report = scheduler.runFrame(world, FIXED_DELTA)
    expect(report.fixedSteps).toBe(1)
  }

  return recorder.finish()
}

describe('Bounce Run fixed-tick action replay', () => {
  it('replays 180 public action snapshots with identical hashes and exact first divergence', () => {
    const recording = recordSchedule()

    expect(recording).toMatchObject({
      version: 1,
      seed: SEED,
      fixedDelta: FIXED_DELTA,
      tickCount: TICK_COUNT,
    })
    expect(recording.frames).toHaveLength(TICK_COUNT)
    expect(recording.frames.every((frame, tick) => frame.tick === tick)).toBe(true)
    expect(Object.isFrozen(recording)).toBe(true)
    expect(Object.isFrozen(recording.frames)).toBe(true)
    expect(Object.isFrozen(recording.frames[0]!.actions)).toBe(true)

    const replay = replayBounceRunRecording(recording, {
      expectedSeed: SEED,
      expectedFixedDelta: FIXED_DELTA,
    })
    expect(replay.hashes).toEqual(recording.frames.map((frame) => frame.expectedHash))
    expect(replay.hashes).toHaveLength(TICK_COUNT)
    expect(replay.divergence).toBeNull()

    const tampered = {
      ...recording,
      frames: recording.frames.map((frame) =>
        frame.tick === 73
          ? { ...frame, actions: { ...frame.actions, lateral: -1 } }
          : frame,
      ),
    }
    const recordingBeforeReplay = structuredClone(tampered)
    const divergent = replayBounceRunRecording(tampered, {
      expectedSeed: SEED,
      expectedFixedDelta: FIXED_DELTA,
    })

    expect(divergent.divergence).toEqual({
      tick: 73,
      expectedHash: recording.frames[73]!.expectedHash,
      actualHash: divergent.hashes[73],
    })
    expect(divergent.hashes[73]).not.toBe(recording.frames[73]!.expectedHash)
    expect(tampered).toEqual(recordingBeforeReplay)
  })

  it('rejects invalid ticks and non-finite actions without mutating recorded frames', () => {
    const invalidCalls = [
      (recorder: ReturnType<typeof createBounceRunActionRecorder>) =>
        recorder.record(0, { lateral: 0 }, { velocity: [0, 0, 1] }),
      (recorder: ReturnType<typeof createBounceRunActionRecorder>) =>
        recorder.record(-1, { lateral: 0 }, { velocity: [0, 0, 1] }),
      (recorder: ReturnType<typeof createBounceRunActionRecorder>) =>
        recorder.record(1.5, { lateral: 0 }, { velocity: [0, 0, 1] }),
      (recorder: ReturnType<typeof createBounceRunActionRecorder>) =>
        recorder.record(1, { lateral: Number.NaN }, { velocity: [0, 0, 1] }),
      (recorder: ReturnType<typeof createBounceRunActionRecorder>) =>
        recorder.record(1, { lateral: Number.POSITIVE_INFINITY }, { velocity: [0, 0, 1] }),
    ]

    for (const invalidCall of invalidCalls) {
      const recorder = createBounceRunActionRecorder({
        seed: SEED,
        fixedDelta: FIXED_DELTA,
        tickCount: 2,
      })
      recorder.record(0, { lateral: 0 }, { velocity: [0, 0, 1] })
      const before = recorder.snapshot()

      expect(() => invalidCall(recorder)).toThrow()
      expect(recorder.snapshot()).toEqual(before)
    }

    const decreasing = createBounceRunActionRecorder({
      seed: SEED,
      fixedDelta: FIXED_DELTA,
      tickCount: 3,
    })
    decreasing.record(0, { lateral: 0 }, { velocity: [0, 0, 1] })
    decreasing.record(1, { lateral: 0 }, { velocity: [0, 0, 1] })
    const beforeDecreasingTick = decreasing.snapshot()
    expect(() =>
      decreasing.record(0, { lateral: 0 }, { velocity: [0, 0, 1] }),
    ).toThrow()
    expect(decreasing.snapshot()).toEqual(beforeDecreasingTick)
  })

  it('rejects incompatible metadata, malformed hashes, and truncated or extra frames', () => {
    const recording = recordSchedule()
    const replayOptions = {
      expectedSeed: SEED,
      expectedFixedDelta: FIXED_DELTA,
    }

    expect(() => replayBounceRunRecording({ ...recording, version: 2 }, replayOptions)).toThrow(
      'Unsupported Bounce Run recording version',
    )
    expect(() =>
      replayBounceRunRecording({ ...recording, seed: SEED + 1 }, replayOptions),
    ).toThrow('Recording seed')
    expect(() =>
      replayBounceRunRecording({ ...recording, fixedDelta: 1 / 30 }, replayOptions),
    ).toThrow('Recording fixedDelta')
    expect(() =>
      replayBounceRunRecording(
        { ...recording, frames: recording.frames.slice(0, -1) },
        replayOptions,
      ),
    ).toThrow('Recording frame count')
    expect(() =>
      replayBounceRunRecording(
        { ...recording, frames: [...recording.frames, recording.frames[0]!] },
        replayOptions,
      ),
    ).toThrow('Recording frame count')
    expect(() =>
      replayBounceRunRecording(
        {
          ...recording,
          frames: recording.frames.map((frame) =>
            frame.tick === 73 ? { ...frame, expectedHash: 'not-a-hash' } : frame,
          ),
        },
        replayOptions,
      ),
    ).toThrow('expectedHash')
    expect(() =>
      replayBounceRunRecording(
        {
          ...recording,
          frames: recording.frames.map((frame) =>
            frame.tick === 73 ? { ...frame, tick: 72 } : frame,
          ),
        },
        replayOptions,
      ),
    ).toThrow('contiguous integer tick 73')
    expect(() =>
      replayBounceRunRecording(
        {
          ...recording,
          frames: recording.frames.map((frame) =>
            frame.tick === 73 ? { ...frame, actions: { lateral: false } } : frame,
          ),
        },
        replayOptions,
      ),
    ).toThrow('lateral action must be a finite number')

    let versionAccessorReads = 0
    const accessorRecording = { ...recording } as Record<string, unknown>
    Object.defineProperty(accessorRecording, 'version', {
      enumerable: true,
      get: () => {
        versionAccessorReads += 1
        return 1
      },
    })
    expect(() => replayBounceRunRecording(accessorRecording, replayOptions)).toThrow(
      'enumerable data property',
    )
    expect(versionAccessorReads).toBe(0)
  })
})
