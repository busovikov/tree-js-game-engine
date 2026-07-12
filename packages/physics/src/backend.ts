import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { IRaycastVehicle } from './raycast-vehicle.js'
import type {
  ICharacterController,
  CharacterControllerOptions,
  IDynamicRaycastVehicle,
} from './physics-controllers.js'
import type { PhysicsJointHandle, PointerJointConfig, RevoluteMotorJointConfig } from './joints.js'
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

  /** Sync scene queries after bulk collider spawn (Rapier needs one step). */
  prepareSceneQueries(): void

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle
  destroyBody(handle: PhysicsBodyHandle): void

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle
  detachShape(shape: PhysicsShapeHandle): void

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void
  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void
  /**
   * Accumulate force (and point torque) for exactly the next `step()`.
   * The backend clears the accumulated force and torque after that step.
   */
  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3
  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3
  getBodyMass(body: PhysicsBodyHandle): number
  setBodyLinearVelocity(body: PhysicsBodyHandle, velocity: Vec3): void
  setBodyAngularVelocity(body: PhysicsBodyHandle, velocity: Vec3): void

  raycast(query: RaycastQuery): RaycastHit | null

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle

  createCharacterController(
    body: PhysicsBodyHandle,
    collider: PhysicsShapeHandle,
    options: CharacterControllerOptions,
  ): ICharacterController

  createDynamicRaycastVehicle(chassis: PhysicsBodyHandle): IDynamicRaycastVehicle

  /** Kinematic anchor for pointer drag (small sphere). */
  createPointerAnchorBody(position: Vec3): PhysicsBodyHandle

  createPointerJoint(config: PointerJointConfig): PhysicsJointHandle
  removeJoint(joint: PhysicsJointHandle): void

  /** Revolute motor between two bodies (wheel axle or steer hinge). */
  createRevoluteMotorJoint(config: RevoluteMotorJointConfig): PhysicsJointHandle
  setRevoluteMotorVelocity(joint: PhysicsJointHandle, velocity: number, factor: number): void
  setRevoluteMotorPosition(
    joint: PhysicsJointHandle,
    angle: number,
    stiffness: number,
    damping: number,
  ): void
}
