import { z } from 'zod'

const ComponentEnabledSchema = z.boolean().default(true)

export const AnimatableBodySyncModeSchema = z.enum(['physics', 'discrete'])
export type AnimatableBodySyncMode = z.infer<typeof AnimatableBodySyncModeSchema>

/** Kinematic body driven by animation/Transform (Godot AnimatableBody3D). */
export const AnimatableBodySchema = z.object({
  enabled: ComponentEnabledSchema,
  /** How transform updates are applied relative to the physics step. */
  syncMode: AnimatableBodySyncModeSchema.default('physics'),
})
export type AnimatableBody = z.infer<typeof AnimatableBodySchema>
