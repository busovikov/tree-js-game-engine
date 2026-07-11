import type { PhysicsBodyHandle } from './handles.js'
import type { PhysicsShapeDescriptor, PhysicsTransform, RaycastHit, RaycastQuery, Vec3 } from './types.js'

export interface RaycastShapeInstance {
  body: PhysicsBodyHandle
  shape: PhysicsShapeDescriptor
  transform: PhysicsTransform
}

/** Cast a ray against axis-aligned box colliders (stub backend and tests). */
export function raycastShapes(
  query: RaycastQuery,
  shapes: readonly RaycastShapeInstance[],
): RaycastHit | null {
  const [dx, dy, dz] = normalizeDirection(query.direction)
  let closest: RaycastHit | null = null

  for (const instance of shapes) {
    if (query.excludeBody && instance.body.value === query.excludeBody.value) {
      continue
    }
    if (instance.shape.type !== 'box') {
      continue
    }

    const hit = raycastBox(
      query.origin,
      [dx, dy, dz],
      instance.transform.position,
      instance.shape.halfExtents,
      query.maxDistance,
    )
    if (!hit) {
      continue
    }
    if (!closest || hit.distance < closest.distance) {
      closest = {
        body: instance.body,
        point: hit.point,
        normal: hit.normal,
        distance: hit.distance,
      }
    }
  }

  return closest
}

interface BoxHit {
  distance: number
  point: Vec3
  normal: Vec3
}

function raycastBox(
  origin: Vec3,
  direction: Vec3,
  center: Vec3,
  halfExtents: Vec3,
  maxDistance: number,
): BoxHit | null {
  const min = [
    center[0] - halfExtents[0],
    center[1] - halfExtents[1],
    center[2] - halfExtents[2],
  ] as const
  const max = [
    center[0] + halfExtents[0],
    center[1] + halfExtents[1],
    center[2] + halfExtents[2],
  ] as const

  let tMin = 0
  let tMax = maxDistance
  let normal: Vec3 = [0, 1, 0]

  const axes: Array<{ index: 0 | 1 | 2; min: number; max: number }> = [
    { index: 0, min: min[0], max: max[0] },
    { index: 1, min: min[1], max: max[1] },
    { index: 2, min: min[2], max: max[2] },
  ]

  for (const axis of axes) {
    const o = origin[axis.index]
    const d = direction[axis.index]

    if (Math.abs(d) < 1e-8) {
      if (o < axis.min || o > axis.max) {
        return null
      }
      continue
    }

    const invD = 1 / d
    let t0 = (axis.min - o) * invD
    let t1 = (axis.max - o) * invD
    let n0: [number, number, number] = [0, 0, 0]
    let n1: [number, number, number] = [0, 0, 0]
    n0[axis.index] = -1
    n1[axis.index] = 1

    if (t0 > t1) {
      const tmpT = t0
      t0 = t1
      t1 = tmpT
      const tmpN = n0
      n0 = n1
      n1 = tmpN
    }

    if (t0 > tMin) {
      tMin = t0
      normal = [n0[0], n0[1], n0[2]]
    }
    tMax = Math.min(tMax, t1)
    if (tMax < tMin) {
      return null
    }
  }

  if (tMin < 0 || tMin > maxDistance) {
    return null
  }

  const point: Vec3 = [
    origin[0] + direction[0] * tMin,
    origin[1] + direction[1] * tMin,
    origin[2] + direction[2] * tMin,
  ]

  return { distance: tMin, point, normal }
}

function normalizeDirection(direction: Vec3): Vec3 {
  const len = Math.hypot(direction[0], direction[1], direction[2])
  if (len === 0) {
    return [0, -1, 0]
  }
  return [direction[0] / len, direction[1] / len, direction[2] / len]
}
