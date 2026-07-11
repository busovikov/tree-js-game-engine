import type { PhysicsBodyHandle, PhysicsWheelHandle } from './handles.js'
import type { WheelConfig } from './raycast-vehicle.js'
import type { PhysicsTransform, RaycastHit, RaycastQuery, Vec3 } from './types.js'
import {
  clamp,
  dotVec3,
  rotateVec3ByQuat,
  scaleVec3,
  subVec3,
  transformLocalPoint,
  velocityAtWorldPoint,
} from './vec-math.js'

const DOWN_LOCAL: Vec3 = [0, -1, 0]
const FORWARD_LOCAL: Vec3 = [0, 0, 1]
const DEFAULT_MAX_SUSPENSION_FORCE = 100_000
/** Reject wall/ceiling hits during downward suspension rays. */
const MIN_GROUND_NORMAL_Y = 0.3

/** Mutable per-wheel runtime used by the shared sketchbook-style solver. */
export interface WheelRuntime {
  config: WheelConfig
  steering: number
  engineForce: number
  brake: number
  rotation: number
  inContact: boolean
  contactPoint: Vec3 | null
  suspensionLength: number
  prevSuspensionLength: number
}

export interface RaycastVehicleSimulationHooks {
  raycast(query: RaycastQuery): RaycastHit | null
  getChassisTransform(chassis: PhysicsBodyHandle): PhysicsTransform
  getChassisLinearVelocity(chassis: PhysicsBodyHandle): Vec3
  getChassisAngularVelocity(chassis: PhysicsBodyHandle): Vec3
  applyForceAtPoint(chassis: PhysicsBodyHandle, force: Vec3, worldPoint: Vec3): void
}

export interface RaycastVehicleStepResult {
  wheel: PhysicsWheelHandle
  inContact: boolean
  contactPoint: Vec3 | null
  suspensionLength: number
  rotation: number
  steering: number
  engineForce: number
}

/**
 * Sketchbook / cannon-es style raycast vehicle update.
 * Raycasts each wheel, applies spring-damper suspension, friction, and engine force.
 */
export function stepRaycastVehicle(
  chassis: PhysicsBodyHandle,
  wheels: ReadonlyMap<string, WheelRuntime>,
  hooks: RaycastVehicleSimulationHooks,
  dt: number,
): RaycastVehicleStepResult[] {
  const transform = hooks.getChassisTransform(chassis)
  const linearVelocity = hooks.getChassisLinearVelocity(chassis)
  const angularVelocity = hooks.getChassisAngularVelocity(chassis)
  const center = transform.position
  const results: RaycastVehicleStepResult[] = []

  for (const [wheelId, wheel] of wheels) {
    const config = wheel.config
    const connectionWorld = transformLocalPoint(transform, config.localPosition)

    const steerQuat = steeringQuat(wheel.steering)
    const wheelBasis = composeWheelBasis(
      [transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]],
      steerQuat,
    )
    const suspDir = rotateVec3ByQuat(DOWN_LOCAL, wheelBasis)
    const forwardDir = rotateVec3ByQuat(FORWARD_LOCAL, wheelBasis)

    const rayLength = config.suspensionRestLength + config.maxSuspensionTravel
    const rawHit = hooks.raycast({
      origin: connectionWorld,
      direction: suspDir,
      maxDistance: rayLength + config.radius,
      excludeBody: chassis,
    })
    const hit =
      rawHit && isValidSuspensionHit(rawHit, connectionWorld, config.radius) ? rawHit : null

    wheel.inContact = hit !== null
    wheel.contactPoint = hit?.point ?? null

    if (hit) {
      const rawLength = hit.distance - config.radius
      const minLength = config.suspensionRestLength - config.maxSuspensionTravel
      const maxLength = config.suspensionRestLength + config.maxSuspensionTravel
      const suspensionLength = clamp(rawLength, minLength, maxLength)
      wheel.suspensionLength = suspensionLength

      const compression = config.suspensionRestLength - suspensionLength
      let suspensionForce = compression * config.suspensionStiffness

      const contactVel = velocityAtWorldPoint(center, linearVelocity, angularVelocity, hit.point)
      const suspRelativeVel = dotVec3(contactVel, suspDir)
      const damper =
        suspRelativeVel < 0
          ? config.dampingCompression * suspRelativeVel
          : config.dampingRelaxation * suspRelativeVel
      suspensionForce -= damper

      const maxForce = config.maxSuspensionForce ?? DEFAULT_MAX_SUSPENSION_FORCE
      suspensionForce = clamp(suspensionForce, 0, maxForce)

      const suspForceVec = scaleVec3(suspDir, -suspensionForce)
      const rollBlend = 1 - config.rollInfluence
      const forcePoint = lerpVec3(center, hit.point, rollBlend)
      hooks.applyForceAtPoint(chassis, suspForceVec, forcePoint)

      const lateralVel = subVec3(contactVel, scaleVec3(suspDir, dotVec3(contactVel, suspDir)))
      const sideFriction = scaleVec3(lateralVel, -config.frictionSlip)
      hooks.applyForceAtPoint(chassis, sideFriction, hit.point)

      const forwardSpeed = dotVec3(contactVel, forwardDir)
      const brakeForce = -forwardSpeed * wheel.brake
      hooks.applyForceAtPoint(chassis, scaleVec3(forwardDir, brakeForce), hit.point)

      if (wheel.engineForce !== 0) {
        hooks.applyForceAtPoint(chassis, scaleVec3(forwardDir, wheel.engineForce), hit.point)
      }

      if (config.radius > 0) {
        wheel.rotation -= (forwardSpeed / config.radius) * dt
      }
    } else {
      wheel.suspensionLength = config.suspensionRestLength + config.maxSuspensionTravel
    }

    wheel.prevSuspensionLength = wheel.suspensionLength

    results.push({
      wheel: { value: wheelId } as PhysicsWheelHandle,
      inContact: wheel.inContact,
      contactPoint: wheel.contactPoint,
      suspensionLength: wheel.suspensionLength,
      rotation: wheel.rotation,
      steering: wheel.steering,
      engineForce: wheel.engineForce,
    })
  }

  return results
}

function isValidSuspensionHit(hit: RaycastHit, connectionWorld: Vec3, radius: number): boolean {
  if (hit.normal[1] < MIN_GROUND_NORMAL_Y) {
    return false
  }
  if (hit.point[1] > connectionWorld[1] + radius * 0.5) {
    return false
  }
  return true
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function steeringQuat(angle: number): [number, number, number, number] {
  const half = angle * 0.5
  return [0, Math.sin(half), 0, Math.cos(half)]
}

function composeWheelBasis(
  chassisRotation: [number, number, number, number],
  steerRotation: [number, number, number, number],
): [number, number, number, number] {
  const [ax, ay, az, aw] = chassisRotation
  const [bx, by, bz, bw] = steerRotation

  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** Build a default four-wheel config set (FL, FR, BL, BR) from schema-aligned params. */
export function defaultFourWheelConfigs(options: {
  halfWidth?: number
  height?: number
  halfLength?: number
  radius?: number
  suspension?: Partial<
    Pick<
      WheelConfig,
      | 'suspensionRestLength'
      | 'suspensionStiffness'
      | 'dampingRelaxation'
      | 'dampingCompression'
      | 'maxSuspensionTravel'
      | 'frictionSlip'
      | 'rollInfluence'
    >
  >
} = {}): WheelConfig[] {
  const halfWidth = options.halfWidth ?? 0.95
  const height = options.height ?? 0.35
  const halfLength = options.halfLength ?? 1.55
  const radius = options.radius ?? 0.42
  const s = options.suspension ?? {}

  const base: Omit<WheelConfig, 'localPosition'> = {
    radius,
    suspensionRestLength: s.suspensionRestLength ?? 0.55,
    suspensionStiffness: s.suspensionStiffness ?? 70,
    dampingRelaxation: s.dampingRelaxation ?? 3.5,
    dampingCompression: s.dampingCompression ?? 4.4,
    maxSuspensionTravel: s.maxSuspensionTravel ?? 0.42,
    frictionSlip: s.frictionSlip ?? 7.8,
    rollInfluence: s.rollInfluence ?? 0.008,
  }

  const positions: Vec3[] = [
    [-halfWidth, height, halfLength],
    [halfWidth, height, halfLength],
    [-halfWidth, height, -halfLength],
    [halfWidth, height, -halfLength],
  ]

  return positions.map((localPosition) => ({ ...base, localPosition }))
}
