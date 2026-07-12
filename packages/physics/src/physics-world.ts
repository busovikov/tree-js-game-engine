import type { IPhysicsBackend } from './backend.js'
import { PhysicsNotInitializedError } from './errors.js'
import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { PhysicsJointHandle, PointerJointConfig, RevoluteMotorJointConfig } from './joints.js'
import type { IRaycastVehicle } from './raycast-vehicle.js'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  Vec3,
} from './types.js'
import type { IPhysicsWorld } from './world.js'

/**
 * Wraps an {@link IPhysicsBackend} and exposes the {@link IPhysicsWorld} facade
 * used by engine systems.
 */
export class PhysicsWorld implements IPhysicsWorld {
  constructor(private readonly backend: IPhysicsBackend) {}

  step(dt: number): void {
    this.assertBackendReady()
    this.backend.step(dt)
  }

  prepareSceneQueries(): void {
    this.assertBackendReady()
    this.backend.prepareSceneQueries()
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    this.assertBackendReady()
    return this.backend.createBody(descriptor)
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    this.assertBackendReady()
    this.backend.destroyBody(handle)
  }

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle {
    this.assertBackendReady()
    return this.backend.attachShape(body, shape)
  }

  detachShape(shape: PhysicsShapeHandle): void {
    this.assertBackendReady()
    this.backend.detachShape(shape)
  }

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void {
    this.assertBackendReady()
    this.backend.setBodyTransform(body, transform)
  }

  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform {
    this.assertBackendReady()
    return this.backend.getBodyTransform(body)
  }

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3 {
    this.assertBackendReady()
    return this.backend.getBodyLinearVelocity(body)
  }

  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3 {
    this.assertBackendReady()
    return this.backend.getBodyAngularVelocity(body)
  }

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void {
    this.assertBackendReady()
    this.backend.applyImpulse(body, impulse, worldPoint)
  }

  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void {
    this.assertBackendReady()
    this.backend.applyForce(body, force, worldPoint)
  }

  raycast(query: RaycastQuery): RaycastHit | null {
    this.assertBackendReady()
    return this.backend.raycast(query)
  }

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle {
    this.assertBackendReady()
    return this.backend.createRaycastVehicle(chassis)
  }

  createCharacterController(
    body: PhysicsBodyHandle,
    collider: PhysicsShapeHandle,
    options: import('./physics-controllers.js').CharacterControllerOptions,
  ): import('./physics-controllers.js').ICharacterController {
    this.assertBackendReady()
    return this.backend.createCharacterController(body, collider, options)
  }

  createDynamicRaycastVehicle(chassis: PhysicsBodyHandle): import('./physics-controllers.js').IDynamicRaycastVehicle {
    this.assertBackendReady()
    return this.backend.createDynamicRaycastVehicle(chassis)
  }

  createPointerAnchorBody(position: Vec3): PhysicsBodyHandle {
    this.assertBackendReady()
    return this.backend.createPointerAnchorBody(position)
  }

  createPointerJoint(config: PointerJointConfig): PhysicsJointHandle {
    this.assertBackendReady()
    return this.backend.createPointerJoint(config)
  }

  removeJoint(joint: PhysicsJointHandle): void {
    this.assertBackendReady()
    this.backend.removeJoint(joint)
  }

  createRevoluteMotorJoint(config: RevoluteMotorJointConfig): PhysicsJointHandle {
    this.assertBackendReady()
    return this.backend.createRevoluteMotorJoint(config)
  }

  setRevoluteMotorVelocity(joint: PhysicsJointHandle, velocity: number, factor: number): void {
    this.assertBackendReady()
    this.backend.setRevoluteMotorVelocity(joint, velocity, factor)
  }

  setRevoluteMotorPosition(
    joint: PhysicsJointHandle,
    angle: number,
    stiffness: number,
    damping: number,
  ): void {
    this.assertBackendReady()
    this.backend.setRevoluteMotorPosition(joint, angle, stiffness, damping)
  }

  private assertBackendReady(): void {
    if (!this.backend.isInitialized()) {
      throw new PhysicsNotInitializedError()
    }
  }
}
