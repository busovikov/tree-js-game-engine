import { describe, expect, it } from 'vitest'
import { runPoolDiagnostic } from './pool-diagnostic.js'

describe('M10a playground pool diagnostic', () => {
  it('covers hierarchy, reset, exhaustion, cleanup, and long-run stable reuse', () => {
    const report = runPoolDiagnostic(10_000)

    expect(report).toEqual({
      hierarchyInactive: true,
      baselineRestored: true,
      exhaustedDeterministically: true,
      cleanupRan: true,
      longRunIterations: 10_000,
      allocatedEntities: 4,
      poolInstances: 2,
      activeAfterRun: 0,
    })
  })
})
