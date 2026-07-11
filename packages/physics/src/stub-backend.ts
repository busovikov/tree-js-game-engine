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
import type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
import type {
  PhysicsShapeDescriptor,
  PhysicsTransform,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  Vec3,
} from './types.js'

let nextId = 0

function createId(prefix: string): string {
  nextId += 1
  return `${prefix}-${nextId}`
}

interface StubBodyRecord {
  descriptor: RigidBodyDescriptor
  transform: PhysicsTransform
}

interface StubShapeRecord {
  body: PhysicsBodyHandle
  shape: PhysicsShapeDescriptor
}

interface StubWheelRecord {
  config: WheelConfig
  steering: number
  engineForce: number
  brake: number
  rotation: number
}

class StubRaycastVehicle implements IRaycastVehicle {
  private readonly wheels = new Map<string, StubWheelRecord>()

  constructor(readonly chassis: PhysicsBodyHandle) {}

  addWheel(config: WheelConfig): PhysicsWheelHandle {
    const handle = physicsWheelHandle(createId('wheel'))
    this.wheels.set(handle.value, {
      config,
      steering: 0,
      engineForce: 0,
      brake: 0,
      rotation: 0,
    })
    return handle
  }

  removeWheel(wheel: PhysicsWheelHandle): void {
    if (!this.wheels.delete(wheel.value)) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
  }

  applyEngineForce(wheel: PhysicsWheelHandle, force: number): void {
    const record = this.getWheel(wheel)
    record.engineForce = force
  }

  setSteering(wheel: PhysicsWheelHandle, angle: number): void {
    const record = this.getWheel(wheel)
    record.steering = angle
  }

  setBrake(wheel: PhysicsWheelHandle, strength: number): void {
    const record = this.getWheel(wheel)
    record.brake = strength
  }

  getWheelStates(): readonly WheelState[] {
    const states: WheelState[] = []
    for (const [value, record] of this.wheels) {
      states.push({
        wheel: physicsWheelHandle(value),
        inContact: false,
        contactPoint: null,
        suspensionLength: record.config.suspensionRestLength,
        rotation: record.rotation,
        steering: record.steering,
        engineForce: record.engineForce,
      })
    }
    return states
  }

  advance(dt: number): void {
    for (const record of this.wheels.values()) {
      if (record.engineForce !== 0) {
        record.rotation += record.engineForce * dt * 0.001
      }
    }
  }

  private getWheel(wheel: PhysicsWheelHandle): StubWheelRecord {
    const record = this.wheels.get(wheel.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
    return record
  }
}

/**
 * No-op physics backend for unit tests and CI without WASM.
 * Tracks bodies/shapes in memory; `step()` advances stub vehicle wheel rotation only.
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
    this.simulationTime += dt
    for (const vehicle of this.vehicles.values()) {
      vehicle.advance(dt)
    }
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    this.assertInitialized()
    const handle = physicsBodyHandle(createId('body'))
    this.bodies.set(handle.value, {
      descriptor,
      transform: cloneTransform(descriptor.transform),
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

  applyImpulse(_body: PhysicsBodyHandle, _impulse: Vec3, _worldPoint?: Vec3): void {
    this.assertInitialized()
  }

  applyForce(_body: PhysicsBodyHandle, _force: Vec3, _worldPoint?: Vec3): void {
    this.assertInitialized()
  }

  raycast(_query: RaycastQuery): RaycastHit | null {
    this.assertInitialized()
    return null
  }

  createRaycastVehicle(chassis: PhysicsBodyHandle): IRaycastVehicle {
    this.assertInitialized()
    this.getBody(chassis)
    const existing = this.vehicles.get(chassis.value)
    if (existing) {
      return existing
    }
    const vehicle = new StubRaycastVehicle(chassis)
    this.vehicles.set(chassis.value, vehicle)
    return vehicle
  }

  /** Exposed for tests — total simulated time in seconds. */
  getSimulationTime(): number {
    return this.simulationTime
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

/** Reset stub ID counter — test helper only. */
export function resetStubPhysicsIds(): void {
  nextId = 0
}
