import type { IWorld } from './types.js'

export const SCHEDULER_PHASES = [
  'FrameInput',
  'AccumulateTime',
  'FixedInputSnapshot',
  'FixedPrePhysics',
  'PhysicsStep',
  'PostPhysics',
  'FixedGameplay',
  'FrameGameplay',
  'LateUpdate',
  'Presentation',
  'Render',
] as const

export type SchedulerPhase = (typeof SCHEDULER_PHASES)[number]
export type SchedulerSourcePhase = SchedulerPhase | 'External'

export interface SchedulerSystem {
  readonly phase: SchedulerPhase
  readonly localOrder?: number
  update(world: IWorld, dt: number): void
}

export interface ISystem extends SchedulerSystem {}

export interface EngineSchedulerOptions {
  readonly fixedTimestep?: number
  readonly maxSubsteps?: number
  readonly maxFrameDelta?: number
}

export interface SchedulerFrameReport {
  readonly frameNumber: number
  readonly tickNumber: number
  readonly fixedSteps: number
  readonly interpolationAlpha: number
  readonly droppedTime: number
}

export interface SchedulerCommand<T> {
  readonly targetPhase: SchedulerPhase
  readonly sourcePhase: SchedulerSourcePhase
  readonly sourceTick: number
  readonly sourceFrame: number
  readonly sequence: number
  readonly payload: T
}

interface RegisteredSystem {
  readonly system: SchedulerSystem
  readonly sequence: number
}

interface QueuedCommand {
  readonly command: SchedulerCommand<unknown>
  readonly handler: (command: SchedulerCommand<unknown>) => void
}

const FIXED_PHASES: readonly SchedulerPhase[] = [
  'FixedInputSnapshot',
  'FixedPrePhysics',
  'PhysicsStep',
  'PostPhysics',
  'FixedGameplay',
]

const DEFAULT_FIXED_TIMESTEP = 1 / 60
const DEFAULT_MAX_SUBSTEPS = 3
const TIME_EPSILON = 1e-9

export class EngineScheduler {
  readonly fixedTimestep: number
  readonly maxSubsteps: number
  readonly maxFrameDelta: number

  private readonly systems: RegisteredSystem[] = []
  private queue: QueuedCommand[] = []
  private nextSystemSequence = 0
  private nextCommandSequence = 0
  private accumulator = 0
  private paused = false
  private pendingSingleStep = false
  private activePhase: SchedulerPhase | null = null
  private runningFrame = false
  private _frameNumber = 0
  private _tickNumber = 0

  constructor(options: EngineSchedulerOptions = {}) {
    this.fixedTimestep = options.fixedTimestep ?? DEFAULT_FIXED_TIMESTEP
    this.maxSubsteps = options.maxSubsteps ?? DEFAULT_MAX_SUBSTEPS
    this.maxFrameDelta =
      options.maxFrameDelta ?? this.fixedTimestep * this.maxSubsteps

    if (!Number.isFinite(this.fixedTimestep) || this.fixedTimestep <= 0) {
      throw new Error('fixedTimestep must be a positive finite number')
    }
    if (!Number.isInteger(this.maxSubsteps) || this.maxSubsteps <= 0) {
      throw new Error('maxSubsteps must be a positive integer')
    }
    if (!Number.isFinite(this.maxFrameDelta) || this.maxFrameDelta < 0) {
      throw new Error('maxFrameDelta must be a non-negative finite number')
    }
  }

  get frameNumber(): number {
    return this._frameNumber
  }

  get tickNumber(): number {
    return this._tickNumber
  }

  get interpolationAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulator / this.fixedTimestep))
  }

  get isPaused(): boolean {
    return this.paused
  }

  get currentPhase(): SchedulerPhase | null {
    return this.activePhase
  }

  addSystem(system: SchedulerSystem): void {
    if (this.systems.some((entry) => entry.system === system)) return
    if (
      system.localOrder !== undefined &&
      !Number.isFinite(system.localOrder)
    ) {
      throw new Error('localOrder must be a finite number')
    }
    this.systems.push({
      system,
      sequence: this.nextSystemSequence++,
    })
  }

  removeSystem(system: SchedulerSystem): void {
    const index = this.systems.findIndex((entry) => entry.system === system)
    if (index >= 0) this.systems.splice(index, 1)
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    this.accumulator = 0
    this.pendingSingleStep = false
  }

  requestSingleStep(): void {
    if (!this.paused) {
      throw new Error('Single-step requires a paused scheduler')
    }
    this.pendingSingleStep = true
  }

  resetTime(options: { resetTickNumber?: boolean } = {}): void {
    this.accumulator = 0
    this.pendingSingleStep = false
    if (options.resetTickNumber) {
      this._tickNumber = 0
      this._frameNumber = 0
    }
  }

  enqueue<T>(
    targetPhase: SchedulerPhase,
    payload: T,
    handler: (command: SchedulerCommand<T>) => void,
  ): SchedulerCommand<T> {
    const command: SchedulerCommand<T> = {
      targetPhase,
      sourcePhase: this.activePhase ?? 'External',
      sourceTick: this._tickNumber,
      sourceFrame: this._frameNumber,
      sequence: this.nextCommandSequence++,
      payload,
    }
    this.queue.push({
      command: command as SchedulerCommand<unknown>,
      handler: handler as (command: SchedulerCommand<unknown>) => void,
    })
    return command
  }

  runFrame(world: IWorld, dt: number): SchedulerFrameReport {
    if (this.runningFrame) {
      throw new Error('EngineScheduler.runFrame cannot be called reentrantly')
    }
    this.runningFrame = true
    this._frameNumber += 1

    try {
      const inputDelta = Number.isFinite(dt) && dt > 0 ? dt : 0
      const admittedDelta = Math.min(inputDelta, this.maxFrameDelta)
      let droppedTime = inputDelta - admittedDelta
      const singleStep = this.paused && this.pendingSingleStep
      const frameDelta = this.paused
        ? singleStep
          ? this.fixedTimestep
          : 0
        : admittedDelta

      this.runPhase(world, 'FrameInput', frameDelta)

      if (!this.paused) {
        this.accumulator += admittedDelta
      }
      this.runPhase(world, 'AccumulateTime', frameDelta)

      let fixedSteps = 0
      if (singleStep) {
        this.pendingSingleStep = false
        this.runFixedStep(world)
        fixedSteps = 1
      } else if (!this.paused) {
        while (
          this.accumulator >= this.fixedTimestep - TIME_EPSILON &&
          fixedSteps < this.maxSubsteps
        ) {
          this.runFixedStep(world)
          this.accumulator = Math.max(0, this.accumulator - this.fixedTimestep)
          fixedSteps += 1
        }
        if (fixedSteps >= this.maxSubsteps) {
          droppedTime += this.accumulator
          this.accumulator = 0
        }
      }

      this.runPhase(world, 'FrameGameplay', frameDelta)
      this.runPhase(world, 'LateUpdate', frameDelta)
      this.runPhase(world, 'Presentation', frameDelta)
      this.runPhase(world, 'Render', frameDelta)

      return {
        frameNumber: this._frameNumber,
        tickNumber: this._tickNumber,
        fixedSteps,
        interpolationAlpha: this.interpolationAlpha,
        droppedTime,
      }
    } finally {
      this.activePhase = null
      this.runningFrame = false
    }
  }

  private runFixedStep(world: IWorld): void {
    this._tickNumber += 1
    for (const phase of FIXED_PHASES) {
      this.runPhase(world, phase, this.fixedTimestep)
    }
  }

  private runPhase(world: IWorld, phase: SchedulerPhase, dt: number): void {
    this.activePhase = phase

    const ready = this.queue.filter((entry) => entry.command.targetPhase === phase)
    if (ready.length > 0) {
      const readySequences = new Set(ready.map((entry) => entry.command.sequence))
      this.queue = this.queue.filter(
        (entry) => !readySequences.has(entry.command.sequence),
      )
      for (const entry of ready) {
        entry.handler(entry.command)
      }
    }

    const systems = this.systems
      .filter((entry) => entry.system.phase === phase)
      .sort((left, right) => {
        const orderDelta =
          (left.system.localOrder ?? 0) - (right.system.localOrder ?? 0)
        return orderDelta || left.sequence - right.sequence
      })
    for (const { system } of systems) {
      system.update(world, dt)
    }
  }
}
