import type { PhysicsBodyHandle, PhysicsShapeHandle } from './handles.js'
import type { Vec3 } from './types.js'

/** Backend-agnostic kinematic character controller (Rapier KinematicCharacterController). */
export interface ICharacterController {
  readonly body: PhysicsBodyHandle
  readonly collider: PhysicsShapeHandle

  /** Reconfigure autostep / snap / impulse flags when component params change. */
  configure(options: CharacterControllerOptions): void

  /** Advance controller for one frame; returns whether grounded. */
  step(movement: Vec3, dt: number): CharacterControllerStepResult
}

export interface CharacterControllerOptions {
  offset: number
  snapToGroundDistance: number
  autoStepMaxHeight: number
  autoStepMinWidth: number
  autoStepIncludeDynamicBodies: boolean
  applyImpulsesToDynamicBodies: boolean
}

export interface CharacterControllerStepResult {
  grounded: boolean
  movement: Vec3
}

/** Rapier DynamicRaycastVehicleController wrapper. */
export interface IDynamicRaycastVehicle {
  readonly chassis: PhysicsBodyHandle

  addWheel(config: DynamicRaycastWheelConfig): number
  updateVehicle(dt: number): void

  setWheelEngineForce(wheelIndex: number, force: number): void
  setWheelBrake(wheelIndex: number, strength: number): void
  setWheelSteering(wheelIndex: number, angle: number): void

  getWheelSteering(wheelIndex: number): number
  getWheelRotation(wheelIndex: number): number
  getWheelSuspensionLength(wheelIndex: number): number
  getWheelChassisConnectionY(wheelIndex: number): number
  getWheelAxle(wheelIndex: number): Vec3
  getWheelIsInContact(wheelIndex: number): boolean
}

export interface DynamicRaycastWheelConfig {
  localPosition: Vec3
  directionLocal?: Vec3
  axleLocal?: Vec3
  radius: number
  suspensionRestLength: number
  suspensionStiffness: number
  maxSuspensionTravel?: number
  frictionSlip: number
  sideFrictionStiffness?: number
}

/** Custom force spring between two bodies (Isaac Mason custom-spring sketch). */
export interface CustomSpringConfig {
  localAnchorA: Vec3
  localAnchorB: Vec3
  restLength: number
  stiffness: number
  damping: number
}

export function stepCustomSpring(
  bodyA: {
    position: Vec3
    rotation: [number, number, number, number]
    linearVelocity: Vec3
    angularVelocity: Vec3
  },
  bodyB: {
    position: Vec3
    rotation: [number, number, number, number]
    linearVelocity: Vec3
    angularVelocity: Vec3
  },
  config: CustomSpringConfig,
): { forceA: Vec3; torqueA: Vec3; forceB: Vec3; torqueB: Vec3 } {
  const { localAnchorA, localAnchorB, restLength, stiffness, damping } = config

  const worldAnchorA = transformPoint(bodyA.position, bodyA.rotation, localAnchorA)
  const worldAnchorB = transformPoint(bodyB.position, bodyB.rotation, localAnchorB)

  const rx = worldAnchorB[0] - worldAnchorA[0]
  const ry = worldAnchorB[1] - worldAnchorA[1]
  const rz = worldAnchorB[2] - worldAnchorA[2]
  const rlen = Math.hypot(rx, ry, rz)
  const invLen = rlen > 1e-8 ? 1 / rlen : 0
  const rux = rx * invLen
  const ruy = ry * invLen
  const ruz = rz * invLen

  const ri = [
    worldAnchorA[0] - bodyA.position[0],
    worldAnchorA[1] - bodyA.position[1],
    worldAnchorA[2] - bodyA.position[2],
  ] as Vec3
  const rj = [
    worldAnchorB[0] - bodyB.position[0],
    worldAnchorB[1] - bodyB.position[1],
    worldAnchorB[2] - bodyB.position[2],
  ] as Vec3

  let ux = bodyB.linearVelocity[0] - bodyA.linearVelocity[0]
  let uy = bodyB.linearVelocity[1] - bodyA.linearVelocity[1]
  let uz = bodyB.linearVelocity[2] - bodyA.linearVelocity[2]

  const tmpA = cross(bodyB.angularVelocity, rj)
  ux += tmpA[0]
  uy += tmpA[1]
  uz += tmpA[2]
  const tmpB = cross(bodyA.angularVelocity, ri)
  ux -= tmpB[0]
  uy -= tmpB[1]
  uz -= tmpB[2]

  const uDotR = ux * rux + uy * ruy + uz * ruz
  const fMag = -stiffness * (rlen - restLength) - damping * uDotR
  const fx = rux * fMag
  const fy = ruy * fMag
  const fz = ruz * fMag

  const forceA: Vec3 = [-fx, -fy, -fz]
  const forceB: Vec3 = [fx, fy, fz]
  const torqueA = cross(ri, forceA)
  const torqueB = cross(rj, forceB)

  return { forceA, torqueA, forceB, torqueB }
}

function transformPoint(
  position: Vec3,
  rotation: [number, number, number, number],
  local: Vec3,
): Vec3 {
  const rotated = rotateVec3ByQuat(local, rotation)
  return [
    position[0] + rotated[0],
    position[1] + rotated[1],
    position[2] + rotated[2],
  ]
}

function rotateVec3ByQuat(v: Vec3, q: [number, number, number, number]): Vec3 {
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

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
