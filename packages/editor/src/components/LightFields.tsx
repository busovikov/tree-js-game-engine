import { memo } from 'react'
import { LightSchema, kelvinToHex, type Light } from '@haku/schema'
import { AngleRangeSlider } from './AngleRangeSlider.js'
import { LightTemperatureSlider, LIGHT_TEMPERATURE_DEFAULT } from './LightTemperatureSlider.js'
import { NumberField } from './NumberField.js'
import { TransformVec3Row } from './TransformFields.js'
import './mesh-renderer-fields.css'
import './transform-fields.css'

const LIGHT_TYPES: Light['type'][] = ['directional', 'point', 'spot', 'hemisphere']

export function normalizeLight(data: unknown): Light {
  return LightSchema.parse(data)
}

function switchLightType(current: Light, type: Light['type']): Light {
  if (current.type === type) return current
  return LightSchema.parse({
    color: current.color,
    intensity: current.intensity,
    colorTemperature: current.colorTemperature,
    castShadow: 'castShadow' in current ? current.castShadow : false,
    type,
    ...(type === 'point'
      ? {
          distance: current.type === 'point' ? current.distance : 10,
          decay: current.type === 'point' ? current.decay : 2,
        }
      : {}),
    ...(type === 'spot'
      ? {
          distance: current.type === 'spot' ? current.distance : 15,
          decay: current.type === 'spot' ? current.decay : 2,
          outerAngle: current.type === 'spot' ? current.outerAngle : 45,
          innerAngle: current.type === 'spot' ? current.innerAngle : 22.5,
        }
      : {}),
    ...(type === 'hemisphere'
      ? {
          skyColor:
            current.type === 'hemisphere' ? current.skyColor : '#87ceeb',
          groundColor:
            current.type === 'hemisphere' ? current.groundColor : '#3d2817',
        }
      : {}),
  })
}

const SHADOW_MAP_SIZES = [512, 1024, 2048, 4096] as const

function LightShadowOverrides({
  value,
  onChange,
  disabled,
}: {
  value: Light
  onChange: (partial: Partial<Light>) => void
  disabled?: boolean
}) {
  const mapSize = value.shadowMapSize
  const bias = value.shadowBias
  const normalBias = value.shadowNormalBias

  return (
    <div className="mesh-renderer-fields__section">
      <div className="mesh-renderer-fields__heading">Shadow Overrides</div>
      <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
        Per-light overrides. Leave on “Inherit” to use the scene Render Settings.
      </p>

      <label className="mesh-field" title="Shadow map resolution for this light — higher is sharper but more expensive.">
        <span className="mesh-field__label">Map Size</span>
        <select
          className="mesh-field__input"
          value={mapSize ?? ''}
          disabled={disabled}
          onChange={(e) =>
            onChange({ shadowMapSize: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        >
          <option value="">Inherit</option>
          {SHADOW_MAP_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <label
        className="mesh-field mesh-field--checkbox"
        title="Override the scene-wide shadow bias for this light."
      >
        <input
          type="checkbox"
          checked={bias !== undefined}
          disabled={disabled}
          onChange={(e) => onChange({ shadowBias: e.target.checked ? -0.0001 : undefined })}
        />
        <span>Override Bias</span>
      </label>
      {bias !== undefined && (
        <NumberField
          label="Bias"
          value={bias}
          step={0.0001}
          disabled={disabled}
          hint="Depth offset to reduce shadow acne."
          onChange={(shadowBias) => onChange({ shadowBias })}
        />
      )}

      <label
        className="mesh-field mesh-field--checkbox"
        title="Override the scene-wide shadow normal bias for this light."
      >
        <input
          type="checkbox"
          checked={normalBias !== undefined}
          disabled={disabled}
          onChange={(e) => onChange({ shadowNormalBias: e.target.checked ? 0.02 : undefined })}
        />
        <span>Override Normal Bias</span>
      </label>
      {normalBias !== undefined && (
        <NumberField
          label="Normal Bias"
          value={normalBias}
          step={0.01}
          disabled={disabled}
          hint="Offset along surface normal to reduce peter-panning."
          onChange={(shadowNormalBias) => onChange({ shadowNormalBias })}
        />
      )}
    </div>
  )
}

export const LightFields = memo(function LightFields({
  value,
  onChange,
  disabled,
}: {
  value: Light
  onChange: (next: Light) => void
  disabled?: boolean
}) {
  const patch = (partial: Partial<Light>) => onChange({ ...value, ...partial } as Light)
  const temperature = value.colorTemperature ?? LIGHT_TEMPERATURE_DEFAULT
  const displayColor =
    value.colorTemperature !== undefined ? kelvinToHex(value.colorTemperature) : value.color

  const onTemperatureChange = (colorTemperature: number) => {
    patch({
      colorTemperature,
      color: kelvinToHex(colorTemperature),
    })
  }

  const onManualColorChange = (color: string) => {
    patch({ color, colorTemperature: undefined })
  }

  return (
    <div className="mesh-renderer-fields">
      <div className="mesh-renderer-fields__section">
        <label className="mesh-field" title="Light source kind: directional (sun), point (bulb), spot (cone), hemisphere (sky fill).">
          <span className="mesh-field__label">Type</span>
          <select
            className="mesh-field__input"
            value={value.type}
            disabled={disabled}
            onChange={(e) => onChange(switchLightType(value, e.target.value as Light['type']))}
          >
            {LIGHT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <LightTemperatureSlider
          value={temperature}
          disabled={disabled}
          onChange={onTemperatureChange}
        />

        <label className="mesh-field" title="Light color. Manual edit clears the color temperature.">
          <span className="mesh-field__label">Color</span>
          <input
            type="color"
            className="mesh-field__color"
            value={displayColor}
            disabled={disabled}
            onChange={(e) => onManualColorChange(e.target.value)}
          />
          <input
            type="text"
            className="mesh-field__input mesh-field__input--hex"
            value={displayColor}
            disabled={disabled}
            onChange={(e) => onManualColorChange(e.target.value)}
          />
        </label>

        <NumberField
          label="Intensity"
          value={value.intensity}
          min={0}
          step={0.05}
          hint="Light brightness multiplier."
          disabled={disabled}
          onChange={(intensity) => patch({ intensity: Math.max(0, intensity) })}
        />

        <label
          className="mesh-field mesh-field--checkbox"
          title="This light casts shadows (hemisphere lights never do)."
        >
          <input
            type="checkbox"
            checked={'castShadow' in value ? value.castShadow : false}
            disabled={disabled || value.type === 'hemisphere'}
            onChange={(e) => patch({ castShadow: e.target.checked })}
          />
          <span>Cast Shadow</span>
        </label>
      </div>

      {value.type === 'directional' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Directional</div>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            Direction = target − position in local space, then entity rotation is applied.
            Shadow volume tracks the view camera (Render Settings → Shadows).
          </p>
          <div className="haku-transform-fields">
            <TransformVec3Row
              label="Local Position"
              value={value.localPosition}
              disabled={disabled}
              step={0.01}
              scrubMultiplier={20}
              onChange={(localPosition) => patch({ localPosition })}
            />
            <TransformVec3Row
              label="Target Position"
              value={value.targetPosition}
              disabled={disabled}
              step={0.01}
              scrubMultiplier={20}
              onChange={(targetPosition) => patch({ targetPosition })}
            />
          </div>
        </div>
      )}

      {'castShadow' in value && value.castShadow && (
        <LightShadowOverrides value={value} onChange={patch} disabled={disabled} />
      )}

      {value.type === 'point' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Point</div>
          <NumberField
            label="Distance"
            value={value.distance}
            min={0}
            step={0.5}
            disabled={disabled}
            hint="Maximum light range. 0 = infinite."
            onChange={(distance) => patch({ distance: Math.max(0, distance) })}
          />
          <NumberField
            label="Decay"
            value={value.decay}
            min={0}
            step={0.1}
            disabled={disabled}
            hint="Physical light falloff exponent."
            onChange={(decay) => patch({ decay: Math.max(0, decay) })}
          />
        </div>
      )}

      {value.type === 'hemisphere' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Hemisphere</div>
          <label className="mesh-field" title="Color of light coming from above (sky).">
            <span className="mesh-field__label">Sky Color</span>
            <input
              type="color"
              className="mesh-field__color"
              value={value.skyColor}
              disabled={disabled}
              onChange={(e) => patch({ skyColor: e.target.value })}
            />
            <input
              type="text"
              className="mesh-field__input mesh-field__input--hex"
              value={value.skyColor}
              disabled={disabled}
              onChange={(e) => patch({ skyColor: e.target.value })}
            />
          </label>
          <label className="mesh-field" title="Color of light bouncing from below (ground).">
            <span className="mesh-field__label">Ground Color</span>
            <input
              type="color"
              className="mesh-field__color"
              value={value.groundColor}
              disabled={disabled}
              onChange={(e) => patch({ groundColor: e.target.value })}
            />
            <input
              type="text"
              className="mesh-field__input mesh-field__input--hex"
              value={value.groundColor}
              disabled={disabled}
              onChange={(e) => patch({ groundColor: e.target.value })}
            />
          </label>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            Soft sky/ground fill. Does not cast shadows. Up vector follows entity rotation.
          </p>
        </div>
      )}

      {value.type === 'spot' && (
        <div className="mesh-renderer-fields__section">
          <div className="mesh-renderer-fields__heading">Spot</div>
          <NumberField
            label="Distance"
            value={value.distance}
            min={0}
            step={0.5}
            disabled={disabled}
            hint="Maximum light range. 0 = infinite."
            onChange={(distance) => patch({ distance: Math.max(0, distance) })}
          />
          <AngleRangeSlider
            label="Inner / Outer"
            inner={value.innerAngle}
            outer={value.outerAngle}
            min={0}
            max={179}
            step={0.1}
            disabled={disabled}
            onChange={(innerAngle, outerAngle) => patch({ innerAngle, outerAngle })}
          />
          <NumberField
            label="Decay"
            value={value.decay}
            min={0}
            step={0.1}
            disabled={disabled}
            hint="Physical light falloff exponent."
            onChange={(decay) => patch({ decay: Math.max(0, decay) })}
          />
          <div className="haku-transform-fields">
            <TransformVec3Row
              label="Local Position"
              value={value.localPosition}
              disabled={disabled}
              step={0.01}
              scrubMultiplier={20}
              onChange={(localPosition) => patch({ localPosition })}
            />
            <TransformVec3Row
              label="Target Position"
              value={value.targetPosition}
              disabled={disabled}
              step={0.01}
              scrubMultiplier={20}
              onChange={(targetPosition) => patch({ targetPosition })}
            />
          </div>
          <p style={{ margin: 0, fontSize: 11, color: '#888', lineHeight: 1.4 }}>
            Gizmo shows a sphere sector. Green ring = inner/outer cone boundary. Direction: local -Z.
          </p>
        </div>
      )}
    </div>
  )
})
