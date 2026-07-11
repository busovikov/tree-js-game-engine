import { describe, expect, it, beforeEach } from 'vitest'
import {
  PhysicsHandleNotFoundError,
  PhysicsWorld,
  StubPhysicsBackend,
  resetStubPhysicsIds,
} from './index.js'
import { createBodyWithShape, destroyBodyWithShape } from './primitives.js'

const identityTransform = {
  position: [0, 0, 0] as const,
  rotation: [0, 0, 0, 1] as const,
}

describe('@haku/physics primitives', () => {
  beforeEach(() => {
    resetStubPhysicsIds()
  })

  it.each([
    ['box', { type: 'box' as const, halfExtents: [0.5, 0.5, 0.5] as const }],
    ['sphere', { type: 'sphere' as const, radius: 0.5 }],
    ['capsule', { type: 'capsule' as const, radius: 0.25, halfHeight: 0.5 }],
  ])('creates and destroys %s on static body', (_label, shape) => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const world = new PhysicsWorld(backend)

    const { body, shape: shapeHandle } = createBodyWithShape(
      world,
      { type: 'static', transform: identityTransform },
      shape,
    )

    world.setBodyTransform(body, {
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    })
    expect(world.getBodyTransform(body).position).toEqual([1, 2, 3])

    destroyBodyWithShape(world, body, shapeHandle)
    expect(() => world.getBodyTransform(body)).toThrow(PhysicsHandleNotFoundError)
  })

  it.each([
    ['box', { type: 'box' as const, halfExtents: [0.5, 0.5, 0.5] as const }],
    ['sphere', { type: 'sphere' as const, radius: 0.5 }],
    ['capsule', { type: 'capsule' as const, radius: 0.25, halfHeight: 0.5 }],
  ])('creates and destroys %s on dynamic body', (_label, shape) => {
    const backend = new StubPhysicsBackend()
    backend.init()
    const world = new PhysicsWorld(backend)

    const { body, shape: shapeHandle } = createBodyWithShape(
      world,
      { type: 'dynamic', transform: identityTransform, mass: 1 },
      shape,
    )

    world.step(1 / 60)
    destroyBodyWithShape(world, body, shapeHandle)
    backend.dispose()
  })
})
