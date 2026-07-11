import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { IRaycastVehicle } from './raycast-vehicle.js'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  Vec3,
} from './types.js'

/**
 * Facade used by engine systems (`PhysicsWorldSystem`, T01.3).
 * Hides backend lifecycle and provides a stable simulation API.
 */
export interface IPhysicsWorld {
  step(dt: number): void

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle
  destroyBody(handle: PhysicsBodyHandle): void

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle
  detachShape(shape: PhysicsShapeHandle): void

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void
  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void
  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void

  raycast(query: RaycastQuery): RaycastHit | null

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle
}
