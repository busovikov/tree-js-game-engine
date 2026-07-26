import { describe, expect, it } from 'vitest'
import { EngineScheduler, World, type SchedulerSystem } from './index.js'

function recordingSystem(
  phase: SchedulerSystem['phase'],
  record: (dt: number) => void,
  localOrder = 0,
): SchedulerSystem {
  return {
    phase,
    localOrder,
    update: (_world, dt) => record(dt),
  }
}

describe('EngineScheduler', () => {
  it('runs named phases and local order deterministically for every fixed substep', () => {
    const world = new World()
    const scheduler = new EngineScheduler({
      fixedTimestep: 1,
      maxSubsteps: 3,
      maxFrameDelta: 3,
    })
    const trace: string[] = []
    const add = (phase: SchedulerSystem['phase'], label: string, localOrder = 0) => {
      scheduler.addSystem(
        recordingSystem(
          phase,
          () => trace.push(`${label}:${scheduler.tickNumber}`),
          localOrder,
        ),
      )
    }
    add('Presentation', 'present')
    add('FixedGameplay', 'gameplay-late', 10)
    add('PhysicsStep', 'physics')
    add('FrameInput', 'input')
    add('FixedGameplay', 'gameplay-early', -10)
    add('FixedPrePhysics', 'pre')
    add('PostPhysics', 'post')
    add('LateUpdate', 'late')
    add('FrameGameplay', 'frame')
    add('FixedInputSnapshot', 'snapshot')
    add('Render', 'render')

    const report = scheduler.runFrame(world, 2)

    expect(report.fixedSteps).toBe(2)
    expect(trace).toEqual([
      'input:0',
      'snapshot:1',
      'pre:1',
      'physics:1',
      'post:1',
      'gameplay-early:1',
      'gameplay-late:1',
      'snapshot:2',
      'pre:2',
      'physics:2',
      'post:2',
      'gameplay-early:2',
      'gameplay-late:2',
      'frame:2',
      'late:2',
      'present:2',
      'render:2',
    ])
  })

  it('bounds hitch catch-up, drops excess time, and ignores invalid deltas', () => {
    const world = new World()
    const scheduler = new EngineScheduler({
      fixedTimestep: 1,
      maxSubsteps: 3,
      maxFrameDelta: 3,
    })
    const fixedDeltas: number[] = []
    scheduler.addSystem(recordingSystem('PhysicsStep', (dt) => fixedDeltas.push(dt)))

    const hitch = scheduler.runFrame(world, 10)
    const invalid = scheduler.runFrame(world, Number.NaN)
    const negative = scheduler.runFrame(world, -1)

    expect(hitch).toMatchObject({
      fixedSteps: 3,
      tickNumber: 3,
      interpolationAlpha: 0,
      droppedTime: 7,
    })
    expect(invalid.fixedSteps).toBe(0)
    expect(negative.fixedSteps).toBe(0)
    expect(fixedDeltas).toEqual([1, 1, 1])
  })

  it('pauses fixed time and single-steps exactly one tick with one presentation update', () => {
    const world = new World()
    const scheduler = new EngineScheduler({ fixedTimestep: 0.5 })
    const trace: string[] = []
    scheduler.addSystem(
      recordingSystem('PhysicsStep', (dt) => trace.push(`fixed:${scheduler.tickNumber}:${dt}`)),
    )
    scheduler.addSystem(
      recordingSystem('Presentation', (dt) => trace.push(`present:${scheduler.tickNumber}:${dt}`)),
    )
    scheduler.setPaused(true)

    const paused = scheduler.runFrame(world, 10)
    scheduler.requestSingleStep()
    const stepped = scheduler.runFrame(world, 10)
    const pausedAgain = scheduler.runFrame(world, 10)

    expect(paused.fixedSteps).toBe(0)
    expect(stepped.fixedSteps).toBe(1)
    expect(stepped.tickNumber).toBe(1)
    expect(pausedAgain.fixedSteps).toBe(0)
    expect(trace).toEqual([
      'present:0:0',
      'fixed:1:0.5',
      'present:1:0.5',
      'present:1:0',
    ])
    expect(() => {
      scheduler.setPaused(false)
      scheduler.requestSingleStep()
    }).toThrow('Single-step requires a paused scheduler')
  })

  it('delivers typed queued work by stable sequence without same-phase reentrancy', () => {
    const world = new World()
    const scheduler = new EngineScheduler({ fixedTimestep: 1 })
    const trace: string[] = []
    let queuedFromSamePhase = false
    scheduler.addSystem(
      recordingSystem('FrameInput', () => {
        scheduler.enqueue('FixedGameplay', 'first', (command) => {
          trace.push(
            `${command.payload}:${command.sourceTick}:${command.sourcePhase}:${command.sequence}`,
          )
        })
        scheduler.enqueue('FixedGameplay', 'second', (command) => {
          trace.push(
            `${command.payload}:${command.sourceTick}:${command.sourcePhase}:${command.sequence}`,
          )
        })
      }),
    )
    scheduler.addSystem(
      recordingSystem('FixedGameplay', () => {
        if (queuedFromSamePhase) return
        queuedFromSamePhase = true
        scheduler.enqueue('FixedGameplay', 'deferred', (command) => {
          trace.push(
            `${command.payload}:${command.sourceTick}:${command.sourcePhase}:${command.sequence}`,
          )
        })
      }),
    )

    scheduler.runFrame(world, 1)
    expect(trace).toEqual([
      'first:0:FrameInput:0',
      'second:0:FrameInput:1',
    ])

    scheduler.runFrame(world, 1)
    expect(trace).toEqual([
      'first:0:FrameInput:0',
      'second:0:FrameInput:1',
      'deferred:1:FixedGameplay:2',
      'first:1:FrameInput:3',
      'second:1:FrameInput:4',
    ])
  })

  it('is stable for equal local order and supports removing systems from an empty world', () => {
    const scheduler = new EngineScheduler()
    const world = new World()
    const trace: string[] = []
    const first = recordingSystem('FrameGameplay', () => trace.push('first'))
    const second = recordingSystem('FrameGameplay', () => trace.push('second'))
    scheduler.addSystem(first)
    scheduler.addSystem(second)
    scheduler.removeSystem(first)
    scheduler.removeSystem(first)

    scheduler.runFrame(world, 0)

    expect(trace).toEqual(['second'])
  })
})
