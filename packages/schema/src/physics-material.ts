import { z } from 'zod'

export const PhysicsMaterialCombineSchema = z.enum([
  'average',
  'multiply',
  'min',
  'max',
])
export type PhysicsMaterialCombine = z.infer<typeof PhysicsMaterialCombineSchema>

/** Project-level physics material asset (referenced by Collider.materialId). */
export const PhysicsMaterialSchema = z.object({
  friction: z.number().min(0).default(0.5),
  restitution: z.number().min(0).max(1).default(0),
  density: z.number().positive().default(1),
  frictionCombine: PhysicsMaterialCombineSchema.default('average'),
  restitutionCombine: PhysicsMaterialCombineSchema.default('average'),
})
export type PhysicsMaterial = z.infer<typeof PhysicsMaterialSchema>
