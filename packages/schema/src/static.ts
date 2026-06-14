import { z } from 'zod'

export const StaticSchema = z.object({
  isStatic: z.boolean().default(false),
})
export type Static = z.infer<typeof StaticSchema>
