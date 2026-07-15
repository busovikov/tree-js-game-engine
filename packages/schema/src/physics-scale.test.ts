import { describe, expect, it } from 'vitest'
import { isNonUniformScale } from './physics-scale.js'

describe('isNonUniformScale', () => {
  it('returns false for uniform scale', () => {
    expect(isNonUniformScale([2, 2, 2])).toBe(false)
  })

  it('returns true for non-uniform scale', () => {
    expect(isNonUniformScale([2, 1, 2])).toBe(true)
  })
})
