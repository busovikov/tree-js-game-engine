import { describe, expect, it } from 'vitest'
import { StubPhysicsBackend } from '@haku/physics'
import { PhysicsContactSystem } from './physics-contact-system.js'
import { PhysicsWorldSystem } from './physics-world-system.js'

describe('PhysicsContactSystem', () => {
  it('drains backend collision events after physics update', () => {
    const backend = new StubPhysicsBackend()
    const physicsSystem = new PhysicsWorldSystem({ fixedTimestep: 1 / 60, maxSubsteps: 1 })
    physicsSystem.setBackend(backend)
    const contactSystem = new PhysicsContactSystem(physicsSystem)

    contactSystem.update({} as never)
    expect(contactSystem.peekCollisionEvents()).toEqual([])
    expect(contactSystem.takeCollisionEvents()).toEqual([])
  })
})
