import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RenderSettingsSchema,
  defaultRenderSettings,
  isFeatureActive,
  resolveShadowSettings,
} from './render-settings.js'
import { validateSceneDocument } from './index.js'

describe('render-settings', () => {
  it('defaultRenderSettings has toneMapping on and other features off', () => {
    const settings = defaultRenderSettings()
    expect(settings.version).toBe(1)
    expect(settings.features.toneMapping).toBe(true)
    expect(settings.features.shadows).toBe(false)
    expect(settings.features.postProcessing).toBe(false)
    expect(settings.features.bloom).toBe(false)
    expect(settings.toneMapping).toBe('aces')
    expect(settings.background.color).toBe('#1a1a2e')
  })

  it('parses explicit feature flags', () => {
    const settings = RenderSettingsSchema.parse({
      features: { shadows: true, bloom: true },
      shadows: { enabled: true, quality: 'high' },
    })
    expect(settings.features.shadows).toBe(true)
    expect(settings.shadows.quality).toBe('high')
  })

  it('resolveShadowSettings applies quality presets', () => {
    const medium = resolveShadowSettings(
      RenderSettingsSchema.parse({ shadows: { quality: 'medium' } }).shadows,
    )
    expect(medium.mapSize).toBe(1024)
    expect(medium.type).toBe('pcf')

    const off = resolveShadowSettings(
      RenderSettingsSchema.parse({ shadows: { quality: 'off' } }).shadows,
    )
    expect(off.enabled).toBe(false)
  })

  it('isFeatureActive checks feature flags', () => {
    const settings = defaultRenderSettings()
    expect(isFeatureActive(settings, 'toneMapping')).toBe(true)
    expect(isFeatureActive(settings, 'shadows')).toBe(false)
  })

  it('legacy scene without renderSettings gets defaults on validate', () => {
    const path = join(import.meta.dirname, '../../../examples/minimal.scene.json')
    const json = JSON.parse(readFileSync(path, 'utf-8'))
    const doc = validateSceneDocument(json)
    expect(doc.renderSettings.version).toBe(1)
    expect(doc.renderSettings.features.shadows).toBe(false)
  })
})
