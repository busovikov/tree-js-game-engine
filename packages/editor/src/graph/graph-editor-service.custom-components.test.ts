import { createCustomComponentDefinition } from '@haku/core'
import { describe, expect, it } from 'vitest'
import {
  graphNodeRegistry,
  graphTypeRegistry,
  syncProjectComponentGraphContracts,
} from './graph-editor-service.js'

describe('Graph Editor project component contracts', () => {
  it('adds each project component data type and command nodes exactly once', () => {
    const mover = createCustomComponentDefinition({
      schemaVersion: 1,
      id: '42000000-0000-4000-8000-0000000000a1',
      name: 'Mover Graph Test',
      version: 1,
      fields: [{ name: 'speed', type: 'number', default: 1 }],
    })

    expect(syncProjectComponentGraphContracts([mover])).toHaveLength(1)
    expect(syncProjectComponentGraphContracts([mover])).toHaveLength(0)
    expect(graphTypeRegistry.require(mover.id).contract.name).toBe('Mover Graph TestData')
    expect(
      graphNodeRegistry
        .all()
        .filter((definition) => definition.contract.category === 'Components/Mover Graph Test')
        .map((definition) => definition.contract.name)
        .sort(),
    ).toEqual(
      [
        'Add Mover Graph Test',
        'Get Mover Graph Test',
        'Remove Mover Graph Test',
        'Set Mover Graph Test',
      ].sort(),
    )
  })
})
