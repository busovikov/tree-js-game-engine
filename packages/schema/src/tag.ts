import { z } from 'zod'

export const TagSchema = z.object({
  tags: z.array(z.string()).default([]),
})
export type Tag = z.infer<typeof TagSchema>
