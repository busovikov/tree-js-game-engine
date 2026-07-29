import { describe, expect, it } from 'vitest'
import {
  NodeRegistry,
  WORLD_GRAPH_CONTRACTS,
  analyzeNodeCheckpointEligibility,
  registerWorldNodeContracts,
} from './index.js'

describe('world and physics graph contracts', () => {
  it('registers transform, component, prefab, query, event, and body foundations', () => {
    const registry = new NodeRegistry()
    registerWorldNodeContracts(registry)

    expect(registry.all().map(({ contract }) => contract.name)).toEqual([
      'Get Transform Position',
      'Has Component',
      'On Physics Event',
      'Raycast',
      'Set Body Velocity',
      'Set Transform Position',
      'Spawn Prefab',
    ])
    expect(Object.keys(WORLD_GRAPH_CONTRACTS)).toEqual([
      'getTransform',
      'setTransform',
      'hasComponent',
      'spawnPrefab',
      'raycast',
      'physicsEvent',
      'setBodyVelocity',
    ])
  })

  it('marks dynamic physics dependencies ineligible without tainting bounded world nodes', () => {
    const registry = new NodeRegistry()
    registerWorldNodeContracts(registry)
    const contracts = Object.fromEntries(
      registry.all().map((definition) => [
        definition.contract.name,
        definition,
      ]),
    )

    for (const name of [
      'Get Transform Position',
      'Set Transform Position',
      'Has Component',
      'Spawn Prefab',
    ]) {
      expect(analyzeNodeCheckpointEligibility(contracts[name]!)).toEqual({
        eligible: true,
        causalChain: [],
      })
    }
    for (const name of ['Raycast', 'On Physics Event', 'Set Body Velocity']) {
      expect(analyzeNodeCheckpointEligibility(contracts[name]!).eligible).toBe(false)
      expect(
        analyzeNodeCheckpointEligibility(contracts[name]!).causalChain.join(' '),
      ).toMatch(/physics|checkpoint policy/)
    }
    expect(contracts.Raycast?.contract.capabilities).toEqual(['physics'])
    expect(contracts['Set Body Velocity']?.contract.effects).toEqual([
      'physics.write',
    ])
  })
})
