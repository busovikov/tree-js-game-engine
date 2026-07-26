import { describe, expect, it } from 'vitest'
import {
  GraphAssetSchema,
  GraphDocumentSchema,
  type GraphAsset,
} from './index.js'

const ids = {
  graph: '40000000-0000-4000-8000-000000000001',
  node: '40000000-0000-4000-8000-000000000002',
  nodeType: '40000000-0000-4000-8000-000000000003',
  callsite: '40000000-0000-4000-8000-000000000004',
  port: '40000000-0000-4000-8000-000000000005',
  publicPort: '40000000-0000-4000-8000-000000000006',
}

function graphAsset(): GraphAsset {
  return {
    schemaVersion: 1,
    graph: {
      id: ids.graph,
      name: 'Headless graph',
      nodes: [
        {
          id: ids.node,
          type: ids.nodeType,
          version: '1.0.0',
          callsites: [
            {
              id: ids.callsite,
              port: ids.port,
              kind: 'flow',
              direction: 'output',
            },
          ],
          properties: {},
          layout: { x: 24, y: 48, collapsed: false },
        },
      ],
      connections: [],
      publicInterface: {
        ports: [
          {
            id: ids.publicPort,
            name: 'Start',
            kind: 'trigger',
            direction: 'input',
          },
        ],
      },
      metadata: { purpose: 'roundtrip' },
    },
  }
}

describe('graph asset JSON schema', () => {
  it('roundtrips graph, node/callsite, public interface, and subgraph data as headless JSON', () => {
    const source = graphAsset()
    const json = JSON.stringify(source)
    const parsed = GraphAssetSchema.parse(JSON.parse(json))

    expect(parsed).toEqual(source)
    expect(GraphDocumentSchema.parse(parsed.graph)).toEqual(source.graph)
    expect(json).not.toMatch(/reactFlow|positionAbsolute|handleBounds|selected|dragging/)
  })

  it('rejects UI-library node state instead of accepting it as graph data', () => {
    const source = graphAsset()
    const node = source.graph.nodes[0]

    expect(() =>
      GraphAssetSchema.parse({
        ...source,
        graph: {
          ...source.graph,
          nodes: [
            {
              ...node,
              selected: true,
              positionAbsolute: { x: 24, y: 48 },
            },
          ],
        },
      }),
    ).toThrow()
  })

  it('rejects UI-library objects nested inside generic graph metadata', () => {
    const source = graphAsset()

    expect(() =>
      GraphAssetSchema.parse({
        ...source,
        graph: {
          ...source.graph,
          metadata: {
            adapterState: {
              reactFlow: {
                nodes: [],
                edges: [],
              },
            },
          },
        },
      }),
    ).toThrow(/UI-library field/)
  })
})
