import { z } from 'zod'

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
type Vec3 = z.infer<typeof Vec3Schema>

const PositiveVec3Schema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
])

/** Isaac Mason Rapier sketch controller kinds. */
export const PhysicsControllerTypeSchema = z.enum([
  'custom-raycast',
  'dynamic-raycast',
  'arcade-vehicle',
  'revolute-joint-vehicle',
  'kinematic-character',
  'custom-spring',
  'pointer-controls',
])
export type PhysicsControllerType = z.infer<typeof PhysicsControllerTypeSchema>

/** Chassis rigid-body parameters shared by vehicle-style controllers. */
export const ControllerChassisSchema = z.object({
  mass: z.number().positive().default(250),
  halfExtents: PositiveVec3Schema.default([0.9, 0.3, 1.55]),
  lift: z.number().min(0).default(0.5),
  angularDamping: z.number().min(0).default(0.35),
  inertiaScale: z.number().positive().default(3),
})
export type ControllerChassis = z.infer<typeof ControllerChassisSchema>

/** Four-wheel layout — front-left, front-right, back-left, back-right. */
export const ControllerWheelsSchema = z.object({
  radius: z.number().positive().default(0.42),
  width: z.number().positive().default(0.32),
  halfWidth: z.number().positive().default(0.95),
  height: z.number().default(0.35),
  halfLength: z.number().positive().default(1.55),
})
export type ControllerWheels = z.infer<typeof ControllerWheelsSchema>

export const ControllerSuspensionSchema = z.object({
  stiffness: z.number().positive().default(30),
  restLength: z.number().positive().default(0.55),
  maxTravel: z.number().min(0).default(0.42),
  frictionSlip: z.number().positive().default(1.4),
  dampingRelaxation: z.number().positive().default(4.6),
  dampingCompression: z.number().positive().default(8.8),
  rollInfluence: z.number().min(0).default(0.01),
  sideFrictionStiffness: z.number().positive().default(1),
})
export type ControllerSuspension = z.infer<typeof ControllerSuspensionSchema>

export const ControllerEngineSchema = z.object({
  force: z.number().positive().default(350),
  boostMultiplier: z.number().positive().default(1.8),
  cruiseSpeedKmh: z.number().positive().default(90),
  maxSpeedKmh: z.number().positive().default(140),
  reverseFactor: z.number().min(0).max(1).default(0.6),
})
export type ControllerEngine = z.infer<typeof ControllerEngineSchema>

export const ControllerSteeringSchema = z.object({
  maxSteer: z.number().positive().default(0.55),
  steerSpeed: z.number().positive().default(6),
})
export type ControllerSteering = z.infer<typeof ControllerSteeringSchema>

export const ControllerBrakesSchema = z.object({
  brakeForce: z.number().positive().default(18),
  handbrakeForce: z.number().positive().default(32),
})
export type ControllerBrakes = z.infer<typeof ControllerBrakesSchema>

/** Drive feel — `isaac` matches Mason custom-raycast sketch controls (no speed cap, instant steer). */
export const ControllerDriveProfileSchema = z.enum(['arcade', 'isaac'])
export type ControllerDriveProfile = z.infer<typeof ControllerDriveProfileSchema>

export const ControllerJumpSchema = z.object({
  impulse: z.number().positive().default(2000),
  cooldown: z.number().min(0).default(0.5),
  bufferTime: z.number().min(0).default(0.18),
  airborneGravityScale: z.number().min(1).default(2),
})
export type ControllerJump = z.infer<typeof ControllerJumpSchema>

export const ControllerAssistsSchema = z.object({
  antiWheelie: z.boolean().default(true),
  tiltClampAirborne: z.number().min(0).default(4),
  uprightAssist: z.boolean().default(true),
  wallSlideAssist: z.boolean().default(true),
  wallSlideMaxSpeedKmh: z.number().min(0).default(18),
  wallSlideStrength: z.number().min(0).default(5),
  cornerLiftDamping: z.number().min(0).max(1).default(0.7),
  gripLoadCap: z.number().positive().default(2),
  landingGripTime: z.number().min(0).default(0.35),
  landingGripFactor: z.number().min(0).max(1).default(0.4),
})
export type ControllerAssists = z.infer<typeof ControllerAssistsSchema>

const ControllerBaseSchema = z.object({
  enabled: z.boolean().default(true),
  /** Runtime-only handle populated by engine sync. */
  physicsHandle: z.string().optional(),
})

/** Isaac Mason `custom-raycast-vehicle` — Haku custom solver (replaces legacy Vehicle). */
export const CustomRaycastControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('custom-raycast'),
  driveProfile: ControllerDriveProfileSchema.default('arcade'),
  chassis: ControllerChassisSchema.default(() => ControllerChassisSchema.parse({})),
  wheels: ControllerWheelsSchema.default(() => ControllerWheelsSchema.parse({})),
  suspension: ControllerSuspensionSchema.default(() => ControllerSuspensionSchema.parse({})),
  engine: ControllerEngineSchema.default(() => ControllerEngineSchema.parse({})),
  steering: ControllerSteeringSchema.default(() => ControllerSteeringSchema.parse({})),
  brakes: ControllerBrakesSchema.default(() => ControllerBrakesSchema.parse({})),
  jump: ControllerJumpSchema.default(() => ControllerJumpSchema.parse({})),
  assists: ControllerAssistsSchema.default(() => ControllerAssistsSchema.parse({})),
})
export type CustomRaycastController = z.infer<typeof CustomRaycastControllerSchema>

/** Drive feel for Rapier DynamicRaycastVehicleController. */
export const DynamicRaycastDriveProfileSchema = z.enum(['default', 'threejs-rapier'])
export type DynamicRaycastDriveProfile = z.infer<typeof DynamicRaycastDriveProfileSchema>

/** Rapier `DynamicRaycastVehicleController` (Isaac sketch + Three.js example). */
export const DynamicRaycastControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('dynamic-raycast'),
  driveProfile: DynamicRaycastDriveProfileSchema.default('default'),
  chassis: ControllerChassisSchema.default(() => ControllerChassisSchema.parse({})),
  wheels: ControllerWheelsSchema.default(() => ControllerWheelsSchema.parse({})),
  suspension: ControllerSuspensionSchema.default(() => ControllerSuspensionSchema.parse({})),
  /** Default/Isaac: direct throttle × force. */
  accelerateForce: z.number().positive().default(2),
  brakeForce: z.number().min(0).default(0.05),
  steerAngle: z.number().positive().default(Math.PI / 24),
  /** Three.js example — ramped engine force (Leva-style defaults in runtime). */
  accelerateForceMin: z.number().default(-30),
  accelerateForceMax: z.number().default(30),
  /** Force added per legacy 60 Hz reference step; runtime scales this by bounded dt × 60. */
  accelerateForceStep: z.number().positive().default(1),
  brakeForceMax: z.number().min(0).default(1),
  /** Brake added per legacy 60 Hz reference step; runtime scales this by bounded dt × 60. */
  brakeForceStep: z.number().positive().default(0.05),
  steerAngleMax: z.number().positive().default(Math.PI / 4),
  /** Blend alpha per legacy 60 Hz reference step; runtime uses 1 − (1 − alpha)^(dt × 60). */
  steerLerp: z.number().min(0).max(1).default(0.25),
})
export type DynamicRaycastController = z.infer<typeof DynamicRaycastControllerSchema>

/** Isaac Mason `arcade-vehicle-controller` — impulse arcade drive + drift. */
export const ArcadeVehicleControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('arcade-vehicle'),
  chassis: ControllerChassisSchema.default(() => ControllerChassisSchema.parse({})),
  wheels: ControllerWheelsSchema.default(() => ControllerWheelsSchema.parse({})),
  maxForwardSpeed: z.number().positive().default(8),
  maxReverseSpeed: z.number().default(-1),
  jumpImpulse: z.number().positive().default(12),
  driftSteerRate: z.number().positive().default(0.01),
  /** Speed blend alpha per legacy 60 Hz reference step; runtime uses reference-step smoothing. */
  speedLerp: z.number().min(0).max(1).default(0.03),
  damping: z.number().positive().default(1.5),
})
export type ArcadeVehicleController = z.infer<typeof ArcadeVehicleControllerSchema>

const RevoluteWheelSchema = z.object({
  axlePosition: Vec3Schema,
  wheelPosition: Vec3Schema,
  isSteered: z.boolean().default(false),
  isDriven: z.boolean().default(false),
})

/** Isaac Mason `revolute-joint-vehicle` — revolute joints + motor drive. */
export const RevoluteJointVehicleControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('revolute-joint-vehicle'),
  chassis: ControllerChassisSchema.default(() => ControllerChassisSchema.parse({})),
  wheels: z.array(RevoluteWheelSchema).length(4).default([
    { axlePosition: [-1.2, -0.6, 0.7], wheelPosition: [-1.2, -0.6, 1], isSteered: true, isDriven: false },
    { axlePosition: [-1.2, -0.6, -0.7], wheelPosition: [-1.2, -0.6, -1], isSteered: true, isDriven: false },
    { axlePosition: [1.2, -0.6, 0.7], wheelPosition: [1.2, -0.6, 1], isSteered: false, isDriven: true },
    { axlePosition: [1.2, -0.6, -0.7], wheelPosition: [1.2, -0.6, -1], isSteered: false, isDriven: true },
  ]),
  wheelRadius: z.number().positive().default(0.4),
  wheelHalfHeight: z.number().positive().default(0.15),
  drivenTargetVelocity: z.number().positive().default(1000),
  drivenFactor: z.number().positive().default(10),
  steerAngle: z.number().positive().default(0.6),
  steerStiffness: z.number().positive().default(100),
  steerDamping: z.number().positive().default(10),
})
export type RevoluteJointVehicleController = z.infer<typeof RevoluteJointVehicleControllerSchema>

/** Isaac Mason `kinematic-character-controller` — Rapier KinematicCharacterController. */
export const KinematicCharacterControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('kinematic-character'),
  capsuleRadius: z.number().positive().default(0.35),
  capsuleHalfHeight: z.number().min(0).default(0.5),
  moveSpeed: z.number().positive().default(1),
  sprintMultiplier: z.number().positive().default(1.5),
  snapToGroundDistance: z.number().min(0).default(0.1),
  characterShapeOffset: z.number().min(0).default(0.1),
  autoStepMaxHeight: z.number().min(0).default(0.7),
  autoStepMinWidth: z.number().min(0).default(0.3),
  autoStepIncludeDynamicBodies: z.boolean().default(true),
  applyImpulsesToDynamicBodies: z.boolean().default(true),
  accelerationTimeGrounded: z.number().positive().default(0.025),
  accelerationTimeAirborne: z.number().positive().default(0.2),
  velocityXZSmoothing: z.number().min(0).max(1).default(0.2),
  velocityXZMin: z.number().min(0).default(0.0001),
  maxJumpHeight: z.number().positive().default(4),
  minJumpHeight: z.number().positive().default(1),
  timeToJumpApex: z.number().positive().default(1),
})
export type KinematicCharacterController = z.infer<typeof KinematicCharacterControllerSchema>

/** Isaac Mason `custom-spring` — force spring between two dynamic bodies. */
export const CustomSpringControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('custom-spring'),
  /** Entity id of the second connected body. */
  targetEntityId: z.string().default(''),
  localAnchorA: Vec3Schema.default([0, 0, 0]),
  localAnchorB: Vec3Schema.default([0, 0, 0]),
  restLength: z.number().min(0).default(1),
  stiffness: z.number().min(0).default(50),
  damping: z.number().min(0).default(10),
})
export type CustomSpringController = z.infer<typeof CustomSpringControllerSchema>

export const PointerConstraintTypeSchema = z.enum(['spherical', 'spring', 'rope'])
export type PointerConstraintType = z.infer<typeof PointerConstraintTypeSchema>

/** Isaac Mason `pointer-controls` — drag dynamic bodies with pointer joints. */
export const PointerControlsControllerSchema = ControllerBaseSchema.extend({
  type: z.literal('pointer-controls'),
  draggable: z.boolean().default(true),
  constraintType: PointerConstraintTypeSchema.default('spherical'),
  springStiffness: z.number().min(0).default(20),
  springDamping: z.number().min(0).default(5),
  ropeLength: z.number().positive().default(0.5),
})
export type PointerControlsController = z.infer<typeof PointerControlsControllerSchema>

export const PhysicsControllerSchema = z.discriminatedUnion('type', [
  CustomRaycastControllerSchema,
  DynamicRaycastControllerSchema,
  ArcadeVehicleControllerSchema,
  RevoluteJointVehicleControllerSchema,
  KinematicCharacterControllerSchema,
  CustomSpringControllerSchema,
  PointerControlsControllerSchema,
])
export type PhysicsController = z.infer<typeof PhysicsControllerSchema>

export const CONTROLLER_WHEEL_ORDER = ['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const
export type ControllerWheelSlot = (typeof CONTROLLER_WHEEL_ORDER)[number]

/** Local chassis connection points for four-wheel controllers. */
export function controllerWheelLocalPositions(
  wheels: ControllerWheels,
): [Vec3, Vec3, Vec3, Vec3] {
  const { halfWidth, height, halfLength } = wheels
  return [
    [-halfWidth, height, halfLength],
    [halfWidth, height, halfLength],
    [-halfWidth, height, -halfLength],
    [halfWidth, height, -halfLength],
  ]
}

/** Implicit chassis box collider for vehicle-style physics controllers. */
export function controllerChassisCollider(
  chassis: ControllerChassis,
): {
  shape: 'box'
  halfExtents: [number, number, number]
  isStatic: false
  offset: Vec3
  rotation: [number, number, number, number]
} {
  const [hx, hy, hz] = chassis.halfExtents
  return {
    shape: 'box',
    halfExtents: [hx, hy, hz],
    isStatic: false,
    offset: [0, chassis.lift, 0],
    rotation: [0, 0, 0, 1],
  }
}

/** Whether this controller type spawns an implicit chassis collider. */
export function controllerNeedsChassis(type: PhysicsControllerType): boolean {
  return (
    type === 'custom-raycast' ||
    type === 'dynamic-raycast' ||
    type === 'arcade-vehicle' ||
    type === 'revolute-joint-vehicle'
  )
}

/** Whether this controller type spawns an implicit capsule collider. */
export function controllerNeedsCapsule(type: PhysicsControllerType): boolean {
  return type === 'kinematic-character'
}

/** @deprecated Use ControllerChassis — kept for migration from Vehicle. */
export const VehicleChassisSchema = ControllerChassisSchema
export type VehicleChassis = ControllerChassis
export const VehicleWheelsSchema = ControllerWheelsSchema
export type VehicleWheels = ControllerWheels
export const vehicleWheelLocalPositions = controllerWheelLocalPositions
export const VEHICLE_WHEEL_ORDER = CONTROLLER_WHEEL_ORDER
export type VehicleWheelSlot = ControllerWheelSlot
