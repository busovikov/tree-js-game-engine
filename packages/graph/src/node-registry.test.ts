import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  BOOL_TYPE,
  GraphDiagnosticError,
  NodeRegistry,
  NUMBER_TYPE,
  analyzeNodeCheckpointEligibility,
  createBuiltinTypeRegistry,
  createRegistryFingerprint,
  defineNode,
  genericType,
  namedType,
} from './index.js'

const nodeTypeId = '42000000-0000-4000-8000-000000000001'
const flowInId = '42000000-0000-4000-8000-000000000002'
const eventOutId = '42000000-0000-4000-8000-000000000003'
const dataInId = '42000000-0000-4000-8000-000000000004'

function genericNode() {
  return defineNode({
    id: nodeTypeId,
    version: '1.0.0',
    name: 'Gate',
    category: 'Flow',
    description: 'Routes a typed value.',
    kind: 'custom',
    typeParameters: ['T'],
    ports: [
      { id: flowInId, name: 'In', kind: 'flow', direction: 'input' },
      {
        id: eventOutId,
        name: 'Changed',
        kind: 'event',
        direction: 'output',
        type: genericType('T'),
      },
      {
        id: dataInId,
        name: 'Condition',
        kind: 'data',
        direction: 'input',
        type: namedType(BOOL_TYPE),
      },
    ],
    propertySchema: z.object({ label: z.string().default('') }).strict(),
    propertyContract: {
      kind: 'object',
      fields: [{ name: 'label', type: 'string' }],
    },
    domains: ['FixedGameplay', 'FrameGameplay'],
    capabilities: ['world.read', 'events'],
    reads: [{ resource: 'Transform', scope: 'static' }],
    writes: [],
    effects: ['world.read'],
    execution: 'sync',
    checkpoint: 'safe',
    resultPersistence: 'none',
    liveness: 'on-flow',
    exportedState: [],
  })
}

describe('node definition SDK and registry', () => {
  it('defines metadata-only custom nodes with typed flow, event, and data ports', () => {
    const definition = genericNode()

    expect(definition.contract.ports.map((port) => port.kind)).toEqual([
      'flow',
      'event',
      'data',
    ])
    expect(definition.propertySchema.parse({})).toEqual({ label: '' })
    expect('execute' in definition).toBe(false)
  })

  it('rejects typed flow ports and untyped data ports', () => {
    expect(() =>
      defineNode({
        ...genericNode().contract,
        propertySchema: z.object({}).strict(),
        ports: [
          {
            id: flowInId,
            name: 'Bad flow',
            kind: 'flow',
            direction: 'input',
            type: namedType(NUMBER_TYPE),
          },
        ],
      }),
    ).toThrow(/flow port must not declare a data type/)

    expect(() =>
      defineNode({
        ...genericNode().contract,
        propertySchema: z.object({}).strict(),
        ports: [
          {
            id: dataInId,
            name: 'Bad data',
            kind: 'data',
            direction: 'input',
          },
        ],
      }),
    ).toThrow(/data port requires a data type/)
  })

  it('reports exact duplicate node and port identities', () => {
    const registry = new NodeRegistry()
    const definition = genericNode()
    registry.register(definition)

    expect(() => registry.register(definition)).toThrowError(
      expect.objectContaining({
        diagnostics: [
          expect.objectContaining({
            code: 'registry.duplicate-node-type',
            location: { nodeTypeId },
          }),
        ],
      }),
    )

    expect(() =>
      defineNode({
        ...definition.contract,
        propertySchema: definition.propertySchema,
        ports: [definition.contract.ports[0], definition.contract.ports[0]],
      }),
    ).toThrow(GraphDiagnosticError)
  })

  it('makes unknown effects and dynamic world reads checkpoint-ineligible with causal chains', () => {
    const definition = defineNode({
      ...genericNode().contract,
      id: '42000000-0000-4000-8000-000000000010',
      propertySchema: z.object({}).strict(),
      reads: [{ resource: 'RigidBody', scope: 'dynamic' }],
      effects: ['unknown'],
    })

    expect(analyzeNodeCheckpointEligibility(definition)).toEqual({
      eligible: false,
      causalChain: [
        'node Gate',
        'effect unknown',
        'dynamic RigidBody read',
      ],
    })
  })

  it('fingerprints node and type contracts independent of registration order', () => {
    const types = createBuiltinTypeRegistry()
    const first = new NodeRegistry()
    first.register(genericNode())
    const second = new NodeRegistry()
    second.register(genericNode())

    expect(createRegistryFingerprint(types, first)).toBe(
      createRegistryFingerprint(types, second),
    )
  })
})
