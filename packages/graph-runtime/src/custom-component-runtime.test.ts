import { describe, expect, it } from 'vitest'
import {
  World,
  createCustomComponentDefinition,
} from '@haku/core'
import {
  NodeRegistry,
  createBuiltinTypeRegistry,
  registerCustomComponentGraphContracts,
} from '@haku/graph'
import {
  NodeRuntimeRegistry,
  registerCustomComponentRuntimeAdapters,
  type NodeExecutionRequest,
} from './index.js'

describe('custom component graph runtime adapters', () => {
  it('executes typed add, read, set, and remove component commands', () => {
    const mover = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000061',
      name: 'Mover',
      version: 1,
      fields: [{ name: 'speed', type: 'number', default: 1 }],
    })
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    const contract = registerCustomComponentGraphContracts(
      [mover],
      types,
      nodes,
    )[0]!
    const world = new World()
    const entity = world.createEntity('Runner')
    const runtimes = new NodeRuntimeRegistry()
    registerCustomComponentRuntimeAdapters([contract], runtimes, {
      world,
      resolveComponent: (typeId) =>
        typeId === mover.id ? mover : undefined,
    })

    const execute = (
      node: (typeof contract.nodes)[keyof typeof contract.nodes],
      values: Readonly<Record<string, unknown>>,
    ) =>
      runtimes.require(node.id, '1').execute({
        node: { id: 'node-instance', nodeType: node.id, version: '1' },
        readData: (portId) => values[portId],
      } as NodeExecutionRequest)
    const entityReference = { $ref: `entity:${entity.value}` }

    execute(contract.nodes.add, {
      [contract.nodes.add.ports.entity.id]: entityReference,
      [contract.nodes.add.ports.value.id]: { speed: 2 },
    })
    expect(world.getComponent(entity, mover)).toEqual({ speed: 2 })

    const read = execute(contract.nodes.read, {
      [contract.nodes.read.ports.entity.id]: entityReference,
    })
    expect(read).toEqual({
      data: { [contract.nodes.read.ports.value.id]: { speed: 2 } },
    })

    execute(contract.nodes.set, {
      [contract.nodes.set.ports.entity.id]: entityReference,
      [contract.nodes.set.ports.value.id]: { speed: 7 },
    })
    expect(world.getComponent(entity, mover)).toEqual({ speed: 7 })

    execute(contract.nodes.remove, {
      [contract.nodes.remove.ports.entity.id]: entityReference,
    })
    expect(world.hasComponent(entity, mover)).toBe(false)
  })
})
