import { describe, beforeEach } from 'vitest'
import { runFlatGroundRaycastVehicleAssertions } from '../../physics/src/raycast-vehicle-suite.js'
import {
  createRapierPhysicsBackend,
  resetRapierPhysicsIds,
} from './index.js'

describe('@haku/physics-rapier RaycastVehicle (Rapier)', () => {
  beforeEach(() => {
    resetRapierPhysicsIds()
  })

  runFlatGroundRaycastVehicleAssertions(() => createRapierPhysicsBackend())
})
