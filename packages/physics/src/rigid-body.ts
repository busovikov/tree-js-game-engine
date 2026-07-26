import { z } from 'zod'

const ComponentEnabledSchema = z.boolean().default(true)

export const RigidBodyTypeSchema = z.enum(['static', 'dynamic', 'kinematic'])
export type RigidBodyType = z.infer<typeof RigidBodyTypeSchema>

export const KinematicModeSchema = z.enum(['position', 'velocity'])
export type KinematicMode = z.infer<typeof KinematicModeSchema>

export const MassModeSchema = z.enum(['explicit', 'autoFromColliders'])
export type MassMode = z.infer<typeof MassModeSchema>

export const RigidBodyInterpolationSchema = z.enum(['none', 'interpolate'])
export type RigidBodyInterpolation = z.infer<typeof RigidBodyInterpolationSchema>

export const RigidBodySchema = z.object({
  enabled: ComponentEnabledSchema,
  type: RigidBodyTypeSchema.default('dynamic'),
  /** Position-based vs velocity-based kinematic body (Rapier distinguishes both). */
  kinematicMode: KinematicModeSchema.default('position'),
  massMode: MassModeSchema.default('explicit'),
  /** Target total mass when massMode is explicit (kg). */
  mass: z.number().positive().default(1),
  angularDamping: z.number().min(0).default(0),
  linearDamping: z.number().min(0).default(0),
  /** 0 disables gravity (Unity useGravity=false equivalent). */
  gravityScale: z.number().default(1),
  canSleep: z.boolean().default(true),
  ccdEnabled: z.boolean().default(false),
  lockPosition: z
    .tuple([z.boolean(), z.boolean(), z.boolean()])
    .default([false, false, false]),
  lockRotation: z
    .tuple([z.boolean(), z.boolean(), z.boolean()])
    .default([false, false, false]),
  /** Local-space center of mass override. */
  centerOfMass: z.tuple([z.number(), z.number(), z.number()]).optional(),
  /** Presentation-only; implemented in RenderSyncSystem, not the physics backend. */
  interpolation: RigidBodyInterpolationSchema.default('none'),
  contactMonitor: z.boolean().default(false),
  maxReportedContacts: z.number().int().min(0).default(0),
  /**
   * Runtime-only physics body handle — populated by engine sync.
   * Optional in scene JSON; stripped on save.
   */
  physicsBodyHandle: z.string().optional(),
})
export type RigidBody = z.infer<typeof RigidBodySchema>
