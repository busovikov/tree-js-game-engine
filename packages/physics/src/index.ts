export type { PhysicsDebugRenderBuffers } from './debug-render.js'
export * from './animatable-body.js'
export * from './collider.js'
export * from './colliders-array.js'
export * from './components.js'
export * from './physics-area.js'
export * from './physics-controller.js'
export * from './physics-joint.js'
export * from './physics-scale.js'
export * from './physics-validation.js'
export * from './rigid-body.js'
export type { PhysicsCapabilities, ColliderShapeKind, PhysicsJointKind } from './capabilities.js'
export { STUB_PHYSICS_CAPABILITIES, RAPIER_PHYSICS_CAPABILITIES } from './capabilities.js'
export type {
  PhysicsEventKind,
  PhysicsEventPhase,
  PhysicsContactPoint,
  PhysicsCollisionEvent,
} from './events.js'
export type { IPhysicsBackend } from './backend.js'
export { PhysicsNotInitializedError, PhysicsHandleNotFoundError } from './errors.js'
export {
  physicsBodyHandle,
  physicsShapeHandle,
  physicsWheelHandle,
  physicsWorldHandle,
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type PhysicsWheelHandle,
  type PhysicsWorldHandle,
} from './handles.js'
export { PhysicsWorld } from './physics-world.js'
export {
  createBodyWithShape,
  destroyBodyWithShape,
  type BodyWithShape,
} from './primitives.js'
export type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
export type {
  ICharacterController,
  IDynamicRaycastVehicle,
  CharacterControllerOptions,
  CharacterControllerStepResult,
  DynamicRaycastWheelConfig,
} from './physics-controllers.js'
export type {
  PhysicsJointHandle,
  PointerJointKind,
  PointerJointConfig,
  PrismaticSpringJointConfig,
  RevoluteMotorJointConfig,
  SceneJointConfig,
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
  Vec3,
  PhysicsShapeSpawnOptions,
  ShapecastQuery,
  ShapecastHit,
  OverlapQuery,
  OverlapHit,
  ShapeQueryFilter,
} from './types.js'
export type { IPhysicsWorld } from './world.js'
