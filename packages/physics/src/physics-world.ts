import type { IPhysicsBackend } from './backend.js'
import { PhysicsNotInitializedError } from './errors.js'
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

  private assertBackendReady(): void {
    if (!this.backend.isInitialized()) {
      throw new PhysicsNotInitializedError()
    }
  }
}
