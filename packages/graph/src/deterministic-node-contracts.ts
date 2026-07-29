import { z } from 'zod'
import { genericType, namedType } from './graph-schema.js'
import {
  NUMBER_TYPE,
  VEC3_TYPE,
} from './type-registry.js'
import {
  defineNode,
  type NodeDefinition,
  type NodeDefinitionInput,
  type NodeRegistry,
} from './node-registry.js'

const id = (value: number): string =>
  `74100000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const DETERMINISTIC_GRAPH_CONTRACTS = {
  getVariable: {
    nodeType: id(1),
    ports: { value: id(101) },
  },
  setVariable: {
    nodeType: id(2),
    ports: { flowIn: id(201), flowOut: id(202), value: id(203) },
  },
  multiply: {
    nodeType: id(3),
    ports: { a: id(301), b: id(302), result: id(303) },
  },
  dotVec3: {
    nodeType: id(4),
    ports: { a: id(401), b: id(402), result: id(403) },
  },
  randomNumber: {
    nodeType: id(5),
    ports: { min: id(501), max: id(502), value: id(503) },
  },
} as const

const EmptyProperties = z.object({}).strict()
const VariableProperties = z.object({ key: z.string().min(1) }).strict()
const domains = ['FixedGameplay', 'FrameGameplay'] as const

function deterministicNode(
  input: Pick<NodeDefinitionInput, 'id' | 'name' | 'category' | 'description' | 'ports'> &
    Partial<NodeDefinitionInput>,
): NodeDefinition {
  return defineNode({
    version: '1',
    kind: 'builtin',
    typeParameters: [],
    propertySchema: EmptyProperties,
    propertyContract: {},
    domains,
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    checkpointScope: 'bounded',
    asyncCheckpointPolicies: [],
    resultPersistence: 'execution',
    liveness: 'pure',
    exportedState: [],
    ...input,
  })
}

const getVariable = DETERMINISTIC_GRAPH_CONTRACTS.getVariable
const setVariable = DETERMINISTIC_GRAPH_CONTRACTS.setVariable
const multiply = DETERMINISTIC_GRAPH_CONTRACTS.multiply
const dotVec3 = DETERMINISTIC_GRAPH_CONTRACTS.dotVec3
const randomNumber = DETERMINISTIC_GRAPH_CONTRACTS.randomNumber

export const DETERMINISTIC_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  deterministicNode({
    id: getVariable.nodeType,
    name: 'Get Variable',
    category: 'Variables',
    description: 'Reads a graph-instance variable by authored key.',
    typeParameters: ['T'],
    ports: [{
      id: getVariable.ports.value,
      name: 'Value',
      kind: 'data',
      direction: 'output',
      type: genericType('T'),
    }],
    propertySchema: VariableProperties,
    propertyContract: { key: 'non-empty string' },
    capabilities: ['state'],
    reads: [{ resource: 'graph.variable', scope: 'static' }],
  }),
  deterministicNode({
    id: setVariable.nodeType,
    name: 'Set Variable',
    category: 'Variables',
    description: 'Stores a graph-instance variable by authored key.',
    typeParameters: ['T'],
    ports: [
      {
        id: setVariable.ports.flowIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: setVariable.ports.flowOut,
        name: 'Out',
        kind: 'flow',
        direction: 'output',
      },
      {
        id: setVariable.ports.value,
        name: 'Value',
        kind: 'data',
        direction: 'input',
        type: genericType('T'),
      },
    ],
    propertySchema: VariableProperties,
    propertyContract: { key: 'non-empty string' },
    capabilities: ['state'],
    writes: [{ resource: 'graph.variable', scope: 'static' }],
    resultPersistence: 'none',
    liveness: 'on-flow',
  }),
  deterministicNode({
    id: multiply.nodeType,
    name: 'Multiply',
    category: 'Math',
    description: 'Multiplies two finite scalar values.',
    ports: [
      {
        id: multiply.ports.a,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: multiply.ports.b,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: multiply.ports.result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: namedType(NUMBER_TYPE),
      },
    ],
  }),
  deterministicNode({
    id: dotVec3.nodeType,
    name: 'Dot Vec3',
    category: 'Vector',
    description: 'Computes the finite dot product of two Vec3 values.',
    ports: [
      {
        id: dotVec3.ports.a,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: namedType(VEC3_TYPE),
      },
      {
        id: dotVec3.ports.b,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: namedType(VEC3_TYPE),
      },
      {
        id: dotVec3.ports.result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: namedType(NUMBER_TYPE),
      },
    ],
  }),
  deterministicNode({
    id: randomNumber.nodeType,
    name: 'Random Number',
    category: 'Random',
    description: 'Advances the graph seeded RNG within a finite half-open range.',
    ports: [
      {
        id: randomNumber.ports.min,
        name: 'Min',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: randomNumber.ports.max,
        name: 'Max',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: randomNumber.ports.value,
        name: 'Value',
        kind: 'data',
        direction: 'output',
        type: namedType(NUMBER_TYPE),
      },
    ],
    capabilities: ['random.seeded'],
    reads: [{ resource: 'random.seeded', scope: 'static' }],
    writes: [{ resource: 'random.seeded', scope: 'static' }],
    effects: ['random.seeded'],
  }),
]

export function registerDeterministicNodeContracts(
  registry: NodeRegistry,
): void {
  for (const definition of DETERMINISTIC_NODE_DEFINITIONS) {
    registry.register(definition)
  }
}
