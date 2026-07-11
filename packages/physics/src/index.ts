export type { IPhysicsBackend } from './backend.js'
export { PhysicsNotInitializedError, PhysicsHandleNotFoundError } from './errors.js'
export {
  physicsBodyHandle,
  physicsShapeHandle,
  physicsWheelHandle,
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type PhysicsWheelHandle,
} from './handles.js'
export { PhysicsWorld } from './physics-world.js'
export type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
export { StubPhysicsBackend, resetStubPhysicsIds } from './stub-backend.js'
export type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  Quat,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  RigidBodyType,
  Vec3,
} from './types.js'
export type { IPhysicsWorld } from './world.js'
