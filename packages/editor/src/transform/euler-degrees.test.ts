import { describe, expect, it } from 'vitest'
import { eulerAxisToQuat, quatToEulerDegrees, snapDegree } from './euler-degrees.js'

describe('snapDegree', () => {
  it('snaps quaternion noise to integers', () => {
    expect(snapDegree(89.999999999)).toBe(90)
    expect(snapDegree(-45.0000001)).toBe(-45)
  })

  it('preserves fractional degrees on the scrub grid', () => {
    expect(snapDegree(12.3456)).toBe(12.346)
  })
})

describe('rotation euler roundtrip', () => {
  it('keeps typed 90 on X after quat storage', () => {
    const q = eulerAxisToQuat(0, 90, [0, 0, 0, 1])
    const euler = quatToEulerDegrees(q)
    expect(euler[0]).toBe(90)
    expect(euler[1]).toBe(0)
    expect(euler[2]).toBe(0)
  })

  it('increments one axis independently', () => {
    const q = eulerAxisToQuat(1, 45, [0, 0, 0, 1])
    const next = eulerAxisToQuat(1, 45.01, q)
    const euler = quatToEulerDegrees(next)
    expect(euler[1]).toBe(45.01)
  })
})
