import { describe, expect, it } from 'vitest'
import {
  CameraComponent,
  PhysicsControllerComponent,
  TransformComponent,
  World,
} from '@haku/core'
import { DynamicRaycastControllerSchema } from '@haku/schema'
import {
  ThreeJsFollowCameraSystem,
  usesThreeJsFollowCamera,
} from './threejs-follow-camera-system.js'

describe('ThreeJsFollowCameraSystem', () => {
  it('preserves initial world offset while vehicle moves', () => {
    const world = new World()
    const vehicleId = world.createEntity('Car')
    const cameraId = world.createEntity('MainCamera')

    world.addComponent(vehicleId, TransformComponent, {
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(cameraId, TransformComponent, {
      position: [0, 4, 10],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    world.addComponent(cameraId, CameraComponent, { fov: 60, near: 0.1, far: 100, enabled: true })
    world.addComponent(vehicleId, PhysicsControllerComponent, DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      enabled: true,
      driveProfile: 'threejs-rapier',
    }))

    const system = new ThreeJsFollowCameraSystem({
      controlledEntity: vehicleId,
      cameraEntityId: cameraId,
    })

    system.update(world)
    let cameraTransform = world.getComponent(cameraId, TransformComponent)!
    expect(cameraTransform.position).toEqual([0, 4, 10])

    world.addComponent(vehicleId, TransformComponent, {
      position: [5, 3, -2],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
    })
    system.update(world)
    cameraTransform = world.getComponent(cameraId, TransformComponent)!
    expect(cameraTransform.position).toEqual([5, 6, 8])
  })

  it('detects threejs-rapier profile', () => {
    const world = new World()
    const vehicleId = world.createEntity('Car')
    world.addComponent(vehicleId, PhysicsControllerComponent, DynamicRaycastControllerSchema.parse({
      type: 'dynamic-raycast',
      enabled: true,
      driveProfile: 'threejs-rapier',
    }))

    expect(usesThreeJsFollowCamera(world, vehicleId)).toBe(true)
  })
})
