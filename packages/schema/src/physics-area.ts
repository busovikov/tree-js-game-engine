import { z } from 'zod'
import { MAX_PHYSICS_LAYERS } from './physics-project-settings.js'

const ComponentEnabledSchema = z.boolean().default(true)
const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])

export const PhysicsAreaSpaceOverrideSchema = z.object({
  /** Directional gravity override inside the area (m/s²). */
  gravity: Vec3Schema.optional(),
})
export type PhysicsAreaSpaceOverride = z.infer<typeof PhysicsAreaSpaceOverrideSchema>

export const PhysicsAreaSchema = z.object({
  enabled: ComponentEnabledSchema,
  /** Layer index 0..15; filtering from project collision matrix. */
  layer: z.number().int().min(0).max(MAX_PHYSICS_LAYERS - 1).default(0),
  /** Other areas/bodies can detect this area. */
  monitorable: z.boolean().default(true),
  /** This area detects overlaps with other bodies/areas. */
  monitoring: z.boolean().default(true),
  spaceOverride: PhysicsAreaSpaceOverrideSchema.optional(),
})
export type PhysicsArea = z.infer<typeof PhysicsAreaSchema>
