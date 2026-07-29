import { z } from 'zod'
import { namedType } from './graph-schema.js'
import {
  BOOL_TYPE,
  ENTITY_REF_TYPE,
  NUMBER_TYPE,
  OPTION_TYPE,
  VEC3_TYPE,
} from './type-registry.js'
import {
  defineNode,
  type NodeDefinition,
  type NodeDefinitionInput,
  type NodeRegistry,
} from './node-registry.js'

const id = (value: number): string =>
  `74200000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const WORLD_GRAPH_CONTRACTS = {
  getTransform: {
    nodeType: id(1),
    ports: { entity: id(101), position: id(102) },
  },
  setTransform: {
    nodeType: id(6),
    ports: { flowIn: id(601), flowOut: id(602), entity: id(603), position: id(604) },
  },
  hasComponent: {
    nodeType: id(2),
    ports: { entity: id(201), result: id(202) },
  },
  spawnPrefab: {
    nodeType: id(7),
    ports: { flowIn: id(701), flowOut: id(702), entity: id(703) },
  },
  raycast: {
    nodeType: id(4),
    ports: {
      origin: id(401),
      direction: id(402),
      maxDistance: id(403),
      entity: id(404),
      distance: id(405),
    },
  },
  physicsEvent: {
    nodeType: id(3),
    ports: { eventIn: id(301), flowOut: id(302), entity: id(303) },
  },
  setBodyVelocity: {
    nodeType: id(5),
    ports: { flowIn: id(501), flowOut: id(502), entity: id(503), velocity: id(504) },
  },
} as const

const EmptyProperties = z.object({}).strict()
const ComponentProperties = z.object({ componentType: z.string().min(1) }).strict()
const PrefabProperties = z.object({ prefabId: z.string().uuid() }).strict()
const domains = ['FixedGameplay', 'FrameGameplay'] as const

function worldNode(
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

const entityPort = (id: string, direction: 'input' | 'output') => ({
  id,
  name: 'Entity',
  kind: 'data' as const,
  direction,
  type: namedType(ENTITY_REF_TYPE),
})
const vec3Port = (
  id: string,
  name: string,
  direction: 'input' | 'output',
) => ({
  id,
  name,
  kind: 'data' as const,
  direction,
  type: namedType(VEC3_TYPE),
})
const flowPorts = (flowIn: string, flowOut: string) => [
  { id: flowIn, name: 'In', kind: 'flow' as const, direction: 'input' as const },
  { id: flowOut, name: 'Out', kind: 'flow' as const, direction: 'output' as const },
]

const getTransform = WORLD_GRAPH_CONTRACTS.getTransform
const hasComponent = WORLD_GRAPH_CONTRACTS.hasComponent
const physicsEvent = WORLD_GRAPH_CONTRACTS.physicsEvent
const raycast = WORLD_GRAPH_CONTRACTS.raycast
const setBodyVelocity = WORLD_GRAPH_CONTRACTS.setBodyVelocity
const setTransform = WORLD_GRAPH_CONTRACTS.setTransform
const spawnPrefab = WORLD_GRAPH_CONTRACTS.spawnPrefab

export const WORLD_NODE_DEFINITIONS: readonly NodeDefinition[] = [
  worldNode({
    id: getTransform.nodeType,
    name: 'Get Transform Position',
    category: 'Transform',
    description: 'Reads the position of one entity through the world service.',
    ports: [
      entityPort(getTransform.ports.entity, 'input'),
      vec3Port(getTransform.ports.position, 'Position', 'output'),
    ],
    capabilities: ['world.read'],
    reads: [{ resource: 'Transform', scope: 'static' }],
    effects: ['world.read'],
  }),
  worldNode({
    id: hasComponent.nodeType,
    name: 'Has Component',
    category: 'Component',
    description: 'Checks a declared component type through the world service.',
    ports: [
      entityPort(hasComponent.ports.entity, 'input'),
      {
        id: hasComponent.ports.result,
        name: 'Result',
        kind: 'data',
        direction: 'output',
        type: namedType(BOOL_TYPE),
      },
    ],
    propertySchema: ComponentProperties,
    propertyContract: { componentType: 'registered component type' },
    capabilities: ['world.read'],
    reads: [{ resource: 'component', scope: 'static' }],
    effects: ['world.read'],
  }),
  worldNode({
    id: physicsEvent.nodeType,
    name: 'On Physics Event',
    category: 'Physics/Event',
    description: 'Receives one collision or trigger event from the physics service.',
    ports: [
      {
        id: physicsEvent.ports.eventIn,
        name: 'Event',
        kind: 'trigger',
        direction: 'input',
      },
      {
        id: physicsEvent.ports.flowOut,
        name: 'Out',
        kind: 'flow',
        direction: 'output',
      },
      entityPort(physicsEvent.ports.entity, 'output'),
    ],
    capabilities: ['physics'],
    reads: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
    effects: ['physics.event'],
    checkpoint: 'unsafe',
    resultPersistence: 'none',
    liveness: 'on-event',
  }),
  worldNode({
    id: raycast.nodeType,
    name: 'Raycast',
    category: 'Physics/Query',
    description: 'Queries the public physics service for the nearest body.',
    ports: [
      vec3Port(raycast.ports.origin, 'Origin', 'input'),
      vec3Port(raycast.ports.direction, 'Direction', 'input'),
      {
        id: raycast.ports.maxDistance,
        name: 'Max Distance',
        kind: 'data',
        direction: 'input',
        type: namedType(NUMBER_TYPE),
      },
      {
        id: raycast.ports.entity,
        name: 'Entity',
        kind: 'data',
        direction: 'output',
        type: namedType(OPTION_TYPE, [namedType(ENTITY_REF_TYPE)]),
      },
      {
        id: raycast.ports.distance,
        name: 'Distance',
        kind: 'data',
        direction: 'output',
        type: namedType(OPTION_TYPE, [namedType(NUMBER_TYPE)]),
      },
    ],
    capabilities: ['physics'],
    reads: [{ resource: 'physics.dynamic-body', scope: 'unprovable' }],
    effects: ['physics.query'],
    checkpoint: 'unsafe',
  }),
  worldNode({
    id: setBodyVelocity.nodeType,
    name: 'Set Body Velocity',
    category: 'Physics/Body',
    description: 'Changes a dynamic body through the public physics service.',
    ports: [
      ...flowPorts(setBodyVelocity.ports.flowIn, setBodyVelocity.ports.flowOut),
      entityPort(setBodyVelocity.ports.entity, 'input'),
      vec3Port(setBodyVelocity.ports.velocity, 'Velocity', 'input'),
    ],
    capabilities: ['physics'],
    writes: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
    effects: ['physics.write'],
    checkpoint: 'unsafe',
    resultPersistence: 'none',
    liveness: 'on-flow',
  }),
  worldNode({
    id: setTransform.nodeType,
    name: 'Set Transform Position',
    category: 'Transform',
    description: 'Changes one entity position through the world service.',
    ports: [
      ...flowPorts(setTransform.ports.flowIn, setTransform.ports.flowOut),
      entityPort(setTransform.ports.entity, 'input'),
      vec3Port(setTransform.ports.position, 'Position', 'input'),
    ],
    capabilities: ['world.write'],
    writes: [{ resource: 'Transform', scope: 'static' }],
    effects: ['world.write'],
    resultPersistence: 'none',
    liveness: 'on-flow',
  }),
  worldNode({
    id: spawnPrefab.nodeType,
    name: 'Spawn Prefab',
    category: 'Prefab',
    description: 'Instantiates one typed prefab through the composition service.',
    ports: [
      ...flowPorts(spawnPrefab.ports.flowIn, spawnPrefab.ports.flowOut),
      entityPort(spawnPrefab.ports.entity, 'output'),
    ],
    propertySchema: PrefabProperties,
    propertyContract: { prefabId: 'asset UUID' },
    capabilities: ['assets', 'world.write'],
    reads: [{ resource: 'asset.prefab', scope: 'static' }],
    writes: [{ resource: 'world.entities', scope: 'static' }],
    effects: ['asset.read', 'world.write'],
    resultPersistence: 'none',
    liveness: 'on-flow',
  }),
]

export function registerWorldNodeContracts(registry: NodeRegistry): void {
  for (const definition of WORLD_NODE_DEFINITIONS) {
    registry.register(definition)
  }
}
