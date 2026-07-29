import { describe, expect, it } from 'vitest'
import {
  DETERMINISTIC_GRAPH_CONTRACTS,
  NodeRegistry,
  registerDeterministicNodeContracts,
} from './index.js'

describe('deterministic graph contracts', () => {
  it('registers variable, scalar/vector, and seeded-random nodes as bounded contracts', () => {
    const registry = new NodeRegistry()
    registerDeterministicNodeContracts(registry)

    expect(registry.all()).toHaveLength(5)
    expect(Object.keys(DETERMINISTIC_GRAPH_CONTRACTS)).toEqual([
      'getVariable',
      'setVariable',
      'multiply',
      'dotVec3',
      'randomNumber',
    ])
    for (const definition of registry.all()) {
      expect(definition.contract.checkpoint).toBe('safe')
      expect(definition.contract.checkpointScope).toBe('bounded')
      expect(definition.contract.effects).not.toContain('unknown')
      expect(definition.contract.effects).not.toContain('external')
    }
  })

  it('declares state and random capabilities without hidden world access', () => {
    const definitions = Object.fromEntries(
      new NodeRegistry().all().map(({ contract }) => [contract.name, contract]),
    )
    const registry = new NodeRegistry()
    registerDeterministicNodeContracts(registry)
    const contracts = Object.fromEntries(
      registry.all().map(({ contract }) => [contract.name, contract]),
    )

    expect(definitions).toEqual({})
    expect(contracts['Get Variable']?.capabilities).toEqual(['state'])
    expect(contracts['Set Variable']?.capabilities).toEqual(['state'])
    expect(contracts['Random Number']?.capabilities).toEqual(['random.seeded'])
    expect(contracts['Random Number']?.effects).toEqual(['random.seeded'])
    expect(contracts.Multiply?.capabilities).toEqual([])
    expect(contracts['Dot Vec3']?.capabilities).toEqual([])
  })
})
