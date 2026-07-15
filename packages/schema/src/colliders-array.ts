import { z } from 'zod'
import { ColliderSchema } from './collider.js'

const ComponentEnabledSchema = z.boolean().default(true)

/** Multiple colliders on one entity when hierarchy compound is insufficient. */
export const CollidersSchema = z.object({
  enabled: ComponentEnabledSchema,
  colliders: z.array(ColliderSchema).default([]),
})
export type Colliders = z.infer<typeof CollidersSchema>
