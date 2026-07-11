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
 * Low-level physics backend contract.
 * Rapier (T01.2) and future box3D adapters implement this interface.
 *
 * Hot-path contract: `step()` must not allocate per call.
 */
export interface IPhysicsBackend {
  init(): void
  dispose(): void
  isInitialized(): boolean

  /** Advance simulation by `dt` seconds (fixed timestep expected from caller). */
  step(dt: number): void

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle
  destroyBody(handle: PhysicsBodyHandle): void

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle
  detachShape(shape: PhysicsShapeHandle): void

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void
  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void
  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3
  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3
  setBodyLinearVelocity(body: PhysicsBodyHandle, velocity: Vec3): void
  setBodyAngularVelocity(body: PhysicsBodyHandle, velocity: Vec3): void

  raycast(query: RaycastQuery): RaycastHit | null

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle
}
