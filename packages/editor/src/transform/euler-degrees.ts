import * as THREE from 'three'

export type Quat = [number, number, number, number]
export type Vec3 = [number, number, number]

/** Grid step for scrubbing rotation in the inspector (degrees). */
export const ROTATION_SCRUB_STEP = 0.01

/** Display / snap precision for euler degrees read from quaternions. */
export const ROTATION_DEGREE_PRECISION = 0.001

const DEGREE_DECIMALS = 3

/**
 * Snap degree readouts so quaternion round-trips do not show 89.999999 for typed 90.
 */
export function snapDegree(deg: number, step = ROTATION_DEGREE_PRECISION): number {
  if (!Number.isFinite(deg)) return 0

  const nearInt = Math.round(deg)
  if (Math.abs(deg - nearInt) < 1e-4) {
    return Math.abs(nearInt) === 0 ? 0 : nearInt
  }

  const snapped = Math.round(deg / step) * step
  const result = Number(snapped.toFixed(DEGREE_DECIMALS))
  return result === 0 ? 0 : result
}

export function quatToEulerDegrees(q: Quat): Vec3 {
  const euler = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
    'XYZ',
  )
  return [
    snapDegree(THREE.MathUtils.radToDeg(euler.x)),
    snapDegree(THREE.MathUtils.radToDeg(euler.y)),
    snapDegree(THREE.MathUtils.radToDeg(euler.z)),
  ]
}

export function eulerDegreesToQuat(eulerDeg: Vec3): Quat {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(eulerDeg[0]),
    THREE.MathUtils.degToRad(eulerDeg[1]),
    THREE.MathUtils.degToRad(eulerDeg[2]),
    'XYZ',
  )
  const q = new THREE.Quaternion().setFromEuler(euler)
  return [q.x, q.y, q.z, q.w]
}

/** Update one euler axis from an exact degree value (keyboard / scrub). */
export function eulerAxisToQuat(
  axis: 0 | 1 | 2,
  degrees: number,
  current: Quat,
): Quat {
  const euler = quatToEulerDegrees(current)
  euler[axis] = degrees
  return eulerDegreesToQuat(euler)
}
