import type { PhysicsTransform, Quat, Vec3 } from '@haku/physics'

export function vec3ToRapier([x, y, z]: Vec3): { x: number; y: number; z: number } {
  return { x, y, z }
}

export function quatToRapier([x, y, z, w]: Quat): { x: number; y: number; z: number; w: number } {
  return { x, y, z, w }
}

export function vec3FromRapier(v: { x: number; y: number; z: number }): Vec3 {
  return [v.x, v.y, v.z]
}

export function quatFromRapier(q: { x: number; y: number; z: number; w: number }): Quat {
  return [q.x, q.y, q.z, q.w]
}

export function cloneTransform(transform: PhysicsTransform): PhysicsTransform {
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
