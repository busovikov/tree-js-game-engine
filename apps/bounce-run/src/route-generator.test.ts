import { describe, expect, it } from 'vitest'
import { generateBounceRunRoute } from './route-generator.js'

describe('Bounce Run route generator', () => {
  it('returns the same complete platform sequence and decision log for the same seed and config', () => {
    const config = Object.freeze({ seed: 0x5eed, platformCount: 64 })

    const first = generateBounceRunRoute(config)
    const second = generateBounceRunRoute(config)

    expect(first.platforms).toEqual(second.platforms)
    expect(first.decisionLog).toEqual(second.decisionLog)
  })
})
