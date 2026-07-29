import { describe, expect, it } from 'vitest'
import { WORLD_GRAPH_CONTRACTS } from '@haku/graph'
import {
  NodeRuntimeRegistry,
  registerWorldRuntimeAdapters,
  type NodeExecutionRequest,
  type WorldGraphService,
} from './index.js'

const entityRef = (id: string) => ({ $ref: `entity:${id}` })

function execute(
  registry: NodeRuntimeRegistry,
  contract: {
    readonly nodeType: string
    readonly ports: Readonly<Record<string, string>>
  },
  values: Readonly<Record<string, unknown>> = {},
  properties: Readonly<Record<string, unknown>> = {},
  input?: unknown,
) {
  return registry.require(contract.nodeType, '1').execute({
    instanceId: 'instance',
    node: { id: 'node', nodeType: contract.nodeType, version: '1', properties },
    tickNumber: 4,
    frameNumber: 8,
    input: input === undefined
      ? undefined
      : { callsiteId: 'event', kind: 'event', value: input },
    readData: (portId) => values[portId],
  } as NodeExecutionRequest)
}

describe('world graph runtime adapters', () => {
  it('uses the public world service for transform, component, and prefab operations', () => {
    const calls: unknown[] = []
    const service: WorldGraphService = {
      getTransformPosition: () => [1, 2, 3],
      setTransformPosition: (entity, position) => calls.push(['set', entity, position]),
      hasComponent: (_entity, type) => type === 'Mover',
      spawnPrefab: (prefab) => {
        calls.push(['spawn', prefab])
        return '20000000-0000-4000-8000-000000000001'
      },
      raycast: () => null,
      setBodyVelocity: () => undefined,
    }
    const registry = new NodeRuntimeRegistry()
    registerWorldRuntimeAdapters(registry, service)
    const get = WORLD_GRAPH_CONTRACTS.getTransform
    const set = WORLD_GRAPH_CONTRACTS.setTransform
    const has = WORLD_GRAPH_CONTRACTS.hasComponent
    const spawn = WORLD_GRAPH_CONTRACTS.spawnPrefab
    const entity = '10000000-0000-4000-8000-000000000001'

    expect(execute(registry, get, {
      [get.ports.entity]: entityRef(entity),
    })).toEqual({ data: { [get.ports.position]: [1, 2, 3] } })
    execute(registry, set, {
      [set.ports.entity]: entityRef(entity),
      [set.ports.position]: [4, 5, 6],
    })
    expect(execute(registry, has, {
      [has.ports.entity]: entityRef(entity),
    }, { componentType: 'Mover' })).toEqual({
      data: { [has.ports.result]: true },
    })
    expect(execute(registry, spawn, {}, {
      prefabId: '30000000-0000-4000-8000-000000000001',
    })).toMatchObject({
      data: {
        [spawn.ports.entity]:
          entityRef('20000000-0000-4000-8000-000000000001'),
      },
      effects: [{ kind: 'world.spawn-prefab' }],
    })
    expect(calls).toEqual([
      ['set', entity, [4, 5, 6]],
      ['spawn', '30000000-0000-4000-8000-000000000001'],
    ])
  })

  it('dispatches physics query, event payload, and body mutation with explicit effects', () => {
    const velocities: unknown[] = []
    const hitEntity = '40000000-0000-4000-8000-000000000001'
    const service: WorldGraphService = {
      getTransformPosition: () => [0, 0, 0],
      setTransformPosition: () => undefined,
      hasComponent: () => false,
      spawnPrefab: () => hitEntity,
      raycast: () => ({ entity: hitEntity, distance: 2 }),
      setBodyVelocity: (entity, velocity) => velocities.push([entity, velocity]),
    }
    const registry = new NodeRuntimeRegistry()
    registerWorldRuntimeAdapters(registry, service)
    const raycast = WORLD_GRAPH_CONTRACTS.raycast
    const event = WORLD_GRAPH_CONTRACTS.physicsEvent
    const body = WORLD_GRAPH_CONTRACTS.setBodyVelocity

    expect(execute(registry, raycast, {
      [raycast.ports.origin]: [0, 0, 0],
      [raycast.ports.direction]: [0, -1, 0],
      [raycast.ports.maxDistance]: 5,
    })).toEqual({
      data: {
        [raycast.ports.entity]: { kind: 'some', value: entityRef(hitEntity) },
        [raycast.ports.distance]: { kind: 'some', value: 2 },
      },
    })
    expect(execute(registry, event, {}, {}, {
      entity: hitEntity,
      phase: 'started',
    })).toEqual({
      flow: [event.ports.flowOut],
      data: { [event.ports.entity]: entityRef(hitEntity) },
    })
    expect(execute(registry, body, {
      [body.ports.entity]: entityRef(hitEntity),
      [body.ports.velocity]: [1, 2, 3],
    })).toMatchObject({ effects: [{ kind: 'physics.set-body-velocity' }] })
    expect(velocities).toEqual([[hitEntity, [1, 2, 3]]])
  })

  it('rejects malformed entity references and unbounded physics inputs before service calls', () => {
    const service: WorldGraphService = {
      getTransformPosition: () => [0, 0, 0],
      setTransformPosition: () => undefined,
      hasComponent: () => false,
      spawnPrefab: () => 'entity',
      raycast: () => null,
      setBodyVelocity: () => undefined,
    }
    const registry = new NodeRuntimeRegistry()
    registerWorldRuntimeAdapters(registry, service)
    const get = WORLD_GRAPH_CONTRACTS.getTransform
    const raycast = WORLD_GRAPH_CONTRACTS.raycast

    expect(() => execute(registry, get, {
      [get.ports.entity]: { $ref: 'asset:not-an-entity' },
    })).toThrow('Entity reference')
    expect(() => execute(registry, raycast, {
      [raycast.ports.origin]: [0, 0, 0],
      [raycast.ports.direction]: [0, 0, 0],
      [raycast.ports.maxDistance]: Number.POSITIVE_INFINITY,
    })).toThrow()
  })
})
