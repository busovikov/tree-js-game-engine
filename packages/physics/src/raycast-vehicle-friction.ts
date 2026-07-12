import type { PhysicsBodyHandle } from './handles.js'
import type { Vec3 } from './types.js'
import {
  crossVec3,
  dotVec3,
  scaleVec3,
  subVec3,
} from './vec-math.js'

const CONTACT_DAMPING = 0.2
const ROLLING_RELAXATION = 1

export interface FrictionBodyHooks {
  getInverseMass(body: PhysicsBodyHandle): number
  getVelocityAtWorldPoint(body: PhysicsBodyHandle, worldPoint: Vec3): Vec3
  getImpulseDenominator(body: PhysicsBodyHandle, worldPoint: Vec3, normal: Vec3): number
}

/** Bilateral constraint impulse along `normal` (Isaac Mason custom raycast vehicle). */
export function resolveSingleBilateralConstraint(
  hooks: FrictionBodyHooks,
  body1: PhysicsBodyHandle,
  pos1: Vec3,
  body2: PhysicsBodyHandle,
  pos2: Vec3,
  normal: Vec3,
): number {
  const normalLenSqr = dotVec3(normal, normal)
  if (normalLenSqr > 1.1) {
    return 0
  }

  const vel1 = hooks.getVelocityAtWorldPoint(body1, pos1)
  const vel2 = hooks.getVelocityAtWorldPoint(body2, pos2)
  const relVel = dotVec3(normal, subVec3(vel1, vel2))

  const inv1 = hooks.getInverseMass(body1)
  const inv2 = hooks.getInverseMass(body2)
  if (inv1 + inv2 <= 0) {
    return 0
  }

  const massTerm = 1 / (inv1 + inv2)
  return -CONTACT_DAMPING * relVel * massTerm
}

/** Rolling friction impulse along `frictionDir` (Isaac Mason custom raycast vehicle). */
export function calcRollingFriction(
  hooks: FrictionBodyHooks,
  body0: PhysicsBodyHandle,
  body1: PhysicsBodyHandle,
  frictionPosWorld: Vec3,
  frictionDir: Vec3,
  maxImpulse: number,
): number {
  const vel0 = hooks.getVelocityAtWorldPoint(body0, frictionPosWorld)
  const vel1 = hooks.getVelocityAtWorldPoint(body1, frictionPosWorld)
  const vrel = dotVec3(frictionDir, subVec3(vel0, vel1))

  const denom0 = hooks.getImpulseDenominator(body0, frictionPosWorld, frictionDir)
  const denom1 = hooks.getImpulseDenominator(body1, frictionPosWorld, frictionDir)
  const denomSum = denom0 + denom1
  if (denomSum <= 0) {
    return 0
  }

  const jacDiagInv = ROLLING_RELAXATION / denomSum
  let impulse = -vrel * jacDiagInv
  if (Number.isFinite(maxImpulse)) {
    impulse = Math.max(-maxImpulse, Math.min(maxImpulse, impulse))
  }
  return impulse
}

/** Project `axle` onto the plane perpendicular to `groundNormal`. */
export function projectAxleOntoGround(axle: Vec3, groundNormal: Vec3): Vec3 {
  const proj = dotVec3(axle, groundNormal)
  return subVec3(axle, scaleVec3(groundNormal, proj))
}

/** Wheel forward axis on the ground plane: cross(groundNormal, axle). */
export function wheelForwardOnGround(groundNormal: Vec3, axle: Vec3): Vec3 {
  return crossVec3(groundNormal, axle)
}

/** 3×3 row-major matrix (Rapier `SdpMatrix3` layout). */
export type Mat3RowMajor = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

function applyMat3RowMajor(m: Mat3RowMajor, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

/**
 * Impulse denominator for a constraint at `worldPoint` along `normal`.
 * @see Isaac Mason `computeImpulseDenominator`
 */
export function computeImpulseDenominator(
  bodyTranslation: Vec3,
  invMass: number,
  effectiveWorldInvInertia: Mat3RowMajor,
  worldPoint: Vec3,
  normal: Vec3,
): number {
  const r0 = subVec3(worldPoint, bodyTranslation)
  const c0 = crossVec3(r0, normal)
  const m = applyMat3RowMajor(effectiveWorldInvInertia, c0)
  const vec = crossVec3(m, r0)
  return invMass + dotVec3(normal, vec)
}
