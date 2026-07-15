import type { PhysicsCapabilities } from './capabilities.js'
import type { PhysicsDebugRenderBuffers } from './debug-render.js'
import type { PhysicsCollisionEvent } from './events.js'
import type { IPhysicsBackend } from './backend.js'
import { PhysicsNotInitializedError } from './errors.js'
import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { PhysicsJointHandle, PointerJointConfig, RevoluteMotorJointConfig, SceneJointConfig } from './joints.js'
import type { IRaycastVehicle } from './raycast-vehicle.js'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  OverlapHit,
  OverlapQuery,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  ShapecastHit,
  ShapecastQuery,
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

  replaceShape(shape: PhysicsShapeHandle, next: PhysicsShapeDescriptor): PhysicsShapeHandle {
    this.assertBackendReady()
    return this.backend.replaceShape(shape, next)
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

  shapecast(query: ShapecastQuery): ShapecastHit | null {
    this.assertBackendReady()
    return this.backend.shapecast(query)
  }

  overlap(query: OverlapQuery): OverlapHit[] {
    this.assertBackendReady()
    return this.backend.overlap(query)
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

  createSceneJoint(config: SceneJointConfig): PhysicsJointHandle {
    this.assertBackendReady()
    return this.backend.createSceneJoint(config)
  }

  capabilities(): PhysicsCapabilities {
    this.assertBackendReady()
    return this.backend.capabilities()
  }

  setBodyEnabled(body: PhysicsBodyHandle, enabled: boolean): void {
    this.assertBackendReady()
    this.backend.setBodyEnabled(body, enabled)
  }

  setShapeEnabled(shape: PhysicsShapeHandle, enabled: boolean): void {
    this.assertBackendReady()
    this.backend.setShapeEnabled(shape, enabled)
  }

  wakeBody(body: PhysicsBodyHandle): void {
    this.assertBackendReady()
    this.backend.wakeBody(body)
  }

  clearForces(body: PhysicsBodyHandle): void {
    this.assertBackendReady()
    this.backend.clearForces(body)
  }

  finalizeExplicitMass(body: PhysicsBodyHandle, targetMass: number): void {
    this.assertBackendReady()
    this.backend.finalizeExplicitMass(body, targetMass)
  }

  getBodyMass(body: PhysicsBodyHandle): number {
    this.assertBackendReady()
    return this.backend.getBodyMass(body)
  }

  drainCollisionEvents(): PhysicsCollisionEvent[] {
    this.assertBackendReady()
    return this.backend.drainCollisionEvents()
  }

  getDebugRenderBuffers(): PhysicsDebugRenderBuffers | null {
    this.assertBackendReady()
    return this.backend.getDebugRenderBuffers()
  }

  private assertBackendReady(): void {
    if (!this.backend.isInitialized()) {
      throw new PhysicsNotInitializedError()
    }
  }
}
