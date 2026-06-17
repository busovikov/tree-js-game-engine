import { memo } from 'react'
import type { RenderSettings, RenderSettingsFeatures } from '@haku/schema'
import { SHADOW_QUALITY_PRESETS } from '@haku/schema'

const FEATURE_LABELS: Record<keyof RenderSettingsFeatures, string> = {
  toneMapping: 'Tone Mapping',
  shadows: 'Shadows',
  postProcessing: 'Post Processing',
  renderingLayers: 'Rendering Layers',
  renderTargets: 'Render Targets',
  fxaa: 'FXAA (requires Post Processing)',
  bloom: 'Bloom (requires Post Processing)',
  vignette: 'Vignette (requires Post Processing)',
}

export const FeaturesTab = memo(function FeaturesTab({
  settings,
  onChange,
}: {
  settings: RenderSettings
  onChange: (next: RenderSettings) => void
}) {
  const toggleFeature = (key: keyof RenderSettingsFeatures, value: boolean) => {
    const features = { ...settings.features, [key]: value }
    if (key === 'postProcessing' && !value) {
      features.fxaa = false
      features.bloom = false
      features.vignette = false
    }
    onChange({ ...settings, features })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: '0 0 8px', color: '#aaa', fontSize: 12 }}>
        Scene capabilities — persisted in .scene.json
      </p>
      {(Object.keys(FEATURE_LABELS) as (keyof RenderSettingsFeatures)[]).map((key) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ddd' }}>
          <input
            type="checkbox"
            checked={settings.features[key]}
            onChange={(e) => toggleFeature(key, e.target.checked)}
            disabled={key === 'fxaa' || key === 'bloom' || key === 'vignette' ? !settings.features.postProcessing : false}
          />
          {FEATURE_LABELS[key]}
        </label>
      ))}
    </div>
  )
})

export const OutputTab = memo(function OutputTab({
  settings,
  onChange,
}: {
  settings: RenderSettings
  onChange: (next: RenderSettings) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ color: '#ddd' }}>
        Tone Mapping
        <select
          value={settings.toneMapping}
          onChange={(e) =>
            onChange({ ...settings, toneMapping: e.target.value as RenderSettings['toneMapping'] })
          }
          style={{ display: 'block', marginTop: 4, width: '100%' }}
        >
          <option value="none">None</option>
          <option value="aces">ACES</option>
          <option value="agx">AgX</option>
          <option value="neutral">Neutral</option>
        </select>
      </label>
      <label style={{ color: '#ddd' }}>
        Exposure
        <input
          type="number"
          min={0}
          step={0.1}
          value={settings.toneMappingExposure}
          onChange={(e) =>
            onChange({ ...settings, toneMappingExposure: Number(e.target.value) })
          }
          style={{ display: 'block', marginTop: 4, width: '100%' }}
        />
      </label>
      <label style={{ color: '#ddd' }}>
        Background Color
        <input
          type="color"
          value={settings.background.color}
          onChange={(e) =>
            onChange({
              ...settings,
              background: { type: 'color', color: e.target.value },
            })
          }
          style={{ display: 'block', marginTop: 4, width: '100%' }}
        />
      </label>
      <label style={{ color: '#ddd' }}>
        Ambient Intensity
        <input
          type="number"
          min={0}
          step={0.05}
          value={settings.ambient.intensity}
          onChange={(e) =>
            onChange({
              ...settings,
              ambient: { ...settings.ambient, intensity: Number(e.target.value) },
            })
          }
          style={{ display: 'block', marginTop: 4, width: '100%' }}
        />
      </label>
    </div>
  )
})

export const ShadowsTab = memo(function ShadowsTab({
  settings,
  onChange,
}: {
  settings: RenderSettings
  onChange: (next: RenderSettings) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ color: '#ddd' }}>
        <input
          type="checkbox"
          checked={settings.shadows.enabled}
          onChange={(e) =>
            onChange({
              ...settings,
              shadows: { ...settings.shadows, enabled: e.target.checked },
            })
          }
        />{' '}
        Shadows enabled
      </label>
      <label style={{ color: '#ddd' }}>
        Quality Preset
        <select
          value={settings.shadows.quality}
          onChange={(e) => {
            const quality = e.target.value as RenderSettings['shadows']['quality']
            const preset = SHADOW_QUALITY_PRESETS[quality]
            onChange({
              ...settings,
              shadows: { ...settings.shadows, quality, ...preset },
            })
          }}
          style={{ display: 'block', marginTop: 4, width: '100%' }}
        >
          <option value="off">Off</option>
          <option value="low">Low (512)</option>
          <option value="medium">Medium (1024 PCF)</option>
          <option value="high">High (2048 PCF Soft)</option>
        </select>
      </label>
    </div>
  )
})

export const PostTab = memo(function PostTab({
  settings,
  onChange,
}: {
  settings: RenderSettings
  onChange: (next: RenderSettings) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ color: '#ddd' }}>
        <input
          type="checkbox"
          checked={settings.postProcessing.enabled}
          onChange={(e) =>
            onChange({
              ...settings,
              postProcessing: { ...settings.postProcessing, enabled: e.target.checked },
            })
          }
        />{' '}
        Post-processing profile enabled
      </label>
      <p style={{ margin: 0, color: '#888', fontSize: 12 }}>
        Enable individual effects in the Features tab (FXAA, Bloom, Vignette).
      </p>
    </div>
  )
})
