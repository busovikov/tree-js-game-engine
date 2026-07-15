import { describe, expect, it } from 'vitest'
import { StubPhysicsBackend } from '@haku/physics'
import { PhysicsQuerySystem } from './physics-query-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

describe('PhysicsQuerySystem', () => {
  it('delegates raycast to the active physics world', () => {
    const backend = new StubPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 1 })
    physicsSystem.setBackend(backend)
    const querySystem = new PhysicsQuerySystem(physicsSystem)

    expect(
      querySystem.raycast({
        origin: [0, 0, 0],
        direction: [0, -1, 0],
        maxDistance: 10,
      }),
    ).toBeNull()
  })
})
