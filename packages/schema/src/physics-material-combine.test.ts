import { describe, expect, it } from 'vitest'
import { physicsMaterialCombineToRapier } from './physics-material-combine.js'

describe('physicsMaterialCombineToRapier', () => {
  it('maps combine modes to Rapier enum values', () => {
    expect(physicsMaterialCombineToRapier('average')).toBe(0)
    expect(physicsMaterialCombineToRapier('min')).toBe(1)
    expect(physicsMaterialCombineToRapier('multiply')).toBe(2)
    expect(physicsMaterialCombineToRapier('max')).toBe(3)
  })
})
