/** Collider shape kinds supported by the physics abstraction layer. */
export type ColliderShapeKind =
  | 'box'
  | 'sphere'
  | 'capsule'
  | 'cylinder'
  | 'convexHull'
  | 'trimesh'
  | 'heightfield'
  | 'worldBoundary'

export interface ColliderShapeCapabilities {
  shapes: ReadonlySet<ColliderShapeKind>
  maxConvexHullVertices?: number
  maxTrimeshVertices?: number
  trimeshRequiresStatic: boolean
}

export interface RigidBodyCapabilities {
  types: ReadonlySet<'static' | 'dynamic' | 'kinematic'>
  basicDynamics: boolean
  massAutoFromColliders: boolean
  ccd: boolean
  axisLock: boolean
  centerOfMass: boolean
  kinematicVelocityBased: boolean
}

export interface MaterialCapabilities {
  friction: boolean
  restitution: boolean
  density: boolean
  combineModes: boolean
}

export interface QueryCapabilities {
  raycastLayerMask: boolean
  shapecast: boolean
  overlapTest: boolean
}

export interface DebugCapabilities {
  debugRender: boolean
}

export interface EventCapabilities {
  collisionEvents: boolean
  triggerEvents: boolean
  contactManifolds: boolean
  maxContactsPerPair: number
}

export type PhysicsJointKind =
  | 'fixed'
  | 'revolute'
  | 'prismatic'
  | 'spherical'
  | 'spring'
  | 'rope'

export interface PhysicsCapabilities {
  shapes: ColliderShapeCapabilities
  rigidBody: RigidBodyCapabilities
  material: MaterialCapabilities
  query: QueryCapabilities
  events: EventCapabilities
  debug: DebugCapabilities
  areas: boolean
  animatableBody: boolean
  joints: ReadonlySet<PhysicsJointKind>
  maxCollisionLayers: number
  multipleWorlds: boolean
}

const STUB_SHAPES: ReadonlySet<ColliderShapeKind> = new Set([
  'box',
  'sphere',
  'capsule',
])

const RAPIER_SHAPES: ReadonlySet<ColliderShapeKind> = new Set([
  'box',
  'sphere',
  'capsule',
  'cylinder',
  'convexHull',
  'trimesh',
  'heightfield',
  'worldBoundary',
])

export const STUB_PHYSICS_CAPABILITIES: PhysicsCapabilities = {
  shapes: {
    shapes: STUB_SHAPES,
    trimeshRequiresStatic: true,
  },
  rigidBody: {
    types: new Set(['static', 'dynamic', 'kinematic']),
    basicDynamics: true,
    massAutoFromColliders: false,
    ccd: false,
    axisLock: false,
    centerOfMass: false,
    kinematicVelocityBased: false,
  },
  material: {
    friction: true,
    restitution: true,
    density: false,
    combineModes: false,
  },
  query: {
    raycastLayerMask: false,
    shapecast: false,
    overlapTest: false,
  },
  events: {
    collisionEvents: false,
    triggerEvents: false,
    contactManifolds: false,
    maxContactsPerPair: 0,
  },
  debug: {
    debugRender: false,
  },
  areas: false,
  animatableBody: false,
  joints: new Set(),
  maxCollisionLayers: 16,
  multipleWorlds: false,
}

export const RAPIER_PHYSICS_CAPABILITIES: PhysicsCapabilities = {
  shapes: {
    shapes: RAPIER_SHAPES,
    maxConvexHullVertices: 1024,
    maxTrimeshVertices: 1_000_000,
    trimeshRequiresStatic: true,
  },
  rigidBody: {
    types: new Set(['static', 'dynamic', 'kinematic']),
    basicDynamics: true,
    massAutoFromColliders: true,
    ccd: true,
    axisLock: true,
    centerOfMass: true,
    kinematicVelocityBased: true,
  },
  material: {
    friction: true,
    restitution: true,
    density: true,
    combineModes: true,
  },
  query: {
    raycastLayerMask: true,
    shapecast: true,
    overlapTest: true,
  },
  events: {
    collisionEvents: true,
    triggerEvents: true,
    contactManifolds: true,
    maxContactsPerPair: 4,
  },
  debug: {
    debugRender: true,
  },
  areas: true,
  animatableBody: true,
  joints: new Set(['fixed', 'revolute', 'prismatic', 'spherical', 'spring', 'rope']),
  maxCollisionLayers: 16,
  multipleWorlds: true,
}
