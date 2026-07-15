import { z } from 'zod'
import { MAX_PHYSICS_LAYERS } from './physics-project-settings.js'

const ComponentEnabledSchema = z.boolean().default(true)

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

const PositiveVec3Schema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
])

export const UnsupportedShapePolicySchema = z.enum(['skip', 'aabbFallback'])
export type UnsupportedShapePolicy = z.infer<typeof UnsupportedShapePolicySchema>

export const ColliderBakeSourceSchema = z.object({
  kind: z.enum(['meshRenderer', 'manual']),
  geometryType: z.string().optional(),
  modelAsset: z.string().optional(),
  /** Optional collision LOD mesh asset id (manual assign; bake source when set). */
  collisionMeshAsset: z.string().optional(),
  meshRevision: z.string().optional(),
})
export type ColliderBakeSource = z.infer<typeof ColliderBakeSourceSchema>

const ColliderBaseSchema = z.object({
  enabled: ComponentEnabledSchema,
  /** Local offset from entity transform origin. */
  offset: Vec3Schema.default([0, 0, 0]),
  /** Local rotation offset as unit quaternion `[x, y, z, w]`. */
  rotation: QuatSchema.default([0, 0, 0, 1]),
  /** Sensor collider — overlap events without contact response. */
  isTrigger: z.boolean().default(false),
  /** Project physics material asset id; inline friction/restitution are fallbacks. */
  materialId: z.string().default(''),
  /** Layer index 0..15 (Unity model); filtering from project collision matrix. */
  layer: z.number().int().min(0).max(MAX_PHYSICS_LAYERS - 1).default(0),
  unsupportedShapePolicy: UnsupportedShapePolicySchema.default('skip'),
  friction: z.number().min(0).optional(),
  restitution: z.number().min(0).max(1).optional(),
})

export const BoxColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('box'),
  /** Half-extents for a 1×1×1 unit box by default. */
  halfExtents: PositiveVec3Schema.default([0.5, 0.5, 0.5]),
})

export const SphereColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('sphere'),
  radius: z.number().positive().default(0.5),
})

export const CapsuleColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('capsule'),
  radius: z.number().positive().default(0.3),
  halfHeight: z.number().min(0).default(0.5),
})

export const CylinderColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('cylinder'),
  radius: z.number().positive().default(0.5),
  halfHeight: z.number().min(0).default(0.5),
})

export const ConvexHullColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('convexHull'),
  /** Flat `[x,y,z,…]` points in collider local space. */
  points: z.array(z.number()).default([]),
  bakeSource: ColliderBakeSourceSchema.optional(),
})

export const TrimeshColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('trimesh'),
  vertices: z.array(z.number()).default([]),
  indices: z.array(z.number().int().nonnegative()).default([]),
  bakeSource: ColliderBakeSourceSchema.optional(),
})

export const HeightfieldColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('heightfield'),
  /** Row-major height samples (nrows × ncols). */
  heights: z.array(z.number()).default([]),
  nrows: z.number().int().positive().default(2),
  ncols: z.number().int().positive().default(2),
  /** Horizontal scale per height sample (x, y row spacing, z). */
  scale: PositiveVec3Schema.default([1, 1, 1]),
})

export const WorldBoundaryColliderSchema = ColliderBaseSchema.extend({
  shape: z.literal('worldBoundary'),
  /** Outward-facing plane normal in collider local space. */
  normal: Vec3Schema.default([0, 1, 0]),
})

export const ColliderShapeSchema = z.enum([
  'box',
  'sphere',
  'capsule',
  'cylinder',
  'convexHull',
  'trimesh',
  'heightfield',
  'worldBoundary',
])
export type ColliderShape = z.infer<typeof ColliderShapeSchema>

export const ColliderSchema = z.discriminatedUnion('shape', [
  BoxColliderSchema,
  SphereColliderSchema,
  CapsuleColliderSchema,
  CylinderColliderSchema,
  ConvexHullColliderSchema,
  TrimeshColliderSchema,
  HeightfieldColliderSchema,
  WorldBoundaryColliderSchema,
])
export type Collider = z.infer<typeof ColliderSchema>

export type BoxCollider = z.infer<typeof BoxColliderSchema>
export type SphereCollider = z.infer<typeof SphereColliderSchema>
export type CapsuleCollider = z.infer<typeof CapsuleColliderSchema>
export type CylinderCollider = z.infer<typeof CylinderColliderSchema>
export type ConvexHullCollider = z.infer<typeof ConvexHullColliderSchema>
export type TrimeshCollider = z.infer<typeof TrimeshColliderSchema>
export type HeightfieldCollider = z.infer<typeof HeightfieldColliderSchema>
export type WorldBoundaryCollider = z.infer<typeof WorldBoundaryColliderSchema>

/** Legacy collider fields stripped before schema parse (migration handles RigidBody synthesis). */
export const LEGACY_COLLIDER_FIELDS = [
  'isStatic',
  'physicsBodyHandle',
  'physicsHandle',
  'physicsVehicleHandle',
] as const

export function stripLegacyColliderFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...data }
  for (const field of LEGACY_COLLIDER_FIELDS) {
    delete next[field]
  }
  return next
}
