import { z } from 'zod'

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
type Vec3 = z.infer<typeof Vec3Schema>

const PositiveVec3Schema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
])

/** Chassis rigid-body parameters (reference: PHYSICS_HALF, CHASSIS_LIFT, DEFAULT_PARAMS mass/damping). */
export const VehicleChassisSchema = z.object({
  /** Chassis mass in kg. */
  mass: z.number().positive().default(250),
  /** Physics box half-extents `[x, y, z]` (shorter than visual body). */
  halfExtents: PositiveVec3Schema.default([0.9, 0.3, 1.55]),
  /** Vertical offset of the physics box above the entity origin (lowers center of mass). */
  lift: z.number().min(0).default(0.5),
  /** Angular velocity damping on the chassis body. */
  angularDamping: z.number().min(0).default(0.12),
  /** Pitch/roll inertia multiplier (yaw unaffected). Higher = harder to flip. */
  inertiaScale: z.number().positive().default(3),
})
export type VehicleChassis = z.infer<typeof VehicleChassisSchema>

/**
 * Wheel attachment pattern — four corners derived from halfWidth / height / halfLength.
 * Order: front-left, front-right, back-left, back-right (reference WHEEL_CONNECTION).
 */
export const VehicleWheelsSchema = z.object({
  /** Wheel raycast radius. */
  radius: z.number().positive().default(0.42),
  /** Visual tire width (presentation only). */
  width: z.number().positive().default(0.32),
  /** Half track width (|x| of left/right wheels). */
  halfWidth: z.number().positive().default(0.95),
  /** Vertical chassis connection offset. */
  height: z.number().default(0.35),
  /** Half wheelbase (|z| of front axle from origin). */
  halfLength: z.number().positive().default(1.55),
})
export type VehicleWheels = z.infer<typeof VehicleWheelsSchema>

/** Suspension and tire friction — fields align with `@haku/physics` WheelConfig. */
export const VehicleSuspensionSchema = z.object({
  stiffness: z.number().positive().default(70),
  restLength: z.number().positive().default(0.55),
  maxTravel: z.number().min(0).default(0.42),
  frictionSlip: z.number().positive().default(7.8),
  dampingRelaxation: z.number().positive().default(3.5),
  dampingCompression: z.number().positive().default(4.4),
  rollInfluence: z.number().min(0).default(0.008),
})
export type VehicleSuspension = z.infer<typeof VehicleSuspensionSchema>

/** Engine drive and speed caps. */
export const VehicleEngineSchema = z.object({
  force: z.number().positive().default(1400),
  boostMultiplier: z.number().positive().default(1.8),
  cruiseSpeedKmh: z.number().positive().default(90),
  maxSpeedKmh: z.number().positive().default(140),
  reverseFactor: z.number().min(0).max(1).default(0.6),
})
export type VehicleEngine = z.infer<typeof VehicleEngineSchema>

/** Steering smoothing and limits. */
export const VehicleSteeringSchema = z.object({
  maxSteer: z.number().positive().default(0.55),
  steerSpeed: z.number().positive().default(6),
})
export type VehicleSteering = z.infer<typeof VehicleSteeringSchema>

/** Service and handbrake strengths. */
export const VehicleBrakesSchema = z.object({
  brakeForce: z.number().positive().default(18),
  handbrakeForce: z.number().positive().default(32),
})
export type VehicleBrakes = z.infer<typeof VehicleBrakesSchema>

/** Jump impulse and airborne gravity tweak. */
export const VehicleJumpSchema = z.object({
  impulse: z.number().positive().default(2000),
  cooldown: z.number().min(0).default(0.5),
  bufferTime: z.number().min(0).default(0.18),
  airborneGravityScale: z.number().min(1).default(2),
})
export type VehicleJump = z.infer<typeof VehicleJumpSchema>

/** Arcade stability assists (reference DEFAULT_PARAMS assist block). */
export const VehicleAssistsSchema = z.object({
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
export type VehicleAssists = z.infer<typeof VehicleAssistsSchema>

export const VehicleSchema = z.object({
  chassis: VehicleChassisSchema.default(() => VehicleChassisSchema.parse({})),
  wheels: VehicleWheelsSchema.default(() => VehicleWheelsSchema.parse({})),
  suspension: VehicleSuspensionSchema.default(() => VehicleSuspensionSchema.parse({})),
  engine: VehicleEngineSchema.default(() => VehicleEngineSchema.parse({})),
  steering: VehicleSteeringSchema.default(() => VehicleSteeringSchema.parse({})),
  brakes: VehicleBrakesSchema.default(() => VehicleBrakesSchema.parse({})),
  jump: VehicleJumpSchema.default(() => VehicleJumpSchema.parse({})),
  assists: VehicleAssistsSchema.default(() => VehicleAssistsSchema.parse({})),
  enabled: z.boolean().default(true),
  /**
   * Runtime-only raycast vehicle handle — populated by engine sync (T01.12+).
   * Optional in scene JSON; not required for authoring.
   */
  physicsVehicleHandle: z.string().optional(),
})
export type Vehicle = z.infer<typeof VehicleSchema>

/** Wheel index order: front-left, front-right, back-left, back-right. */
export const VEHICLE_WHEEL_ORDER = ['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const
export type VehicleWheelSlot = (typeof VEHICLE_WHEEL_ORDER)[number]

/** Local chassis connection points for each wheel slot (reference connection order). */
export function vehicleWheelLocalPositions(
  wheels: VehicleWheels,
): [Vec3, Vec3, Vec3, Vec3] {
  const { halfWidth, height, halfLength } = wheels
  return [
    [-halfWidth, height, halfLength],
    [halfWidth, height, halfLength],
    [-halfWidth, height, -halfLength],
    [halfWidth, height, -halfLength],
  ]
}
