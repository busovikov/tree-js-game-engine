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

export type KinematicMode = 'position' | 'velocity'

export type MassMode = 'explicit' | 'autoFromColliders'

export interface RigidBodyDescriptor {
  type: RigidBodyType
  transform: PhysicsTransform
  /** Mass in kg; ignored for static bodies when massMode is explicit. */
  mass?: number
  massMode?: MassMode
  /** Angular velocity damping; ignored for static bodies. */
  angularDamping?: number
  linearDamping?: number
  /** 0 disables gravity on dynamic bodies. */
  gravityScale?: number
  kinematicMode?: KinematicMode
  /** Pitch/roll principal inertia multiplier (yaw unchanged). Default 1. */
  inertiaScalePitchRoll?: number
  enabled?: boolean
  ccdEnabled?: boolean
  lockPosition?: readonly [boolean, boolean, boolean]
  lockRotation?: readonly [boolean, boolean, boolean]
  centerOfMass?: Vec3
  /**
   * Extra velocity-solver iterations for this body's island (Rapier
   * `RigidBody.setAdditionalSolverIterations`). Raises stability for stiff joint+contact systems
   * such as jointed vehicles. Default 0.
   */
  additionalSolverIterations?: number
}

export interface PhysicsShapeSpawnOptions {
  /** ECS entity id stored in collider userData for event routing. */
  entityId?: string
  layer?: number
  /** Rapier packed collision groups `(membership << 16) | filter`. */
  collisionGroups?: number
  isSensor?: boolean
  enabled?: boolean
  friction?: number
  restitution?: number
  density?: number
  frictionCombine?: 'average' | 'multiply' | 'min' | 'max'
  restitutionCombine?: 'average' | 'multiply' | 'min' | 'max'
  /** Rapier ActiveCollisionTypes bitmask; backend applies when supported. */
  activeCollisionTypes?: number
  /** Request collision/intersection events for this collider. */
  collisionEvents?: boolean
  /** Enable Rapier contact-force events (RigidBody.contactMonitor). */
  contactMonitor?: boolean
  /** Max contact points reported on collision enter (0 = none). */
  maxReportedContacts?: number
  /** Entity is authored as a PhysicsArea overlap zone. */
  isArea?: boolean
}

export type PhysicsShapeDescriptor = (
  | { type: 'box'; halfExtents: Vec3 }
  | { type: 'sphere'; radius: number }
  | { type: 'capsule'; radius: number; halfHeight: number }
  | { type: 'cylinder'; radius: number; halfHeight: number }
  | { type: 'convexHull'; points: readonly number[] }
  | { type: 'trimesh'; vertices: readonly number[]; indices: readonly number[] }
  | { type: 'worldBoundary'; normal: Vec3 }
) & {
  /** Collider pose relative to the rigid-body origin (Rapier collider translation). */
  localTransform?: PhysicsTransform
  spawn?: PhysicsShapeSpawnOptions
}

export interface RaycastQuery {
  origin: Vec3
  direction: Vec3
  maxDistance: number
  /** Optional body to ignore (e.g. chassis self-hit during wheel raycasts). */
  excludeBody?: PhysicsBodyHandle
  /** 16-bit layer filter bitmask for query membership. */
  layerMask?: number
  /** When false (default), sensor colliders are ignored. */
  includeSensors?: boolean
}

export interface RaycastHit {
  body: PhysicsBodyHandle
  point: Vec3
  normal: Vec3
  distance: number
}

export interface ShapeQueryFilter {
  layerMask?: number
  includeTriggers?: boolean
  excludeBody?: PhysicsBodyHandle
}

export interface ShapecastQuery {
  shape: PhysicsShapeDescriptor
  transform: PhysicsTransform
  direction: Vec3
  maxDistance: number
  filter?: ShapeQueryFilter
}

export interface ShapecastHit {
  body: PhysicsBodyHandle
  point: Vec3
  normal: Vec3
  distance: number
  entityId?: string
}

export interface OverlapQuery {
  shape: PhysicsShapeDescriptor
  transform: PhysicsTransform
  filter?: ShapeQueryFilter
}

export interface OverlapHit {
  body: PhysicsBodyHandle
  entityId?: string
}
