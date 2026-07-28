import { World, createCustomComponentDefinition } from '@haku/core'
import { describe, expect, it } from 'vitest'
import { previewComponentBehaviorTrace } from './component-behavior-trace.js'

describe('component behavior trace preview', () => {
  it('runs one non-mutating scheduler-aware batch with the declared contract', () => {
    const mover = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-0000000000b1',
      name: 'Traced Mover',
      version: 1,
      fields: [{ name: 'speed', type: 'number', default: 1 }],
      typescriptBehavior: {
        exportName: 'accelerateMovers',
        domain: 'FixedGameplay',
        query: ['42000000-0000-4000-8000-0000000000b1'],
        reads: ['component:42000000-0000-4000-8000-0000000000b1'],
        writes: ['component:42000000-0000-4000-8000-0000000000b1'],
        effects: ['world.write'],
        commands: ['set'],
      },
    })
    const world = new World()
    const first = world.createEntity('First')
    const second = world.createEntity('Second')
    world.addComponent(first, mover, { speed: 2 })
    world.addComponent(second, mover, { speed: 5 })

    const trace = previewComponentBehaviorTrace(mover, world, (typeId) =>
      typeId === mover.id ? mover : undefined,
    )

    expect(trace.map((entry) => entry.kind)).toEqual(['batch-start', 'batch-complete'])
    expect(trace[0]).toMatchObject({
      behaviorName: 'accelerateMovers',
      domain: 'FixedGameplay',
      entityCount: 2,
      reads: [`component:${mover.id}`],
      writes: [`component:${mover.id}`],
      effects: ['world.write'],
    })
    expect(world.getComponent(first, mover)).toEqual({ speed: 2 })
    expect(world.getComponent(second, mover)).toEqual({ speed: 5 })
  })
})
