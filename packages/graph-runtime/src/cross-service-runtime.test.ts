import { describe, expect, it } from 'vitest'
import { SERVICE_GRAPH_CONTRACTS } from '@haku/graph'
import {
  GraphAssertionError,
  NodeRuntimeRegistry,
  registerCrossServiceRuntimeAdapters,
  type NodeExecutionRequest,
} from './index.js'

function execute(
  registry: NodeRuntimeRegistry,
  contract: {
    readonly nodeType: string
    readonly ports: Readonly<Record<string, string>>
  },
  values: Readonly<Record<string, unknown>> = {},
  properties: Readonly<Record<string, unknown>> = {},
) {
  return registry.require(contract.nodeType, '1').execute({
    instanceId: 'instance',
    node: { id: 'node', nodeType: contract.nodeType, version: '1', properties },
    tickNumber: 1,
    frameNumber: 2,
    readData: (portId) => values[portId],
  } as NodeExecutionRequest)
}

describe('cross-service runtime adapters', () => {
  it('loads and saves values only through the injected async save service', async () => {
    const values = new Map<string, unknown>()
    const registry = new NodeRuntimeRegistry()
    registerCrossServiceRuntimeAdapters(registry, {
      save: {
        load: async (key) => values.get(key),
        save: async (key, value) => {
          values.set(key, structuredClone(value))
        },
      },
      platform: { hasCapability: async () => false },
      debug: { log: () => undefined },
    })
    const load = SERVICE_GRAPH_CONTRACTS.loadValue
    const save = SERVICE_GRAPH_CONTRACTS.saveValue

    expect(await execute(registry, load, {}, { key: 'missing' })).toEqual({
      flow: [load.ports.flowOut],
      data: { [load.ports.value]: { kind: 'none' } },
    })
    expect(await execute(registry, save, {
      [save.ports.value]: { score: 5 },
    }, { key: 'progress' })).toMatchObject({
      flow: [save.ports.flowOut],
      effects: [{ kind: 'storage.write' }],
    })
    expect(await execute(registry, load, {}, { key: 'progress' })).toEqual({
      flow: [load.ports.flowOut],
      data: {
        [load.ports.value]: { kind: 'some', value: { score: 5 } },
      },
    })
  })

  it('queries honest platform capabilities and emits debug/assertion records', async () => {
    const messages: string[] = []
    const registry = new NodeRuntimeRegistry()
    registerCrossServiceRuntimeAdapters(registry, {
      save: {
        load: async () => undefined,
        save: async () => undefined,
      },
      platform: {
        hasCapability: async (capability) => capability === 'audio',
      },
      debug: { log: (message) => messages.push(message) },
    })
    const capability = SERVICE_GRAPH_CONTRACTS.hasPlatformCapability
    const log = SERVICE_GRAPH_CONTRACTS.debugLog
    const assertion = SERVICE_GRAPH_CONTRACTS.assert

    await expect(execute(registry, capability, {}, {
      capability: 'audio',
    })).resolves.toEqual({
      data: { [capability.ports.available]: true },
    })
    expect(execute(registry, log, {
      [log.ports.message]: 'ready',
    })).toMatchObject({ effects: [{ kind: 'debug.log' }] })
    expect(messages).toEqual(['ready'])
    expect(execute(registry, assertion, {
      [assertion.ports.condition]: true,
      [assertion.ports.message]: 'must pass',
    })).toEqual({ flow: [assertion.ports.flowOut] })
    expect(() => execute(registry, assertion, {
      [assertion.ports.condition]: false,
      [assertion.ports.message]: 'broken invariant',
    })).toThrowError(GraphAssertionError)
  })
})
