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
export {
  createBodyWithShape,
  destroyBodyWithShape,
  type BodyWithShape,
} from './primitives.js'
export type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
export {
  stepCustomSpring,
} from './physics-controllers.js'
export type {
  ICharacterController,
  IDynamicRaycastVehicle,
  CharacterControllerOptions,
  CharacterControllerStepResult,
  DynamicRaycastWheelConfig,
  CustomSpringConfig,
} from './physics-controllers.js'
export type {
  PhysicsJointHandle,
  PointerJointKind,
  PointerJointConfig,
  RevoluteMotorJointConfig,
} from './joints.js'
export { physicsJointHandle } from './joints.js'
export {
  computeImpulseDenominator,
  type Mat3RowMajor,
} from './raycast-vehicle-friction.js'
export {
  computeWheelWorldPose,
  defaultFourWheelConfigs,
  stepRaycastVehicle,
  type RaycastVehicleSimulationHooks,
  type WheelRuntime,
} from './raycast-vehicle-simulation.js'
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
