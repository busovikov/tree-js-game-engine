import { z } from 'zod'

const ComponentEnabledSchema = z.boolean().default(true)
const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])

export const PhysicsJointTypeSchema = z.enum([
  'fixed',
  'revolute',
  'prismatic',
  'spherical',
  'spring',
  'rope',
])
export type PhysicsJointType = z.infer<typeof PhysicsJointTypeSchema>

export const PhysicsJointSchema = z.object({
  enabled: ComponentEnabledSchema,
  type: PhysicsJointTypeSchema.default('fixed'),
  /** Connected rigid-body root entity id (uuid string). */
  bodyA: z.string().default(''),
  /** Connected rigid-body root entity id (uuid string). */
  bodyB: z.string().default(''),
  anchorA: Vec3Schema.default([0, 0, 0]),
  anchorB: Vec3Schema.default([0, 0, 0]),
  axis: Vec3Schema.default([0, 1, 0]),
  limits: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  motor: z
    .object({
      velocity: z.number().default(0),
      maxForce: z.number().positive().default(1),
    })
    .optional(),
  spring: z
    .object({
      stiffness: z.number().positive().default(20),
      damping: z.number().min(0).default(5),
      /** Target separation between the two anchor points, in metres (defaults to 0 at the backend). */
      restLength: z.number().min(0).optional(),
    })
    .optional(),
  ropeLength: z.number().positive().optional(),
})
export type PhysicsJoint = z.infer<typeof PhysicsJointSchema>
