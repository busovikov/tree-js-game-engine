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
  computeImpulseDenominator,
  type Mat3RowMajor,
} from './raycast-vehicle-friction.js'
import {
  stepRaycastVehicle,
  type RaycastVehicleSimulationHooks,
  type WheelRuntime,
} from './raycast-vehicle-simulation.js'
import type { IRaycastVehicle, WheelConfig, WheelState } from './raycast-vehicle.js'
import type {
  CharacterControllerOptions,
  CharacterControllerStepResult,
  DynamicRaycastWheelConfig,
  ICharacterController,
  IDynamicRaycastVehicle,
} from './physics-controllers.js'
import type { PhysicsJointHandle, PointerJointConfig, RevoluteMotorJointConfig } from './joints.js'
import { physicsJointHandle } from './joints.js'
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
  velocityAtWorldPoint,
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

interface StubPointerJointRecord {
  kind: 'pointer'
  config: PointerJointConfig
}

interface StubRevoluteJointRecord {
  kind: 'revolute'
  config: RevoluteMotorJointConfig
  motorVelocity: number
  motorFactor: number
  motorAngle: number
  motorStiffness: number
  motorDamping: number
  usePositionMotor: boolean
}

type StubJointRecord = StubPointerJointRecord | StubRevoluteJointRecord

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

  private getWheel(wheel: PhysicsWheelHandle): WheelRuntime {
    const record = this.wheels.get(wheel.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('wheel', wheel.value)
    }
    return record
  }
}

class StubDynamicRaycastVehicle implements IDynamicRaycastVehicle {
  private readonly wheelHandles: PhysicsWheelHandle[] = []
  private readonly wheelConfigs: DynamicRaycastWheelConfig[] = []
  private readonly inner: IRaycastVehicle

  constructor(
    readonly chassis: PhysicsBodyHandle,
    backend: StubPhysicsBackend,
  ) {
    this.inner = backend.createRaycastVehicle(chassis)
  }

  addWheel(config: DynamicRaycastWheelConfig): number {
    const handle = this.inner.addWheel({
      localPosition: config.localPosition,
      directionLocal: config.directionLocal ?? [0, -1, 0],
      axleLocal: config.axleLocal ?? [1, 0, 0],
      radius: config.radius,
      suspensionRestLength: config.suspensionRestLength,
      suspensionStiffness: config.suspensionStiffness,
      maxSuspensionTravel: config.maxSuspensionTravel ?? 0.42,
      frictionSlip: config.frictionSlip,
      dampingRelaxation: 2.3,
      dampingCompression: 4.4,
      rollInfluence: 0.01,
      sideFrictionStiffness: config.sideFrictionStiffness ?? 1,
    })
    this.wheelHandles.push(handle)
    this.wheelConfigs.push(config)
    return this.wheelHandles.length - 1
  }

  updateVehicle(_dt: number): void {
    // Stub raycast vehicle steps inside backend.step via simulate().
  }

  setWheelEngineForce(wheelIndex: number, force: number): void {
    const wheel = this.wheelHandles[wheelIndex]
    if (wheel) this.inner.applyEngineForce(wheel, force)
  }

  setWheelBrake(wheelIndex: number, strength: number): void {
    const wheel = this.wheelHandles[wheelIndex]
    if (wheel) this.inner.setBrake(wheel, strength)
  }

  setWheelSteering(wheelIndex: number, angle: number): void {
    const wheel = this.wheelHandles[wheelIndex]
    if (wheel) this.inner.setSteering(wheel, angle)
  }

  getWheelSteering(wheelIndex: number): number {
    return this.inner.getWheelStates()[wheelIndex]?.steering ?? 0
  }

  getWheelRotation(wheelIndex: number): number {
    return this.inner.getWheelStates()[wheelIndex]?.rotation ?? 0
  }

  getWheelSuspensionLength(wheelIndex: number): number {
    return this.inner.getWheelStates()[wheelIndex]?.suspensionLength ?? 0
  }

  getWheelChassisConnectionY(wheelIndex: number): number {
    return this.wheelConfigs[wheelIndex]?.localPosition[1] ?? 0
  }

  getWheelAxle(_wheelIndex: number): Vec3 {
    return [1, 0, 0]
  }

  getWheelIsInContact(wheelIndex: number): boolean {
    return this.inner.getWheelStates()[wheelIndex]?.inContact ?? false
  }
}

class StubCharacterController implements ICharacterController {
  private options: CharacterControllerOptions

  constructor(
    readonly body: PhysicsBodyHandle,
    readonly collider: PhysicsShapeHandle,
    options: CharacterControllerOptions,
    private readonly backend: StubPhysicsBackend,
  ) {
    this.options = { ...options }
  }

  configure(options: CharacterControllerOptions): void {
    this.options = { ...options }
  }

  step(movement: Vec3, dt: number): CharacterControllerStepResult {
    const transform = this.backend.getBodyTransform(this.body)
    let nextY = transform.position[1] + movement[1]
    const grounded = nextY <= 0.01 + this.options.snapToGroundDistance
    if (grounded && nextY < 0) {
      nextY = 0
    }
    const next: Vec3 = [
      transform.position[0] + movement[0],
      nextY,
      transform.position[2] + movement[2],
    ]
    this.backend.setBodyTransform(this.body, { ...transform, position: next })
    this.backend.setBodyLinearVelocity(this.body, [
      movement[0] / Math.max(dt, 1e-4),
      movement[1] / Math.max(dt, 1e-4),
      movement[2] / Math.max(dt, 1e-4),
    ])
    return { grounded, movement }
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
  private readonly dynamicVehicles = new Map<string, StubDynamicRaycastVehicle>()
  private readonly characterControllers = new Map<string, StubCharacterController>()
  private readonly joints = new Map<string, StubJointRecord>()

  init(): void {
    this.initialized = true
  }

  dispose(): void {
    this.initialized = false
    this.simulationTime = 0
    this.bodies.clear()
    this.shapes.clear()
    this.vehicles.clear()
    this.dynamicVehicles.clear()
    this.characterControllers.clear()
    this.joints.clear()
  }

  isInitialized(): boolean {
    return this.initialized
  }

  prepareSceneQueries(): void {
    // Stub raycasts work immediately after attachShape.
  }

  step(dt: number): void {
    this.assertInitialized()

    for (const vehicle of this.vehicles.values()) {
      vehicle.simulate(dt)
    }

    for (const vehicle of this.dynamicVehicles.values()) {
      vehicle.updateVehicle(dt)
    }

    this.applyStubJoints(dt)

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
    this.clearForces()

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

  getBodyMass(body: PhysicsBodyHandle): number {
    this.assertInitialized()
    const record = this.getBody(body)
    return record.descriptor.mass ?? 1
  }

  getInverseMass(body: PhysicsBodyHandle): number {
    this.assertInitialized()
    const record = this.getBody(body)
    if (record.descriptor.type !== 'dynamic') {
      return 0
    }
    const mass = record.descriptor.mass ?? 1
    return mass > 0 ? 1 / mass : 0
  }

  getVelocityAtWorldPoint(body: PhysicsBodyHandle, worldPoint: Vec3): Vec3 {
    this.assertInitialized()
    const record = this.getBody(body)
    return velocityAtWorldPoint(
      record.transform.position,
      record.linearVelocity,
      record.angularVelocity,
      worldPoint,
    )
  }

  getImpulseDenominator(body: PhysicsBodyHandle, worldPoint: Vec3, normal: Vec3): number {
    this.assertInitialized()
    const record = this.getBody(body)
    const invMass = this.getInverseMass(body)
    if (invMass === 0) {
      return 0
    }
    const mass = record.descriptor.mass ?? 1
    const invInertia = 1 / (mass * 0.4)
    const inertia: Mat3RowMajor = [
      invInertia,
      0,
      0,
      0,
      invInertia,
      0,
      0,
      0,
      invInertia,
    ]
    return computeImpulseDenominator(
      record.transform.position,
      invMass,
      inertia,
      worldPoint,
      normal,
    )
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

  createDynamicRaycastVehicle(chassis: PhysicsBodyHandle): IDynamicRaycastVehicle {
    this.assertInitialized()
    this.getBody(chassis)
    const existing = this.dynamicVehicles.get(chassis.value)
    if (existing) {
      return existing
    }
    const vehicle = new StubDynamicRaycastVehicle(chassis, this)
    this.dynamicVehicles.set(chassis.value, vehicle)
    return vehicle
  }

  createCharacterController(
    body: PhysicsBodyHandle,
    collider: PhysicsShapeHandle,
    options: CharacterControllerOptions,
  ): ICharacterController {
    this.assertInitialized()
    this.getBody(body)
    this.getShape(collider)
    const key = `${body.value}:${collider.value}`
    const existing = this.characterControllers.get(key)
    if (existing) {
      existing.configure(options)
      return existing
    }
    const controller = new StubCharacterController(body, collider, options, this)
    this.characterControllers.set(key, controller)
    return controller
  }

  createPointerAnchorBody(position: Vec3): PhysicsBodyHandle {
    this.assertInitialized()
    return this.createBody({
      type: 'kinematic',
      transform: { position, rotation: [0, 0, 0, 1] },
    })
  }

  createPointerJoint(config: PointerJointConfig): PhysicsJointHandle {
    this.assertInitialized()
    this.getBody(config.pointerBody)
    this.getBody(config.targetBody)
    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, { kind: 'pointer', config })
    return handle
  }

  removeJoint(joint: PhysicsJointHandle): void {
    this.assertInitialized()
    this.joints.delete(joint.value)
  }

  createRevoluteMotorJoint(config: RevoluteMotorJointConfig): PhysicsJointHandle {
    this.assertInitialized()
    this.getBody(config.bodyA)
    this.getBody(config.bodyB)
    const handle = physicsJointHandle(createId('joint'))
    this.joints.set(handle.value, {
      kind: 'revolute',
      config,
      motorVelocity: 0,
      motorFactor: 1,
      motorAngle: 0,
      motorStiffness: 100,
      motorDamping: 10,
      usePositionMotor: false,
    })
    return handle
  }

  setRevoluteMotorVelocity(joint: PhysicsJointHandle, velocity: number, factor: number): void {
    this.assertInitialized()
    const record = this.joints.get(joint.value)
    if (!record || record.kind !== 'revolute') {
      return
    }
    record.motorVelocity = velocity
    record.motorFactor = factor
    record.usePositionMotor = false
  }

  setRevoluteMotorPosition(
    joint: PhysicsJointHandle,
    angle: number,
    stiffness: number,
    damping: number,
  ): void {
    this.assertInitialized()
    const record = this.joints.get(joint.value)
    if (!record || record.kind !== 'revolute') {
      return
    }
    record.motorAngle = angle
    record.motorStiffness = stiffness
    record.motorDamping = damping
    record.usePositionMotor = true
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

  private applyStubJoints(dt: number): void {
    for (const record of this.joints.values()) {
      if (record.kind === 'pointer') {
        this.applyStubPointerJoint(record.config)
        continue
      }
      this.applyStubRevoluteJoint(record, dt)
    }
  }

  private applyStubPointerJoint(config: PointerJointConfig): void {
    const pointer = this.getBody(config.pointerBody)
    const target = this.getBody(config.targetBody)
    if (target.descriptor.type !== 'dynamic') {
      return
    }

    const pointerPos = pointer.transform.position
    const targetTransform = target.transform
    const local = config.targetAnchorLocal
    const rotated = rotateVec3ByQuatStub(local, [
      targetTransform.rotation[0],
      targetTransform.rotation[1],
      targetTransform.rotation[2],
      targetTransform.rotation[3],
    ])
    const anchor: Vec3 = [
      targetTransform.position[0] + rotated[0],
      targetTransform.position[1] + rotated[1],
      targetTransform.position[2] + rotated[2],
    ]

    const dx = pointerPos[0] - anchor[0]
    const dy = pointerPos[1] - anchor[1]
    const dz = pointerPos[2] - anchor[2]
    const dist = Math.hypot(dx, dy, dz)
    if (dist < 1e-6) {
      return
    }
    const inv = 1 / dist
    const ux = dx * inv
    const uy = dy * inv
    const uz = dz * inv

    let forceMag = 0
    if (config.kind === 'spring') {
      const stiffness = config.springStiffness ?? 20
      const damping = config.springDamping ?? 5
      const relVel = subVec3(pointerPos, anchor)
      forceMag = stiffness * dist - damping * Math.hypot(relVel[0], relVel[1], relVel[2])
    } else if (config.kind === 'rope') {
      const maxLen = config.ropeLength ?? 0.5
      if (dist > maxLen) {
        forceMag = (dist - maxLen) * 80
      }
    } else {
      forceMag = dist * 40
    }

    target.force = addVec3(target.force, [ux * forceMag, uy * forceMag, uz * forceMag])
  }

  private applyStubRevoluteJoint(record: StubRevoluteJointRecord, dt: number): void {
    const bodyB = this.getBody(record.config.bodyB)
    if (bodyB.descriptor.type !== 'dynamic') {
      return
    }
    if (record.usePositionMotor) {
      const delta = record.motorAngle - bodyB.transform.rotation[1]
      bodyB.angularVelocity = addVec3(bodyB.angularVelocity, [
        0,
        delta * record.motorStiffness * dt - bodyB.angularVelocity[1] * record.motorDamping * dt,
        0,
      ])
      return
    }
    bodyB.angularVelocity = addVec3(bodyB.angularVelocity, [
      record.motorVelocity * record.motorFactor * dt,
      0,
      0,
    ])
  }

  private getShape(handle: PhysicsShapeHandle): StubShapeRecord {
    const record = this.shapes.get(handle.value)
    if (!record) {
      throw new PhysicsHandleNotFoundError('shape', handle.value)
    }
    return record
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

function rotateVec3ByQuatStub(
  v: Vec3,
  q: [number, number, number, number],
): Vec3 {
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

/** Reset stub ID counter — test helper only. */
export function resetStubPhysicsIds(): void {
  nextId = 0
}
