import type { RenderSettings } from '@haku/schema'
import { isFeatureActive, resolveShadowSettings } from '@haku/schema'

/** Pure renderer state snapshot for unit tests (no Three.js types). */
export interface RendererStateSnapshot {
  shadowMapEnabled: boolean
  shadowMapType: string
  shadowMapAutoUpdate: boolean
  toneMapping: string
  toneMappingExposure: number
  outputColorSpace: string
  backgroundColor: string | null
  ambientColor: string
  ambientIntensity: number
}

export interface ShadowRendererLike {
  shadowMap: {
    enabled: boolean
    type: number
    autoUpdate: boolean
  }
}

export interface ToneMappingRendererLike {
  toneMapping: number
  toneMappingExposure: number
  outputColorSpace: string
}

const TONE_MAPPING_MAP: Record<RenderSettings['toneMapping'], string> = {
  none: 'NoToneMapping',
  aces: 'ACESFilmicToneMapping',
  agx: 'AgXToneMapping',
  neutral: 'NeutralToneMapping',
}

const SHADOW_TYPE_MAP: Record<RenderSettings['shadows']['type'], string> = {
  basic: 'BasicShadowMap',
  pcf: 'PCFShadowMap',
  pcfsoft: 'PCFSoftShadowMap',
  vsm: 'VSMShadowMap',
}

const OUTPUT_COLOR_SPACE_MAP: Record<RenderSettings['outputColorSpace'], string> = {
  srgb: 'SRGBColorSpace',
  'linear-srgb': 'LinearSRGBColorSpace',
}

// Three.js constant values for shadow map types (mirrored for tests)
export const THREE_SHADOW_MAP_TYPES = {
  BasicShadowMap: 0,
  PCFShadowMap: 1,
  PCFSoftShadowMap: 2,
  VSMShadowMap: 3,
} as const

export const THREE_TONE_MAPPING = {
  NoToneMapping: 0,
  ACESFilmicToneMapping: 4,
  AgXToneMapping: 7,
  NeutralToneMapping: 8,
} as const

export function computeRendererState(settings: RenderSettings): RendererStateSnapshot {
  const shadows = resolveShadowSettings(settings.shadows)
  const shadowsActive = isFeatureActive(settings, 'shadows') && shadows.enabled

  return {
    shadowMapEnabled: shadowsActive,
    shadowMapType: shadowsActive ? SHADOW_TYPE_MAP[shadows.type] : 'BasicShadowMap',
    shadowMapAutoUpdate: shadows.autoUpdate,
    toneMapping: isFeatureActive(settings, 'toneMapping')
      ? TONE_MAPPING_MAP[settings.toneMapping]
      : 'NoToneMapping',
    toneMappingExposure: settings.toneMappingExposure,
    outputColorSpace: OUTPUT_COLOR_SPACE_MAP[settings.outputColorSpace],
    backgroundColor: settings.background.type === 'color' ? settings.background.color : null,
    ambientColor: settings.ambient.color,
    ambientIntensity: settings.ambient.intensity,
  }
}

export function applyShadowSettings(
  renderer: ShadowRendererLike,
  settings: RenderSettings,
): { shadowMapEnabled: boolean } {
  const shadows = resolveShadowSettings(settings.shadows)
  const enabled = isFeatureActive(settings, 'shadows') && shadows.enabled

  renderer.shadowMap.enabled = enabled
  if (enabled) {
    const typeName = SHADOW_TYPE_MAP[shadows.type]
    renderer.shadowMap.type =
      THREE_SHADOW_MAP_TYPES[typeName as keyof typeof THREE_SHADOW_MAP_TYPES] ?? 1
    renderer.shadowMap.autoUpdate = shadows.autoUpdate
  }

  return { shadowMapEnabled: enabled }
}

export function applyToneMappingSettings(
  renderer: ToneMappingRendererLike,
  settings: RenderSettings,
): void {
  if (!isFeatureActive(settings, 'toneMapping') || settings.toneMapping === 'none') {
    renderer.toneMapping = THREE_TONE_MAPPING.NoToneMapping
  } else {
    const name = TONE_MAPPING_MAP[settings.toneMapping]
    renderer.toneMapping =
      THREE_TONE_MAPPING[name as keyof typeof THREE_TONE_MAPPING] ?? THREE_TONE_MAPPING.NoToneMapping
  }
  renderer.toneMappingExposure = settings.toneMappingExposure
}

export function resolveOutputColorSpace(settings: RenderSettings): string {
  return OUTPUT_COLOR_SPACE_MAP[settings.outputColorSpace]
}
