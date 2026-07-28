import { TagComponent, World } from '@haku/core'
import {
  DIAGNOSTIC_GRAPH_IDS,
  compileDiagnosticGraph,
} from '@haku/graph'
import { describe, expect, it } from 'vitest'
import { runDiagnosticGraphPlan } from './diagnostic-graph.js'

describe('M07 diagnostic graph', () => {
  it('exposes async policy and dynamic-physics checkpoint diagnostics', () => {
    const compiled = compileDiagnosticGraph()
    const checkpoint = compiled.plan!.checkpoints.find(
      (item) => item.nodeId === DIAGNOSTIC_GRAPH_IDS.nodes.checkpoint,
    )

    expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([])
    expect(checkpoint).toMatchObject({
      eligible: false,
      dependencies: [
        expect.objectContaining({
          kind: 'dynamic-physics',
          resource: 'physics.dynamic-body',
        }),
      ],
    })
    expect(checkpoint!.asyncPolicies).toEqual([
      expect.objectContaining({
        nodeId: DIAGNOSTIC_GRAPH_IDS.nodes.async,
        supported: [
          'wait',
          'restart',
          'resume',
          'reconnect',
          'materialized',
          'cancel-fallback',
          'reject',
        ],
      }),
    ])
  })

  it('runs the same compiled plan headlessly into independent worlds', () => {
    const plan = compileDiagnosticGraph().plan!
    const first = new World()
    const second = new World()

    const firstRun = runDiagnosticGraphPlan(plan, first)
    const secondRun = runDiagnosticGraphPlan(plan, second)

    expect(firstRun.planFingerprint).toBe(plan.planFingerprint)
    expect(secondRun.planFingerprint).toBe(plan.planFingerprint)
    expect(
      first.query(TagComponent).flatMap(
        (entity) => first.getComponent(entity, TagComponent)?.tags ?? [],
      ),
    ).toContain('m07-diagnostic-ran')
    expect(
      second.query(TagComponent).flatMap(
        (entity) => second.getComponent(entity, TagComponent)?.tags ?? [],
      ),
    ).toContain('m07-diagnostic-ran')
    expect(firstRun.trace.at(-1)?.nodeId).toBe(DIAGNOSTIC_GRAPH_IDS.nodes.markWorld)
  })
})
