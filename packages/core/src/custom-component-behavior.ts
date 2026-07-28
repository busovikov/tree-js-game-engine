import { z } from 'zod'
import { ComponentTypeIdSchema } from '@haku/schema'
import {
  SCHEDULER_PHASES,
  type EngineScheduler,
  type SchedulerPhase,
  type SchedulerSystem,
} from './scheduler.js'
import type {
  ComponentDefinition,
  EntityId,
  IWorld,
} from './types.js'

export const COMPONENT_BEHAVIOR_LIFECYCLE_ACTIONS = [
  'create',
  'activate',
  'deactivate',
  'destroy',
  'pool-acquire',
  'pool-release',
  'checkpoint-restore',
] as const

export type ComponentBehaviorLifecycleAction =
  (typeof COMPONENT_BEHAVIOR_LIFECYCLE_ACTIONS)[number]
export type ComponentCommandKind = 'add' | 'set' | 'remove'

export type ComponentCommand =
  | {
      readonly kind: 'add' | 'set'
      readonly entity: EntityId
      readonly component: string
      readonly data: unknown
    }
  | {
      readonly kind: 'remove'
      readonly entity: EntityId
      readonly component: string
    }

export interface ComponentBehaviorBatchContext {
  readonly world: IWorld
  readonly entities: readonly EntityId[]
  readonly dt: number
  readonly domain: SchedulerPhase
  getComponent<T>(
    entity: EntityId,
    component: ComponentDefinition<T>,
  ): T | undefined
}

export type ComponentBehaviorBatchResult =
  | readonly ComponentCommand[]
  | void

export interface ComponentBehaviorLifecycle {
  readonly create?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly activate?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly deactivate?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly destroy?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly poolAcquire?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly poolRelease?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly checkpointRestore?: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
}

export interface ComponentBehaviorDefinition {
  readonly id: string
  readonly name: string
  readonly version: number
  readonly domain: SchedulerPhase
  readonly query: readonly string[]
  readonly reads: readonly string[]
  readonly writes: readonly string[]
  readonly effects: readonly string[]
  readonly commands: readonly ComponentCommandKind[]
  readonly updateBatch: (
    context: ComponentBehaviorBatchContext,
  ) => ComponentBehaviorBatchResult
  readonly lifecycle?: ComponentBehaviorLifecycle
}

export interface ComponentBehaviorDefinitionInput
  extends ComponentBehaviorDefinition {}

function assertUnique(label: string, values: readonly string[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) throw new Error(`${label} entries must not be empty`)
    if (seen.has(value)) throw new Error(`Duplicate ${label} entry: ${value}`)
    seen.add(value)
  }
}

export function defineComponentBehavior(
  input: ComponentBehaviorDefinitionInput,
): ComponentBehaviorDefinition {
  const id = z.string().uuid().parse(input.id)
  if (!input.name.trim()) throw new Error('Behavior name must not be empty')
  if (!Number.isInteger(input.version) || input.version <= 0) {
    throw new Error('Behavior version must be a positive integer')
  }
  if (!SCHEDULER_PHASES.includes(input.domain)) {
    throw new Error(`Unknown behavior domain: ${input.domain}`)
  }
  input.query.forEach((typeId) => ComponentTypeIdSchema.parse(typeId))
  assertUnique('query', input.query)
  assertUnique('reads', input.reads)
  assertUnique('writes', input.writes)
  assertUnique('effects', input.effects)
  assertUnique('commands', input.commands)
  if (
    input.commands.length > 0 &&
    !input.writes.some(
      (write) => write === 'world' || write.startsWith('component:'),
    )
  ) {
    throw new Error('Component commands require declared component writes')
  }
  if (
    input.commands.length > 0 &&
    !input.effects.includes('world.write')
  ) {
    throw new Error('Component commands require the world.write effect')
  }
  return Object.freeze({
    ...input,
    id,
    name: input.name.trim(),
    query: Object.freeze([...input.query]),
    reads: Object.freeze([...input.reads]),
    writes: Object.freeze([...input.writes]),
    effects: Object.freeze([...input.effects]),
    commands: Object.freeze([...input.commands]),
  })
}

export type ComponentBehaviorTraceKind =
  | 'batch-start'
  | 'component-command'
  | 'batch-complete'
  | 'lifecycle'

export interface ComponentBehaviorTraceEntry {
  readonly kind: ComponentBehaviorTraceKind
  readonly sequence: number
  readonly behaviorId: string
  readonly behaviorName: string
  readonly domain: SchedulerPhase
  readonly tickNumber: number
  readonly frameNumber: number
  readonly entityCount: number
  readonly reads: readonly string[]
  readonly writes: readonly string[]
  readonly effects: readonly string[]
  readonly lifecycle?: ComponentBehaviorLifecycleAction
  readonly command?: ComponentCommandKind
  readonly entity?: string
  readonly component?: string
}

export interface ComponentBehaviorRunnerOptions {
  readonly scheduler: EngineScheduler
  readonly resolveComponent: (
    typeId: string,
  ) => ComponentDefinition | undefined
}

const LIFECYCLE_CALLBACKS = {
  create: 'create',
  activate: 'activate',
  deactivate: 'deactivate',
  destroy: 'destroy',
  'pool-acquire': 'poolAcquire',
  'pool-release': 'poolRelease',
  'checkpoint-restore': 'checkpointRestore',
} as const satisfies Record<
  ComponentBehaviorLifecycleAction,
  keyof ComponentBehaviorLifecycle
>

export class ComponentBehaviorRunner implements SchedulerSystem {
  readonly phase: SchedulerPhase
  private readonly entries: ComponentBehaviorTraceEntry[] = []
  private nextTraceSequence = 0

  constructor(
    readonly behavior: ComponentBehaviorDefinition,
    private readonly options: ComponentBehaviorRunnerOptions,
  ) {
    this.phase = behavior.domain
    for (const typeId of behavior.query) {
      if (!options.resolveComponent(typeId)) {
        throw new Error(`Unknown behavior query component: ${typeId}`)
      }
    }
  }

  get trace(): readonly ComponentBehaviorTraceEntry[] {
    return this.entries
  }

  update(world: IWorld, dt: number): void {
    const context = this.createContext(world, dt)
    this.record('batch-start', context.entities.length)
    const commands = this.behavior.updateBatch(context) ?? []
    this.applyCommands(world, context.entities.length, commands)
    this.record('batch-complete', context.entities.length)
  }

  dispatchLifecycle(
    action: ComponentBehaviorLifecycleAction,
    world: IWorld,
  ): void {
    const context = this.createContext(world, 0)
    const callbackName = LIFECYCLE_CALLBACKS[action]
    const callback = this.behavior.lifecycle?.[callbackName]
    this.record('lifecycle', context.entities.length, { lifecycle: action })
    const commands = callback?.(context) ?? []
    this.applyCommands(world, context.entities.length, commands)
  }

  private createContext(
    world: IWorld,
    dt: number,
  ): ComponentBehaviorBatchContext {
    const entities = [
      ...world.query(...this.behavior.query.map((id) => ({ id }))),
    ]
    return {
      world,
      entities,
      dt,
      domain: this.behavior.domain,
      getComponent: (entity, component) =>
        world.getComponent(entity, component),
    }
  }

  private applyCommands(
    world: IWorld,
    entityCount: number,
    commands: readonly ComponentCommand[],
  ): void {
    for (const command of commands) {
      if (!this.behavior.commands.includes(command.kind)) {
        throw new Error(
          `Behavior ${this.behavior.id} emitted undeclared ${command.kind} command`,
        )
      }
      if (
        !this.behavior.writes.includes('world') &&
        !this.behavior.writes.includes(`component:${command.component}`)
      ) {
        throw new Error(
          `Behavior ${this.behavior.id} wrote undeclared component ${command.component}`,
        )
      }
      const definition = this.options.resolveComponent(command.component)
      if (!definition) {
        throw new Error(`Unknown component command type: ${command.component}`)
      }
      if (command.kind === 'remove') {
        world.removeComponent(command.entity, definition)
      } else {
        const data = definition.schema.parse(command.data)
        if (
          command.kind === 'add' &&
          world.hasComponent(command.entity, definition)
        ) {
          throw new Error(
            `Cannot add existing component ${command.component} to ${command.entity.value}`,
          )
        }
        if (
          command.kind === 'set' &&
          !world.hasComponent(command.entity, definition)
        ) {
          throw new Error(
            `Cannot set missing component ${command.component} on ${command.entity.value}`,
          )
        }
        world.addComponent(command.entity, definition, data)
      }
      this.record('component-command', entityCount, {
        command: command.kind,
        entity: command.entity.value,
        component: command.component,
      })
    }
  }

  private record(
    kind: ComponentBehaviorTraceKind,
    entityCount: number,
    details: Pick<
      ComponentBehaviorTraceEntry,
      'lifecycle' | 'command' | 'entity' | 'component'
    > = {},
  ): void {
    this.entries.push({
      kind,
      sequence: this.nextTraceSequence++,
      behaviorId: this.behavior.id,
      behaviorName: this.behavior.name,
      domain: this.behavior.domain,
      tickNumber: this.options.scheduler.tickNumber,
      frameNumber: this.options.scheduler.frameNumber,
      entityCount,
      reads: this.behavior.reads,
      writes: this.behavior.writes,
      effects: this.behavior.effects,
      ...details,
    })
  }
}
