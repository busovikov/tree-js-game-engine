import { z } from 'zod'
import {
  NUMBER_TYPE,
  STRING_TYPE,
  createBuiltinTypeRegistry,
  defineNode,
  namedType,
  NodeRegistry,
} from '@haku/graph'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '../commands/command-bus.js'
import { GraphAuthoringSession } from './graph-authoring-session.js'

const uid = (value: number): string =>
  `71000000-0000-4000-8000-${value.toString().padStart(12, '0')}`

const sourceDefinition = defineNode({
  id: uid(1),
  version: '1',
  name: 'Number Source',
  category: 'Values',
  description: 'Emits a number',
  kind: 'builtin',
  typeParameters: [],
  ports: [
    {
      id: uid(101),
      name: 'Value',
      kind: 'data',
      direction: 'output',
      type: namedType(NUMBER_TYPE),
    },
  ],
  propertySchema: z.object({ value: z.number() }),
  propertyContract: { value: 'number' },
  domains: ['FrameGameplay'],
  capabilities: [],
  reads: [],
  writes: [],
  effects: [],
  execution: 'sync',
  checkpoint: 'safe',
  resultPersistence: 'none',
  liveness: 'pure',
  exportedState: [],
})

const sinkDefinition = defineNode({
  id: uid(2),
  version: '1',
  name: 'String Sink',
  category: 'Debug',
  description: 'Consumes a string',
  kind: 'builtin',
  typeParameters: [],
  ports: [
    {
      id: uid(102),
      name: 'Value',
      kind: 'data',
      direction: 'input',
      type: namedType(STRING_TYPE),
    },
  ],
  propertySchema: z.object({ prefix: z.string() }),
  propertyContract: { prefix: 'string' },
  domains: ['FrameGameplay'],
  capabilities: [],
  reads: [],
  writes: [],
  effects: [],
  execution: 'sync',
  checkpoint: 'safe',
  resultPersistence: 'none',
  liveness: 'pure',
  exportedState: [],
})

describe('Haku graph authoring commands', () => {
  let commands: CommandBus
  let session: GraphAuthoringSession
  let nodes: NodeRegistry

  beforeEach(() => {
    commands = new CommandBus()
    nodes = new NodeRegistry()
    nodes.register(sourceDefinition)
    nodes.register(sinkDefinition)
    session = new GraphAuthoringSession(commands, {
      readText: async () => '',
      writeText: async () => undefined,
    }, {
      nodes,
      types: createBuiltinTypeRegistry(),
      uuid: (() => {
        let next = 1000
        return () => uid(next++)
      })(),
    })
    session.create('graphs/commands.graph.json', 'Commands', uid(999))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('invokes the browser UUID generator with its crypto receiver', () => {
    let next = 2000
    const browserCrypto = {
      randomUUID() {
        if (this !== browserCrypto) throw new TypeError('Illegal invocation')
        return uid(next++)
      },
    }
    vi.stubGlobal('crypto', browserCrypto)
    const browserSession = new GraphAuthoringSession(commands, {
      readText: async () => '',
      writeText: async () => undefined,
    }, {
      nodes,
      types: createBuiltinTypeRegistry(),
    })
    browserSession.create('graphs/browser.graph.json', 'Browser', uid(1999))

    expect(() => browserSession.addNode(
      sourceDefinition.contract.id,
      { x: 10, y: 20 },
      { value: 4 },
    )).not.toThrow()
  })

  it('adds typed palette nodes and updates layout/properties through undoable commands', () => {
    const source = session.addNode(sourceDefinition.contract.id, { x: 10, y: 20 }, { value: 4 })

    session.moveNodes([{ nodeId: source, x: 30, y: 40 }])
    session.updateNodeProperties(source, { value: 8 })

    expect(session.asset!.graph.nodes[0]).toMatchObject({
      id: source,
      properties: { value: 8 },
      layout: { x: 30, y: 40 },
    })

    commands.undo()
    expect(session.asset!.graph.nodes[0]!.properties).toEqual({ value: 4 })
    commands.undo()
    expect(session.asset!.graph.nodes[0]!.layout).toMatchObject({ x: 10, y: 20 })
    commands.redo()
    expect(session.asset!.graph.nodes[0]!.layout).toMatchObject({ x: 30, y: 40 })
  })

  it('blocks incompatible connections before save while leaving compile authoritative', () => {
    const source = session.addNode(sourceDefinition.contract.id, { x: 0, y: 0 }, { value: 1 })
    const sink = session.addNode(sinkDefinition.contract.id, { x: 200, y: 0 }, { prefix: 'x' })
    const sourcePort = session.asset!.graph.nodes.find((node) => node.id === source)!.callsites[0]!.id
    const sinkPort = session.asset!.graph.nodes.find((node) => node.id === sink)!.callsites[0]!.id

    expect(session.canConnect(
      { node: source, callsite: sourcePort },
      { node: sink, callsite: sinkPort },
    )).toEqual({
      valid: false,
      reason: 'Incompatible data types',
    })
    expect(() => session.connect(
      { node: source, callsite: sourcePort },
      { node: sink, callsite: sinkPort },
    )).toThrow('Incompatible data types')
    expect(session.asset!.graph.connections).toEqual([])

    const compiled = session.compile()
    expect(compiled.plan?.graphId).toBe(session.asset!.graph.id)
    expect(compiled.diagnostics.map((item) => item.code)).toEqual([
      'graph.dead-node',
      'graph.dead-node',
    ])
  })

  it('copies, pastes, duplicates, multi-selects, and deletes without UI-library state', () => {
    const first = session.addNode(sourceDefinition.contract.id, { x: 0, y: 0 }, { value: 1 })
    const second = session.addNode(sourceDefinition.contract.id, { x: 100, y: 0 }, { value: 2 })

    session.selectNodes([first, second])
    session.copySelection()
    const pasted = session.paste({ x: 20, y: 30 })
    expect(pasted).toHaveLength(2)
    expect(session.asset!.graph.nodes).toHaveLength(4)

    const duplicated = session.duplicateSelection()
    expect(duplicated).toHaveLength(2)
    expect(session.asset!.graph.nodes).toHaveLength(6)

    session.deleteSelection()
    expect(session.asset!.graph.nodes).toHaveLength(4)
    commands.undo()
    expect(session.asset!.graph.nodes).toHaveLength(6)
    expect(JSON.stringify(session.asset)).not.toMatch(/reactFlow|positionAbsolute|selected|dragging/)
  })
})
