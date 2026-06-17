import { describe, expect, it } from 'vitest'
import { RenderSettingsSchema, defaultRenderSettings } from '@haku/schema'
import {
  applyShadowSettings,
  computeRendererState,
} from './apply-render-settings.js'

describe('apply-render-settings', () => {
  it('disables shadowMap when features.shadows is false', () => {
    const settings = defaultRenderSettings()
    const renderer = { shadowMap: { enabled: true, type: 1, autoUpdate: true } }
    const result = applyShadowSettings(renderer, settings)
    expect(result.shadowMapEnabled).toBe(false)
    expect(renderer.shadowMap.enabled).toBe(false)
  })

  it('enables shadowMap when features.shadows and shadows.enabled', () => {
    const settings = RenderSettingsSchema.parse({
      features: { shadows: true },
      shadows: { enabled: true, quality: 'medium' },
    })
    const renderer = { shadowMap: { enabled: false, type: 0, autoUpdate: true } }
    const result = applyShadowSettings(renderer, settings)
    expect(result.shadowMapEnabled).toBe(true)
    expect(renderer.shadowMap.enabled).toBe(true)
    expect(renderer.shadowMap.type).toBe(1)
  })

  it('computeRendererState reflects tone mapping feature', () => {
    const on = defaultRenderSettings()
    expect(computeRendererState(on).toneMapping).toBe('ACESFilmicToneMapping')

    const off = RenderSettingsSchema.parse({
      features: { toneMapping: false },
    })
    expect(computeRendererState(off).toneMapping).toBe('NoToneMapping')
  })

  it('computeRendererState uses background color from settings', () => {
    const settings = RenderSettingsSchema.parse({
      background: { type: 'color', color: '#ff0000' },
    })
    expect(computeRendererState(settings).backgroundColor).toBe('#ff0000')
  })
})
