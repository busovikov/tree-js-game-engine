import { describe, expect, it } from 'vitest'
import { createCustomComponentDefinition } from '@haku/core'
import {
  NodeRegistry,
  createBuiltinTypeRegistry,
  registerCustomComponentGraphContracts,
} from './index.js'

describe('custom component graph contracts', () => {
  it('registers typed read and component-command nodes with declared effects', () => {
    const mover = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-000000000051',
      name: 'Mover',
      version: 3,
      fields: [{ name: 'speed', type: 'number', default: 2 }],
    })
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()

    const contract = registerCustomComponentGraphContracts(
      [mover],
      types,
      nodes,
    )[0]!

    expect(types.require(mover.id).runtimeSchema.parse({})).toEqual({
      speed: 2,
    })
    expect(nodes.require(contract.nodes.read.id).contract).toMatchObject({
      name: 'Get Mover',
      reads: [{ resource: `component:${mover.id}`, scope: 'dynamic' }],
      writes: [],
      effects: ['world.read'],
    })
    expect(nodes.require(contract.nodes.set.id).contract).toMatchObject({
      name: 'Set Mover',
      domains: ['FixedGameplay', 'FrameGameplay'],
      reads: [{ resource: `component:${mover.id}`, scope: 'dynamic' }],
      writes: [{ resource: `component:${mover.id}`, scope: 'dynamic' }],
      effects: ['world.write'],
    })
    expect(contract.nodes.set.ports.value.type).toEqual({
      kind: 'named',
      type: mover.id,
      arguments: [],
    })
    expect(contract.nodes.add.id).not.toBe(contract.nodes.remove.id)
  })
})
