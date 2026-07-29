import { describe, expect, it } from 'vitest'
import {
  NodeRegistry,
  SERVICE_GRAPH_CONTRACTS,
  registerServiceNodeContracts,
} from './index.js'

describe('save, platform, debug, and assertion node contracts', () => {
  it('registers explicit service contracts with bounded metadata', () => {
    const registry = new NodeRegistry()
    registerServiceNodeContracts(registry)
    const contracts = Object.fromEntries(
      registry.all().map(({ contract }) => [contract.name, contract]),
    )

    expect(Object.keys(SERVICE_GRAPH_CONTRACTS)).toEqual([
      'loadValue',
      'saveValue',
      'hasPlatformCapability',
      'debugLog',
      'assert',
    ])
    expect(contracts['Load Save Value']?.capabilities).toEqual(['storage'])
    expect(contracts['Load Save Value']?.effects).toEqual(['storage.read'])
    expect(contracts['Save Value']?.effects).toEqual(['storage.write'])
    expect(contracts['Has Platform Capability']?.capabilities).toEqual([
      'platform',
    ])
    expect(contracts['Debug Log']?.effects).toEqual(['debug'])
    expect(contracts.Assert?.effects).toEqual(['debug'])
    for (const contract of Object.values(contracts)) {
      expect(contract.checkpointScope).toBe('bounded')
      expect(contract.effects).not.toContain('unknown')
    }
  })
})
