import type { IPhysicsBackend } from './backend.js'
import { PhysicsHandleNotFoundError, PhysicsNotInitializedError } from './errors.js'
import {
  physicsBodyHandle,
  physicsShapeHandle,
  physicsWheelHandle,
  type PhysicsBodyHandle,
  type PhysicsShapeHandle,
  type PhysicsWheelHandle,
} from './handles.js'
import { raycastShapes } from './raycast.js'
import {
  stepRaycastVehicle,
  type RaycastVehicleSimulationHooks,
  type WheelRuntime,
} from './raycast-vehicle-simulation.js'
import type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  Vec3,
} from './types.js'
import {
  addVec3,
  crossVec3,
  GRAVITY,
  scaleVec3,
  subVec3,
  vec3,
} from './vec-math.js'

let nextId = 0

function createId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

interface StubBodyRecord {
  descriptor: RigidBodyDescriptor
  transform: PhysicsTransform
  linearVelocity: Vec3
  angularVelocity: Vec3
  force: Vec3
  torque: Vec3
}

interface StubShapeRecord {
  body: PhysicsBodyHandle
  shape: PhysicsShapeDescriptor
}

class StubRaycastVehicle implements IRaycastVehicle {
  private readonly wheels = new Map<string, WheelRuntime>()

  constructor(
    readonly chassis: PhysicsBodyHandle,
    private readonly backend: StubPhysicsBackend,
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

  private getWheel(wheel: PhysicsWheelHandle): WheelRuntime {
    const record = this.wheels.get(wheel.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
    return record
  }
}

/**
 * No-op physics backend for unit tests and CI without WASM.
 * Implements minimal rigid-body integration and sketchbook-style raycast vehicles.
 */
export class StubPhysicsBackend implements IPhysicsBackend {
  private initialized = false
  private simulationTime = 0
  private readonly bodies = new Map<string, StubBodyRecord>()
  private readonly shapes = new Map<string, StubShapeRecord>()
  private readonly vehicles = new Map<string, StubRaycastVehicle>()

  init(): void {
    this.initialized = true
  }

  dispose(): void {
    this.initialized = false
    this.simulationTime = 0
    this.bodies.clear()
    this.shapes.clear()
    this.vehicles.clear()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  step(dt: number): void {
    this.assertInitialized()
    this.clearForces()

    for (const vehicle of this.vehicles.values()) {
      vehicle.simulate(dt)
    }

    for (const record of this.bodies.values()) {
      if (record.descriptor.type !== 'dynamic') {
        continue
      }
      const mass = record.descriptor.mass ?? 1
      const gravityForce = scaleVec3(GRAVITY, mass)
      record.force = addVec3(record.force, gravityForce)

      const invMass = 1 / mass
      const linearAccel = scaleVec3(record.force, invMass)
      record.linearVelocity = addVec3(record.linearVelocity, scaleVec3(linearAccel, dt))

      const inertia = mass * 0.4
      const invInertia = 1 / inertia
      const angularAccel = scaleVec3(record.torque, invInertia)
      record.angularVelocity = addVec3(record.angularVelocity, scaleVec3(angularAccel, dt))

      record.transform = {
        position: addVec3(record.transform.position, scaleVec3(record.linearVelocity, dt)),
        rotation: integrateQuaternion(
          [
            record.transform.rotation[0],
            record.transform.rotation[1],
            record.transform.rotation[2],
            record.transform.rotation[3],
          ],
          record.angularVelocity,
          dt,
        ),
      }
    }

    this.resolveStaticCollisions()

    this.simulationTime += dt
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    this.assertInitialized()
    const handle = physicsBodyHandle(createId('body'))
    this.bodies.set(handle.value, {
      descriptor,
      transform: cloneTransform(descriptor.transform),
      linearVelocity: vec3(0, 0, 0),
      angularVelocity: vec3(0, 0, 0),
      force: vec3(0, 0, 0),
      torque: vec3(0, 0, 0),
    })
    return handle
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    this.assertInitialized()
    if (!this.bodies.delete(handle.value)) {
      throw new PhysicsHandleNotFoundError('body', handle.value)
    }
    this.vehicles.delete(handle.value)
    for (const [shapeId, record] of this.shapes) {
      if (record.body.value === handle.value) {
        this.shapes.delete(shapeId)
      }
    }
  }

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle {
    this.assertInitialized()
    this.getBody(body)
    const handle = physicsShapeHandle(createId('shape'))
    this.shapes.set(handle.value, { body, shape })
    return handle
  }

  detachShape(shape: PhysicsShapeHandle): void {
    this.assertInitialized()
    if (!this.shapes.delete(shape.value)) {
      throw new PhysicsHandleNotFoundError('shape', shape.value)
    }
  }

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void {
    this.assertInitialized()
    const record = this.getBody(body)
    record.transform = cloneTransform(transform)
  }

  getBodyTransform(body: PhysicsBodyHandle): PhysicsTransform {
    this.assertInitialized()
    return cloneTransform(this.getBody(body).transform)
  }

  getBodyLinearVelocity(body: PhysicsBodyHandle): Vec3 {
    this.assertInitialized()
    const record = this.getBody(body)
    return [...record.linearVelocity] as Vec3
  }

  getBodyAngularVelocity(body: PhysicsBodyHandle): Vec3 {
    this.assertInitialized()
    const record = this.getBody(body)
    return [...record.angularVelocity] as Vec3
  }

  setBodyLinearVelocity(body: PhysicsBodyHandle, velocity: Vec3): void {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return
    }
    record.linearVelocity = [...velocity] as Vec3
  }

  setBodyAngularVelocity(body: PhysicsBodyHandle, velocity: Vec3): void {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return
    }
    record.angularVelocity = [...velocity] as Vec3
  }

  applyImpulse(body: PhysicsBodyHandle, impulse: Vec3, worldPoint?: Vec3): void {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return
    }
    const mass = record.descriptor.mass ?? 1
    record.linearVelocity = addVec3(record.linearVelocity, scaleVec3(impulse, 1 / mass))
    if (worldPoint) {
      const r = subVec3(worldPoint, record.transform.position)
      const deltaOmega = scaleVec3(crossVec3(r, impulse), 1 / (mass * 0.4))
      record.angularVelocity = addVec3(record.angularVelocity, deltaOmega)
    }
  }

  applyForce(body: PhysicsBodyHandle, force: Vec3, worldPoint?: Vec3): void {
    this.assertInitialized()
    if (worldPoint) {
      this.applyForceAtPoint(body, force, worldPoint)
      return
    }
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return
    }
    record.force = addVec3(record.force, force)
  }

  applyForceAtPoint(body: PhysicsBodyHandle, force: Vec3, worldPoint: Vec3): void {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return
    }
    record.force = addVec3(record.force, force)
    const r = subVec3(worldPoint, record.transform.position)
    record.torque = addVec3(record.torque, crossVec3(r, force))
  }

  raycast(query: RaycastQuery): RaycastHit | null {
    this.assertInitialized()
    const instances = [...this.shapes.values()].map((shapeRecord) => ({
      body: shapeRecord.body,
      shape: shapeRecord.shape,
      transform: this.getBodyTransform(shapeRecord.body),
    }))
    return raycastShapes(query, instances)
  }

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle {
    this.assertInitialized()
    this.getBody(chassis)
    const existing = this.vehicles.get(chassis.value)
    if (existing) {
      return existing
    }
    const vehicle = new StubRaycastVehicle(chassis, this)
    this.vehicles.set(chassis.value, vehicle)
    return vehicle
  }

  /** Exposed for tests — total simulated time in seconds. */
  getSimulationTime(): number {
    return this.simulationTime
  }

  private clearForces(): void {
    for (const record of this.bodies.values()) {
      record.force = vec3(0, 0, 0)
      record.torque = vec3(0, 0, 0)
    }
  }

  /** Minimal AABB vs static box resolution so chassis cannot fall through ground. */
  private resolveStaticCollisions(): void {
    const staticShapes = [...this.shapes.values()].filter((shapeRecord) => {
      const body = this.getBody(shapeRecord.body)
      return body.descriptor.type === 'static' && shapeRecord.shape.type === 'box'
    })

    for (const [bodyId, dynamic] of this.bodies) {
      if (dynamic.descriptor.type !== 'dynamic') {
        continue
      }
      const dynamicShapes = [...this.shapes.values()].filter(
        (shapeRecord) => shapeRecord.body.value === bodyId && shapeRecord.shape.type === 'box',
      )
      for (const dynamicShape of dynamicShapes) {
        for (const staticShape of staticShapes) {
          this.resolveBoxPair(dynamic, dynamicShape.shape, staticShape)
        }
      }
    }
  }

  private resolveBoxPair(
    dynamic: StubBodyRecord,
    dynamicShape: PhysicsShapeDescriptor,
    staticShape: StubShapeRecord,
  ): void {
    if (dynamicShape.type !== 'box' || staticShape.shape.type !== 'box') {
      return
    }

    const dynamicTransform = dynamic.transform
    const staticTransform = this.getBodyTransform(staticShape.body)
    const dynamicHalf = dynamicShape.halfExtents
    const staticHalf = staticShape.shape.halfExtents

    const dynamicMinY = dynamicTransform.position[1] - dynamicHalf[1]
    const staticMaxY = staticTransform.position[1] + staticHalf[1]

    if (dynamicMinY >= staticMaxY) {
      return
    }

    const penetration = staticMaxY - dynamicMinY
    dynamic.transform = {
      ...dynamic.transform,
      position: [
        dynamicTransform.position[0],
        dynamicTransform.position[1] + penetration,
        dynamicTransform.position[2],
      ],
    }
    if (dynamic.linearVelocity[1] < 0) {
      dynamic.linearVelocity = [
        dynamic.linearVelocity[0],
        0,
        dynamic.linearVelocity[2],
      ]
    }
  }

  private getBody(handle: PhysicsBodyHandle): StubBodyRecord {
    const record = this.bodies.get(handle.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('body', handle.value)
    }
    return record
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new PhysicsNotInitializedError()
    }
  }
}

function cloneTransform(transform: PhysicsTransform): PhysicsTransform {
  return {
    position: [transform.position[0], transform.position[1], transform.position[2]],
    rotation: [
      transform.rotation[0],
      transform.rotation[1],
      transform.rotation[2],
      transform.rotation[3],
    ],
  }
}

function integrateQuaternion(
  rotation: [number, number, number, number],
  angularVelocity: Vec3,
  dt: number,
): [number, number, number, number] {
  const [wx, wy, wz] = angularVelocity
  const [qx, qy, qz, qw] = rotation

  const halfDt = dt * 0.5
  const dq: [number, number, number, number] = [
    wx * halfDt,
    wy * halfDt,
    wz * halfDt,
    0,
  ]

  return normalizeQuat([
    qw * dq[0] + qx * dq[3] + qy * dq[2] - qz * dq[1],
    qw * dq[1] - qx * dq[2] + qy * dq[3] + qz * dq[0],
    qw * dq[2] + qx * dq[1] - qy * dq[0] + qz * dq[3],
    qw * dq[3] - qx * dq[0] - qy * dq[1] - qz * dq[2],
  ])
}

function normalizeQuat(q: [number, number, number, number]): [number, number, number, number] {
  const len = Math.hypot(q[0], q[1], q[2], q[3])
  if (len === 0) {
    return [0, 0, 0, 1]
  }
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len]
}

/** Reset stub ID counter — test helper only. */
export function resetStubPhysicsIds(): void {
  nextId = 0
}
