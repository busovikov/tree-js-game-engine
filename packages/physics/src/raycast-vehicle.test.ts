import { describe, beforeEach } from 'vitest'
import { StubPhysicsBackend, resetStubPhysicsIds } from './index.js'
import { runFlatGroundRaycastVehicleAssertions } from './raycast-vehicle-suite.js'

describe('@haku/physics RaycastVehicle (stub)', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  runFlatGroundRaycastVehicleAssertions(() => new StubPhysicsBackend())
})
