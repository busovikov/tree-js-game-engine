import { z } from 'zod'
import { ComponentEnabledSchema, Vec3Schema } from '@haku/schema'
import {
  HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR,
  HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR,
  LIGHT_DEFAULT_LOCAL_POSITION,
  LIGHT_DEFAULT_TARGET_POSITION,
} from './light-defaults.js'

export const LightTypeSchema = z.enum(['directional', 'point', 'spot', 'hemisphere'])

const LightBaseSchema = z.object({
  color: z.string().default('#ffffff'),
  intensity: z.number().default(1),
  colorTemperature: z.number().min(1000).max(12000).optional(),
  castShadow: z.boolean().default(false),
  shadowMapSize: z.number().int().positive().optional(),
  shadowBias: z.number().optional(),
  shadowNormalBias: z.number().optional(),
  enabled: ComponentEnabledSchema,
})

export const DirectionalLightDataSchema = LightBaseSchema.extend({
  type: z.literal('directional'),
  localPosition: Vec3Schema.default(LIGHT_DEFAULT_LOCAL_POSITION),
  targetPosition: Vec3Schema.default(LIGHT_DEFAULT_TARGET_POSITION),
})

export const PointLightDataSchema = LightBaseSchema.extend({
  type: z.literal('point'),
  distance: z.number().min(0).default(10),
  decay: z.number().min(0).default(2),
})

export const SpotLightDataSchema = LightBaseSchema.extend({
  type: z.literal('spot'),
  distance: z.number().min(0).default(15),
  decay: z.number().min(0).default(2),
  localPosition: Vec3Schema.default(LIGHT_DEFAULT_LOCAL_POSITION),
  targetPosition: Vec3Schema.default(LIGHT_DEFAULT_TARGET_POSITION),
  outerAngle: z.number().min(1).max(179).optional(),
  innerAngle: z.number().min(0).max(179).optional(),
  /** @deprecated use outerAngle */
  angle: z.number().min(1).max(179).optional(),
  /** @deprecated use innerAngle/outerAngle */
  penumbra: z.number().min(0).max(1).optional(),
}).transform((data) => {
  const outerAngle = Math.min(179, Math.max(1, data.outerAngle ?? data.angle ?? 45))
  const legacyInner =
    data.innerAngle ??
    (data.penumbra !== undefined || data.angle !== undefined
      ? outerAngle * (1 - (data.penumbra ?? 0))
      : outerAngle * 0.5)
  const innerAngle = Math.min(outerAngle, Math.max(0, legacyInner))

  return {
    type: 'spot' as const,
    color: data.color,
    intensity: data.intensity,
    colorTemperature: data.colorTemperature,
    distance: data.distance,
    decay: data.decay,
    outerAngle,
    innerAngle,
    localPosition: data.localPosition ?? LIGHT_DEFAULT_LOCAL_POSITION,
    targetPosition: data.targetPosition ?? LIGHT_DEFAULT_TARGET_POSITION,
    castShadow: data.castShadow,
    shadowMapSize: data.shadowMapSize,
    shadowBias: data.shadowBias,
    shadowNormalBias: data.shadowNormalBias,
    enabled: data.enabled,
  }
})

export const HemisphereLightDataSchema = LightBaseSchema.omit({ castShadow: true }).extend({
  type: z.literal('hemisphere'),
  skyColor: z.string().default(HEMISPHERE_LIGHT_DEFAULT_SKY_COLOR),
  groundColor: z.string().default(HEMISPHERE_LIGHT_DEFAULT_GROUND_COLOR),
})

export const LightSchema = z.union([
  DirectionalLightDataSchema,
  PointLightDataSchema,
  SpotLightDataSchema,
  HemisphereLightDataSchema,
])
export type Light = z.infer<typeof LightSchema>

export const EDITOR_LIGHT_GIZMO_MAX_DISTANCE = 15

export function lightDisplayDistance(light: Light): number {
  if (light.type === 'directional' || light.type === 'hemisphere') return 2
  const distance = light.distance ?? 0
  const raw = distance > 0 ? distance : 5
  return Math.min(raw, EDITOR_LIGHT_GIZMO_MAX_DISTANCE)
}

export type SpotLight = Extract<Light, { type: 'spot' }>

export function spotToThreeCone(spot: SpotLight): { angleRad: number; penumbra: number } {
  const angleRad = (spot.outerAngle * Math.PI) / 180
  const penumbra =
    spot.outerAngle > 0 ? Math.min(1, Math.max(0, 1 - spot.innerAngle / spot.outerAngle)) : 0
  return { angleRad, penumbra }
}
