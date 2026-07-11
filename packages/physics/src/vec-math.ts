import type { Quat, Vec3 } from './types.js'

export const GRAVITY: Vec3 = [0, -9.81, 0]

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z]
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function lengthVec3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = lengthVec3(v)
  if (len === 0) {
    return [0, 0, 0]
  }
  return [v[0] / len, v[1] / len, v[2] / len]
}

export function rotateVec3ByQuat(v: Vec3, q: Quat): Vec3 {
  const [qx, qy, qz, qw] = q
  const [vx, vy, vz] = v

  const ix = qw * vx + qy * vz - qz * vy
  const iy = qw * vy + qz * vx - qx * vz
  const iz = qw * vz + qx * vy - qy * vx
  const iw = -qx * vx - qy * vy - qz * vz

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ]
}

export function transformLocalPoint(transform: { position: Vec3; rotation: Quat }, local: Vec3): Vec3 {
  const rotated = rotateVec3ByQuat(local, transform.rotation)
  return addVec3(transform.position, rotated)
}

export function velocityAtWorldPoint(
  center: Vec3,
  linearVelocity: Vec3,
  angularVelocity: Vec3,
  worldPoint: Vec3,
): Vec3 {
  const r = subVec3(worldPoint, center)
  return addVec3(linearVelocity, crossVec3(angularVelocity, r))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
