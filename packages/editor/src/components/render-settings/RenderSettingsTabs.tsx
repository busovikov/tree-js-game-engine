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

const labelStyle = { color: '#ddd' } as const
const inputStyle = { display: 'block', marginTop: 4, width: '100%' } as const

export const ShadowsTab = memo(function ShadowsTab({
  settings,
  onChange,
}: {
  settings: RenderSettings
  onChange: (next: RenderSettings) => void
}) {
  const shadows = settings.shadows
  const setShadows = (patch: Partial<RenderSettings['shadows']>) =>
    onChange({ ...settings, shadows: { ...shadows, ...patch } })

  // Map size and type are preset-driven, so manual edits switch to "custom".
  const setManual = (patch: Partial<RenderSettings['shadows']>) =>
    setShadows({ quality: 'custom', ...patch })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={labelStyle}>
        <input
          type="checkbox"
          checked={shadows.enabled}
          onChange={(e) => setShadows({ enabled: e.target.checked })}
        />{' '}
        Shadows enabled
      </label>

      <label style={labelStyle}>
        Quality Preset
        <select
          value={shadows.quality}
          onChange={(e) => {
            const quality = e.target.value as RenderSettings['shadows']['quality']
            const preset = SHADOW_QUALITY_PRESETS[quality]
            setShadows({ quality, ...preset })
          }}
          style={inputStyle}
        >
          <option value="off">Off</option>
          <option value="low">Low (512)</option>
          <option value="medium">Medium (1024 PCF)</option>
          <option value="high">High (2048 PCF Soft)</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <fieldset
        disabled={!shadows.enabled}
        style={{ border: '1px solid #333', borderRadius: 4, padding: 10, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <legend style={{ color: '#aaa', fontSize: 12, padding: '0 6px' }}>Manual controls</legend>

        <label style={labelStyle}>
          Map Size
          <select
            value={shadows.mapSize}
            onChange={(e) =>
              setManual({ mapSize: Number(e.target.value) as RenderSettings['shadows']['mapSize'] })
            }
            style={inputStyle}
          >
            <option value={512}>512</option>
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
            <option value={4096}>4096</option>
          </select>
        </label>

        <label style={labelStyle}>
          Shadow Type
          <select
            value={shadows.type}
            onChange={(e) =>
              setManual({ type: e.target.value as RenderSettings['shadows']['type'] })
            }
            style={inputStyle}
          >
            <option value="basic">Basic (hard)</option>
            <option value="pcf">PCF</option>
            <option value="pcfsoft">PCF Soft</option>
            <option value="vsm">VSM</option>
          </select>
        </label>

        <label style={labelStyle}>
          Edge Softness (radius): {shadows.radius}
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={shadows.radius}
            onChange={(e) => setShadows({ radius: Number(e.target.value) })}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={shadows.followCamera}
            onChange={(e) => setShadows({ followCamera: e.target.checked })}
          />{' '}
          Follow camera (sun tracks the view)
        </label>

        <label style={labelStyle}>
          Shadow Area (world units)
          <input
            type="number"
            min={1}
            step={1}
            value={shadows.cameraSize}
            onChange={(e) => setShadows({ cameraSize: Math.max(1, Number(e.target.value)) })}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Shadow Distance (depth)
          <input
            type="number"
            min={1}
            step={1}
            value={shadows.cameraDistance}
            onChange={(e) => setShadows({ cameraDistance: Math.max(1, Number(e.target.value)) })}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Anchor Ground Y
          <input
            type="number"
            step={0.1}
            value={shadows.anchorGroundY}
            onChange={(e) => setShadows({ anchorGroundY: Number(e.target.value) })}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Anchor Max Distance (× area)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={shadows.anchorMaxDistanceFactor}
            onChange={(e) =>
              setShadows({ anchorMaxDistanceFactor: Math.max(0.1, Number(e.target.value)) })
            }
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Anchor Fallback (× area)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={shadows.anchorFallbackDistanceFactor}
            onChange={(e) =>
              setShadows({
                anchorFallbackDistanceFactor: Math.max(0.1, Number(e.target.value)),
              })
            }
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Bias
          <input
            type="number"
            step={0.0001}
            value={shadows.bias}
            onChange={(e) => setShadows({ bias: Number(e.target.value) })}
            style={inputStyle}
          />
        </label>

        <label style={labelStyle}>
          Normal Bias
          <input
            type="number"
            step={0.01}
            value={shadows.normalBias}
            onChange={(e) => setShadows({ normalBias: Number(e.target.value) })}
            style={inputStyle}
          />
        </label>
      </fieldset>
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
