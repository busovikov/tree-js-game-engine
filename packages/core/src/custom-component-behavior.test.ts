import { describe, expect, it } from 'vitest'
import {
  ComponentBehaviorRunner,
  EngineScheduler,
  World,
  createCustomComponentDefinition,
  defineComponentBehavior,
} from './index.js'

const mover = createCustomComponentDefinition({
  schemaVersion: 1,
  id: '42000000-0000-4000-8000-000000000041',
  name: 'Mover',
  version: 1,
  fields: [{ name: 'speed', type: 'number', default: 1 }],
})

describe('scheduler-aware custom component behaviors', () => {
  it('runs one declared batch and applies traced component commands', () => {
    const world = new World()
    const first = world.createEntity('First')
    const second = world.createEntity('Second')
    world.addComponent(first, mover, { speed: 2 })
    world.addComponent(second, mover, { speed: 5 })
    let batchCalls = 0
    const behavior = defineComponentBehavior({
      id: '43000000-0000-4000-8000-000000000001',
      name: 'Accelerate movers',
      version: 1,
      domain: 'FixedGameplay',
      query: [mover.id],
      reads: [`component:${mover.id}`],
      writes: [`component:${mover.id}`],
      effects: ['world.write'],
      commands: ['set'],
      updateBatch(context) {
        batchCalls += 1
        return context.entities.map((entity) => {
          const current = context.getComponent(entity, mover) as {
            speed: number
          }
          return {
            kind: 'set' as const,
            entity,
            component: mover.id,
            data: { speed: current.speed + context.dt },
          }
        })
      },
    })
    const scheduler = new EngineScheduler({ fixedTimestep: 1 })
    const runner = new ComponentBehaviorRunner(behavior, {
      scheduler,
      resolveComponent: (typeId) =>
        typeId === mover.id ? mover : undefined,
    })
    scheduler.addSystem(runner)

    scheduler.runFrame(world, 1)

    expect(batchCalls).toBe(1)
    expect(world.getComponent(first, mover)).toEqual({ speed: 3 })
    expect(world.getComponent(second, mover)).toEqual({ speed: 6 })
    expect(runner.trace.map((entry) => entry.kind)).toEqual([
      'batch-start',
      'component-command',
      'component-command',
      'batch-complete',
    ])
    expect(runner.trace[0]).toMatchObject({
      behaviorId: behavior.id,
      domain: 'FixedGameplay',
      entityCount: 2,
      reads: [`component:${mover.id}`],
      writes: [`component:${mover.id}`],
      effects: ['world.write'],
    })
  })

  it('dispatches explicit lifecycle batches and rejects undeclared commands', () => {
    const world = new World()
    const entity = world.createEntity('Mover')
    world.addComponent(entity, mover, { speed: 1 })
    const lifecycle: string[] = []
    const behavior = defineComponentBehavior({
      id: '43000000-0000-4000-8000-000000000002',
      name: 'Mover lifecycle',
      version: 1,
      domain: 'FrameGameplay',
      query: [mover.id],
      reads: [],
      writes: [],
      effects: [],
      commands: [],
      updateBatch: () => [],
      lifecycle: {
        activate: (context) => {
          lifecycle.push(`activate:${context.entities.length}`)
        },
        checkpointRestore: (context) => {
          lifecycle.push(`checkpoint:${context.entities.length}`)
        },
      },
    })
    const scheduler = new EngineScheduler()
    const runner = new ComponentBehaviorRunner(behavior, {
      scheduler,
      resolveComponent: (typeId) =>
        typeId === mover.id ? mover : undefined,
    })

    runner.dispatchLifecycle('activate', world)
    runner.dispatchLifecycle('checkpoint-restore', world)

    expect(lifecycle).toEqual(['activate:1', 'checkpoint:1'])
    expect(() =>
      defineComponentBehavior({
        ...behavior,
        id: '43000000-0000-4000-8000-000000000003',
        commands: ['remove'],
      }),
    ).toThrow(/writes/)
  })
})
