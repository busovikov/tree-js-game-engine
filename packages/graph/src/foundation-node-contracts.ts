import { z } from 'zod'
import {
  BOOL_TYPE,
  NUMBER_TYPE,
  VEC3_TYPE,
} from './type-registry.js'
import { namedType } from './graph-schema.js'
import {
  defineNode,
  type NodeDefinition,
  type NodeDefinitionInput,
  type NodeRegistry,
} from './node-registry.js'

const id = (value: number): string =>
  `74000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const FOUNDATION_GRAPH_IDS = {
  onStart: {
    nodeType: id(1),
    ports: { next: id(101) },
  },
  branch: {
    nodeType: id(2),
    ports: {
      flowIn: id(201),
      condition: id(202),
      whenTrue: id(203),
      whenFalse: id(204),
    },
  },
  add: {
    nodeType: id(3),
    ports: { a: id(301), b: id(302), result: id(303) },
  },
  addVec3: {
    nodeType: id(4),
    ports: { a: id(401), b: id(402), result: id(403) },
  },
} as const

const EmptyProperties = z.object({}).strict()
const DETERMINISTIC_DOMAINS = ['FixedGameplay', 'FrameGameplay'] as const

function foundationNode(
  input: Pick<NodeDefinitionInput, 'id' | 'name' | 'category' | 'description' | 'ports'> &
    Partial<
      Pick<NodeDefinitionInput, 'domains' | 'liveness' | 'resultPersistence'>
    >,
): NodeDefinition {
  return defineNode({
    version: '1',
    kind: 'builtin',
    typeParameters: [],
    propertySchema: EmptyProperties,
    propertyContract: {},
    domains: input.domains ?? DETERMINISTIC_DOMAINS,
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    checkpointScope: 'bounded',
    asyncCheckpointPolicies: [],
    resultPersistence: input.resultPersistence ?? 'none',
    liveness: input.liveness ?? 'on-flow',
    exportedState: [],
    ...input,
  })
}

export const FOUNDATION_GRAPH_CONTRACTS: readonly NodeDefinition[] = [
  foundationNode({
    id: FOUNDATION_GRAPH_IDS.onStart.nodeType,
    name: 'On Start',
    category: 'Lifecycle',
    description: 'Begins flow when a graph instance starts.',
    ports: [
      {
        id: FOUNDATION_GRAPH_IDS.onStart.ports.next,
        name: 'Next',
        kind: 'flow',
        direction: 'output',
      },
    ],
    domains: ['FrameGameplay'],
    liveness: 'always',
  }),
  foundationNode({
    id: FOUNDATION_GRAPH_IDS.branch.nodeType,
    name: 'Branch',
    category: 'Control',
    description: 'Routes flow according to a boolean condition.',
    ports: [
      {
        id: FOUNDATION_GRAPH_IDS.branch.ports.flowIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: FOUNDATION_GRAPH_IDS.branch.ports.condition,
        name: 'Condition',
        kind: 'data',
        direction: 'input',
        type: namedType(BOOL_TYPE),
      },
      {
        id: FOUNDATION_GRAPH_IDS.branch.ports.whenTrue,
        name: 'True',
        kind: 'flow',
        direction: 'output',
      },
      {
        id: FOUNDATION_GRAPH_IDS.branch.ports.whenFalse,
        name: 'False',
        kind: 'flow',
        direction: 'output',
      },
    ],
  }),
  foundationNode({
    id: FOUNDATION_GRAPH_IDS.add.nodeType,
    name: 'Add',
    category: 'Math',
    description: 'Adds two finite scalar values.',
    ports: [
      {
        id: FOUNDATION_GRAPH_IDS.add.ports.a,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: FOUNDATION_GRAPH_IDS.add.ports.b,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: FOUNDATION_GRAPH_IDS.add.ports.result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: namedType(NUMBER_TYPE),
      },
    ],
    liveness: 'pure',
    resultPersistence: 'execution',
  }),
  foundationNode({
    id: FOUNDATION_GRAPH_IDS.addVec3.nodeType,
    name: 'Add Vec3',
    category: 'Vector',
    description: 'Adds two finite three-component vectors.',
    ports: [
      {
        id: FOUNDATION_GRAPH_IDS.addVec3.ports.a,
        name: 'A',
        kind: 'data',
        direction: 'input',
        type: namedType(VEC3_TYPE),
      },
      {
        id: FOUNDATION_GRAPH_IDS.addVec3.ports.b,
        name: 'B',
        kind: 'data',
        direction: 'input',
        type: namedType(VEC3_TYPE),
      },
      {
        id: FOUNDATION_GRAPH_IDS.addVec3.ports.result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: namedType(VEC3_TYPE),
      },
    ],
    liveness: 'pure',
    resultPersistence: 'execution',
  }),
]

export function registerFoundationNodeContracts(registry: NodeRegistry): void {
  for (const definition of FOUNDATION_GRAPH_CONTRACTS) {
    registry.register(definition)
  }
}
