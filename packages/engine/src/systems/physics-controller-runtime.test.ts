import { describe, expect, it } from 'vitest'
import { PhysicsControllerComponent, TransformComponent, World } from '@haku/core'
import { physicsBodyHandle } from '@haku/physics'
import {
  updateArcadeVehicle,
  type TrackedArcadeVehicle,
} from './physics-controller-runtime.js'

const identityRotation: [number, number, number, number] = [0, 0, 0, 1]

function simulateArcadeSpeed(fps: 30 | 60 | 120): number {
  const world = new World()
  const carId = world.createEntity('Arcade car')
  world.addComponent(carId, TransformComponent, {
    position: [0, 0, 0],
    rotation: identityRotation,
    scale: [1, 1, 1],
  })
  world.addComponent(
    carId,
    PhysicsControllerComponent,
    PhysicsControllerComponent.schema.parse({
      type: 'arcade-vehicle',
    }),
  )

  const state: TrackedArcadeVehicle = { currentSpeed: 0, jumpCooldown: 0 }
  const tracked = new Map([[carId.value, state]])
  const inputs = new Map([[carId.value, { throttle: 1 }]])
  const bodyHandle = physicsBodyHandle('arcade-car')
  const physicsWorld = {
    raycast: () => ({
      body: bodyHandle,
      point: [0, 0, 0],
      normal: [0, 1, 0],
      distance: 1,
    }),
  } as never
  const physicsSystem = {
    getBodyHandle: () => bodyHandle,
    getBodyLinearVelocity: () => [0, 0, 0],
    setBodyLinearVelocity: () => {},
    getBodyAngularVelocity: () => [0, 0, 0],
    setBodyAngularVelocity: () => {},
  } as never

  for (let frame = 0; frame < fps; frame++) {
    updateArcadeVehicle(
      world,
      physicsWorld,
      physicsSystem,
      tracked,
      inputs,
      1 / fps,
    )
  }
  return state.currentSpeed
}

describe('updateArcadeVehicle', () => {
  it('produces equivalent one-second speed smoothing at 30/60/120 FPS', () => {
    const thirtyHz = simulateArcadeSpeed(30)
    const sixtyHz = simulateArcadeSpeed(60)
    const oneTwentyHz = simulateArcadeSpeed(120)
    const legacySixtyHz = 8 * (1 - Math.pow(1 - 0.03, 60))

    expect(sixtyHz).toBeCloseTo(legacySixtyHz, 10)
    expect(thirtyHz).toBeCloseTo(sixtyHz, 10)
    expect(oneTwentyHz).toBeCloseTo(sixtyHz, 10)
  })
})
