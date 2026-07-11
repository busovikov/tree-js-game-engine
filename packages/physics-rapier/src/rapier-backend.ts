import RAPIER from '@dimforge/rapier3d-compat'
import type { IPhysicsBackend } from '@haku/physics'
import {
  PhysicsHandleNotFoundError,
  PhysicsNotInitializedError,
  physicsBodyHandle,
  physicsShapeHandle,
  physicsWheelHandle,
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type PhysicsWheelHandle,
} from '@haku/physics'
import type { IRaycastVehicle, WheelConfig, WheelState } from '@haku/physics'
import {
  stepRaycastVehicle,
  type RaycastVehicleSimulationHooks,
  type WheelRuntime,
} from '@haku/physics'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  Vec3,
} from '@haku/physics'
import { PhysicsWasmInitError } from './errors.js'
import { quatFromRapier, quatToRapier, vec3FromRapier, vec3ToRapier } from './math.js'

let nextId = 0
let wasmLoaded = false
let wasmInitPromise: Promise<void> | null = null

function createId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

/** Load Rapier WASM once. Required before `RapierPhysicsBackend.init()`. */
export function ensureRapierWasmLoaded(): Promise<void> {
  if (wasmLoaded) {
    return Promise.resolve()
  }
  if (!wasmInitPromise) {
    wasmInitPromise = RAPIER.init()
      .then(() => {
        wasmLoaded = true
      })
      .catch((cause: unknown) => {
        wasmInitPromise = null
        throw new PhysicsWasmInitError(cause)
      })
  }
  return wasmInitPromise
}

export interface RapierPhysicsBackendOptions {
  gravity?: Vec3
}

/** Create and initialize a Rapier backend (loads WASM, then creates world). */
export async function createRapierPhysicsBackend(
  options: RapierPhysicsBackendOptions = {},
): Promise<RapierPhysicsBackend> {
  await ensureRapierWasmLoaded()
  const backend = new RapierPhysicsBackend(options)
  backend.init()
  return backend
}

interface BodyRecord {
  body: RAPIER.RigidBody
  colliderHandles: Set<string>
}

interface ShapeRecord {
  collider: RAPIER.Collider
  bodyHandle: PhysicsBodyHandle
}

interface WheelRecord extends WheelRuntime {}

class RapierRaycastVehicle implements IRaycastVehicle {
  private readonly wheels = new Map<string, WheelRecord>()

  constructor(
    readonly chassis: PhysicsBodyHandle,
    private readonly backend: RapierPhysicsBackend,
  ) {}

  addWheel(config: WheelConfig): PhysicsWheelHandle {
    const handle = physicsWheelHandle(createId('wheel'))
    this.wheels.set(handle.value, {
      config,
      steering: 0,
      engineForce: 0,
      brake: 0,
      rotation: 0,
      inContact: false,
      contactPoint: null,
      suspensionLength: config.suspensionRestLength,
      prevSuspensionLength: config.suspensionRestLength,
    })
    return handle
  }

  removeWheel(wheel: PhysicsWheelHandle): void {
    if (!this.wheels.delete(wheel.value)) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
  }

  applyEngineForce(wheel: PhysicsWheelHandle, force: number): void {
    this.getWheel(wheel).engineForce = force
  }

  setSteering(wheel: PhysicsWheelHandle, angle: number): void {
    this.getWheel(wheel).steering = angle
  }

  setBrake(wheel: PhysicsWheelHandle, strength: number): void {
    this.getWheel(wheel).brake = strength
  }

  getWheelStates(): readonly WheelState[] {
    return [...this.wheels.entries()].map(([value, wheel]) => ({
      wheel: physicsWheelHandle(value),
      inContact: wheel.inContact,
      contactPoint: wheel.contactPoint,
      suspensionLength: wheel.suspensionLength,
      rotation: wheel.rotation,
      steering: wheel.steering,
      engineForce: wheel.engineForce,
    }))
  }

  simulate(dt: number): void {
    const hooks: RaycastVehicleSimulationHooks = {
      raycast: (query) => this.backend.raycast(query),
      getChassisTransform: (body) => this.backend.getBodyTransform(body),
      getChassisLinearVelocity: (body) => this.backend.getBodyLinearVelocity(body),
      getChassisAngularVelocity: (body) => this.backend.getBodyAngularVelocity(body),
      applyForceAtPoint: (body, force, point) => this.backend.applyForceAtPoint(body, force, point),
    }
    stepRaycastVehicle(this.chassis, this.wheels, hooks, dt)
  }

  private getWheel(wheel: PhysicsWheelHandle): WheelRecord {
    const record = this.wheels.get(wheel.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
    return record
  }
}

/**
 * Rapier WASM implementation of {@link IPhysicsBackend}.
 * All `@dimforge/rapier3d-compat` types stay in this module (AD-02).
 */
export class RapierPhysicsBackend implements IPhysicsBackend {
  private world: RAPIER.World | null = null
  private initialized = false
  private readonly gravity: Vec3
  private readonly bodies = new Map<string, BodyRecord>()
  private readonly shapes = new Map<string, ShapeRecord>()
  private readonly colliderToBody = new Map<number, PhysicsBodyHandle>()
  private readonly vehicles = new Map<string, RapierRaycastVehicle>()

  constructor(options: RapierPhysicsBackendOptions = {}) {
    this.gravity = options.gravity ?? [0, -9.81, 0]
  }

  init(): void {
    if (!wasmLoaded) {
      throw new PhysicsNotInitializedError(
        'Rapier WASM not loaded — call ensureRapierWasmLoaded() or createRapierPhysicsBackend() first',
      )
    }
    if (this.initialized) {
      return
    }
    this.world = new RAPIER.World(vec3ToRapier(this.gravity))
    this.initialized = true
  }

  dispose(): void {
    if (this.world) {
      this.world.free()
      this.world = null
    }
    this.initialized = false
    this.bodies.clear()
    this.shapes.clear()
    this.colliderToBody.clear()
    this.vehicles.clear()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  step(dt: number): void {
    const world = this.getWorld()
    world.timestep = dt
    for (const vehicle of this.vehicles.values()) {
      vehicle.simulate(dt)
    }
    world.step()
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    const world = this.getWorld()
    const bodyDesc = this.createRigidBodyDesc(descriptor)
    const body = world.createRigidBody(bodyDesc)
    const handle = physicsBodyHandle(createId('body'))
    this.bodies.set(handle.value, { body, colliderHandles: new Set() })
    return handle
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    const world = this.getWorld()
    const record = this.getBodyRecord(handle)
    for (const shapeId of record.colliderHandles) {
      this.shapes.delete(shapeId)
    }
    world.removeRigidBody(record.body)
    this.bodies.delete(handle.value)
    this.vehicles.delete(handle.value)
  }

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle {
    const world = this.getWorld()
    const bodyRecord = this.getBodyRecord(body)
    const colliderDesc = this.createColliderDesc(shape)
    const collider = world.createCollider(colliderDesc, bodyRecord.body)
    const handle = physicsShapeHandle(createId('shape'))
    bodyRecord.colliderHandles.add(handle.value)
    this.shapes.set(handle.value, { collider, bodyHandle: body })
    this.colliderToBody.set(collider.handle, body)
    this.syncColliders()
    return handle
  }

  detachShape(shape: PhysicsShapeHandle): void {
    const world = this.getWorld()
    const record = this.getShapeRecord(shape)
    this.colliderToBody.delete(record.collider.handle)
    const bodyRecord = this.getBodyRecord(record.bodyHandle)
    bodyRecord.colliderHandles.delete(shape.value)
    world.removeCollider(record.collider, true)
    this.shapes.delete(shape.value)
  }

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void {
    const record = this.getBodyRecord(body)
    record.body.setTranslation(vec3ToRapier(transform.position), true)
    record.body.setRotation(quatToRapier(transform.rotation), true)
    this.syncColliders()
  }

  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform {
    const record = this.getBodyRecord(body)
    return {
      position: vec3FromRapier(record.body.translation()),
      rotation: quatFromRapier(record.body.rotation()),
    }
  }

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3 {
    const record = this.getBodyRecord(body)
    return vec3FromRapier(record.body.linvel())
  }

  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3 {
    const record = this.getBodyRecord(body)
    return vec3FromRapier(record.body.angvel())
  }

  setBodyLinearVelocity(body: PhysicsBodyHandle, velocity: Vec3): void {
    const record = this.getBodyRecord(body)
    record.body.setLinvel(vec3ToRapier(velocity), true)
  }

  setBodyAngularVelocity(body: PhysicsBodyHandle, velocity: Vec3): void {
    const record = this.getBodyRecord(body)
    record.body.setAngvel(vec3ToRapier(velocity), true)
  }

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void {
    const record = this.getBodyRecord(body)
    if (worldPoint) {
      record.body.applyImpulseAtPoint(vec3ToRapier(impulse), vec3ToRapier(worldPoint), true)
      return
    }
    record.body.applyImpulse(vec3ToRapier(impulse), true)
  }

  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void {
    if (worldPoint) {
      this.applyForceAtPoint(body, force, worldPoint)
      return
    }
    const record = this.getBodyRecord(body)
    record.body.addForce(vec3ToRapier(force), true)
  }

  applyForceAtPoint(body: PhysicsBodyHandle, force: Vec3, worldPoint: Vec3): void {
    const record = this.getBodyRecord(body)
    record.body.addForceAtPoint(vec3ToRapier(force), vec3ToRapier(worldPoint), true)
  }

  raycast(query: RaycastQuery): RaycastHit | null {
    const world = this.getWorld()
    this.refreshQueries()
    const direction = normalizeDirection(query.direction)
    const ray = new RAPIER.Ray(vec3ToRapier(query.origin), vec3ToRapier(direction))

    const excludeRigidBody = query.excludeBody
      ? this.getBodyRecord(query.excludeBody).body
      : undefined

    const hit = world.castRayAndGetNormal(
      ray,
      query.maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      excludeRigidBody,
    )
    if (!hit) {
      return null
    }

    const bodyHandle = this.colliderToBody.get(hit.collider.handle)
    if (!bodyHandle) {
      return null
    }

    const point = ray.pointAt(hit.timeOfImpact)

    return {
      body: bodyHandle,
      point: vec3FromRapier(point),
      normal: vec3FromRapier(hit.normal),
      distance: hit.timeOfImpact,
    }
  }

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle {
    this.getBodyRecord(chassis)
    const existing = this.vehicles.get(chassis.value)
    if (existing) {
      return existing
    }
    const vehicle = new RapierRaycastVehicle(chassis, this)
    this.vehicles.set(chassis.value, vehicle)
    return vehicle
  }

  /** Transform a local point using a world transform (used by raycast vehicle). */
  transformLocalPoint(transform: PhysicsTransform, localPoint: Vec3): Vec3 {
    const [qx, qy, qz, qw] = transform.rotation
    const [lx, ly, lz] = localPoint
    const [px, py, pz] = transform.position

    const ix = qw * lx + qy * lz - qz * ly
    const iy = qw * ly + qz * lx - qx * lz
    const iz = qw * lz + qx * ly - qy * lx
    const iw = -qx * lx - qy * ly - qz * lz

    return [
      ix * qw + iw * -qx + iy * -qz - iz * -qy + px,
      iy * qw + iw * -qy + iz * -qx - ix * -qz + py,
      iz * qw + iw * -qz + ix * -qy - iy * -qx + pz,
    ]
  }

  private createRigidBodyDesc(descriptor: RigidBodyDescriptor): RAPIER.RigidBodyDesc {
    let bodyDesc: RAPIER.RigidBodyDesc
    switch (descriptor.type) {
      case 'static':
        bodyDesc = RAPIER.RigidBodyDesc.fixed()
        break
      case 'kinematic':
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        break
      case 'dynamic':
        bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        break
    }

    bodyDesc.setTranslation(
      descriptor.transform.position[0],
      descriptor.transform.position[1],
      descriptor.transform.position[2],
    )
    bodyDesc.setRotation(quatToRapier(descriptor.transform.rotation))

    if (descriptor.type === 'dynamic' && descriptor.mass !== undefined) {
      bodyDesc.setAdditionalMass(descriptor.mass)
    }

    return bodyDesc
  }

  private createColliderDesc(shape: PhysicsShapeDescriptor): RAPIER.ColliderDesc {
    switch (shape.type) {
      case 'box':
        return RAPIER.ColliderDesc.cuboid(
          shape.halfExtents[0],
          shape.halfExtents[1],
          shape.halfExtents[2],
        )
      case 'sphere':
        return RAPIER.ColliderDesc.ball(shape.radius)
      case 'capsule':
        return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
    }
  }

  private getWorld(): RAPIER.World {
    if (!this.world || !this.initialized) {
      throw new PhysicsNotInitializedError()
    }
    return this.world
  }

  private getBodyRecord(handle: PhysicsBodyHandle): BodyRecord {
    const record = this.bodies.get(handle.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('body', handle.value)
    }
    return record
  }

  private getShapeRecord(handle: PhysicsShapeHandle): ShapeRecord {
    const record = this.shapes.get(handle.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('shape', handle.value)
    }
    return record
  }

  private syncColliders(): void {
    this.getWorld().propagateModifiedBodyPositionsToColliders()
  }

  /** Rapier requires at least one step before scene queries see new colliders. */
  private refreshQueries(): void {
    const world = this.getWorld()
    const dt = world.timestep
    world.timestep = 0
    world.step()
    world.timestep = dt
  }
}

function normalizeDirection(direction: Vec3): Vec3 {
  const [x, y, z] = direction
  const length = Math.hypot(x, y, z)
  if (length === 0) {
    return [0, -1, 0]
  }
  return [x / length, y / length, z / length]
}

/** Reset ID counter — test helper only. */
export function resetRapierPhysicsIds(): void {
  nextId = 0
}

/** Reset WASM init state — test helper only. */
export function resetRapierWasmState(): void {
  wasmLoaded = false
  wasmInitPromise = null
}
