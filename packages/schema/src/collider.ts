import { z } from 'zod'

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])

const PositiveVec3Schema = z.tuple([
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
])

const ColliderBaseSchema = z.object({
  /** Local offset from entity transform origin. */
  offset: Vec3Schema.default([0, 0, 0]),
  /** Local rotation offset as unit quaternion `[x, y, z, w]`. */
  rotation: QuatSchema.default([0, 0, 0, 1]),
  /** When true, body is static (no dynamics). */
  isStatic: z.boolean().default(true),
  /**
   * Runtime-only physics body handle — populated by engine sync (T01.8+).
   * Optional in scene JSON; not required for authoring.
   */
  physicsBodyHandle: z.string().optional(),
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

export const ColliderShapeSchema = z.enum(['box', 'sphere', 'capsule'])
export type ColliderShape = z.infer<typeof ColliderShapeSchema>

export const ColliderSchema = z.discriminatedUnion('shape', [
  BoxColliderSchema,
  SphereColliderSchema,
  CapsuleColliderSchema,
])
export type Collider = z.infer<typeof ColliderSchema>

export type BoxCollider = z.infer<typeof BoxColliderSchema>
export type SphereCollider = z.infer<typeof SphereColliderSchema>
export type CapsuleCollider = z.infer<typeof CapsuleColliderSchema>
