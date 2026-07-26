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
    expect(first.plan?.publicInterface).toEqual({ ports: [] })
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
    expect(result.plan?.nodes.find((item) => item.id === uid(102))).toMatchObject({
      execution: 'sync',
      exportedState: [],
      kind: 'builtin',
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

    nodes.register(definition(1, []))
    const valid = compileGraph(
      graph([
        node(101, 6, [], 'FixedGameplay', { target: { node: uid(102) } }),
        node(102, 1, []),
      ]),
      { types, nodes },
    )
    expect(valid.diagnostics.map((item) => item.code)).toEqual([
      'node.missing-capability',
    ])
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

  it('keeps an independent checkpoint eligible beside unrelated dynamic physics', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(20, [
        { id: uid(120), name: 'Next', kind: 'flow', direction: 'output' },
      ], {
        name: 'SafeCheckpoint',
        checkpointRole: 'create',
      }),
    )
    nodes.register(
      definition(21, [
        { id: uid(121), name: 'In', kind: 'flow', direction: 'input' },
      ], {
        name: 'SafeLogic',
        liveness: 'on-flow',
        writes: [{ resource: 'logic.score', scope: 'static' }],
      }),
    )
    nodes.register(
      definition(22, [], {
        name: 'UnrelatedDynamicBody',
        reads: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
      }),
    )

    const result = compileGraph(
      graph(
        [
          node(120, 20, [callsite(220, 120, 'flow', 'output')]),
          node(121, 21, [callsite(221, 121, 'flow', 'input')]),
          node(122, 22, []),
        ],
        [connection(320, 120, 220, 121, 221)],
      ),
      { types, nodes },
    )

    expect(result.diagnostics).toEqual([])
    expect(result.plan?.checkpointEligible).toBe(true)
    expect(result.plan?.checkpoints).toEqual([
      {
        nodeId: uid(120),
        eligible: true,
        stateScope: {
          nodes: [uid(120), uid(121)],
          resources: ['logic.score'],
          unbounded: false,
        },
        dependencies: [],
        asyncPolicies: [],
      },
    ])
  })

  it('rejects direct and transitive dynamic-physics reads with complete causal chains', () => {
    const types = createBuiltinTypeRegistry()
    const directNodes = new NodeRegistry()
    directNodes.register(
      definition(23, [], {
        name: 'DirectCheckpoint',
        checkpointRole: 'create',
        reads: [{ resource: 'physics.dynamic-body', scope: 'dynamic' }],
      }),
    )

    const direct = compileGraph(graph([node(123, 23, [])]), {
      types,
      nodes: directNodes,
    })

    expect(direct.plan?.checkpoints[0]).toMatchObject({
      eligible: false,
      dependencies: [
        {
          kind: 'dynamic-physics',
          nodeId: uid(123),
          resource: 'physics.dynamic-body',
          causalChain: [
            `checkpoint ${uid(123)}`,
            `node DirectCheckpoint (${uid(123)})`,
            'dynamic physics read physics.dynamic-body',
          ],
        },
      ],
    })

    const transitiveNodes = new NodeRegistry()
    transitiveNodes.register(
      definition(24, [
        { id: uid(124), name: 'Value', kind: 'data', direction: 'output', type: namedType(NUMBER_TYPE) },
      ], {
        name: 'DynamicQuery',
        reads: [{ resource: 'physics.query.dynamic', scope: 'dynamic' }],
        liveness: 'pure',
      }),
    )
    transitiveNodes.register(
      definition(25, [
        { id: uid(125), name: 'Value', kind: 'data', direction: 'input', type: namedType(NUMBER_TYPE) },
      ], {
        name: 'TransitiveCheckpoint',
        checkpointRole: 'create',
      }),
    )

    const transitive = compileGraph(
      graph(
        [
          node(124, 24, [
            callsite(224, 124, 'data', 'output', namedType(NUMBER_TYPE)),
          ]),
          node(125, 25, [
            callsite(225, 125, 'data', 'input', namedType(NUMBER_TYPE)),
          ]),
        ],
        [connection(324, 124, 224, 125, 225)],
      ),
      { types, nodes: transitiveNodes },
    )

    expect(transitive.plan?.checkpoints[0]).toMatchObject({
      eligible: false,
      dependencies: [
        {
          kind: 'dynamic-physics',
          nodeId: uid(124),
          resource: 'physics.query.dynamic',
          causalChain: [
            `checkpoint ${uid(125)}`,
            `data dependency ${uid(124)} -> ${uid(125)}`,
            `node DynamicQuery (${uid(124)})`,
            'dynamic physics read physics.query.dynamic',
          ],
        },
      ],
    })
  })

  it('rejects unknown effects and unprovable queries in Inspector checkpoint metadata', () => {
    const types = createBuiltinTypeRegistry()
    const nodes = new NodeRegistry()
    nodes.register(
      definition(26, [], {
        name: 'UnprovableCheckpoint',
        checkpointRole: 'create',
        reads: [{ resource: 'world.query.any', scope: 'unprovable' }],
        effects: ['external'],
      }),
    )

    const result = compileGraph(graph([node(126, 26, [])]), { types, nodes })

    expect(result.plan?.checkpointEligible).toBe(false)
    expect(result.plan?.checkpoints[0]).toEqual({
      nodeId: uid(126),
      eligible: false,
      stateScope: {
        nodes: [uid(126)],
        resources: ['world.query.any'],
        unbounded: false,
      },
      dependencies: [
        {
          kind: 'unknown-effect',
          nodeId: uid(126),
          effect: 'external',
          causalChain: [
            `checkpoint ${uid(126)}`,
            `node UnprovableCheckpoint (${uid(126)})`,
            'effect external',
          ],
        },
        {
          kind: 'unprovable-query',
          nodeId: uid(126),
          resource: 'world.query.any',
          causalChain: [
            `checkpoint ${uid(126)}`,
            `node UnprovableCheckpoint (${uid(126)})`,
            'unprovable query world.query.any',
          ],
        },
      ],
      asyncPolicies: [],
    })
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
