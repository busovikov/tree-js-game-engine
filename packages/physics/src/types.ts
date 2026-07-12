import type { PhysicsBodyHandle } from './handles.js'

/** 3D vector as a plain tuple — no Three.js dependency. */
export type Vec3 = readonly [number, number, number]

/** Unit quaternion as `[x, y, z, w]`. */
export type Quat = readonly [number, number, number, number]

export interface PhysicsTransform {
  position: Vec3
  rotation: Quat
}

export type RigidBodyType = 'static' | 'dynamic' | 'kinematic'

export interface RigidBodyDescriptor {
  type: RigidBodyType
  transform: PhysicsTransform
  /** Mass in kg; ignored for static bodies. */
  mass?: number
  /** Angular velocity damping; ignored for static bodies. */
  angularDamping?: number
  /** Pitch/roll principal inertia multiplier (yaw unchanged). Default 1. */
  inertiaScalePitchRoll?: number
}

export type PhysicsShapeDescriptor = (
  | { type: 'box'; halfExtents: Vec3 }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; radius: number; halfHeight: number }
) & {
  /** Collider pose relative to the rigid-body origin (Rapier collider translation). */
  localTransform?: PhysicsTransform
}

export interface RaycastQuery {
  origin: Vec3
  direction: Vec3
  maxDistance: number
  /** Optional body to ignore (e.g. chassis self-hit during wheel raycasts). */
  excludeBody?: PhysicsBodyHandle
}

export interface RaycastHit {
  body: PhysicsBodyHandle
  point: Vec3
  normal: Vec3
  distance: number
}
