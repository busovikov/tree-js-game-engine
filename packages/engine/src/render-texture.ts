import { z } from 'zod'

export const RenderTextureUpdateModeSchema = z.enum(['always', 'on-demand', 'once'])
export type RenderTextureUpdateMode = z.infer<typeof RenderTextureUpdateModeSchema>

export const RenderTextureSchema = z.object({
  width: z.number().int().min(1).default(256),
  height: z.number().int().min(1).default(256),
  cameraEntityId: z.string().uuid(),
  updateMode: RenderTextureUpdateModeSchema.default('always'),
  matchViewport: z.boolean().default(false),
})
export type RenderTexture = z.infer<typeof RenderTextureSchema>
