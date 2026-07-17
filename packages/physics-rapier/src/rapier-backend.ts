import RAPIER from '@dimforge/rapier3d-compat'
import type { IPhysicsBackend } from '@haku/physics'
import { RAPIER_PHYSICS_CAPABILITIES } from '@haku/physics'
import {
  PhysicsHandleNotFoundError,
  PhysicsNotInitializedError,
  physicsBodyHandle,
  physicsJointHandle,
  physicsShapeHandle,
  physicsWheelHandle,
  type PhysicsBodyHandle,
  type PhysicsJointHandle,
  type PhysicsShapeHandle,
  type PhysicsWheelHandle,
  type PointerJointConfig,
  type PrismaticSpringJointConfig,
  type RevoluteMotorJointConfig,
  type SceneJointConfig,
} from '@haku/physics'
import type { IRaycastVehicle, WheelConfig, WheelState } from '@haku/physics'
import type {
  CharacterControllerOptions,
  CharacterControllerStepResult,
  DynamicRaycastWheelConfig,
  ICharacterController,
  IDynamicRaycastVehicle,
} from '@haku/physics'
import {
  computeImpulseDenominator,
  type Mat3RowMajor,
} from '@haku/physics'
import {
  stepRaycastVehicle,
  type RaycastVehicleSimulationHooks,
  type WheelRuntime,
} from '@haku/physics'
import type {
  OverlapHit,
  OverlapQuery,
  PhysicsShapeDescriptor,
  PhysicsTransform,
  Quat,
  RaycastHit,
  RaycastQuery,
  RigidBodyDescriptor,
  ShapecastHit,
  ShapecastQuery,
  Vec3,
} from '@haku/physics'
import type { PhysicsCollisionEvent } from '@haku/physics'
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
  /** When set, collider density is zero and this mass drives the body. */
  explicitMass?: number
  /** Pitch/roll inertia multiplier from Vehicle.chassis.inertiaScale. */
  inertiaScalePitchRoll?: number
}

interface ColliderEventMeta {
  entityId: string
  isSensor: boolean
  isArea: boolean
  contactMonitor: boolean
  maxReportedContacts: number
}

interface ShapeRecord {
  collider: RAPIER.Collider
  bodyHandle: PhysicsBodyHandle
  enabled: boolean
  entityId?: string
  isSensor: boolean
  isArea: boolean
}

interface JointRecord {
  joint: RAPIER.ImpulseJoint
  kind: 'pointer' | 'revolute' | 'scene' | 'prismatic-spring'
  bodyA: PhysicsBodyHandle
  bodyB: PhysicsBodyHandle
}

type WheelRecord = WheelRuntime

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
      getChassisMass: (body) => this.backend.getBodyMass(body),
      getInverseMass: (body) => this.backend.getInverseMass(body),
      getVelocityAtWorldPoint: (body, point) => this.backend.getVelocityAtWorldPoint(body, point),
      getImpulseDenominator: (body, point, normal) =>
        this.backend.getImpulseDenominator(body, point, normal),
      applyBodyImpulseAtPoint: (body, impulse, point) =>
        this.backend.applyImpulse(body, impulse, point),
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

class RapierDynamicRaycastVehicle implements IDynamicRaycastVehicle {
  private readonly controller: RAPIER.DynamicRayCastVehicleController
  private disposed = false

  constructor(
    readonly chassis: PhysicsBodyHandle,
    backend: RapierPhysicsBackend,
    chassisBody: RAPIER.RigidBody,
    private readonly onDispose: (
      controller: RAPIER.DynamicRayCastVehicleController,
      vehicle: RapierDynamicRaycastVehicle,
    ) => void,
  ) {
    this.controller = backend.getWorldInternal().createVehicleController(chassisBody)
  }

  addWheel(config: DynamicRaycastWheelConfig): number {
    const direction = config.directionLocal ?? [0, -1, 0]
    const axle = config.axleLocal ?? [1, 0, 0]
    const index = this.controller.numWheels()
    this.controller.addWheel(
      vec3ToRapier(config.localPosition),
      vec3ToRapier(direction),
      vec3ToRapier(axle),
      config.suspensionRestLength,
      config.radius,
    )
    this.controller.setWheelSuspensionStiffness(index, config.suspensionStiffness)
    if (config.maxSuspensionTravel !== undefined) {
      this.controller.setWheelMaxSuspensionTravel(index, config.maxSuspensionTravel)
    }
    this.controller.setWheelFrictionSlip(index, config.frictionSlip)
    if (config.sideFrictionStiffness !== undefined) {
      this.controller.setWheelSideFrictionStiffness(index, config.sideFrictionStiffness)
    }
    return index
  }

  updateVehicle(dt: number): void {
    this.controller.updateVehicle(dt)
  }

  setWheelEngineForce(wheelIndex: number, force: number): void {
    this.controller.setWheelEngineForce(wheelIndex, force)
  }

  setWheelBrake(wheelIndex: number, strength: number): void {
    this.controller.setWheelBrake(wheelIndex, strength)
  }

  setWheelSteering(wheelIndex: number, angle: number): void {
    this.controller.setWheelSteering(wheelIndex, angle)
  }

  getWheelSteering(wheelIndex: number): number {
    return this.controller.wheelSteering(wheelIndex) ?? 0
  }

  getWheelRotation(wheelIndex: number): number {
    return this.controller.wheelRotation(wheelIndex) ?? 0
  }

  getWheelSuspensionLength(wheelIndex: number): number {
    return this.controller.wheelSuspensionLength(wheelIndex) ?? 0
  }

  getWheelChassisConnectionY(wheelIndex: number): number {
    return this.controller.wheelChassisConnectionPointCs(wheelIndex)?.y ?? 0
  }

  getWheelAxle(wheelIndex: number): Vec3 {
    const axle = this.controller.wheelAxleCs(wheelIndex)
    return axle ? vec3FromRapier(axle) : [1, 0, 0]
  }

  getWheelIsInContact(wheelIndex: number): boolean {
    return this.controller.wheelIsInContact(wheelIndex)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.onDispose(this.controller, this)
  }
}

class RapierCharacterController implements ICharacterController {
  private readonly controller: RAPIER.KinematicCharacterController
  private disposed = false

  constructor(
    readonly body: PhysicsBodyHandle,
    readonly collider: PhysicsShapeHandle,
    options: CharacterControllerOptions,
    private readonly backend: RapierPhysicsBackend,
    private readonly onDispose: (
      controller: RAPIER.KinematicCharacterController,
      character: RapierCharacterController,
    ) => void,
  ) {
    this.controller = backend.getWorldInternal().createCharacterController(options.offset)
    this.configure(options)
  }

  configure(options: CharacterControllerOptions): void {
    this.controller.enableAutostep(
      options.autoStepMaxHeight,
      options.autoStepMinWidth,
      options.autoStepIncludeDynamicBodies,
    )
    this.controller.enableSnapToGround(options.snapToGroundDistance)
    this.controller.setApplyImpulsesToDynamicBodies(options.applyImpulsesToDynamicBodies)
  }

  step(movement: Vec3, _dt: number): CharacterControllerStepResult {
    const collider = this.backend.getColliderRecord(this.collider)
    this.controller.computeColliderMovement(collider, vec3ToRapier(movement))
    const computed = this.controller.computedMovement()
    const bodyRecord = this.backend.getBodyRecordInternal(this.body)
    const translation = bodyRecord.body.translation()
    bodyRecord.body.setNextKinematicTranslation({
      x: translation.x + computed.x,
      y: translation.y + computed.y,
      z: translation.z + computed.z,
    })
    return {
      grounded: this.controller.computedGrounded(),
      movement: vec3FromRapier(computed),
    }
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.onDispose(this.controller, this)
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
  private readonly dynamicVehicles = new Map<string, RapierDynamicRaycastVehicle>()
  private readonly characterControllers = new Map<string, RapierCharacterController>()
  private readonly joints = new Map<string, JointRecord>()
  private eventQueue: RAPIER.EventQueue | null = null
  private readonly colliderEventMeta = new Map<number, ColliderEventMeta>()
  private readonly colliderByHandle = new Map<number, RAPIER.Collider>()

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
    this.eventQueue = new RAPIER.EventQueue(false)
    this.initialized = true
  }

  dispose(): void {
    if (this.world) {
      for (const [handle, record] of this.bodies) {
        this.disposeBodyOwnedResources(physicsBodyHandle(handle), record)
      }
      this.eventQueue?.free()
      this.eventQueue = null
      this.world.free()
      this.world = null
    }
    this.initialized = false
    this.bodies.clear()
    this.shapes.clear()
    this.colliderToBody.clear()
    this.colliderEventMeta.clear()
    this.colliderByHandle.clear()
    this.vehicles.clear()
    this.dynamicVehicles.clear()
    this.characterControllers.clear()
    this.joints.clear()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  prepareSceneQueries(): void {
    this.refreshQueries()
  }

  step(dt: number): void {
    const world = this.getWorld()
    world.timestep = dt
    this.syncColliders()
    for (const vehicle of this.vehicles.values()) {
      vehicle.simulate(dt)
    }
    for (const vehicle of this.dynamicVehicles.values()) {
      vehicle.updateVehicle(dt)
    }
    world.step(this.eventQueue ?? undefined)
    for (const record of this.bodies.values()) {
      record.body.resetForces(false)
      record.body.resetTorques(false)
    }
  }

  createBody(descriptor: RigidBodyDescriptor): PhysicsBodyHandle {
    const world = this.getWorld()
    assertFiniteVec3(descriptor.transform.position, 'body position')
    if (descriptor.type === 'dynamic') {
      assertFiniteMass(descriptor.mass, 'body mass')
    }
    const bodyDesc = this.createRigidBodyDesc(descriptor)
    const body = world.createRigidBody(bodyDesc)
  const explicitMass =
      descriptor.type === 'dynamic' &&
      descriptor.massMode !== 'autoFromColliders' &&
      descriptor.mass !== undefined
        ? descriptor.mass
        : undefined
    if (descriptor.type === 'dynamic' && descriptor.gravityScale !== undefined) {
      body.setGravityScale(descriptor.gravityScale, true)
    }
    const handle = physicsBodyHandle(createId('body'))
    this.bodies.set(handle.value, {
      body,
      colliderHandles: new Set(),
      explicitMass,
      inertiaScalePitchRoll:
        descriptor.type === 'dynamic' ? descriptor.inertiaScalePitchRoll : undefined,
    })
    return handle
  }

  destroyBody(handle: PhysicsBodyHandle): void {
    const world = this.getWorld()
    const record = this.getBodyRecord(handle)
    this.disposeBodyOwnedResources(handle, record)
    world.removeRigidBody(record.body)
    this.bodies.delete(handle.value)
  }

  attachShape(body: PhysicsBodyHandle, shape: PhysicsShapeDescriptor): PhysicsShapeHandle {
    const world = this.getWorld()
    const bodyRecord = this.getBodyRecord(body)
    const colliderDesc = this.createColliderDesc(shape)
    const isFirstShape = bodyRecord.colliderHandles.size === 0
    const useAnalyticExplicit =
      bodyRecord.explicitMass !== undefined &&
      isFirstShape &&
      isAnalyticPrimitive(shape)
    if (useAnalyticExplicit) {
      colliderDesc.setDensity(0)
    }
    const collider = world.createCollider(colliderDesc, bodyRecord.body)
    if (useAnalyticExplicit && bodyRecord.explicitMass !== undefined) {
      this.applyExplicitMassProperties(
        bodyRecord,
        shape,
        bodyRecord.explicitMass,
        bodyRecord.inertiaScalePitchRoll,
      )
    }
    const spawn = shape.spawn
    const handle = physicsShapeHandle(createId('shape'))
    const enabled = spawn?.enabled !== false
    const isSensor = spawn?.isSensor === true
    const isArea = spawn?.isArea === true
    bodyRecord.colliderHandles.add(handle.value)
    this.shapes.set(handle.value, {
      collider,
      bodyHandle: body,
      enabled,
      entityId: spawn?.entityId,
      isSensor,
      isArea,
    })
    if (spawn?.entityId) {
      this.colliderEventMeta.set(collider.handle, {
        entityId: spawn.entityId,
        isSensor,
        isArea,
        contactMonitor: spawn.contactMonitor === true,
        maxReportedContacts: spawn.maxReportedContacts ?? 0,
      })
    }
    this.colliderByHandle.set(collider.handle, collider)
    this.colliderToBody.set(collider.handle, body)
    this.syncColliders()
    return handle
  }

  detachShape(shape: PhysicsShapeHandle): void {
    const world = this.getWorld()
    const record = this.getShapeRecord(shape)
    this.colliderEventMeta.delete(record.collider.handle)
    this.colliderByHandle.delete(record.collider.handle)
    this.colliderToBody.delete(record.collider.handle)
    const bodyRecord = this.getBodyRecord(record.bodyHandle)
    bodyRecord.colliderHandles.delete(shape.value)
    world.removeCollider(record.collider, true)
    this.shapes.delete(shape.value)
  }

  replaceShape(shape: PhysicsShapeHandle, next: PhysicsShapeDescriptor): PhysicsShapeHandle {
    const record = this.getShapeRecord(shape)
    const body = record.bodyHandle
    const enabled = record.enabled
    this.detachShape(shape)
    const nextHandle = this.attachShape(body, next)
    if (!enabled) {
      this.setShapeEnabled(nextHandle, false)
    }
    return nextHandle
  }

  setBodyTransform(body: PhysicsBodyHandle, transform: PhysicsTransform): void {
    const record = this.getBodyRecord(body)
    const bodyType = record.body.bodyType()
    if (bodyType === RAPIER.RigidBodyType.KinematicPositionBased) {
      record.body.setNextKinematicTranslation(vec3ToRapier(transform.position))
      record.body.setNextKinematicRotation(quatToRapier(transform.rotation))
    } else {
      record.body.setTranslation(vec3ToRapier(transform.position), true)
      record.body.setRotation(quatToRapier(transform.rotation), true)
    }
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

  getBodyMass(body: PhysicsBodyHandle): number {
    const record = this.getBodyRecord(body)
    return record.explicitMass ?? record.body.mass()
  }

  getInverseMass(body: PhysicsBodyHandle): number {
    const record = this.getBodyRecord(body)
    return record.body.invMass()
  }

  getVelocityAtWorldPoint(body: PhysicsBodyHandle, worldPoint: Vec3): Vec3 {
    const record = this.getBodyRecord(body)
    return vec3FromRapier(record.body.velocityAtPoint(vec3ToRapier(worldPoint)))
  }

  getImpulseDenominator(body: PhysicsBodyHandle, worldPoint: Vec3, normal: Vec3): number {
    const record = this.getBodyRecord(body)
    const rb = record.body
    const invMass = rb.invMass()
    if (invMass === 0) {
      return 0
    }
    const inertia = sdpMatrix3ToRowMajor(rb.effectiveWorldInvInertia())
    const translation = vec3FromRapier(rb.translation())
    return computeImpulseDenominator(translation, invMass, inertia, worldPoint, normal)
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
    const direction = normalizeDirection(query.direction)
    const ray = new RAPIER.Ray(vec3ToRapier(query.origin), vec3ToRapier(direction))

    const excludeRigidBody = query.excludeBody
      ? this.getBodyRecord(query.excludeBody).body
      : undefined

    const layerMask = query.layerMask ?? 0xffff
    const filterGroups = (0xffff << 16) | layerMask
    const solid = !query.includeSensors

    const hit = world.castRayAndGetNormal(
      ray,
      query.maxDistance,
      solid,
      undefined,
      filterGroups,
      undefined,
      excludeRigidBody,
    )
    if (!hit) {
      return null
    }

    const shapeRecord = [...this.shapes.values()].find(
      (record) => record.collider.handle === hit.collider.handle,
    )
    if (shapeRecord && !shapeRecord.enabled) {
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

  shapecast(query: ShapecastQuery): ShapecastHit | null {
    const world = this.getWorld()
    const direction = normalizeDirection(query.direction)
    const worldPose = composeQueryTransform(query.transform, query.shape)
    const rapierShape = createRapierShape(query.shape)
    const filter = this.buildShapeQueryFilter(query.filter)

    const hit = world.castShape(
      vec3ToRapier(worldPose.position),
      quatToRapier(worldPose.rotation),
      vec3ToRapier(direction),
      rapierShape,
      0,
      query.maxDistance,
      true,
      filter.filterFlags,
      filter.filterGroups,
      undefined,
      filter.excludeRigidBody,
      filter.filterPredicate,
    )
    if (!hit) {
      return null
    }

    const shapeRecord = this.findShapeRecordByCollider(hit.collider.handle)
    if (shapeRecord && !shapeRecord.enabled) {
      return null
    }

    const bodyHandle = this.colliderToBody.get(hit.collider.handle)
    if (!bodyHandle) {
      return null
    }

    const colliderTransform = {
      position: vec3FromRapier(hit.collider.translation()),
      rotation: quatFromRapier(hit.collider.rotation()),
    }
    const point = this.transformLocalPoint(colliderTransform, vec3FromRapier(hit.witness2))

    return {
      body: bodyHandle,
      point,
      normal: vec3FromRapier(hit.normal2),
      distance: hit.time_of_impact,
      entityId: shapeRecord?.entityId,
    }
  }

  overlap(query: OverlapQuery): OverlapHit[] {
    const world = this.getWorld()
    const worldPose = composeQueryTransform(query.transform, query.shape)
    const rapierShape = createRapierShape(query.shape)
    const filter = this.buildShapeQueryFilter(query.filter)
    const hits: OverlapHit[] = []

    world.intersectionsWithShape(
      vec3ToRapier(worldPose.position),
      quatToRapier(worldPose.rotation),
      rapierShape,
      (collider) => {
        const shapeRecord = this.findShapeRecordByCollider(collider.handle)
        if (shapeRecord && !shapeRecord.enabled) {
          return true
        }
        const bodyHandle = this.colliderToBody.get(collider.handle)
        if (!bodyHandle) {
          return true
        }
        hits.push({
          body: bodyHandle,
          entityId: shapeRecord?.entityId,
        })
        return true
      },
      filter.filterFlags,
      filter.filterGroups,
      undefined,
      filter.excludeRigidBody,
      filter.filterPredicate,
    )

    return hits
  }

  fork(options?: { gravity?: Vec3 }): IPhysicsBackend {
    const backend = new RapierPhysicsBackend({ gravity: options?.gravity ?? this.gravity })
    if (this.initialized) {
      backend.init()
    }
    return backend
  }

  capabilities() {
    return RAPIER_PHYSICS_CAPABILITIES
  }

  setBodyEnabled(body: PhysicsBodyHandle, enabled: boolean): void {
    const record = this.getBodyRecord(body)
    record.body.setEnabled(enabled)
  }

  setShapeEnabled(shape: PhysicsShapeHandle, enabled: boolean): void {
    const record = this.getShapeRecord(shape)
    record.enabled = enabled
    record.collider.setEnabled(enabled)
  }

  wakeBody(body: PhysicsBodyHandle): void {
    const record = this.getBodyRecord(body)
    record.body.wakeUp()
  }

  clearForces(body: PhysicsBodyHandle): void {
    const record = this.getBodyRecord(body)
    record.body.resetForces(true)
    record.body.resetTorques(true)
  }

  finalizeExplicitMass(body: PhysicsBodyHandle, targetMass: number): void {
    const record = this.getBodyRecord(body)
    const computed = record.body.mass()
    record.body.setAdditionalMass(targetMass - computed, true)
    record.explicitMass = targetMass
  }

  drainCollisionEvents(): PhysicsCollisionEvent[] {
    const queue = this.eventQueue
    if (!queue) {
      return []
    }

    const events: PhysicsCollisionEvent[] = []
    const maxCapabilityContacts = this.capabilities().events.maxContactsPerPair
    const world = this.getWorld()

    queue.drainCollisionEvents((handle1, handle2, started) => {
      const meta1 = this.colliderEventMeta.get(handle1)
      const meta2 = this.colliderEventMeta.get(handle2)
      if (!meta1 || !meta2) {
        return
      }

      const kind = resolvePhysicsEventKind(meta1, meta2)
      const event: PhysicsCollisionEvent = {
        kind,
        phase: started ? 'enter' : 'exit',
        entityA: meta1.entityId,
        entityB: meta2.entityId,
      }

      if (
        started &&
        kind === 'collision' &&
        maxCapabilityContacts > 0 &&
        this.capabilities().events.contactManifolds
      ) {
        const collider1 = this.colliderByHandle.get(handle1)
        const collider2 = this.colliderByHandle.get(handle2)
        if (collider1 && collider2) {
          const contacts = extractContactPoints(world, collider1, collider2, maxCapabilityContacts)
          if (contacts.length > 0) {
            event.contacts = contacts
          }
        }
      }

      events.push(event)
    })
    return events
  }

  getDebugRenderBuffers(): { vertices: Float32Array; colors: Float32Array } | null {
    const world = this.world
    if (!world || !this.initialized) {
      return null
    }
    const buffers = world.debugRender()
    return { vertices: buffers.vertices, colors: buffers.colors }
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

  createDynamicRaycastVehicle(chassis: PhysicsBodyHandle): IDynamicRaycastVehicle {
    const bodyRecord = this.getBodyRecord(chassis)
    const existing = this.dynamicVehicles.get(chassis.value)
    if (existing) {
      return existing
    }
    const vehicle = new RapierDynamicRaycastVehicle(
      chassis,
      this,
      bodyRecord.body,
      (controller, disposedVehicle) => {
        if (this.dynamicVehicles.get(chassis.value) === disposedVehicle) {
          this.dynamicVehicles.delete(chassis.value)
        }
        if (this.world?.vehicleControllers.has(controller)) {
          this.world.removeVehicleController(controller)
        }
      },
    )
    this.dynamicVehicles.set(chassis.value, vehicle)
    return vehicle
  }

  createCharacterController(
    body: PhysicsBodyHandle,
    collider: PhysicsShapeHandle,
    options: CharacterControllerOptions,
  ): ICharacterController {
    this.getBodyRecord(body)
    this.getShapeRecord(collider)
    const key = `${body.value}:${collider.value}`
    const existing = this.characterControllers.get(key)
    if (existing) {
      existing.configure(options)
      return existing
    }
    const controller = new RapierCharacterController(
      body,
      collider,
      options,
      this,
      (nativeController, disposedController) => {
        if (this.characterControllers.get(key) === disposedController) {
          this.characterControllers.delete(key)
        }
        if (this.world?.characterControllers.has(nativeController)) {
          this.world.removeCharacterController(nativeController)
        }
      },
    )
    this.characterControllers.set(key, controller)
    return controller
  }

  createPointerAnchorBody(position: Vec3): PhysicsBodyHandle {
    return this.createBody({
      type: 'kinematic',
      transform: { position, rotation: [0, 0, 0, 1] },
    })
  }

  createPointerJoint(config: PointerJointConfig): PhysicsJointHandle {
    const world = this.getWorld()
    const pointerBody = this.getBodyRecord(config.pointerBody).body
    const targetBody = this.getBodyRecord(config.targetBody).body
    const anchor2 = vec3ToRapier(config.targetAnchorLocal)
    const anchor1 = new RAPIER.Vector3(0, 0, 0)

    let jointData: RAPIER.JointData
    switch (config.kind) {
      case 'spring':
        jointData = RAPIER.JointData.spring(
          0.01,
          config.springStiffness ?? 20,
          config.springDamping ?? 5,
          anchor1,
          anchor2,
        )
        break
      case 'rope':
        jointData = RAPIER.JointData.rope(config.ropeLength ?? 0.5, anchor1, anchor2)
        break
      default:
        jointData = RAPIER.JointData.spherical(anchor1, anchor2)
        break
    }

    const joint = world.createImpulseJoint(jointData, pointerBody, targetBody, true)
    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, {
      joint,
      kind: 'pointer',
      bodyA: config.pointerBody,
      bodyB: config.targetBody,
    })
    return handle
  }

  removeJoint(joint: PhysicsJointHandle): void {
    const record = this.joints.get(joint.value)
    if (!record) {
      return
    }
    this.getWorld().impulseJoints.remove(record.joint.handle, true)
    this.joints.delete(joint.value)
  }

  createRevoluteMotorJoint(config: RevoluteMotorJointConfig): PhysicsJointHandle {
    const world = this.getWorld()
    assertFiniteVec3(config.anchorA, 'revolute joint anchorA')
    assertFiniteVec3(config.anchorB, 'revolute joint anchorB')
    assertNonZeroAxis(config.axis, 'revolute joint axis')
    const bodyA = this.getBodyRecord(config.bodyA).body
    const bodyB = this.getBodyRecord(config.bodyB).body
    const jointData = RAPIER.JointData.revolute(
      vec3ToRapier(config.anchorA),
      vec3ToRapier(config.anchorB),
      vec3ToRapier(config.axis),
    )
    const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true)
    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, {
      joint,
      kind: 'revolute',
      bodyA: config.bodyA,
      bodyB: config.bodyB,
    })
    return handle
  }

  setRevoluteMotorVelocity(joint: PhysicsJointHandle, velocity: number, factor: number): void {
    const record = this.joints.get(joint.value)
    if (!record || record.kind !== 'revolute') {
      return
    }
    const revolute = record.joint as RAPIER.RevoluteImpulseJoint
    revolute.configureMotorVelocity(velocity, factor)
  }

  setRevoluteMotorPosition(
    joint: PhysicsJointHandle,
    angle: number,
    stiffness: number,
    damping: number,
  ): void {
    const record = this.joints.get(joint.value)
    if (!record || record.kind !== 'revolute') {
      return
    }
    const revolute = record.joint as RAPIER.RevoluteImpulseJoint
    revolute.configureMotorPosition(angle, stiffness, damping)
  }

  createPrismaticSpringJoint(config: PrismaticSpringJointConfig): PhysicsJointHandle {
    const world = this.getWorld()
    assertFiniteVec3(config.anchorA, 'prismatic spring joint anchorA')
    assertFiniteVec3(config.anchorB, 'prismatic spring joint anchorB')
    assertNonZeroAxis(config.axis, 'prismatic spring joint axis')
    const bodyA = this.getBodyRecord(config.bodyA).body
    const bodyB = this.getBodyRecord(config.bodyB).body
    const jointData = RAPIER.JointData.prismatic(
      vec3ToRapier(config.anchorA),
      vec3ToRapier(config.anchorB),
      vec3ToRapier(config.axis),
    )
    const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true) as RAPIER.PrismaticImpulseJoint
    // Spring-damper along the slide axis: pull the separation toward restLength.
    joint.configureMotorPosition(config.restLength, config.stiffness, config.damping)
    if (config.limits) {
      joint.setLimits(config.limits.min, config.limits.max)
    }
    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, {
      joint,
      kind: 'prismatic-spring',
      bodyA: config.bodyA,
      bodyB: config.bodyB,
    })
    return handle
  }

  createSceneJoint(config: SceneJointConfig): PhysicsJointHandle {
    const world = this.getWorld()
    assertFiniteVec3(config.anchorA, 'scene joint anchorA')
    assertFiniteVec3(config.anchorB, 'scene joint anchorB')
    const axisVec = config.axis ?? [0, 1, 0]
    if (config.type === 'revolute' || config.type === 'prismatic') {
      assertNonZeroAxis(axisVec, `${config.type} joint axis`)
    } else {
      assertFiniteVec3(axisVec, 'scene joint axis')
    }
    const bodyA = this.getBodyRecord(config.bodyA).body
    const bodyB = this.getBodyRecord(config.bodyB).body
    const anchorA = vec3ToRapier(config.anchorA)
    const anchorB = vec3ToRapier(config.anchorB)
    const axis = vec3ToRapier(axisVec)
    const identityFrame = { x: 0, y: 0, z: 0, w: 1 }

    let jointData: RAPIER.JointData
    switch (config.type) {
      case 'fixed':
        jointData = RAPIER.JointData.fixed(anchorA, identityFrame, anchorB, identityFrame)
        break
      case 'revolute':
        jointData = RAPIER.JointData.revolute(anchorA, anchorB, axis)
        break
      case 'prismatic':
        jointData = RAPIER.JointData.prismatic(anchorA, anchorB, axis)
        break
      case 'spherical':
        jointData = RAPIER.JointData.spherical(anchorA, anchorB)
        break
      case 'spring':
        jointData = RAPIER.JointData.spring(
          config.spring?.restLength ?? 0,
          config.spring?.stiffness ?? 20,
          config.spring?.damping ?? 5,
          anchorA,
          anchorB,
        )
        break
      case 'rope':
        jointData = RAPIER.JointData.rope(config.ropeLength ?? 0.5, anchorA, anchorB)
        break
    }

    const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true)
    if (config.type === 'revolute' || config.type === 'prismatic') {
      const unitJoint = joint as RAPIER.RevoluteImpulseJoint | RAPIER.PrismaticImpulseJoint
      if (config.limits) {
        unitJoint.setLimits(config.limits.min, config.limits.max)
      }
      if (config.motor) {
        unitJoint.configureMotorVelocity(config.motor.velocity, config.motor.maxForce)
      }
    }

    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, {
      joint,
      kind: 'scene',
      bodyA: config.bodyA,
      bodyB: config.bodyB,
    })
    return handle
  }

  /** @internal — used by controller wrappers in this module. */
  getWorldInternal(): RAPIER.World {
    return this.getWorld()
  }

  /** @internal */
  getBodyRecordInternal(handle: PhysicsBodyHandle): BodyRecord {
    return this.getBodyRecord(handle)
  }

  /** @internal */
  getColliderRecord(shape: PhysicsShapeHandle): RAPIER.Collider {
    return this.getShapeRecord(shape).collider
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
        bodyDesc =
          descriptor.kinematicMode === 'velocity'
            ? RAPIER.RigidBodyDesc.kinematicVelocityBased()
            : RAPIER.RigidBodyDesc.kinematicPositionBased()
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

    if (descriptor.type === 'dynamic') {
      if (descriptor.angularDamping !== undefined) {
        bodyDesc.setAngularDamping(descriptor.angularDamping)
      }
      if (descriptor.linearDamping !== undefined) {
        bodyDesc.setLinearDamping(descriptor.linearDamping)
      }
      if (descriptor.ccdEnabled) {
        bodyDesc.setCcdEnabled(true)
      }
    }

    if (descriptor.lockPosition) {
      bodyDesc.enabledTranslations(
        !descriptor.lockPosition[0],
        !descriptor.lockPosition[1],
        !descriptor.lockPosition[2],
      )
    }
    if (descriptor.lockRotation) {
      bodyDesc.enabledRotations(
        !descriptor.lockRotation[0],
        !descriptor.lockRotation[1],
        !descriptor.lockRotation[2],
      )
    }

    if (descriptor.enabled === false) {
      bodyDesc.setEnabled(false)
    }

    if (descriptor.additionalSolverIterations && descriptor.additionalSolverIterations > 0) {
      bodyDesc.setAdditionalSolverIterations(Math.floor(descriptor.additionalSolverIterations))
    }

    return bodyDesc
  }

  /** Box/sphere/capsule principal inertia for explicit mass (Rapier needs mass + inertia together). */
  private applyExplicitMassProperties(
    bodyRecord: BodyRecord,
    shape: PhysicsShapeDescriptor,
    mass: number,
    inertiaScalePitchRoll = 1,
  ): void {
    let principal: Vec3
    if (shape.type === 'box') {
      const [hx, hy, hz] = shape.halfExtents
      principal = [
        (mass * (hy * hy + hz * hz)) / 12,
        (mass * (hx * hx + hz * hz)) / 12,
        (mass * (hx * hx + hy * hy)) / 12,
      ]
    } else if (shape.type === 'sphere') {
      const i = 0.4 * mass * shape.radius * shape.radius
      principal = [i, i, i]
    } else if (shape.type === 'capsule') {
      const i = 0.5 * mass * shape.radius * shape.radius
      principal = [i, i, i]
    } else if (shape.type === 'cylinder') {
      // Solid cylinder: about the long (Y) axis 0.5·m·r²; transverse (m/12)(3r²+(2h)²). Isotropic
      // approximation keeps it well-conditioned for wheel bodies (matches the capsule treatment).
      const i = 0.5 * mass * shape.radius * shape.radius
      principal = [i, i, i]
    } else {
      return
    }

    const pitchRollScale = Math.max(1, inertiaScalePitchRoll)
    const principalInertia: [number, number, number] = [
      principal[0] * pitchRollScale,
      principal[1],
      principal[2] * pitchRollScale,
    ]

    bodyRecord.body.setAdditionalMassProperties(
      mass,
      { x: 0, y: 0, z: 0 },
      { x: principalInertia[0], y: principalInertia[1], z: principalInertia[2] },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    )
  }

  private createColliderDesc(shape: PhysicsShapeDescriptor): RAPIER.ColliderDesc {
    let colliderDesc: RAPIER.ColliderDesc
    switch (shape.type) {
      case 'box':
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          shape.halfExtents[0],
          shape.halfExtents[1],
          shape.halfExtents[2],
        )
        break
      case 'sphere':
        colliderDesc = RAPIER.ColliderDesc.ball(shape.radius)
        break
      case 'capsule':
        colliderDesc = RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius)
        break
      case 'cylinder':
        colliderDesc = RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius)
        break
      case 'convexHull': {
        const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(shape.points))
        if (!hull) {
          throw new Error('Invalid convex hull collider points')
        }
        colliderDesc = hull
        break
      }
      case 'trimesh':
        colliderDesc = RAPIER.ColliderDesc.trimesh(
          new Float32Array(shape.vertices),
          new Uint32Array(shape.indices),
        )
        break
      case 'worldBoundary':
        colliderDesc = new RAPIER.ColliderDesc(new RAPIER.HalfSpace(vec3ToRapier(shape.normal)))
        break
    }

    const local = shape.localTransform
    if (local) {
      colliderDesc.setTranslation(local.position[0], local.position[1], local.position[2])
      colliderDesc.setRotation(quatToRapier(local.rotation))
    }

    const spawn = shape.spawn
    let activeEvents = 0
    if (spawn?.collisionGroups !== undefined) {
      colliderDesc.setCollisionGroups(spawn.collisionGroups)
    }
    if (spawn?.isSensor) {
      colliderDesc.setSensor(true)
      colliderDesc.setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT |
          RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED |
          RAPIER.ActiveCollisionTypes.FIXED_FIXED,
      )
    }
    if (spawn?.collisionEvents || spawn?.isSensor || spawn?.isArea) {
      activeEvents |= RAPIER.ActiveEvents.COLLISION_EVENTS
    }
    if (spawn?.contactMonitor) {
      activeEvents |= RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS
    }
    if (activeEvents !== 0) {
      colliderDesc.setActiveEvents(activeEvents)
    }
    if (spawn?.friction !== undefined) {
      colliderDesc.setFriction(spawn.friction)
    }
    if (spawn?.restitution !== undefined) {
      colliderDesc.setRestitution(spawn.restitution)
    }
    if (spawn?.density !== undefined) {
      colliderDesc.setDensity(spawn.density)
    }
    if (spawn?.frictionCombine !== undefined) {
      colliderDesc.setFrictionCombineRule(combineRuleToRapier(spawn.frictionCombine))
    }
    if (spawn?.restitutionCombine !== undefined) {
      colliderDesc.setRestitutionCombineRule(combineRuleToRapier(spawn.restitutionCombine))
    }
    if (spawn?.enabled === false) {
      colliderDesc.setEnabled(false)
    }

    return colliderDesc
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

  private findShapeRecordByCollider(colliderHandle: number): ShapeRecord | undefined {
    return [...this.shapes.values()].find((record) => record.collider.handle === colliderHandle)
  }

  private buildShapeQueryFilter(
    filter: import('@haku/physics').ShapeQueryFilter | undefined,
  ): ShapeQueryFilterOptions {
    const layerMask = filter?.layerMask ?? 0xffff
    const filterGroups = (0xffff << 16) | layerMask
    const filterFlags =
      filter?.includeTriggers === false ? RAPIER.QueryFilterFlags.EXCLUDE_SENSORS : undefined
    const excludeRigidBody = filter?.excludeBody
      ? this.getBodyRecord(filter.excludeBody).body
      : undefined
    const filterPredicate = (collider: RAPIER.Collider) => {
      const shapeRecord = this.findShapeRecordByCollider(collider.handle)
      return shapeRecord ? shapeRecord.enabled : true
    }
    return { filterFlags, filterGroups, excludeRigidBody, filterPredicate }
  }

  private disposeBodyOwnedResources(handle: PhysicsBodyHandle, record: BodyRecord): void {
    this.vehicles.delete(handle.value)
    this.dynamicVehicles.get(handle.value)?.dispose()

    for (const controller of [...this.characterControllers.values()]) {
      if (controller.body.value === handle.value) {
        controller.dispose()
      }
    }

    for (const [jointId, joint] of [...this.joints]) {
      if (joint.bodyA.value === handle.value || joint.bodyB.value === handle.value) {
        this.removeJoint(physicsJointHandle(jointId))
      }
    }

    for (const shapeId of record.colliderHandles) {
      const shape = this.shapes.get(shapeId)
      if (shape) {
        this.colliderEventMeta.delete(shape.collider.handle)
        this.colliderByHandle.delete(shape.collider.handle)
        this.colliderToBody.delete(shape.collider.handle)
        this.shapes.delete(shapeId)
      }
    }
  }

  private syncColliders(): void {
    this.getWorld().propagateModifiedBodyPositionsToColliders()
  }

  /** Rapier requires at least one step before scene queries see new colliders. */
  private refreshQueries(): void {
    const world = this.getWorld()
    const dt = world.timestep
    world.timestep = 0
  world.step(this.eventQueue ?? undefined)
    world.timestep = dt
  }
}

/**
 * Rapier panics with an unrecoverable WASM `unreachable` trap when fed NaN/∞ (or a degenerate
 * zero-length joint axis). These guards fail loudly with a catchable JS error at the boundary,
 * before such values reach `world.step`.
 */
function assertFiniteVec3(vec: Vec3, label: string): void {
  if (!Number.isFinite(vec[0]) || !Number.isFinite(vec[1]) || !Number.isFinite(vec[2])) {
    throw new Error(`Non-finite ${label}: [${vec[0]}, ${vec[1]}, ${vec[2]}]`)
  }
}

function assertNonZeroAxis(axis: Vec3, label: string): void {
  assertFiniteVec3(axis, label)
  if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-6) {
    throw new Error(`Degenerate (zero-length) ${label}: [${axis[0]}, ${axis[1]}, ${axis[2]}]`)
  }
}

function assertFiniteMass(mass: number | undefined, label: string): void {
  if (mass !== undefined && (!Number.isFinite(mass) || mass < 0)) {
    throw new Error(`Invalid ${label}: ${mass}`)
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

function composeQueryTransform(
  base: PhysicsTransform,
  descriptor: PhysicsShapeDescriptor,
): PhysicsTransform {
  if (!descriptor.localTransform) {
    return base
  }
  const local = descriptor.localTransform
  const rotatedLocal = rotateVec3ByQuat(local.position, base.rotation)
  return {
    position: [
      base.position[0] + rotatedLocal[0],
      base.position[1] + rotatedLocal[1],
      base.position[2] + rotatedLocal[2],
    ],
    rotation: multiplyQuat(base.rotation, local.rotation),
  }
}

function multiplyQuat(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  const x = aw * bx + ax * bw + ay * bz - az * by
  const y = aw * by - ax * bz + ay * bw + az * bx
  const z = aw * bz + ax * by - ay * bx + az * bw
  const w = aw * bw - ax * bx - ay * by - az * bz
  const len = Math.hypot(x, y, z, w)
  if (len === 0) {
    return [0, 0, 0, 1]
  }
  return [x / len, y / len, z / len, w / len]
}

function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [x, y, z] = v
  const [qx, qy, qz, qw] = q
  const ix = qw * x + qy * z - qz * y
  const iy = qw * y + qz * x - qx * z
  const iz = qw * z + qx * y - qy * x
  const iw = -qx * x - qy * y - qz * z
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

function createRapierShape(shape: PhysicsShapeDescriptor): RAPIER.Shape {
  switch (shape.type) {
    case 'box':
      return new RAPIER.Cuboid(
        shape.halfExtents[0],
        shape.halfExtents[1],
        shape.halfExtents[2],
      )
    case 'sphere':
      return new RAPIER.Ball(shape.radius)
    case 'capsule':
      return new RAPIER.Capsule(shape.halfHeight, shape.radius)
    case 'cylinder':
      return new RAPIER.Cylinder(shape.halfHeight, shape.radius)
    case 'convexHull': {
      const hull = new RAPIER.ConvexPolyhedron(new Float32Array(shape.points))
      return hull
    }
    case 'trimesh':
      return new RAPIER.TriMesh(
        new Float32Array(shape.vertices),
        new Uint32Array(shape.indices),
      )
    case 'worldBoundary':
      return new RAPIER.HalfSpace(vec3ToRapier(shape.normal))
  }
}

interface ShapeQueryFilterOptions {
  filterFlags?: RAPIER.QueryFilterFlags
  filterGroups?: number
  excludeRigidBody?: RAPIER.RigidBody
  filterPredicate?: (collider: RAPIER.Collider) => boolean
}

function isAnalyticPrimitive(shape: PhysicsShapeDescriptor): boolean {
  return shape.type === 'box' || shape.type === 'sphere' || shape.type === 'capsule'
}

function combineRuleToRapier(
  rule: 'average' | 'multiply' | 'min' | 'max',
): RAPIER.CoefficientCombineRule {
  switch (rule) {
    case 'average':
      return RAPIER.CoefficientCombineRule.Average
    case 'min':
      return RAPIER.CoefficientCombineRule.Min
    case 'multiply':
      return RAPIER.CoefficientCombineRule.Multiply
    case 'max':
      return RAPIER.CoefficientCombineRule.Max
  }
}

function resolvePhysicsEventKind(a: ColliderEventMeta, b: ColliderEventMeta): PhysicsCollisionEvent['kind'] {
  if (a.isArea || b.isArea) {
    return 'area'
  }
  if (a.isSensor || b.isSensor) {
    return 'trigger'
  }
  return 'collision'
}

function extractContactPoints(
  world: RAPIER.World,
  collider1: RAPIER.Collider,
  collider2: RAPIER.Collider,
  maxContacts: number,
): import('@haku/physics').PhysicsContactPoint[] {
  const contacts: import('@haku/physics').PhysicsContactPoint[] = []
  world.contactPair(collider1, collider2, (manifold) => {
    const normal = vec3FromRapier(manifold.normal())
    const count = Math.min(manifold.numSolverContacts(), maxContacts - contacts.length)
    for (let i = 0; i < count; i++) {
      contacts.push({
        point: vec3FromRapier(manifold.solverContactPoint(i)),
        normal: [normal[0], normal[1], normal[2]],
        depth: manifold.solverContactDist(i),
      })
    }
  })
  return contacts
}

function sdpMatrix3ToRowMajor(matrix: RAPIER.SdpMatrix3): Mat3RowMajor {
  return [
    matrix.m11,
    matrix.m12,
    matrix.m13,
    matrix.m21,
    matrix.m22,
    matrix.m23,
    matrix.m31,
    matrix.m32,
    matrix.m33,
  ]
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
