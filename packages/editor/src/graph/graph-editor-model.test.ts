import {
  DIAGNOSTIC_GRAPH_IDS,
  compileDiagnosticGraph,
  createDiagnosticGraphAsset,
  createDiagnosticNodeRegistry,
} from '@haku/graph'
import { describe, expect, it } from 'vitest'
import {
  createGraphInspectorModel,
  searchGraphPalette,
} from './graph-editor-model.js'

describe('graph editor presentation model', () => {
  it('searches palette metadata without exposing registry implementation state', () => {
    const registry = createDiagnosticNodeRegistry()

    expect(searchGraphPalette(registry, 'checkpoint')).toEqual([
      expect.objectContaining({
        id: DIAGNOSTIC_GRAPH_IDS.nodeTypes.checkpoint,
        name: 'Checkpoint',
        category: 'M07 Diagnostic',
      }),
    ])
    expect(searchGraphPalette(registry, 'missing')).toEqual([])
  })

  it('projects properties, diagnostics, async choices, and physics rejection for navigation', () => {
    const asset = createDiagnosticGraphAsset()
    const compiled = compileDiagnosticGraph()
    const model = createGraphInspectorModel(
      asset,
      createDiagnosticNodeRegistry(),
      compiled,
      DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
    )

    expect(model.selectedNode?.properties).toEqual({})
    expect(model.checkpoint).toMatchObject({
      eligible: false,
      dynamicPhysicsRejected: true,
      asyncPolicies: [
        expect.objectContaining({
          supported: expect.arrayContaining(['wait', 'restart', 'reject']),
        }),
      ],
    })
    expect(model.diagnostics.every((item) => item.navigateTo.nodeId)).toBe(true)
  })
})
