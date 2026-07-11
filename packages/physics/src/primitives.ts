import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { PhysicsShapeDescriptor, RigidBodyDescriptor } from './types.js'
import type { IPhysicsWorld } from './world.js'

/** A rigid body with its primary collider shape attached. */
export interface BodyWithShape {
  body: PhysicsBodyHandle
  shape: PhysicsShapeHandle
}

/**
 * Create a rigid body and attach a primitive collider in one call.
 * Used by engine bootstrap and tests before ColliderComponent (T01.7).
 */
export function createBodyWithShape(
  world: IPhysicsWorld,
  descriptor: RigidBodyDescriptor,
  shape: PhysicsShapeDescriptor,
): BodyWithShape {
  const body = world.createBody(descriptor)
  const shapeHandle = world.attachShape(body, shape)
  return { body, shape: shapeHandle }
}

/** Detach an optional shape handle, then destroy the body. */
export function destroyBodyWithShape(
  world: IPhysicsWorld,
  body: PhysicsBodyHandle,
  shape?: PhysicsShapeHandle,
): void {
  if (shape) {
    world.detachShape(shape)
  }
  world.destroyBody(body)
}
