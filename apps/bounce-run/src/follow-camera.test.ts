import { describe, expect, it } from 'vitest'
import { stepFollowCamera, type FollowCameraPose } from './follow-camera.js'

describe('Bounce Run follow camera', () => {
  it('converges consistently at 30 and 60 FPS', () => {
    const simulate = (dt: number) => {
      let pose: FollowCameraPose = {
        position: [0, 4, -8] as const,
        target: [0, 1, 2] as const,
      }
      for (let elapsed = 0; elapsed < 1 - 1e-9; elapsed += dt) {
        pose = stepFollowCamera(pose, [2, 3, 12], dt)
      }
      return pose
    }

    const at30 = simulate(1 / 30)
    const at60 = simulate(1 / 60)
    expect(at30.position[0]).toBeCloseTo(at60.position[0], 10)
    expect(at30.position[2]).toBeCloseTo(at60.position[2], 10)
    expect(at30.target[2]).toBeGreaterThan(12)
  })

  it('rejects invalid delta time instead of corrupting the camera pose', () => {
    expect(() =>
      stepFollowCamera({ position: [0, 4, -8], target: [0, 1, 2] }, [0, 1, 0], Number.NaN),
    ).toThrow('dt must be a positive finite number')
  })
})
