import { z } from 'zod'
import { compileGraph, type GraphCompileResult } from './compiler.js'
import { GraphAssetSchema, type GraphAsset } from './graph-schema.js'
import {
  ASYNC_CHECKPOINT_POLICIES,
  NodeRegistry,
  defineNode,
  type NodeDefinitionInput,
} from './node-registry.js'
import { createBuiltinTypeRegistry } from './type-registry.js'

const uid = (value: number): string =>
  `73000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

export const DIAGNOSTIC_GRAPH_IDS = {
  graph: uid(1),
  nodeTypes: {
    start: uid(10),
    dynamicRead: uid(11),
    checkpoint: uid(12),
    markWorld: uid(13),
    async: uid(14),
  },
  ports: {
    startOut: uid(100),
    dynamicIn: uid(101),
    dynamicOut: uid(102),
    checkpointIn: uid(103),
    checkpointOut: uid(104),
    markIn: uid(105),
    asyncIn: uid(106),
    asyncOut: uid(107),
  },
  nodes: {
    mainStart: uid(200),
    dynamicRead: uid(201),
    checkpoint: uid(202),
    markWorld: uid(203),
    asyncStart: uid(204),
    async: uid(205),
  },
  callsites: {
    mainStartOut: uid(300),
    dynamicIn: uid(301),
    dynamicOut: uid(302),
    checkpointIn: uid(303),
    checkpointOut: uid(304),
    markIn: uid(305),
    asyncStartOut: uid(306),
    asyncIn: uid(307),
    asyncOut: uid(308),
  },
  connections: {
    startDynamic: uid(400),
    dynamicCheckpoint: uid(401),
    checkpointMark: uid(402),
    startAsync: uid(403),
    asyncCheckpoint: uid(404),
  },
} as const

function nodeDefinition(
  input: Pick<NodeDefinitionInput, 'id' | 'name' | 'ports'> &
    Partial<Omit<NodeDefinitionInput, 'id' | 'name' | 'ports'>>,
) {
  return defineNode({
    version: '1',
    category: 'M07 Diagnostic',
    description: 'Built-in M07 compiler/runtime/editor diagnostic node',
    kind: 'builtin',
    typeParameters: [],
    propertySchema: z.object({}).strict(),
    propertyContract: {},
    domains: ['FrameGameplay'],
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    resultPersistence: 'none',
    liveness: 'on-flow',
    exportedState: [],
    ...input,
  })
}

export function createDiagnosticNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry()
  registry.register(nodeDefinition({
    id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.start,
    name: 'Start',
    ports: [{
      id: DIAGNOSTIC_GRAPH_IDS.ports.startOut,
      name: 'Next',
      kind: 'flow',
      direction: 'output',
    }],
    liveness: 'always',
  }))
  registry.register(nodeDefinition({
    id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.dynamicRead,
    name: 'Read Dynamic Body',
    ports: [
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.dynamicIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.dynamicOut,
        name: 'Next',
        kind: 'flow',
        direction: 'output',
      },
    ],
    capabilities: ['world.read'],
    reads: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
    effects: ['world.read'],
  }))
  registry.register(nodeDefinition({
    id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.checkpoint,
    name: 'Checkpoint',
    ports: [
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.checkpointIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.checkpointOut,
        name: 'Next',
        kind: 'flow',
        direction: 'output',
      },
    ],
    checkpointRole: 'create',
    capabilities: ['world.read'],
    reads: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
    effects: ['world.read'],
  }))
  registry.register(nodeDefinition({
    id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.markWorld,
    name: 'Mark World',
    ports: [{
      id: DIAGNOSTIC_GRAPH_IDS.ports.markIn,
      name: 'In',
      kind: 'flow',
      direction: 'input',
    }],
    propertySchema: z.object({ tag: z.string().min(1) }).strict(),
    propertyContract: { tag: 'string' },
    capabilities: ['world.write'],
    writes: [{ resource: 'world.tags', scope: 'static' }],
    effects: ['world.write'],
  }))
  registry.register(nodeDefinition({
    id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.async,
    name: 'Async Policy Probe',
    ports: [
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.asyncIn,
        name: 'In',
        kind: 'flow',
        direction: 'input',
      },
      {
        id: DIAGNOSTIC_GRAPH_IDS.ports.asyncOut,
        name: 'Next',
        kind: 'flow',
        direction: 'output',
      },
    ],
    execution: 'async',
    asyncCheckpointPolicies: ASYNC_CHECKPOINT_POLICIES,
  }))
  return registry
}

function callsite(
  id: string,
  port: string,
  direction: 'input' | 'output',
) {
  return { id, port, direction, kind: 'flow' as const }
}

export function createDiagnosticGraphAsset(): GraphAsset {
  return GraphAssetSchema.parse({
    schemaVersion: 1,
    graph: {
      id: DIAGNOSTIC_GRAPH_IDS.graph,
      name: 'M07 Diagnostic',
      nodes: [
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.mainStart,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.start,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.mainStartOut,
              DIAGNOSTIC_GRAPH_IDS.ports.startOut,
              'output',
            ),
          ],
          properties: {},
          layout: { x: 0, y: 0, label: 'Runtime Start' },
          domain: 'FrameGameplay',
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.dynamicRead,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.dynamicRead,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.dynamicIn,
              DIAGNOSTIC_GRAPH_IDS.ports.dynamicIn,
              'input',
            ),
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.dynamicOut,
              DIAGNOSTIC_GRAPH_IDS.ports.dynamicOut,
              'output',
            ),
          ],
          properties: {},
          layout: { x: 220, y: 0, label: 'Dynamic Physics Read' },
          domain: 'FrameGameplay',
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.checkpoint,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.checkpointIn,
              DIAGNOSTIC_GRAPH_IDS.ports.checkpointIn,
              'input',
            ),
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.checkpointOut,
              DIAGNOSTIC_GRAPH_IDS.ports.checkpointOut,
              'output',
            ),
          ],
          properties: {},
          layout: { x: 460, y: 0, label: 'Checkpoint (rejected)' },
          domain: 'FrameGameplay',
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.markWorld,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.markWorld,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.markIn,
              DIAGNOSTIC_GRAPH_IDS.ports.markIn,
              'input',
            ),
          ],
          properties: { tag: 'm07-diagnostic-ran' },
          layout: { x: 700, y: 0, label: 'Mark World' },
          domain: 'FrameGameplay',
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.asyncStart,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.start,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.asyncStartOut,
              DIAGNOSTIC_GRAPH_IDS.ports.startOut,
              'output',
            ),
          ],
          properties: {},
          layout: { x: 0, y: 180, label: 'Policy Start' },
          domain: 'FrameGameplay',
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.nodes.async,
          type: DIAGNOSTIC_GRAPH_IDS.nodeTypes.async,
          version: '1',
          callsites: [
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.asyncIn,
              DIAGNOSTIC_GRAPH_IDS.ports.asyncIn,
              'input',
            ),
            callsite(
              DIAGNOSTIC_GRAPH_IDS.callsites.asyncOut,
              DIAGNOSTIC_GRAPH_IDS.ports.asyncOut,
              'output',
            ),
          ],
          properties: {},
          layout: { x: 220, y: 180, label: 'Async Policies' },
          domain: 'FrameGameplay',
        },
      ],
      connections: [
        {
          id: DIAGNOSTIC_GRAPH_IDS.connections.startDynamic,
          from: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.mainStart,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.mainStartOut,
          },
          to: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.dynamicRead,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.dynamicIn,
          },
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.connections.dynamicCheckpoint,
          from: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.dynamicRead,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.dynamicOut,
          },
          to: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.checkpointIn,
          },
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.connections.checkpointMark,
          from: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.checkpointOut,
          },
          to: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.markWorld,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.markIn,
          },
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.connections.startAsync,
          from: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.asyncStart,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.asyncStartOut,
          },
          to: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.async,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.asyncIn,
          },
        },
        {
          id: DIAGNOSTIC_GRAPH_IDS.connections.asyncCheckpoint,
          from: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.async,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.asyncOut,
          },
          to: {
            node: DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
            callsite: DIAGNOSTIC_GRAPH_IDS.callsites.checkpointIn,
          },
        },
      ],
      publicInterface: { ports: [] },
      metadata: { purpose: 'compiler-runtime-world-editor-diagnostic' },
    },
  })
}

export function compileDiagnosticGraph(): GraphCompileResult {
  return compileGraph(createDiagnosticGraphAsset(), {
    nodes: createDiagnosticNodeRegistry(),
    types: createBuiltinTypeRegistry(),
  })
}
