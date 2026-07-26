import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  BOOL_TYPE,
  NodeRegistry,
  NUMBER_TYPE,
  STRING_TYPE,
  compileGraph,
  createBuiltinTypeRegistry,
  defineNode,
  genericType,
  isExecutionPlanCompatible,
  namedType,
  type GraphAsset,
  type NodeDefinition,
  type NodePortInput,
} from './index.js'

const uid = (value: number): string =>
  `43000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

function definition(
  id: number,
  ports: readonly NodePortInput[],
  options: Partial<Parameters<typeof defineNode>[0]> = {},
): NodeDefinition {
  return defineNode({
    id: uid(id),
    version: '1',
    name: `Node${id}`,
    category: 'Test',
    description: 'Compiler fixture',
    kind: 'builtin',
    typeParameters: [],
    ports,
    propertySchema: z.object({}).strict(),
    propertyContract: { kind: 'object', fields: [] },
    domains: ['FixedGameplay'],
    capabilities: [],
    reads: [],
    writes: [],
    effects: [],
    execution: 'sync',
    checkpoint: 'safe',
    resultPersistence: 'none',
    liveness: 'always',
    exportedState: [],
    ...options,
  })
}

function graph(
  nodes: GraphAsset['graph']['nodes'] = [],
  connections: GraphAsset['graph']['connections'] = [],
): GraphAsset {
  return {
    schemaVersion: 1,
    graph: {
      id: uid(900),
      name: 'Compiler golden',
      nodes,
      connections,
      publicInterface: { ports: [] },
      metadata: {},
    },
  }
}

function node(
  id: number,
  type: number,
  callsites: GraphAsset['graph']['nodes'][number]['callsites'],
  domain = 'FixedGameplay',
  properties: Record<string, unknown> = {},
): GraphAsset['graph']['nodes'][number] {
  return {
    id: uid(id),
    type: uid(type),
    version: '1',
    callsites,
    properties,
    layout: { x: id, y: 0 },
    domain,
  }
}

function callsite(
  id: number,
  port: number,
  kind: 'flow' | 'event' | 'trigger' | 'data',
  direction: 'input' | 'output',
  type?: ReturnType<typeof namedType>,
): GraphAsset['graph']['nodes'][number]['callsites'][number] {
  return type === undefined
    ? { id: uid(id), port: uid(port), kind: kind as 'flow', direction }
    : { id: uid(id), port: uid(port), kind: kind as 'data', direction, type }
}

function connection(
  id: number,
  fromNode: number,
  fromCallsite: number,
  toNode: number,
  toCallsite: number,
): GraphAsset['graph']['connections'][number] {
  return {
    id: uid(id),
    from: { node: uid(fromNode), callsite: uid(fromCallsite) },
    to: { node: uid(toNode), callsite: uid(toCallsite) },
  }
}

describe('headless graph compiler', () => {
  it('compiles an empty graph into a deterministic compatible plan', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()

    const first = compileGraph(graph(), { types, nodes })
    const second = compileGraph(graph(), { types, nodes })

    expect(first.diagnostics).toEqual([])
    expect(first.plan).toEqual(second.plan)
    expect(first.plan?.nodes).toEqual([])
    expect(isExecutionPlanCompatible(first.plan!, types, nodes)).toBe(true)
  })

  it('infers generic data ports and emits queue operations for cross-domain events', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(1, [
        { id: uid(11), name: 'Value', kind: 'data', direction: 'output', type: namedType(NUMBER_TYPE) },
      ]),
    )
    nodes.register(
      definition(
        2,
        [{ id: uid(12), name: 'Value', kind: 'data', direction: 'input', type: genericType('T') }],
        { typeParameters: ['T'] },
      ),
    )
    nodes.register(
      definition(3, [
        { id: uid(13), name: 'Changed', kind: 'event', direction: 'output', type: namedType(NUMBER_TYPE) },
      ]),
    )
    nodes.register(
      definition(
        4,
        [{ id: uid(14), name: 'Changed', kind: 'event', direction: 'input', type: namedType(NUMBER_TYPE) }],
        { domains: ['FrameGameplay'], liveness: 'on-event' },
      ),
    )
    nodes.register(
      definition(9, [
        { id: uid(19), name: 'Next', kind: 'flow', direction: 'output' },
      ]),
    )
    nodes.register(
      definition(
        10,
        [{ id: uid(20), name: 'Next', kind: 'flow', direction: 'input' }],
        { domains: ['FrameGameplay'] },
      ),
    )
    const asset = graph(
      [
        node(101, 1, [callsite(201, 11, 'data', 'output', namedType(NUMBER_TYPE))]),
        node(102, 2, [callsite(202, 12, 'data', 'input', namedType(NUMBER_TYPE))]),
        node(103, 3, [callsite(203, 13, 'event', 'output', namedType(NUMBER_TYPE))]),
        node(
          104,
          4,
          [callsite(204, 14, 'event', 'input', namedType(NUMBER_TYPE))],
          'FrameGameplay',
        ),
        node(105, 9, [callsite(205, 19, 'flow', 'output')]),
        node(
          106,
          10,
          [callsite(206, 20, 'flow', 'input')],
          'FrameGameplay',
        ),
      ],
      [
        connection(301, 101, 201, 102, 202),
        connection(302, 103, 203, 104, 204),
        connection(303, 105, 205, 106, 206),
      ],
    )

    const result = compileGraph(asset, { types, nodes })

    expect(result.diagnostics).toEqual([])
    expect(result.plan?.connections.map((item) => item.operation)).toEqual([
      'data-dependency',
      'queue-event',
      'queue-flow',
    ])
    expect(result.plan?.nodes.find((item) => item.id === uid(102))?.typeArguments).toEqual({
      T: namedType(NUMBER_TYPE),
    })
  })

  it('rejects flow/data separation and incompatible data without implicit conversion', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(1, [
        { id: uid(11), name: 'Value', kind: 'data', direction: 'output', type: namedType(NUMBER_TYPE) },
      ]),
    )
    nodes.register(
      definition(2, [
        { id: uid(12), name: 'In', kind: 'flow', direction: 'input' },
        { id: uid(13), name: 'Text', kind: 'data', direction: 'input', type: namedType(STRING_TYPE) },
      ]),
    )
    const source = node(101, 1, [
      callsite(201, 11, 'data', 'output', namedType(NUMBER_TYPE)),
    ])
    const target = node(102, 2, [
      callsite(202, 12, 'flow', 'input'),
      callsite(203, 13, 'data', 'input', namedType(STRING_TYPE)),
    ])

    const separated = compileGraph(
      graph([source, target], [connection(301, 101, 201, 102, 202)]),
      { types, nodes },
    )
    const mismatched = compileGraph(
      graph([source, target], [connection(302, 101, 201, 102, 203)]),
      { types, nodes },
    )

    expect(separated.diagnostics[0]).toMatchObject({
      code: 'connection.kind-mismatch',
      location: {
        graphId: uid(900),
        nodeId: uid(102),
        portId: uid(12),
        callsiteId: uid(202),
        connectionId: uid(301),
      },
    })
    expect(mismatched.diagnostics[0]).toMatchObject({
      code: 'connection.type-mismatch',
      location: {
        graphId: uid(900),
        nodeId: uid(102),
        portId: uid(13),
        callsiteId: uid(203),
        connectionId: uid(302),
      },
    })
    expect(mismatched.diagnostics[0].causalChain).toHaveLength(2)
  })

  it('rejects data cycles and domains outside a node contract', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(1, [
        { id: uid(11), name: 'In', kind: 'data', direction: 'input', type: namedType(NUMBER_TYPE) },
        { id: uid(12), name: 'Out', kind: 'data', direction: 'output', type: namedType(NUMBER_TYPE) },
      ]),
    )
    const first = node(101, 1, [
      callsite(201, 11, 'data', 'input', namedType(NUMBER_TYPE)),
      callsite(202, 12, 'data', 'output', namedType(NUMBER_TYPE)),
    ])
    const second = node(102, 1, [
      callsite(203, 11, 'data', 'input', namedType(NUMBER_TYPE)),
      callsite(204, 12, 'data', 'output', namedType(NUMBER_TYPE)),
    ])
    const cycle = compileGraph(
      graph(
        [first, second],
        [
          connection(301, 101, 202, 102, 203),
          connection(302, 102, 204, 101, 201),
        ],
      ),
      { types, nodes },
    )
    const wrongDomain = compileGraph(
      graph([
        node(
          101,
          1,
          [
            callsite(201, 11, 'data', 'input', namedType(NUMBER_TYPE)),
            callsite(202, 12, 'data', 'output', namedType(NUMBER_TYPE)),
          ],
          'FrameGameplay',
        ),
      ]),
      { types, nodes },
    )

    expect(cycle.diagnostics).toEqual([
      expect.objectContaining({ code: 'graph.data-cycle' }),
    ])
    expect(wrongDomain.diagnostics[0]).toMatchObject({
      code: 'node.domain-not-allowed',
      location: { graphId: uid(900), nodeId: uid(101) },
    })
  })

  it('reports duplicate identities and unknown nodes and ports exactly', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(definition(1, []))
    const duplicate = node(101, 1, [])
    const result = compileGraph(graph([
      duplicate,
      duplicate,
      node(102, 999, []),
    ]), { types, nodes })

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'graph.duplicate-node',
      'registry.unknown-node-type',
    ])
    expect(result.diagnostics[0].location).toEqual({
      graphId: uid(900),
      nodeId: uid(101),
    })
  })

  it('compiles registered subgraphs and reports missing subgraphs with a causal chain', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(5, [], {
        kind: 'subgraph',
        propertySchema: z.object({
          graph: z.object({ $ref: z.string().uuid() }).strict(),
        }).strict(),
        propertyContract: { kind: 'subgraph-reference' },
      }),
    )
    const subgraphId = uid(700)
    const instance = node(101, 5, [], 'FixedGameplay', {
      graph: { $ref: subgraphId },
    })

    const positive = compileGraph(graph([instance]), {
      types,
      nodes,
      subgraphs: new Map([[subgraphId, graph()]]),
    })
    const negative = compileGraph(graph([instance]), { types, nodes })

    expect(positive.diagnostics).toEqual([])
    expect(positive.plan?.subgraphs).toEqual([
      { nodeId: uid(101), assetId: subgraphId, graphId: uid(900) },
    ])
    expect(negative.diagnostics[0]).toMatchObject({
      code: 'subgraph.unknown-asset',
      location: { graphId: uid(900), nodeId: uid(101) },
      causalChain: [
        { message: `graph ${uid(900)}`, location: { graphId: uid(900) } },
        {
          message: `subgraph call ${uid(101)}`,
          location: { graphId: uid(900), nodeId: uid(101) },
        },
      ],
    })

    const interfaceMismatch = compileGraph(graph([instance]), {
      types,
      nodes,
      subgraphs: new Map([
        [
          subgraphId,
          {
            ...graph(),
            graph: {
              ...graph().graph,
              publicInterface: {
                ports: [
                  {
                    id: uid(77),
                    name: 'Start',
                    kind: 'trigger',
                    direction: 'input',
                  },
                ],
              },
            },
          },
        ],
      ]),
    })
    expect(interfaceMismatch.diagnostics[0]).toMatchObject({
      code: 'subgraph.interface-mismatch',
      location: { graphId: uid(900), nodeId: uid(101), portId: uid(77) },
    })
  })

  it('enforces same-instance NodeRef targets and declared capabilities', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(6, [], {
        propertySchema: z.object({
          target: z.object({ node: z.string().uuid() }).strict(),
        }).strict(),
        propertyContract: { kind: 'node-ref' },
        effects: ['world.write'],
        capabilities: [],
      }),
    )
    const result = compileGraph(
      graph([
        node(101, 6, [], 'FixedGameplay', { target: { node: uid(999) } }),
      ]),
      { types, nodes },
    )

    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'node-ref.unknown-target',
      'node.missing-capability',
    ])
    expect(result.diagnostics[0].location).toEqual({
      graphId: uid(900),
      nodeId: uid(101),
    })
  })

  it('records effect causes and removes unreachable nodes through liveness analysis', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(7, [], {
        name: 'UnsafeQuery',
        reads: [{ resource: 'RigidBody', scope: 'dynamic' }],
        effects: ['unknown'],
      }),
    )
    nodes.register(
      definition(
        8,
        [{ id: uid(18), name: 'In', kind: 'flow', direction: 'input' }],
        { liveness: 'on-flow' },
      ),
    )
    const result = compileGraph(
      graph([
        node(101, 7, []),
        node(102, 8, [callsite(202, 18, 'flow', 'input')]),
      ]),
      { types, nodes },
    )

    expect(result.plan?.nodes.map((item) => item.id)).toEqual([uid(101)])
    expect(result.plan?.nodes[0].checkpoint).toEqual({
      eligible: false,
      causalChain: ['node UnsafeQuery', 'effect unknown', 'dynamic RigidBody read'],
    })
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'graph.dead-node',
        severity: 'warning',
        location: { graphId: uid(900), nodeId: uid(102) },
      }),
    ])
  })

  it('keeps pure data nodes only when a live node consumes them', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(
        9,
        [{ id: uid(19), name: 'Value', kind: 'data', direction: 'output', type: namedType(BOOL_TYPE) }],
        { liveness: 'pure' },
      ),
    )

    const result = compileGraph(
      graph([
        node(109, 9, [
          callsite(209, 19, 'data', 'output', namedType(BOOL_TYPE)),
        ]),
      ]),
      { types, nodes },
    )

    expect(result.plan?.nodes).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'graph.dead-node',
        location: { graphId: uid(900), nodeId: uid(109) },
      }),
    ])
  })

  it('invalidates a compiled plan when either registry contract changes', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(definition(1, []))
    const result = compileGraph(graph([node(101, 1, [])]), { types, nodes })

    const changedNodes = new NodeRegistry()
    changedNodes.register(definition(1, [], { version: '2' }))

    expect(isExecutionPlanCompatible(result.plan!, types, changedNodes)).toBe(false)
  })
})
