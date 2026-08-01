import {
  createFixedTickRecorder,
  replayFixedTickRecording,
  type FixedTickRecorder,
  type FixedTickRecording,
  type FixedTickReplayResult,
} from '@haku/core'
import type { InputActionMapSnapshot } from '@haku/engine'
import { applyBallControlStep, type Velocity3 } from './ball-controller.js'
import { BOUNCE_RUN_PHYSICS } from './bounce-run-physics.js'

export const BOUNCE_RUN_RECORDING_VERSION = 1 as const

export interface BounceRunReplayState {
  readonly velocity: Velocity3
}

export type BounceRunRecording = FixedTickRecording<InputActionMapSnapshot> & {
  readonly version: typeof BOUNCE_RUN_RECORDING_VERSION
}

export interface BounceRunActionRecorder {
  record(
    tick: number,
    actions: InputActionMapSnapshot,
    state: BounceRunReplayState,
  ): void
  snapshot(): BounceRunRecording
  finish(): BounceRunRecording
}

export interface BounceRunActionRecorderOptions {
  readonly seed: number
  readonly fixedDelta: number
  readonly tickCount: number
}

export interface BounceRunReplayOptions {
  readonly expectedSeed?: number
  readonly expectedFixedDelta?: number
}

export function createBounceRunActionRecorder(
  options: BounceRunActionRecorderOptions,
): BounceRunActionRecorder {
  const recorder = createFixedTickRecorder<
    InputActionMapSnapshot,
    BounceRunReplayState
  >({
    version: BOUNCE_RUN_RECORDING_VERSION,
    seed: options.seed,
    fixedDelta: options.fixedDelta,
    tickCount: options.tickCount,
  })
  return wrapRecorder(recorder)
}

export function replayBounceRunRecording(
  recording: unknown,
  options: BounceRunReplayOptions = {},
): FixedTickReplayResult {
  if (
    typeof recording === 'object' &&
    recording !== null &&
    'version' in recording &&
    recording.version !== BOUNCE_RUN_RECORDING_VERSION
  ) {
    throw new Error(
      `Unsupported Bounce Run recording version: ${String(recording.version)}`,
    )
  }

  return replayFixedTickRecording<BounceRunReplayState, InputActionMapSnapshot>(
    recording,
    {
      version: BOUNCE_RUN_RECORDING_VERSION,
      expectedSeed: options.expectedSeed,
      expectedFixedDelta: options.expectedFixedDelta,
      initialState: {
        velocity: [0, 0, BOUNCE_RUN_PHYSICS.forwardSpeed],
      },
      step: (state, actions, context) => ({
        velocity: applyBallControlStep({
          velocity: state.velocity,
          lateralInput: requireLateralAction(actions),
          landed: false,
          dt: context.fixedDelta,
          forwardSpeed: BOUNCE_RUN_PHYSICS.forwardSpeed,
          lateralSpeed: BOUNCE_RUN_PHYSICS.lateralSpeed,
          lateralResponsiveness: BOUNCE_RUN_PHYSICS.lateralResponsiveness,
          bounceHeight: BOUNCE_RUN_PHYSICS.bounceHeight,
          gravity: BOUNCE_RUN_PHYSICS.gravity,
        }),
      }),
    },
  )
}

function wrapRecorder(
  recorder: FixedTickRecorder<InputActionMapSnapshot, BounceRunReplayState>,
): BounceRunActionRecorder {
  return {
    record(tick, actions, state) {
      requireLateralAction(actions)
      recorder.record(tick, actions, state)
    },
    snapshot: () => recorder.snapshot() as BounceRunRecording,
    finish: () => recorder.finish() as BounceRunRecording,
  }
}

function requireLateralAction(actions: InputActionMapSnapshot): number {
  const lateral = actions.lateral
  if (typeof lateral !== 'number' || !Number.isFinite(lateral)) {
    throw new Error('Bounce Run lateral action must be a finite number')
  }
  return lateral
}
