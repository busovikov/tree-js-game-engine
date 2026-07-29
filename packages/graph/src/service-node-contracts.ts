import { z } from 'zod'
import { genericType, namedType } from './graph-schema.js'
import {
  BOOL_TYPE,
  OPTION_TYPE,
  STRING_TYPE,
} from './type-registry.js'
import {
  defineNode,
  type NodeDefinition,
  type NodeDefinitionInput,
  type NodeRegistry,
} from './node-registry.js'

const id = (value: number): string =>
  `74300000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const SERVICE_GRAPH_CONTRACTS = {
  loadValue: {
    nodeType: id(1),
    ports: { flowIn: id(101), flowOut: id(102), value: id(103) },
  },
  saveValue: {
    nodeType: id(2),
    ports: { flowIn: id(201), flowOut: id(202), value: id(203) },
  },
  hasPlatformCapability: {
    nodeType: id(3),
    ports: { available: id(301) },
  },
  debugLog: {
    nodeType: id(4),
    ports: { flowIn: id(401), flowOut: id(402), message: id(403) },
  },
  assert: {
    nodeType: id(5),
    ports: {
      flowIn: id(501),
      flowOut: id(502),
      condition: id(503),
      message: id(504),
    },
  },
} as const

export const PLATFORM_GRAPH_CAPABILITIES = [
  'lifecycle',
  'auth',
  'pause',
  'input',
  'audio',
] as const
export type PlatformGraphCapability =
  (typeof PLATFORM_GRAPH_CAPABILITIES)[number]

const EmptyProperties = z.object({}).strict()
const KeyProperties = z.object({ key: z.string().min(1) }).strict()
const CapabilityProperties = z.object({
  capability: z.enum(PLATFORM_GRAPH_CAPABILITIES),
}).strict()

const flowPorts = (flowIn: string, flowOut: string) => [
  { id: flowIn, name: 'In', kind: 'flow' as const, direction: 'input' as const },
  { id: flowOut, name: 'Out', kind: 'flow' as const, direction: 'output' as const },
]

function serviceNode(
  input: Pick<NodeDefinitionInput, 'id' | 'name' | 'category' | 'description' | 'ports'> &
    Partial<NodeDefinitionInput>,
): NodeDefinition {
  return defineNode({
    version: '1',
    kind: 'builtin',
    typeParameters: [],
    propertySchema: EmptyProperties,
    propertyContract: {},
    domains: ['FrameGameplay'],
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    checkpointScope: 'bounded',
    asyncCheckpointPolicies: [],
    resultPersistence: 'none',
    liveness: 'on-flow',
    exportedState: [],
    ...input,
  })
}

const loadValue = SERVICE_GRAPH_CONTRACTS.loadValue
const saveValue = SERVICE_GRAPH_CONTRACTS.saveValue
const capability = SERVICE_GRAPH_CONTRACTS.hasPlatformCapability
const debugLog = SERVICE_GRAPH_CONTRACTS.debugLog
const assertion = SERVICE_GRAPH_CONTRACTS.assert

export const SERVICE_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  serviceNode({
    id: loadValue.nodeType,
    name: 'Load Save Value',
    category: 'Save',
    description: 'Loads one keyed value through the public save service.',
    typeParameters: ['T'],
    ports: [
      ...flowPorts(loadValue.ports.flowIn, loadValue.ports.flowOut),
      {
        id: loadValue.ports.value,
        name: 'Value',
        kind: 'data',
        direction: 'output',
        type: namedType(OPTION_TYPE, [genericType('T')]),
      },
    ],
    propertySchema: KeyProperties,
    propertyContract: { key: 'non-empty string' },
    capabilities: ['storage'],
    reads: [{ resource: 'save.slot', scope: 'static' }],
    effects: ['storage.read'],
    execution: 'async',
    checkpoint: 'conditional',
    asyncCheckpointPolicies: ['materialized', 'reject'],
    resultPersistence: 'checkpoint',
  }),
  serviceNode({
    id: saveValue.nodeType,
    name: 'Save Value',
    category: 'Save',
    description: 'Persists one keyed value through the public save service.',
    typeParameters: ['T'],
    ports: [
      ...flowPorts(saveValue.ports.flowIn, saveValue.ports.flowOut),
      {
        id: saveValue.ports.value,
        name: 'Value',
        kind: 'data',
        direction: 'input',
        type: genericType('T'),
      },
    ],
    propertySchema: KeyProperties,
    propertyContract: { key: 'non-empty string' },
    capabilities: ['storage'],
    writes: [{ resource: 'save.slot', scope: 'static' }],
    effects: ['storage.write'],
    execution: 'async',
    checkpoint: 'unsafe',
    asyncCheckpointPolicies: ['wait', 'reject'],
  }),
  serviceNode({
    id: capability.nodeType,
    name: 'Has Platform Capability',
    category: 'Platform',
    description: 'Queries one honest provider-neutral platform capability.',
    ports: [{
      id: capability.ports.available,
      name: 'Available',
      kind: 'data',
      direction: 'output',
      type: namedType(BOOL_TYPE),
    }],
    propertySchema: CapabilityProperties,
    propertyContract: { capability: [...PLATFORM_GRAPH_CAPABILITIES] },
    capabilities: ['platform'],
    reads: [{ resource: 'platform.capabilities', scope: 'static' }],
    effects: ['platform'],
    execution: 'async',
    checkpoint: 'conditional',
    asyncCheckpointPolicies: ['materialized', 'reject'],
    resultPersistence: 'checkpoint',
    liveness: 'pure',
  }),
  serviceNode({
    id: debugLog.nodeType,
    name: 'Debug Log',
    category: 'Debug',
    description: 'Emits a message through the injected debug service.',
    ports: [
      ...flowPorts(debugLog.ports.flowIn, debugLog.ports.flowOut),
      {
        id: debugLog.ports.message,
        name: 'Message',
        kind: 'data',
        direction: 'input',
        type: namedType(STRING_TYPE),
      },
    ],
    capabilities: ['debug'],
    effects: ['debug'],
  }),
  serviceNode({
    id: assertion.nodeType,
    name: 'Assert',
    category: 'Assertion',
    description: 'Stops graph execution when a declared invariant is false.',
    ports: [
      ...flowPorts(assertion.ports.flowIn, assertion.ports.flowOut),
      {
        id: assertion.ports.condition,
        name: 'Condition',
        kind: 'data',
        direction: 'input',
        type: namedType(BOOL_TYPE),
      },
      {
        id: assertion.ports.message,
        name: 'Message',
        kind: 'data',
        direction: 'input',
        type: namedType(STRING_TYPE),
      },
    ],
    capabilities: ['debug'],
    effects: ['debug'],
  }),
]

export function registerServiceNodeContracts(registry: NodeRegistry): void {
  for (const definition of SERVICE_NODE_DEFINITIONS) {
    registry.register(definition)
  }
}
