import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { PhysicsJointHandle, PointerJointConfig, RevoluteMotorJointConfig } from './joints.js'
import type { IRaycastVehicle } from './raycast-vehicle.js'
import type { ICharacterController, IDynamicRaycastVehicle } from './physics-controllers.js'
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
  prepareSceneQueries(): void

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle
  destroyBody(handle: PhysicsBodyHandle): void

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle
  detachShape(shape: PhysicsShapeHandle): void

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void
  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform
  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3
  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void
  /** Accumulate force (and point torque) for exactly the next simulation step. */
  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void

  raycast(query: RaycastQuery): RaycastHit | null

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle

  createCharacterController(
    body: PhysicsBodyHandle,
    collider: PhysicsShapeHandle,
    options: import('./physics-controllers.js').CharacterControllerOptions,
  ): ICharacterController

  createDynamicRaycastVehicle(chassis: PhysicsBodyHandle): IDynamicRaycastVehicle

  createPointerAnchorBody(position: Vec3): PhysicsBodyHandle
  createPointerJoint(config: PointerJointConfig): PhysicsJointHandle
  removeJoint(joint: PhysicsJointHandle): void
  createRevoluteMotorJoint(config: RevoluteMotorJointConfig): PhysicsJointHandle
  setRevoluteMotorVelocity(joint: PhysicsJointHandle, velocity: number, factor: number): void
  setRevoluteMotorPosition(
    joint: PhysicsJointHandle,
    angle: number,
    stiffness: number,
    damping: number,
  ): void
}
