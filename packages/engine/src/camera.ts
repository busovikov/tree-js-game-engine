import { z } from 'zod'
import { ComponentEnabledSchema } from '@haku/schema'

export const CameraSchema = z.object({
  fov: z.number().default(60),
  near: z.number().default(0.1),
  far: z.number().default(1000),
  ortho: z.boolean().optional(),
  orthoSize: z.number().optional(),
  enabled: ComponentEnabledSchema,
})

export type Camera = z.infer<typeof CameraSchema>
