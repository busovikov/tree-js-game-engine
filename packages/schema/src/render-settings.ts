import { z } from 'zod'

export const RenderSettingsFeaturesSchema = z.object({
  toneMapping: z.boolean().default(true),
  shadows: z.boolean().default(false),
  postProcessing: z.boolean().default(false),
  renderingLayers: z.boolean().default(false),
  renderTargets: z.boolean().default(false),
  fxaa: z.boolean().default(false),
  bloom: z.boolean().default(false),
  vignette: z.boolean().default(false),
})
export type RenderSettingsFeatures = z.infer<typeof RenderSettingsFeaturesSchema>

export const ToneMappingTypeSchema = z.enum(['none', 'aces', 'agx', 'neutral'])
export type ToneMappingType = z.infer<typeof ToneMappingTypeSchema>

export const OutputColorSpaceSchema = z.enum(['srgb', 'linear-srgb'])
export type OutputColorSpace = z.infer<typeof OutputColorSpaceSchema>

export const BackgroundSettingsSchema = z.object({
  type: z.literal('color'),
  color: z.string().default('#1a1a2e'),
})
export type BackgroundSettings = z.infer<typeof BackgroundSettingsSchema>

export const ShadowQualitySchema = z.enum(['off', 'low', 'medium', 'high', 'custom'])
export type ShadowQuality = z.infer<typeof ShadowQualitySchema>

export const ShadowTypeSchema = z.enum(['basic', 'pcf', 'pcfsoft', 'vsm'])
export type ShadowType = z.infer<typeof ShadowTypeSchema>

export const ShadowSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  quality: ShadowQualitySchema.default('medium'),
  type: ShadowTypeSchema.default('pcf'),
  mapSize: z.union([z.literal(512), z.literal(1024), z.literal(2048), z.literal(4096)]).default(1024),
  maxCasters: z.number().int().min(1).max(8).default(1),
  bias: z.number().default(-0.0001),
  normalBias: z.number().default(0.02),
  /** Edge softening radius (PCF/PCFSoft). Higher = blurrier shadow edges. */
  radius: z.number().min(0).default(2),
  autoUpdate: z.boolean().default(true),
  /**
   * Side length (world units) of the orthographic shadow volume used by
   * directional lights. Larger values cover more of the scene at the cost of
   * shadow-map resolution per unit.
   */
  cameraSize: z.number().positive().default(40),
  /**
   * Distance (world units) the directional shadow camera sits back from the
   * shadow volume centre along the light direction. Defines the depth range.
   */
  cameraDistance: z.number().positive().default(100),
  /**
   * When true, the directional shadow volume tracks the active view camera so
   * shadows stay sharp wherever you look. When false it stays centred on the
   * world origin. Direction always comes from the light's rotation.
   */
  followCamera: z.boolean().default(true),
  /** World Y of the ground plane used when followCamera computes the shadow anchor. */
  anchorGroundY: z.number().default(0),
  /** Max travel along the view ray as a multiple of cameraSize. */
  anchorMaxDistanceFactor: z.number().positive().default(4),
  /** Fallback travel when the view ray does not hit the ground plane (× cameraSize). */
  anchorFallbackDistanceFactor: z.number().positive().default(0.5),
})
export type ShadowSettings = z.infer<typeof ShadowSettingsSchema>

export const AmbientSettingsSchema = z.object({
  color: z.string().default('#ffffff'),
  intensity: z.number().min(0).default(0.3),
})
export type AmbientSettings = z.infer<typeof AmbientSettingsSchema>

export const PostEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fxaa') }),
  z.object({
    type: z.literal('bloom'),
    intensity: z.number().min(0).default(1),
    threshold: z.number().min(0).default(0.85),
    radius: z.number().min(0).default(0.4),
  }),
  z.object({
    type: z.literal('vignette'),
    offset: z.number().min(0).max(1).default(1),
    darkness: z.number().min(0).max(1).default(1),
  }),
])
export type PostEffect = z.infer<typeof PostEffectSchema>

export const PostProcessingProfileSchema = z.object({
  enabled: z.boolean().default(false),
  effects: z.array(PostEffectSchema).default([]),
})
export type PostProcessingProfile = z.infer<typeof PostProcessingProfileSchema>

export const RenderSettingsSchema = z.object({
  version: z.literal(1).default(1),
  features: RenderSettingsFeaturesSchema.default({}),
  toneMapping: ToneMappingTypeSchema.default('aces'),
  toneMappingExposure: z.number().min(0).default(1),
  outputColorSpace: OutputColorSpaceSchema.default('srgb'),
  background: BackgroundSettingsSchema.default({ type: 'color' }),
  shadows: ShadowSettingsSchema.default({}),
  ambient: AmbientSettingsSchema.default({}),
  postProcessing: PostProcessingProfileSchema.default({}),
  defaultLayer: z.number().int().min(0).max(31).default(0),
})
export type RenderSettings = z.infer<typeof RenderSettingsSchema>

export const SHADOW_QUALITY_PRESETS: Record<
  ShadowQuality,
  Partial<Pick<ShadowSettings, 'mapSize' | 'type' | 'enabled'>>
> = {
  off: { enabled: false },
  low: { mapSize: 512, type: 'basic', enabled: true },
  medium: { mapSize: 1024, type: 'pcf', enabled: true },
  high: { mapSize: 2048, type: 'pcfsoft', enabled: true },
  // Custom leaves map size / type under manual control (no preset overrides).
  custom: {},
}

export function defaultRenderSettings(): RenderSettings {
  return RenderSettingsSchema.parse({})
}

export function isFeatureActive(
  settings: RenderSettings,
  key: keyof RenderSettingsFeatures,
): boolean {
  return settings.features[key] === true
}

export function resolveShadowSettings(shadows: ShadowSettings): ShadowSettings {
  const preset = SHADOW_QUALITY_PRESETS[shadows.quality]
  return {
    ...shadows,
    ...preset,
    enabled: shadows.quality === 'off' ? false : (preset.enabled ?? shadows.enabled),
  }
}
