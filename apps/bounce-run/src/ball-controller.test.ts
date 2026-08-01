import { describe, expect, it } from 'vitest'
import { applyBallControlStep, bounceVelocityForHeight } from './ball-controller.js'

describe('fixed-tick ball controller', () => {
  it('sets an analytic bounce velocity independent of render batching', () => {
    const jumpVelocity = bounceVelocityForHeight(3.2, 18)
    const simulate = (frameDt: number): number => {
      let velocity = jumpVelocity
      let height = 0
      let accumulator = 0
      for (let frame = 0; frame < Math.ceil(1.5 / frameDt); frame++) {
        accumulator += frameDt
        while (accumulator >= 1 / 60 - 1e-9) {
          velocity -= 18 / 60
          height += velocity / 60
          accumulator -= 1 / 60
        }
      }
      return height
    }

    expect(jumpVelocity).toBeCloseTo(Math.sqrt(2 * 18 * 3.2), 10)
    expect(simulate(1 / 30)).toBeCloseTo(simulate(1 / 60), 10)
    expect(simulate(3 / 60)).toBeCloseTo(simulate(1 / 60), 10)
  })

  it('preserves forward speed, clamps lateral speed, and applies bounce once', () => {
    const next = applyBallControlStep({
      velocity: [0, -5, 1],
      lateralInput: -1,
      landed: true,
      dt: 1 / 60,
      forwardSpeed: 8,
      lateralSpeed: 5,
      lateralResponsiveness: 18,
      bounceHeight: 3.2,
      gravity: 18,
    })

    expect(next[0]).toBeCloseTo(-5 * (1 - Math.exp(-18 / 60)), 10)
    expect(next[1]).toBe(bounceVelocityForHeight(3.2, 18))
    expect(next[2]).toBe(8)
  })

  it('rejects invalid tuning values instead of producing unstable velocity', () => {
    expect(() => bounceVelocityForHeight(-1, 18)).toThrow(
      'bounceHeight must be a positive finite number',
    )
  })
})
